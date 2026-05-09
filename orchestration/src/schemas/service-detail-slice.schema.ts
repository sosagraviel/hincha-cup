/**
 * Plan v4 Phase D — per-service detail slice.
 *
 * The shape every Phase 1.5 service-detail-extractor sub-agent emits, one
 * file per service, written to `<tempDir>/service-details/<service-id>.json`.
 *
 * Why this exists: v3's monolithic §B.3 contract asked the single
 * code-patterns-testing-analyzer to produce per-service `code_patterns[]`
 * for every service in one pass. On gira (six services) the output grew 13×
 * and wall-clock 7× (155 s → 1091 s). v4 splits the work N-ways: one
 * sub-agent per service, MAX_PARALLEL_FANOUT=8 in flight, wall-clock =
 * max(per-service) ≈ 100 s.
 *
 * Stack-agnostic: every field below is text-shape only — no language,
 * framework, or naming convention is enumerated. The agent decides what
 * `kind` labels its snippets carry; the framework groups by that label
 * downstream without ever closing the set.
 */

import { z } from 'zod';
import { CodeSnippetSchema, NeedsVerificationEntrySchema } from './phase1-base.schema.js';

/* --------------------------------------------------------------------- */
/* RequestLifecycleStep — one row in a service's per-request narrative.  */
/* --------------------------------------------------------------------- */

/**
 * One step in the request → handler → service → repo → response chain.
 * The agent writes this in narrative order; the composer renders it as a
 * numbered list in `services/<id>.md` Request Lifecycle section.
 *
 * Fields are intentionally shallow strings — the synthesizer cannot read
 * the source tree, and `step` / `where` carry the structural anchor
 * (handler name, file path, function name) so the operator can locate
 * the implementation by themselves.
 */
export const RequestLifecycleStepSchema = z
  .object({
    step: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'Short verb-led label for this step (e.g. "Receive HTTP request", ' +
          '"Validate body", "Dispatch to use-case", "Persist via repository"). ≤ 120 chars.',
      ),
    where: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'Concrete code anchor — file path + symbol name where this step is implemented ' +
          '(e.g. "src/users/users.controller.ts:UsersController.create"). ≤ 200 chars.',
      ),
    note: z
      .string()
      .max(240)
      .optional()
      .describe(
        'Optional one-liner clarifying what this step does or why it matters. ≤ 240 chars.',
      ),
  })
  .strict();
export type RequestLifecycleStep = z.infer<typeof RequestLifecycleStepSchema>;

/* --------------------------------------------------------------------- */
/* TestingExample — a representative test/spec quote for the service.    */
/* --------------------------------------------------------------------- */

/**
 * One representative test the agent picked from the service. The composer
 * renders these in the per-service `Testing` section so the operator sees
 * the *shape* of tests the project writes (not just the runner name).
 */
export const TestingExampleSchema = z
  .object({
    file: z
      .string()
      .min(1)
      .max(240)
      .describe('Path from repo root to the test file (e.g. "src/users/users.spec.ts").'),
    name: z.string().max(160).optional().describe('Optional test/describe name. ≤ 160 chars.'),
    snippet: CodeSnippetSchema.describe(
      'Representative excerpt (≤ 600 chars). The agent picks the most illustrative ' +
        "test from this service — one that shows the project's testing conventions.",
    ),
  })
  .strict();
export type TestingExample = z.infer<typeof TestingExampleSchema>;

/* --------------------------------------------------------------------- */
/* ServiceDetailSlice — top-level shape per sub-agent.                   */
/* --------------------------------------------------------------------- */

/**
 * One file per service under `<tempDir>/service-details/<service-id>.json`.
 *
 * The sub-agent narrows scope to ONE service:
 *  - `code_patterns[]` — the conventions this service uses (≤ 12 entries).
 *  - `request_lifecycle?` — narrative for backend / serverless / worker
 *    services; omitted for libraries / CLI / infrastructure.
 *  - `testing.representative_examples[]` — concrete tests (≤ 5 entries).
 *  - `notable[]` — short bullets for service-specific gotchas.
 *
 * `agent_name` is locked to the literal `service-detail-extractor` so the
 * Stop hook and downstream loaders can dispatch on a single name.
 *
 * `service_id` is the canonical id from the structure-architecture-analyzer's
 * authoritative service list. The orchestrator passes it into the prompt;
 * the agent must echo it back verbatim. Mismatch → Stop hook rejection.
 */
export const ServiceDetailSliceSchema = z
  .object({
    agent_name: z.literal('service-detail-extractor'),
    timestamp: z.string(),
    service_id: z
      .string()
      .min(1)
      .describe(
        'Canonical service id from the structure-analyzer authoritative list. ' +
          'Echo back verbatim from the prompt — never invent or rename.',
      ),
    graph_queries_used: z.array(z.string()).default([]),
    graph_overflow_count: z.number().optional(),
    graph_overflow_tools: z.array(z.string()).optional(),
    soft_warning: z.array(z.string()).optional(),
    needs_verification: z.array(NeedsVerificationEntrySchema).max(3).optional(),
    findings: z
      .object({
        code_patterns: z
          .array(CodeSnippetSchema)
          .max(12)
          .default([])
          .describe(
            'Representative code-shape patterns used by this service (≤ 12 entries). ' +
              'Each entry is a short verbatim snippet with a free-form `kind` label ' +
              '(e.g. "error-return-pattern", "dto-validation", "controller-shape"). ' +
              'Stack-agnostic: the framework never enumerates a closed list of kinds.',
          ),
        request_lifecycle: z
          .array(RequestLifecycleStepSchema)
          .max(10)
          .optional()
          .describe(
            'Per-request narrative for backend / serverless / worker services. ' +
              'Omit for libraries / CLI / infrastructure. ≤ 10 steps.',
          ),
        testing: z
          .object({
            representative_examples: z
              .array(TestingExampleSchema)
              .max(5)
              .default([])
              .describe("Up to 5 concrete tests illustrating this service's conventions."),
            notes: z
              .string()
              .max(600)
              .optional()
              .describe('Optional ≤ 600 char narrative about testing in this service.'),
          })
          .optional(),
        notable: z
          .array(z.string().min(1).max(280))
          .max(8)
          .optional()
          .describe(
            'Free-form bullets capturing service-specific gotchas the patterns above ' +
              'would not show on their own (e.g. "uses two-stage Docker build", ' +
              '"exposes WebSocket only in dev"). ≤ 8 entries, ≤ 280 chars each.',
          ),
      })
      .strict(),
  })
  .strict();
export type ServiceDetailSlice = z.infer<typeof ServiceDetailSliceSchema>;

/**
 * Shape of the merged `<tempDir>/service-details/_index.json` written
 * after all per-service files land. This is what Phase E composer-views
 * (and the consolidation step) read — they never walk the directory
 * themselves.
 */
export const ServiceDetailIndexSchema = z
  .object({
    timestamp: z.string(),
    services_total: z.number().int().nonnegative(),
    services_completed: z.number().int().nonnegative(),
    services_failed: z.number().int().nonnegative(),
    services_timed_out: z.number().int().nonnegative(),
    soft_warning: z.array(z.string()).default([]),
    /**
     * Map keyed by `service_id` → relative path from `<tempDir>`. Empty
     * when the orchestrator has nothing to record (graph unavailable,
     * authoritative service list empty).
     */
    slices: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type ServiceDetailIndex = z.infer<typeof ServiceDetailIndexSchema>;
