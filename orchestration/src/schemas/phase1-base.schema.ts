/**
 * Shared base for every Phase 1 analyzer schema.
 *
 * Centralises the `agent_name` / `timestamp` / `graph_queries_used` /
 * `graph_overflow_*` / `soft_warning` / `needs_verification`
 * declarations so a single change to the base shape propagates to all
 * four analyzers.
 *
 * Stack/structure/naming agnostic by construction: every field here
 * is text-shape only — no language family, framework token, or naming
 * convention appears.
 */

import { z, ZodLiteral, ZodTypeAny } from 'zod';

/**
 * Shared shape for analyzer-emitted code examples. Used both by
 * project-level fields (`event_pipeline.examples`, `auth_flow.examples`,
 * `external_services[].sample_usage_quote`) and by the per-service
 * detail extractors.
 *
 * Stack-agnostic: `kind` and `language` are free-form strings. A Go
 * project might emit `kind: "error-return-pattern"`; a Haskell
 * project might emit `kind: "monad-stack"`. The framework groups
 * snippets by `kind` for downstream rendering but never enumerates a
 * closed list.
 */
export const CodeSnippetSchema = z
  .object({
    kind: z
      .string()
      .min(1)
      .describe(
        'Free-form analyzer-chosen tag (e.g. "wrong" / "correct" / "pattern" / ' +
          '"fixture" / "rule" / "anti-pattern" / "scaffold"). Used as a label for ' +
          'grouping in the composer view; no closed enum.',
      ),
    language: z
      .string()
      .min(1)
      .describe(
        'Canonical lowercase language identifier (e.g. "typescript", "python", ' +
          '"go", "rust", "csharp"). Same vocabulary as project-inspection.',
      ),
    code: z
      .string()
      .min(1)
      .max(1500)
      .describe(
        'Verbatim code snippet (≤ 1500 chars). Trim trailing whitespace; preserve ' +
          'indentation. Snippets longer than 1500 chars must be summarised down to ' +
          'the most representative excerpt. This snippet is rendered into the wiki ' +
          'and loaded on demand by skills — wider than CLAUDE.md / agent.md bounds.',
      ),
    source_file: z
      .string()
      .optional()
      .describe('Verbatim path from project root (e.g. "src/auth/middleware.ts").'),
    source_line: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('1-based line number in `source_file` where the snippet begins.'),
    note: z
      .string()
      .max(400)
      .optional()
      .describe('Optional explanation (≤ 400 chars) accompanying the snippet in the wiki.'),
  })
  .strict();
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;

/**
 * Groundedness contract for LLM-judgment snippets.
 *
 * Whenever an analyzer attaches a code snippet to a *per-service* judgment
 * field (`code_patterns[].patterns`, `testing[].representative_examples`,
 * etc.), the schema requires the citation pair `source_file` +
 * `source_line` so a reader can open the exact line. Loose snippets used
 * for project-level project-shape examples (`event_pipeline.examples`,
 * `auth_flow.examples`, `external_services[].sample_usage_quote`) keep
 * the original optional citation shape — they describe cross-cutting
 * patterns that may not have a single canonical line.
 */
export const CodeSnippetWithCitationSchema = CodeSnippetSchema.extend({
  source_file: z
    .string()
    .min(1)
    .max(240)
    .describe(
      'REQUIRED for per-service judgment fields. Verbatim path from project ' +
        'root to the file the snippet was lifted from (e.g. ' +
        '"services/api/src/auth/middleware.ts").',
    ),
  source_line: z
    .number()
    .int()
    .positive()
    .describe('REQUIRED for per-service judgment fields. 1-based line number.'),
});
export type CodeSnippetWithCitation = z.infer<typeof CodeSnippetWithCitationSchema>;

/**
 * `attempted_resolution` (≥ 2 entries) and `impact` (≥ 40 chars) are
 * required so an item proves the agent searched and the answer
 * changes a concrete artefact. Text-shape rules (graph-internals ban,
 * fabricated numbers, generic impact phrasing) live in
 * `validateNeedsVerificationProse`; the Stop hook applies them on
 * top of this shape.
 */
