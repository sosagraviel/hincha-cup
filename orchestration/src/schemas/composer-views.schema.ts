/**
 * Composer-views schemas.
 *
 * The synthesizer (Phase 3) is a *composer*, not an investigator. Phase 2
 * pre-flattens analyzer outputs + per-service slices into four
 * input views — one per output section — that the synthesizer reads
 * verbatim. Each view carries:
 *
 *   - leaf data (free-form strings — `kind` / `pattern` / `language` are
 *     never enumerated),
 *   - a `present.*` flag block telling the synthesizer which sections to
 *     render (skipping empty sections instead of fabricating).
 *
 * Stack-agnostic by construction: every leaf is `z.string()` or a
 * record of strings. A 2011 PHP monolith populates `style: "psr-12"`;
 * a 2026 Erlang OTP cluster populates `style: "elvis-style-rebar3"`.
 * The framework never closes the set.
 *
 * Schema version: incremented when the shape changes in a way the
 * synthesizer prompt assumes. The synthesizer asserts `schema_version`
 * on Read; bumping requires explicit migration.
 */

import { z } from 'zod';
import { CodeSnippetSchema, NeedsVerificationEntrySchema } from './phase1-base.schema.js';
import { RequestLifecycleStepSchema, TestingExampleSchema } from './service-detail-slice.schema.js';

const SCHEMA_VERSION = 1;

/**
 * Provenance tag for every composer-view sub-section. Tells the run
 * report (and the synthesizer prompt) where each field came from: a
 * per-service slice, a Phase 1 analyzer's direct rollup, the
 * deterministic-derivation library, or nowhere (the project genuinely
 * lacks the evidence). Priority order in the composer fallback chain:
 * slice > analyzer > deterministic > absent.
 */
export const SourceTagSchema = z.enum(['slice', 'analyzer', 'deterministic', 'absent']);
export type SourceTag = z.infer<typeof SourceTagSchema>;

/**
 * Per-service summary surfaced into every view's `services[]` array.
 * The composer copies only the descriptive fields (id / path / type /
 * language) — never the full structure-analyzer service entry — so
 * downstream prompts have a small, stable shape to iterate over.
 */
export const ComposerServiceRefSchema = z
  .object({
    id: z.string().min(1),
    path: z.string(),
    type: z.string().optional(),
    language: z.string().optional(),
  })
  .strict();
export type ComposerServiceRef = z.infer<typeof ComposerServiceRefSchema>;

/**
 * Input view for `<project>/.claude/skills/code-conventions/SKILL.md`.
 *
 * Fed by:
 *   - Phase 1 code-patterns analyzer findings (project-level
 *     `quality_tools.enforcement_summary` + cross-cutting patterns).
 *   - Per-service slices (`code_patterns[]` per service →
 *     grouped into a `by_service` map keyed by canonical id).
 *
 * The synthesizer renders one section per non-empty `by_service` entry
 * plus a "Cross-cutting conventions" section when project-level fields
 * are populated.
 */
