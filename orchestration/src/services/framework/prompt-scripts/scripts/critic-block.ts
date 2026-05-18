/**
 * `<<script:critic-block agent=NAME>>` renders a single, focused CRITIC block
 * for analyzer `NAME`. The block is built deterministically from the same
 * Zod schema the Stop hook validates against (via `renderSchemaSkeleton`),
 * wrapped with:
 *
 *   1. A short imperative header telling the model the cost of a rejection
 *      (one full regeneration ≈ 80–300 s on Sonnet 4.6).
 *   2. The JSONC skeleton with every `min` / `max` / `regex` / `enum` /
 *      description inlined as JSONC line-end comments.
 *   3. A short pre-emit checklist of shape-invariant traps that the Phase 1
 *      stop hook commonly rejects on (string regex patterns, length caps,
 *      `attempted_resolution[]` entry shape, etc.).
 *   4. A reminder phrase the CI placeholder-check test asserts on — making
 *      the rendered output stack-agnostic by construction.
 *
 * Usage in an analyzer prompt:
 *
 *     ## Output Contract
 *
 *     <<script:critic-block agent=structure-architecture-analyzer>>
 *
 * The script owns its own fenced code block and surrounding banner. Drop-in
 * replacement / complement to the older `<<script:schema-skeleton>>`.
 *
 * Stack-agnostic by construction: the Zod schemas are stack-agnostic; the
 * rendered output uses abstract placeholders only (`<path>:<symbol>`,
 * `<service-id>`, `<extension>`); the reminder phrase explicitly mentions
 * that the rules apply regardless of language, framework, or topology.
 */

import { AGENT_OUTPUT_SCHEMAS } from '../../../../schemas/phase1-agent-outputs.schema.js';
import { renderSchemaSkeleton } from '../../schema-skeleton/render-skeleton.js';
import type { PromptScriptHandler } from '../types.js';

/**
 * Stable banner separator. Trimmed so the rendered block has a predictable
 * shape; the CI snapshot test asserts on exact identity.
 */
const BANNER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/**
 * Reminder phrase asserted by the CRITIC-block placeholder check
 * (`tools/critic-block-placeholders.test.ts`). Hardcoded here so the test
 * has a single source of truth.
 */
export const CRITIC_STACK_AGNOSTIC_REMINDER =
  "These rules apply regardless of the target project's language, framework, or repository topology.";

/**
 * Build the pre-emit checklist. Stack-agnostic by construction: every
 * mention of a value uses a placeholder, every reference to a path uses
 * `<path>` or `<glob-pattern>`, never a concrete language extension or
 * framework token.
 */
function buildPreEmitChecklist(): string {
  return [
    'Pre-emit checklist (walk every field before writing the JSON):',
    '',
    '  1. Every string field with a `≤N` cap fits inside N chars — count them.',
    '  2. Every string field with a `pattern=…` regex matches that regex',
    '     literally. The most common rejection is `<path>:<symbol>` fields',
    '     where the model writes prose ("Handles incoming HTTP request to /api")',
    '     instead of the required `<relative/path>:<symbol-name>` shape (e.g.',
    '     `<path-segment>/<path-segment>:<symbol-name>`).',
    '  3. Every enum field uses one of the listed values verbatim — no synonyms.',
    '  4. Every `needs_verification[].attempted_resolution[]` entry starts with',
    '     a tool token — `Read` / `Grep` / `Glob` / `Bash` / `mcp__code_graph__<tool>`',
    '     — OR the literal prefix `human: ` followed by ≥20 chars of explanation.',
    '     Plain prose (e.g. "I tried searching for X") is rejected.',
    '  5. Every per-service map key matches a service id from the AUTHORITATIVE',
    '     SERVICE LIST verbatim. New IDs are rejected.',
    '  6. The `agent_name` field is the exact literal value shown in the',
    '     skeleton above; no other value is accepted.',
    '  7. Optional fields use the `"<key>?"` form in the skeleton — OMIT them',
    '     entirely when no value applies. Never emit `"<key>": null`.',
  ].join('\n');
}

export const criticBlock: PromptScriptHandler = {
  name: 'critic-block',
  description:
    "Render an agent's Zod output schema as a CRITIC block: skeleton + " +
    'inlined constraints (min/max, regex, enum, description) + pre-emit ' +
    'checklist + stack-agnostic reminder. Replaces the older `schema-skeleton` ' +
    'script for analyzers that need first-attempt schema correctness.',
  run(args) {
    const agent = args.agent;
    if (!agent) {
      return `<!-- prompt-script 'critic-block': missing 'agent' arg -->`;
    }
    const schema = (AGENT_OUTPUT_SCHEMAS as Record<string, unknown>)[agent];
    if (!schema) {
      return `<!-- prompt-script 'critic-block': unknown agent '${agent}' -->`;
    }

    const body = renderSchemaSkeleton(schema as Parameters<typeof renderSchemaSkeleton>[0]);

    return [
      '',
      BANNER,
      'OUTPUT CONTRACT (CRITIC) — Zod-derived; the Stop hook validates against the same schema',
      BANNER,
      '',
      'CRITICAL: emit the JSON below ON THE FIRST ATTEMPT. The framework rejects',
      'any mismatch (regex, length, enum, required field) via the Stop hook;',
      'each rejection costs one full regeneration (≈80–300 s on a large output)',
      'and burns subscription tokens.',
      '',
      'Skeleton legend:',
      '  - `"<key>"` is REQUIRED; `"<key>?"` is OPTIONAL — OMIT optional keys when no value applies (never emit `null`).',
      '  - `"<string ≥1, ≤120>"` means string length must be between 1 and 120 chars.',
      '  - `pattern=…` after a string field is a literal JS regex that the field MUST match.',
      '  - `"<a|b|c>"` is a closed enum — use exactly one of the listed tokens.',
      '  - `[<X>] ≤N` is an array of at most N items.',
      '  - `// "<key>": FORBIDDEN` lines mark fields the schema rejects entirely — do not emit them.',
      '',
      '```jsonc',
      body,
      '```',
      '',
      buildPreEmitChecklist(),
      '',
      `${BANNER}`,
      CRITIC_STACK_AGNOSTIC_REMINDER,
      BANNER,
    ].join('\n');
  },
};