export const NeedsVerificationEntrySchema = z
  .object({
    id: z.string(),
    question: z.string(),
    reason: z.string(),
    attempted_resolution: z
      .array(z.string().min(1))
      .min(2)
      .describe(
        'List of search attempts (Read / Grep / Glob / Bash / mcp__code_graph__*) the ' +
          'agent ran BEFORE surfacing this item. Minimum 2 entries; ≥ 1 entry MUST be a ' +
          'concrete tool invocation (the rest may be `human:`-prefixed explanations). ' +
          'Items without sufficient search provenance are rejected at the Stop hook.',
      ),
    impact: z
      .string()
      .min(40)
      .describe(
        'Names the concrete downstream artefact (wiki page / skill body / finding / ' +
          'config-default) the answer changes, and what changes about it. Generic ' +
          'phrasing ("important for documentation", "useful to know") is rejected by ' +
          'the prose validator.',
      ),
  })
  .passthrough();
export type NeedsVerificationEntry = z.infer<typeof NeedsVerificationEntrySchema>;

/**
 * The base fields every Phase 1 analyzer emits at the top level. Each
 * analyzer narrows `agent_name` to a `z.literal(...)` via
 * `buildPhase1AnalyzerSchema` and supplies its own `findingsSchema`
 * shape.
 *
 * `graph_overflow_count` / `graph_overflow_tools` are derived by
 * `applyGraphToolUsageFromSidecar` from the Stop hook's sidecar, not
 * emitted directly by the agent. They're optional because older
 * replays predate the graph-navigation redesign.
 *
 * `soft_warning` values come from a fixed vocabulary
 * (`low_graph_ratio` / `graph_overflow_detected` /
 * `tech_stack_inspection_redundant_glob` /
 * `mcp_completely_unavailable`) — non-blocking; surfaced by the
 * sidecar usage analyzer.
 */
export const Phase1AnalyzerBaseFields = {
  agent_name: z.string(),
  timestamp: z.string(),
  graph_queries_used: z.array(z.string()).default([]),
  graph_overflow_count: z.number().optional(),
  graph_overflow_tools: z.array(z.string()).optional(),
  soft_warning: z.array(z.string()).optional(),
  needs_verification: z
    .array(NeedsVerificationEntrySchema)
    .max(3)
    .optional()
    .describe('Items that need clarification or verification (≤ 3 entries).'),
} as const;

/**
 * Build a Phase 1 analyzer schema from its `agent_name` literal and
 * its findings shape. The returned schema:
 *
 * - Narrows `agent_name` to the literal supplied.
 * - Adds the supplied `findingsSchema` under the `findings` key.
 * - Inherits every other base field.
 *
 * Top-level `findings.passthrough()` (caller's choice) is preserved
 * for back-compat — analyzers that emit fields not yet in the schema
 * pass through silently. Tightening to `.strict()` is intentionally
 * deferred until the analyzer prompts are aligned with the schema.
 */
export function buildPhase1AnalyzerSchema<N extends string, F extends ZodTypeAny>(
  agentName: N,
  findingsSchema: F,
): z.ZodObject<{
  agent_name: ZodLiteral<N>;
  timestamp: typeof Phase1AnalyzerBaseFields.timestamp;
  graph_queries_used: typeof Phase1AnalyzerBaseFields.graph_queries_used;
  graph_overflow_count: typeof Phase1AnalyzerBaseFields.graph_overflow_count;
  graph_overflow_tools: typeof Phase1AnalyzerBaseFields.graph_overflow_tools;
  soft_warning: typeof Phase1AnalyzerBaseFields.soft_warning;
  needs_verification: typeof Phase1AnalyzerBaseFields.needs_verification;
  findings: F;
}> {
  return z.object({
    ...Phase1AnalyzerBaseFields,
    agent_name: z.literal(agentName),
    findings: findingsSchema,
  });
}
