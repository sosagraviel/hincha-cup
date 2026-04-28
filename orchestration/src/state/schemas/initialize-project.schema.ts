import { z } from 'zod';

/**
 * State schema for initialize-project workflow
 * 6-Phase Architecture:
 * Phase 1: Parallel Analysis (4 agents)
 * Phase 2: Consolidation & Gap Analysis
 * Phase 3: Opus Synthesis
 * Phase 4: Context Generation (CLAUDE.md, project-context)
 * Phase 5: Resource Copying
 * Phase 6: Final Validation
 *
 * Each phase has retry with exponential backoff and error feedback
 */

// ============================================================================
// PHASE 1: PARALLEL ANALYSIS SCHEMAS
// ============================================================================

// Individual Analyzer Output (validated against phase1-analysis.schema.json)
export const AnalyzerOutputSchema = z.object({
  agent_name: z.enum([
    'structure-architecture-analyzer',
    'tech-stack-dependencies-analyzer',
    'code-patterns-testing-analyzer',
    'data-flows-integrations-analyzer',
  ]),
  timestamp: z.string(),
  graph_queries_used: z.array(z.string()).default([]).optional(),
  findings: z.any(), // Flexible structure - accepts anything (avoids Zod v4 beta bugs)
  needs_verification: z.array(z.any()).max(5).optional(), // Accept any structure for needs_verification (max 5 items)
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

// Phase 1 Complete State
export const Phase1AnalysisSchema = z.object({
  structure_architecture: AnalyzerOutputSchema.optional(),
  tech_stack_dependencies: AnalyzerOutputSchema.optional(),
  code_patterns_testing: AnalyzerOutputSchema.optional(),
  data_flows_integrations: AnalyzerOutputSchema.optional(),
  all_completed: z.boolean().default(false),
  completion_timestamp: z.string().optional(),
});

// ============================================================================
// PHASE 2: CONSOLIDATION SCHEMAS
// ============================================================================

export const Phase2ConsolidationSchema = z.object({
  consolidated_findings: z.any(), // Flexible structure - accepts anything (avoids Zod v4 beta bugs)
  identified_gaps: z.array(z.string()).optional(),
  conflicting_findings: z.array(z.string()).optional(),
  timestamp: z.string(),
});

// ============================================================================
// PHASE 3: SYNTHESIS SCHEMAS
// ============================================================================

export const Phase3SynthesisSchema = z.object({
  synthesis_content: z.string(), // Raw markdown content
  extracted_files: z
    .object({
      claude_md: z.string().optional(),
      project_context_md: z.string().optional(),
    })
    .optional(),
  timestamp: z.string(),
  validation_passed: z.boolean().default(false),
});

// ============================================================================
// PHASE 4: CONTEXT GENERATION SCHEMAS
// ============================================================================

export const Phase4ContextSchema = z.object({
  claude_md_written: z.boolean().default(false),
  project_context_written: z.boolean().default(false),
  stack_profile: z.any().optional(), // Flexible structure - accepts anything (avoids Zod v4 beta bugs)
  framework_config_generated: z.boolean().default(false),
  timestamp: z.string(),
});

export const PhaseWikiGenerationSchema = z.object({
  llm_wiki_written: z.boolean().default(false),
  files: z.array(z.string()).default([]),
  timestamp: z.string(),
});

// Phase 4b internal work-area — populated across the wiki-generation subgraph.
// Each parallel core-doc node writes exactly one slot; the merge reducer on the
// Annotation prevents last-write-wins overwrites. Not persisted as a final output.
export const Phase4WikiDocsSchema = z.object({
  context: z
    .object({
      analyzers: z.any(),
      stackProfile: z.any().optional(),
      generatedAt: z.string(),
      graphVersion: z.string(),
      graphCommit: z.string().optional(),
      // Digested upstream piped into the closed-book wiki-generator. All three
      // come from earlier phases of the same workflow; the wiki agent has no
      // filesystem access, so these strings are its sole narrative source.
      digestedUpstream: z
        .object({
          synthesis: z.string().optional(),
          claudeMd: z.string().optional(),
          projectContext: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  architecture: z.any().optional(),
  data_flows: z.any().optional(),
  patterns: z.any().optional(),
  service_docs: z.array(z.any()).optional(),
});

// ============================================================================
// RETRY AND ERROR TRACKING
// ============================================================================

// Retry state for a single operation (agent or phase)
export const RetryStateSchema = z.object({
  attempt: z.number().default(0),
  max_attempts: z.number().default(5),
  last_error: z.string().optional(),
  error_history: z.array(z.string()).default([]),
  last_output: z.string().optional(), // Store previous failed output for context preservation
  output_history: z.array(z.string()).default([]), // History of failed outputs (last 2)
  next_delay_ms: z.number().optional(), // Exponential backoff delay
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  session_id: z.string().optional(), // UUID for tracking (not for Claude CLI session reuse)
});

// Retry tracking for all Phase 1 agents
export const Phase1RetryTrackingSchema = z.object({
  structure_architecture: RetryStateSchema.optional(),
  tech_stack_dependencies: RetryStateSchema.optional(),
  code_patterns_testing: RetryStateSchema.optional(),
  data_flows_integrations: RetryStateSchema.optional(),
});

// ============================================================================
// MAIN WORKFLOW STATE
// ============================================================================

export const InitializeProjectStateSchema = z.object({
  // Inputs
  project_path: z.string(),
  framework_path: z.string(),

  // Phase control
  start_phase: z.number().min(1).max(6).default(1).optional(),

  // Code graph foundation (Phase 0). The MCP server is stdio-only — there is no
  // port. Any historical `code_graph_mcp_port` field has been removed.
  code_graph_available: z.boolean().optional(),
  code_graph_path: z.string().optional(),
  code_graph_stats: CodeGraphStatsSchema.optional(),
  code_graph_error: z.string().optional(),
  // Live MCP tool catalog fetched from `code-review-graph serve` at Phase 0.
  // Templated into every analyzer prompt so tool names cannot drift between
  // hand-written prompts and the actual server. Empty array when graph is
  // unavailable; the prompt builder falls back to file-discovery guidance.
  code_graph_tool_catalog: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .optional(),

  // Current phase tracking
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

  // Phase outputs (stored for framework-config.json generation)
  phase1_analysis: Phase1AnalysisSchema.optional(),
  phase2_consolidation: Phase2ConsolidationSchema.optional(),
  phase3_synthesis: Phase3SynthesisSchema.optional(),
  phase4_context: Phase4ContextSchema.optional(),
  phase4_wiki_generation: PhaseWikiGenerationSchema.optional(),
  phase4_wiki_docs: Phase4WikiDocsSchema.optional(),

  // Temp directory for intermediate files
  temp_dir: z.string().optional(),

  // Retry tracking (with exponential backoff and error feedback)
  phase1_retry_tracking: Phase1RetryTrackingSchema.default({}),
  phase2_retry: RetryStateSchema.optional(),
  phase3_retry: RetryStateSchema.optional(),
  phase4_retry: RetryStateSchema.optional(),

  // Global error tracking
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),

  // Final outputs
  framework_config_path: z.string().optional(),
  claude_md_path: z.string().optional(),
  project_context_path: z.string().optional(),
  llm_wiki_path: z.string().optional(),
  llm_wiki_files: z.array(z.string()).optional(),

  // Workflow metadata
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  total_duration_ms: z.number().optional(),

  // Checkpointing
  checkpoint_id: z.string().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

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

// ============================================================================
// LANGGRAPH ANNOTATION (Required for parallel state updates)
// ============================================================================

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
  // ============================================================================
  // INPUTS (use default LastValue reducer)
  // ============================================================================
  project_path: Annotation<string>,
  framework_path: Annotation<string>,

  // ============================================================================
  // PHASE CONTROL (use default LastValue reducer)
  // ============================================================================
  start_phase: Annotation<number | undefined>,

  // ============================================================================
  // CODE GRAPH FOUNDATION (Phase 0 POC)
  // ============================================================================
  code_graph_available: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  code_graph_path: Annotation<string | undefined>,
  code_graph_stats: Annotation<CodeGraphStats | undefined>,
  code_graph_error: Annotation<string | undefined>,
  code_graph_tool_catalog: Annotation<Array<{ name: string; description: string }> | undefined>,

  // ============================================================================
  // PHASE TRACKING (use custom reducer for parallel phase updates)
  // ============================================================================
  // Note: Phase 1 has 4 parallel nodes that may all fail simultaneously
  // We need a reducer that can handle multiple "failed" updates
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
      // Priority order (highest to lowest):
      // failed > complete > specific phases > init
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

      // Return the phase with highest priority
      return rightPriority >= leftPriority ? right : left;
    },
    default: () => 'init',
  }),

  // ============================================================================
  // PHASE OUTPUTS (use merge reducer for Phase 1, LastValue for others)
  // ============================================================================

  // Phase 1: Merge results from 4 parallel analyzers
  phase1_analysis: Annotation<Phase1Analysis>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({
      all_completed: false,
    }),
  }),

  // Phases 2-4: Sequential nodes, use default LastValue reducer
  phase2_consolidation: Annotation<Phase2Consolidation | undefined>,
  phase3_synthesis: Annotation<Phase3Synthesis | undefined>,
  phase4_context: Annotation<Phase4Context | undefined>,
  phase4_wiki_generation: Annotation<PhaseWikiGeneration | undefined>,

  // Phase 4b internal work-area: merged across wiki subgraph nodes.
  // Mirrors the phase1_analysis merge-reducer pattern so the 3 parallel core-doc
  // nodes can each set a distinct slot without "INVALID_CONCURRENT_GRAPH_UPDATE".
  phase4_wiki_docs: Annotation<Phase4WikiDocs>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),

  // ============================================================================
  // TEMP DIRECTORY (use custom reducer for parallel updates from Phase 1)
  // ============================================================================
  // Note: All 4 Phase 1 analyzers return the same temp_dir value
  // We need a reducer that can handle multiple identical updates
  temp_dir: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
    default: () => undefined,
  }),

  // ============================================================================
  // RETRY TRACKING (use merge reducer for Phase 1, LastValue for others)
  // ============================================================================

  // Phase 1 Retry Tracking: Merge retry state from 4 parallel analyzers
  // Each analyzer updates its own field:
  //   - structure_architecture_analyzer → updates structure_architecture
  //   - tech_stack_dependencies_analyzer → updates tech_stack_dependencies
  //   - code_patterns_testing_analyzer → updates code_patterns_testing
  //   - data_flows_integrations_analyzer → updates data_flows_integrations
  phase1_retry_tracking: Annotation<Phase1RetryTracking>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),

  // Phases 2-4: Sequential nodes, use default LastValue reducer
  phase2_retry: Annotation<RetryState | undefined>,
  phase3_retry: Annotation<RetryState | undefined>,
  phase4_retry: Annotation<RetryState | undefined>,

  // ============================================================================
  // ERROR TRACKING (use array concatenation reducer)
  // ============================================================================

  // Errors: Concatenate arrays from multiple nodes
  errors: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  // Warnings: Concatenate arrays from multiple nodes
  warnings: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  // ============================================================================
  // FINAL OUTPUTS (use default LastValue reducer)
  // ============================================================================
  framework_config_path: Annotation<string | undefined>,
  claude_md_path: Annotation<string | undefined>,
  project_context_path: Annotation<string | undefined>,
  llm_wiki_path: Annotation<string | undefined>,
  llm_wiki_files: Annotation<string[] | undefined>,

  // ============================================================================
  // METADATA (use default LastValue reducer)
  // ============================================================================
  started_at: Annotation<string | undefined>,
  completed_at: Annotation<string | undefined>,
  total_duration_ms: Annotation<number | undefined>,
  checkpoint_id: Annotation<string | undefined>,
});