export const CodeConventionsViewSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string(),
    services: z.array(ComposerServiceRefSchema).default([]),
    /** Per-service code patterns. Empty when no slice. */
    by_service: z
      .record(
        z.string(),
        z
          .object({
            code_patterns: z.array(CodeSnippetSchema).default([]),
            notable: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default({}),
    /** Project-level enforcement summary from the code-patterns analyzer. */
    enforcement_summary: z.string().optional(),
    /**
     * `present.*` flags drive synthesizer section emission. Set true
     * only when the corresponding data is non-empty — skipping is
     * preferable to a fabricated stub.
     */
    present: z
      .object({
        any_service_patterns: z.boolean(),
        enforcement_summary: z.boolean(),
        any_service_patterns_source: SourceTagSchema.optional(),
        enforcement_summary_source: SourceTagSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type CodeConventionsView = z.infer<typeof CodeConventionsViewSchema>;

/**
 * Input view for `<project>/.claude/skills/multi-file-workflows/SKILL.md`.
 *
 * Fed by:
 *   - Phase 1 data-flows analyzer (`event_pipeline`, `auth_flow`).
 *   - Per-service slices (`request_lifecycle` per service).
 *
 * The synthesizer renders one "Request Lifecycle" subsection per
 * service that has a populated `request_lifecycle` and one
 * cross-cutting "Project-level flows" section when the analyzer-level
 * `event_pipeline` / `auth_flow` are populated.
 */
export const MultiFileWorkflowsViewSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string(),
    services: z.array(ComposerServiceRefSchema).default([]),
    by_service: z
      .record(
        z.string(),
        z
          .object({
            request_lifecycle: z.array(RequestLifecycleStepSchema).default([]),
          })
          .strict(),
      )
      .default({}),
    event_pipeline: z
      .object({
        summary: z.string(),
        examples: z.array(CodeSnippetSchema).default([]),
      })
      .strict()
      .optional(),
    auth_flow: z
      .object({
        summary: z.string(),
        examples: z.array(CodeSnippetSchema).default([]),
      })
      .strict()
      .optional(),
    present: z
      .object({
        any_request_lifecycle: z.boolean(),
        event_pipeline: z.boolean(),
        auth_flow: z.boolean(),
        any_request_lifecycle_source: SourceTagSchema.optional(),
        event_pipeline_source: SourceTagSchema.optional(),
        auth_flow_source: SourceTagSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type MultiFileWorkflowsView = z.infer<typeof MultiFileWorkflowsViewSchema>;

/**
 * Input view for `<project>/.claude/skills/testing-conventions/SKILL.md`.
 *
 * Fed by:
 *   - Phase 1 code-patterns analyzer findings (project-level testing
 *     summary, runner names).
 *   - Per-service slices (`testing.representative_examples` per service).
 *
 * The synthesizer renders one "Examples in <service>" subsection per
 * service that has populated examples + a "Project-level conventions"
 * section when the project summary is populated.
 */
export const TestingConventionsViewSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string(),
    services: z.array(ComposerServiceRefSchema).default([]),
    by_service: z
      .record(
        z.string(),
        z
          .object({
            representative_examples: z.array(TestingExampleSchema).default([]),
            notes: z.string().optional(),
          })
          .strict(),
      )
      .default({}),
    project_level: z
      .object({
        summary: z.string().optional(),
        runners: z.array(z.string()).default([]),
      })
      .strict()
      .optional(),
    present: z
      .object({
        any_service_tests: z.boolean(),
        project_summary: z.boolean(),
        any_service_tests_source: SourceTagSchema.optional(),
        project_summary_source: SourceTagSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type TestingConventionsView = z.infer<typeof TestingConventionsViewSchema>;

/**
 * Input view for `<tempDir>/architectural-narrative.md` — the
 * descriptive prose section that downstream feeds the wiki-generator
 * (it is NOT a skill body; persisted to `<tempDir>/architectural-
 * narrative.md`).
 *
 * Fed by:
 *   - Phase 1 structure analyzer (`repository_shape_summary`,
 *     `architecture_decisions`).
 *   - Phase 1 tech-stack analyzer (`runtime_versions`,
 *     `external_services`).
 *   - Per-service slices (`notable[]` per service rolled up into a
 *     `by_service.notable` map).
 *
 * The synthesizer composes a 3-5 paragraph narrative covering the
 * shape, the decisions, the runtime, and the cross-cutting notable
 * items. Stack-agnostic — none of the leaves are enumerated.
 */
export const ArchitectureNarrativeViewSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string(),
    services: z.array(ComposerServiceRefSchema).default([]),
    repository_shape_summary: z.string().optional(),
    architecture_decisions: z.array(z.string()).default([]),
    runtime_versions: z.record(z.string(), z.string()).default({}),
    external_services: z
      .array(
        z
          .object({
            name: z.string(),
            kind: z.string().optional(),
            sample_usage_quote: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    by_service: z
      .record(
        z.string(),
        z
          .object({
            notable: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default({}),
    present: z
      .object({
        repository_shape_summary: z.boolean(),
        architecture_decisions: z.boolean(),
        runtime_versions: z.boolean(),
        external_services: z.boolean(),
        any_service_notable: z.boolean(),
        repository_shape_summary_source: SourceTagSchema.optional(),
        architecture_decisions_source: SourceTagSchema.optional(),
        runtime_versions_source: SourceTagSchema.optional(),
        external_services_source: SourceTagSchema.optional(),
        any_service_notable_source: SourceTagSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type ArchitectureNarrativeView = z.infer<typeof ArchitectureNarrativeViewSchema>;

/**
 * Convenience envelope returned by `buildComposerViews`. Each view is
 * also written to its own file on disk so the synthesizer can Read one
 * view at a time (less context per spawn).
 */
export const ComposerViewsBundleSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string(),
    code_conventions: CodeConventionsViewSchema,
    multi_file_workflows: MultiFileWorkflowsViewSchema,
    testing_conventions: TestingConventionsViewSchema,
    architecture_narrative: ArchitectureNarrativeViewSchema,
    /**
     * Carry needs-verification items forward into the views so the
     * synthesizer can render an "Open questions" appendix when any
     * analyzer or per-service sub-agent surfaced one.
     */
    needs_verification: z.array(NeedsVerificationEntrySchema).default([]),
  })
  .strict();
export type ComposerViewsBundle = z.infer<typeof ComposerViewsBundleSchema>;

export const COMPOSER_VIEWS_SCHEMA_VERSION = SCHEMA_VERSION;
