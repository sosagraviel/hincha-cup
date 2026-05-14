import { z } from 'zod';

/**
 * State schema for initialize-project workflow
 * 6-Phase Architecture:
 * Phase 1: Parallel Analysis (4 agents)
 * Phase 2: Consolidation & Gap Analysis
 * Phase 3: Opus Synthesis (emits 5 sections: CLAUDE.md + 3 prescriptive
 *   convention skills + an architectural narrative)
 * Phase 4: Context Generation (writes CLAUDE.md + 3 skills, persists the
 *   architectural narrative to <tempDir>/architectural-narrative.md for the
 *   wiki-generator) and Wiki Generation (LLM-grounded llm-wiki/ pages)
 * Phase 5: Resource Copying
 * Phase 6: Final Validation
 *
 * Each phase has retry with exponential backoff and error feedback
 */

export const AnalyzerOutputSchema = z.object({
  agent_name: z.enum([
    'structure-architecture-analyzer',
    'tech-stack-dependencies-analyzer',
    'code-patterns-testing-analyzer',
    'data-flows-integrations-analyzer',
  ]),
  timestamp: z.string(),
  graph_queries_used: z.array(z.string()).default([]).optional(),
  findings: z.any(),
  needs_verification: z.array(z.any()).max(5).optional(),
  confidence_level: z.enum(['high', 'medium', 'low']).optional(),
});

export const CodeGraphStatsSchema = z.object({
  files: z.number().optional(),
  functions: z.number().optional(),
  classes: z.number().optional(),
  edges: z.number().optional(),
  languages: z.array(z.string()).optional(),
  build_time_ms: z.number().optional(),
});

export const Phase1AnalysisSchema = z.object({
  structure_architecture: AnalyzerOutputSchema.optional(),
  tech_stack_dependencies: AnalyzerOutputSchema.optional(),
  code_patterns_testing: AnalyzerOutputSchema.optional(),
  data_flows_integrations: AnalyzerOutputSchema.optional(),
  all_completed: z.boolean().default(false),
  completion_timestamp: z.string().optional(),
});

export const Phase2ConsolidationSchema = z.object({
  consolidated_findings: z.any(),
  identified_gaps: z.array(z.string()).optional(),
  conflicting_findings: z.array(z.string()).optional(),
  timestamp: z.string(),
});

/**
 * Phase 3 synthesis emits five sections; the four file-bound bodies are
 * surfaced under `extracted_files`. The architectural narrative is
 * persisted to disk for the wiki-generator and is not duplicated in
 * state.
 */
export const Phase3SynthesisSchema = z.object({
  synthesis_content: z.string(),
  extracted_files: z
    .object({
      claude_md: z.string().optional(),
      code_conventions_md: z.string().optional(),
      multi_file_workflows_md: z.string().optional(),
      testing_conventions_md: z.string().optional(),
    })
    .optional(),
  timestamp: z.string(),
  validation_passed: z.boolean().default(false),
});

/**
 * Phase 4 writes:
 *   - `<project>/.claude/CLAUDE.md`.
 *   - Three prescriptive skills:
 *     `<project>/.claude/skills/code-conventions/SKILL.md`,
 *     `<project>/.claude/skills/multi-file-workflows/SKILL.md`,
 *     `<project>/.claude/skills/testing-conventions/SKILL.md`
 *     (paths use `.codex/` on Codex). `conventions_skills_written` is
 *     a single rollup so consumers can gate on "all three persisted".
 *   - The architectural narrative to
 *     `<tempDir>/architectural-narrative.md` (descriptive prose for the
 *     wiki-generator; not a skill).
 */
export const Phase4ContextSchema = z.object({
  claude_md_written: z.boolean().default(false),
  conventions_skills_written: z.boolean().default(false),
  architectural_narrative_written: z.boolean().default(false),
  stack_profile: z.any().optional(),
  framework_config_generated: z.boolean().default(false),
  timestamp: z.string(),
});

export const PhaseWikiGenerationSchema = z.object({
  llm_wiki_written: z.boolean().default(false),
  files: z.array(z.string()).default([]),
  timestamp: z.string(),
});

