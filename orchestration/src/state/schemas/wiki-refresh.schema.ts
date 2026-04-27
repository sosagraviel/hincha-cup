import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';
import type { Provider } from '../../providers/types.js';
import { WikiDeltaHintSchema } from '../../services/graph-wiki/wiki-delta-hints.js';
export type { WikiDeltaHint } from '../../services/graph-wiki/wiki-delta-hints.js';

// ============================================================================
// LINT REPORT SHAPE
// Returns an empty lint report. Full structural + semantic checks are added in Phase E.
// ============================================================================

export const LintViolationSchema = z.object({
  page: z.string(),
  rule: z.string(),
  severity: z.enum(['fail', 'warn']),
  message: z.string(),
});

export type LintViolation = z.infer<typeof LintViolationSchema>;

export const LintReportSchema = z.object({
  structural: z.array(LintViolationSchema),
  semantic: z.array(LintViolationSchema),
  stats: z.object({
    pages_scanned: z.number(),
    duration_ms: z.number(),
  }),
});

export type LintReport = z.infer<typeof LintReportSchema>;

// ============================================================================
// GENERATED PAGE SHAPE
// ============================================================================

export const GeneratedPageSchema = z.object({
  filename: z.string(),
  content: z.string(),
});

export type GeneratedPage = z.infer<typeof GeneratedPageSchema>;

// ============================================================================
// WIKI-REFRESH ZOD SCHEMA
// ============================================================================

export const WikiRefreshStateSchema = z.object({
  project_path: z.string(),
  framework_path: z.string(),
  provider: z.enum(['claude', 'codex']) as z.ZodType<Provider>,
  since_commit: z.string().optional(),
  force: z.boolean().default(false),
  pages_filter: z.array(z.string()).optional(),
  dry_run: z.boolean().default(false),
  changed_files: z.array(z.string()).default([]),
  refresh_set: z.array(z.string()).default([]),
  generated_pages: z.array(GeneratedPageSchema).default([]),
  lint_report: LintReportSchema.optional(),
  errors: z.array(z.string()).default([]),
  current_phase: z.string().default('init'),
  hints: z.array(WikiDeltaHintSchema).default([]),
});

export type WikiRefreshState = z.infer<typeof WikiRefreshStateSchema>;

// ============================================================================
// LANGGRAPH ANNOTATION
// Reducers:
//   - scalar fields (strings, booleans, optional objects): last-write-wins
//   - array fields (changed_files, refresh_set, generated_pages, errors): concat
//   - lint_report: merge (nested object, last-write-wins the whole report)
// ============================================================================

export const WikiRefreshAnnotation = {
  project_path: Annotation<string>({
    reducer: (_existing, update) => update,
    default: () => '',
  }),
  framework_path: Annotation<string>({
    reducer: (_existing, update) => update,
    default: () => '',
  }),
  provider: Annotation<Provider>({
    reducer: (_existing, update) => update,
    default: () => 'claude' as Provider,
  }),
  since_commit: Annotation<string | undefined>({
    reducer: (_existing, update) => update,
    default: () => undefined,
  }),
  force: Annotation<boolean>({
    reducer: (_existing, update) => update,
    default: () => false,
  }),
  pages_filter: Annotation<string[] | undefined>({
    reducer: (_existing, update) => update,
    default: () => undefined,
  }),
  dry_run: Annotation<boolean>({
    reducer: (_existing, update) => update,
    default: () => false,
  }),
  changed_files: Annotation<string[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),
  refresh_set: Annotation<string[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),
  generated_pages: Annotation<GeneratedPage[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),
  lint_report: Annotation<LintReport | undefined>({
    reducer: (_existing, update) => update,
    default: () => undefined,
  }),
  errors: Annotation<string[]>({
    reducer: (existing, update) => [...existing, ...update],
    default: () => [],
  }),
  current_phase: Annotation<string>({
    reducer: (_existing, update) => update,
    default: () => 'init',
  }),
  hints: Annotation<import('../../services/graph-wiki/wiki-delta-hints.js').WikiDeltaHint[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),
};