/**
 * Phase 4b internal work-area — populated across the wiki-generation
 * subgraph. Each parallel core-doc node writes exactly one slot; the
 * merge reducer on the Annotation prevents last-write-wins overwrites.
 * Not persisted as a final output.
 *
 * `digestedUpstream` is the closed-book wiki-generator's sole narrative
 * source: synthesis output, the generated CLAUDE.md, and the
 * architectural narrative emitted by Phase 3.
 */
export const Phase4WikiDocsSchema = z.object({
  context: z
    .object({
      analyzers: z.any(),
      stackProfile: z.any().optional(),
      generatedAt: z.string(),
      // Digested upstream piped into the closed-book wiki-generator. All
      // three come from earlier phases of the same workflow; the wiki agent
      // has no filesystem access, so these strings are its sole narrative
      // source.
      digestedUpstream: z
        .object({
          synthesis: z.string().optional(),
          claudeMd: z.string().optional(),
          architecturalNarrative: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  architecture: z.any().optional(),
  service_docs: z.array(z.any()).optional(),
});

export const RetryStateSchema = z.object({
  attempt: z.number().default(0),
  max_attempts: z.number().default(5),
  last_error: z.string().optional(),
  error_history: z.array(z.string()).default([]),
  last_output: z.string().optional(),
  output_history: z.array(z.string()).default([]),
  next_delay_ms: z.number().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  session_id: z.string().optional(),
});

export const Phase1RetryTrackingSchema = z.object({
  structure_architecture: RetryStateSchema.optional(),
  tech_stack_dependencies: RetryStateSchema.optional(),
  code_patterns_testing: RetryStateSchema.optional(),
  data_flows_integrations: RetryStateSchema.optional(),
});

export const InitializeProjectStateSchema = z.object({
  project_path: z.string(),
  framework_path: z.string(),

  start_phase: z.number().min(1).max(6).default(1).optional(),

  code_graph_available: z.boolean().optional(),
  code_graph_path: z.string().optional(),
  code_graph_stats: CodeGraphStatsSchema.optional(),
  code_graph_error: z.string().optional(),

  current_phase: z
    .enum([
      'init',
      'phase0_graph',
      'phase1_analysis',
      'phase2_consolidation',
      'phase3_synthesis',
      'phase4_context',
      'phase4_wiki_generation',
      'phase5_resources',
      'phase6_validation',
      'complete',
      'failed',
    ])
    .default('init'),

  phase1_analysis: Phase1AnalysisSchema.optional(),
  phase2_consolidation: Phase2ConsolidationSchema.optional(),
  phase3_synthesis: Phase3SynthesisSchema.optional(),
  phase4_context: Phase4ContextSchema.optional(),
  phase4_wiki_generation: PhaseWikiGenerationSchema.optional(),
  phase4_wiki_docs: Phase4WikiDocsSchema.optional(),

  temp_dir: z.string().optional(),

  phase1_retry_tracking: Phase1RetryTrackingSchema.default({}),
  phase2_retry: RetryStateSchema.optional(),
  phase3_retry: RetryStateSchema.optional(),
  phase4_retry: RetryStateSchema.optional(),

  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),

  framework_config_path: z.string().optional(),
  claude_md_path: z.string().optional(),
  code_conventions_path: z.string().optional(),
  multi_file_workflows_path: z.string().optional(),
  testing_conventions_path: z.string().optional(),
  architectural_narrative_path: z.string().optional(),
  llm_wiki_path: z.string().optional(),
  llm_wiki_files: z.array(z.string()).optional(),

  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  total_duration_ms: z.number().optional(),

  checkpoint_id: z.string().optional(),
});

export type AnalyzerOutput = z.infer<typeof AnalyzerOutputSchema>;
export type CodeGraphStats = z.infer<typeof CodeGraphStatsSchema>;
export type Phase1Analysis = z.infer<typeof Phase1AnalysisSchema>;
export type Phase2Consolidation = z.infer<typeof Phase2ConsolidationSchema>;
export type Phase3Synthesis = z.infer<typeof Phase3SynthesisSchema>;
export type Phase4Context = z.infer<typeof Phase4ContextSchema>;
export type PhaseWikiGeneration = z.infer<typeof PhaseWikiGenerationSchema>;
export type Phase4WikiDocs = z.infer<typeof Phase4WikiDocsSchema>;
export type RetryState = z.infer<typeof RetryStateSchema>;
export type Phase1RetryTracking = z.infer<typeof Phase1RetryTrackingSchema>;
export type InitializeProjectState = z.infer<typeof InitializeProjectStateSchema>;

import { Annotation } from '@langchain/langgraph';

/**
 * LangGraph Annotation for Initialize Project Workflow
 *
 * This Annotation is required to support parallel state updates from Phase 1 analyzers.
 * Key differences from Zod schema:
 *
 * 1. Merge Reducers: Fields updated by parallel nodes use merge reducers
 *    - phase1_retry_tracking: Merges retry state from 4 parallel analyzers
 *    - phase1_analysis: Merges analysis results from 4 parallel analyzers
 *    - errors/warnings: Concatenates arrays from multiple nodes
 *
 * 2. Default Values: Required for all fields that use custom reducers
 *
 * 3. LastValue Reducer: Used for all other fields (default behavior)
 *
 * Why this is needed:
 * - LangGraph's default LastValue reducer only accepts ONE update per step
 * - Phase 1 has 4 nodes running in parallel
 * - Without merge reducers, the graph throws "LastValue can only receive one value per step"
 *
 * See: https://docs.langchain.com/oss/javascript/langgraph/INVALID_CONCURRENT_GRAPH_UPDATE/
 */
export const InitializeProjectAnnotation = Annotation.Root({
  project_path: Annotation<string>,
  framework_path: Annotation<string>,

  start_phase: Annotation<number | undefined>,

  code_graph_available: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  code_graph_path: Annotation<string | undefined>,
  code_graph_stats: Annotation<CodeGraphStats | undefined>,
  code_graph_error: Annotation<string | undefined>,

  current_phase: Annotation<
    | 'init'
    | 'phase0_graph'
    | 'phase1_analysis'
    | 'phase2_consolidation'
    | 'phase3_synthesis'
    | 'phase4_context'
    | 'phase4_wiki_generation'
    | 'phase5_resources'
    | 'phase6_validation'
    | 'complete'
    | 'failed'
  >({
    reducer: (left, right) => {
      const priority = {
        failed: 100,
        complete: 90,
        phase6_validation: 60,
        phase5_resources: 50,
        phase4_wiki_generation: 45,
        phase4_context: 40,
        phase3_synthesis: 30,
        phase2_consolidation: 20,
        phase1_analysis: 10,
        phase0_graph: 5,
        init: 0,
      };

      const leftPriority = priority[left] ?? -1;
      const rightPriority = priority[right] ?? -1;

      return rightPriority >= leftPriority ? right : left;
    },
    default: () => 'init',
  }),

  phase1_analysis: Annotation<Phase1Analysis>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({
      all_completed: false,
    }),
  }),

  phase2_consolidation: Annotation<Phase2Consolidation | undefined>,
  phase3_synthesis: Annotation<Phase3Synthesis | undefined>,
  phase4_context: Annotation<Phase4Context | undefined>,
  phase4_wiki_generation: Annotation<PhaseWikiGeneration | undefined>,

  phase4_wiki_docs: Annotation<Phase4WikiDocs>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),

  temp_dir: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
    default: () => undefined,
  }),

  phase1_retry_tracking: Annotation<Phase1RetryTracking>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),

  phase2_retry: Annotation<RetryState | undefined>,
  phase3_retry: Annotation<RetryState | undefined>,
  phase4_retry: Annotation<RetryState | undefined>,

  errors: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  warnings: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  framework_config_path: Annotation<string | undefined>,
  claude_md_path: Annotation<string | undefined>,
  code_conventions_path: Annotation<string | undefined>,
  multi_file_workflows_path: Annotation<string | undefined>,
  testing_conventions_path: Annotation<string | undefined>,
  architectural_narrative_path: Annotation<string | undefined>,
  llm_wiki_path: Annotation<string | undefined>,
  llm_wiki_files: Annotation<string[] | undefined>,

  started_at: Annotation<string | undefined>,
  completed_at: Annotation<string | undefined>,
  total_duration_ms: Annotation<number | undefined>,
  checkpoint_id: Annotation<string | undefined>,
});
