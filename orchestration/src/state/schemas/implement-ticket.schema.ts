import { z } from "zod";

/**
 * State schema for implement-ticket workflow
 * 11-Phase Architecture:
 * Phase 0: Preflight Validation
 * Phase 1: Context Gathering
 * Phase 2: Planning & Architecture
 * Phase 3: Environment Setup
 * Phase 4: Implementation
 * Phase 5: Testing
 * Phase 6: Visual Verification
 * Phase 7: Documentation Update
 * Phase 8: PR Creation
 * Phase 9: Review Loop
 * Phase 10: Cleanup
 *
 * Each phase has retry with exponential backoff and error feedback
 * Each phase writes outputs to disk BEFORE returning state (idempotency)
 */

// ============================================================================
// PHASE 0: PREFLIGHT VALIDATION SCHEMAS
// ============================================================================

export const Phase0PreflightSchema = z.object({
  stack_profile: z.any(), // From .claude/CLAUDE.md
  framework_config: z.any(), // From .claude/framework-config.json
  test_commands: z.object({
    unit: z.array(z.string()).optional(),
    integration: z.array(z.string()).optional(),
    e2e: z.array(z.string()).optional()
  }).optional(),
  git_clean: z.boolean(),
  timestamp: z.string()
});

// ============================================================================
// PHASE 1: CONTEXT GATHERING SCHEMAS
// ============================================================================

export const Phase1ContextSchema = z.object({
  full_context: z.string(), // Main context markdown
  external_docs: z.string().optional(), // External docs fetched
  source: z.enum(['jira', 'markdown', 'input']),
  timestamp: z.string()
});

// ============================================================================
// PHASE 2: PLANNING SCHEMAS
// ============================================================================

export const Phase2PlanningSchema = z.object({
  implementation_plan: z.string(), // Markdown plan
  test_plan: z.any(), // Structured test plan
  environment_requirements: z.any().optional(), // Docker, env vars, etc.
  timestamp: z.string()
});

// ============================================================================
// PHASE 3: ENVIRONMENT SETUP SCHEMAS
// ============================================================================

export const Phase3EnvironmentSchema = z.object({
  port: z.number().optional(), // Allocated port for this ticket
  docker_config: z.any().optional(), // Docker compose override config
  environment_config: z.any(), // Environment variables, etc.
  screenshots_before: z.array(z.string()).optional(), // Paths to before screenshots
  timestamp: z.string()
});

// ============================================================================
// PHASE 4: IMPLEMENTATION SCHEMAS
// ============================================================================

export const Phase4ImplementationSchema = z.object({
  implementation_log: z.string(), // Log of implementation
  files_modified: z.array(z.string()), // List of modified files
  file_statistics: z.object({
    filesChanged: z.number(),
    linesAdded: z.number(),
    linesRemoved: z.number()
  }), // Git statistics about changes
  primary_language: z.string().optional(), // Primary language used
  agent_used: z.string(), // Which implementer agent was used
  timestamp: z.string()
});

// ============================================================================
// PHASE 5: TESTING SCHEMAS
// ============================================================================

export const Phase5TestingSchema = z.object({
  test_results: z.any(), // Framework-specific test results
  coverage: z.object({
    percentage: z.number().optional(),
    html_path: z.string().optional(),
    json_path: z.string().optional()
  }).optional(),
  all_passed: z.boolean(),
  timestamp: z.string()
});

// ============================================================================
// PHASE 6: VISUAL VERIFICATION SCHEMAS
// ============================================================================

export const Phase6VisualSchema = z.object({
  screenshots_after: z.array(z.string()), // Paths to after screenshots
  diff_report: z.any(), // Comparison metrics
  diff_percentage: z.number().optional(),
  verdict: z.enum(['passed', 'failed', 'skipped']),
  iteration_count: z.number().default(0),
  // Dual-mode visual testing fields (optional for backward compatibility)
  visual_mode: z.enum(['figma', 'screenshot', 'both', 'legacy']).optional(),
  config_used: z.string().optional(), // Path to ui-visual-testing.json if used
  figma_comparisons: z.any().optional(), // Figma mode comparison results
  regression_comparisons: z.any().optional(), // Screenshot mode comparison results
  timestamp: z.string()
});

// ============================================================================
// PHASE 7: DOCUMENTATION SCHEMAS
// ============================================================================

export const Phase7DocumentationSchema = z.object({
  doc_updates: z.any(), // Documentation changes made
  claude_md_updated: z.boolean().default(false),
  project_context_updated: z.boolean().default(false),
  timestamp: z.string()
});

// ============================================================================
// PHASE 8: PR CREATION SCHEMAS
// ============================================================================

export const Phase8PRSchema = z.object({
  pr_url: z.string(),
  pr_description: z.string(), // Generated PR description
  commit_sha: z.string().optional(),
  branch_name: z.string().optional(),
  timestamp: z.string()
});

// ============================================================================
// PHASE 9: REVIEW LOOP SCHEMAS
// ============================================================================

export const Phase9ReviewSchema = z.object({
  pr_review_results: z.any(), // PR review findings
  security_review_results: z.any().optional(), // Security scan results
  iteration_count: z.number().default(0),
  all_resolved: z.boolean(),
  timestamp: z.string()
});

// ============================================================================
// PHASE 10: CLEANUP SCHEMAS
// ============================================================================

export const Phase10CleanupSchema = z.object({
  docker_stopped: z.boolean().default(false),
  artifacts_archived: z.boolean().default(false),
  archive_path: z.string().optional(),
  timestamp: z.string()
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
  next_delay_ms: z.number().optional(), // Exponential backoff delay
  started_at: z.string().optional(),
  completed_at: z.string().optional()
});

// ============================================================================
// MAIN WORKFLOW STATE
// ============================================================================

export const ImplementTicketStateSchema = z.object({
  // Inputs
  ticket_id: z.string(),
  input_source: z.enum(['jira', 'markdown', 'input']),
  input_value: z.string(), // Jira URL, file path, or direct input
  project_path: z.string(),
  framework_path: z.string(),

  // Phase control
  start_phase: z.number().min(0).max(10).default(0).optional(),

  // Current phase tracking
  current_phase: z.enum([
    'init',
    'phase0_preflight',
    'phase1_context',
    'phase2_planning',
    'phase3_environment',
    'phase4_implementation',
    'phase5_testing',
    'phase6_visual',
    'phase7_documentation',
    'phase8_pr',
    'phase9_review',
    'phase10_cleanup',
    'complete',
    'failed'
  ]).default('init'),

  // Phase completion flags (for flow control only - data is on disk!)
  phase0_complete: z.boolean().default(false),
  phase1_complete: z.boolean().default(false),
  phase2_complete: z.boolean().default(false),
  phase3_complete: z.boolean().default(false),
  phase4_complete: z.boolean().default(false),
  phase5_complete: z.boolean().default(false),
  phase6_complete: z.boolean().default(false),
  phase7_complete: z.boolean().default(false),
  phase8_complete: z.boolean().default(false),
  phase9_complete: z.boolean().default(false),
  phase10_complete: z.boolean().default(false),

  // Phase outputs (stored in state for framework-config.json generation)
  // NOTE: Next phase MUST read from disk files, NOT from these state fields!
  phase0_preflight: Phase0PreflightSchema.optional(),
  phase1_context: Phase1ContextSchema.optional(),
  phase2_planning: Phase2PlanningSchema.optional(),
  phase3_environment: Phase3EnvironmentSchema.optional(),
  phase4_implementation: Phase4ImplementationSchema.optional(),
  phase5_testing: Phase5TestingSchema.optional(),
  phase6_visual: Phase6VisualSchema.optional(),
  phase7_documentation: Phase7DocumentationSchema.optional(),
  phase8_pr: Phase8PRSchema.optional(),
  phase9_review: Phase9ReviewSchema.optional(),
  phase10_cleanup: Phase10CleanupSchema.optional(),

  // Temp directory for intermediate files
  // All outputs written to: .claude-temp/implement-ticket/{TICKET_ID}/phase{N}/
  temp_dir: z.string().optional(),

  // Retry tracking (with exponential backoff and error feedback)
  phase0_retry: RetryStateSchema.optional(),
  phase1_retry: RetryStateSchema.optional(),
  phase2_retry: RetryStateSchema.optional(),
  phase3_retry: RetryStateSchema.optional(),
  phase4_retry: RetryStateSchema.optional(),
  phase5_retry: RetryStateSchema.optional(),
  phase6_retry: RetryStateSchema.optional(),
  phase7_retry: RetryStateSchema.optional(),
  phase8_retry: RetryStateSchema.optional(),
  phase9_retry: RetryStateSchema.optional(),
  phase10_retry: RetryStateSchema.optional(),

  // Global error tracking
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),

  // Workflow metadata
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  total_duration_ms: z.number().optional(),

  // Checkpointing
  checkpoint_id: z.string().optional()
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Phase0Preflight = z.infer<typeof Phase0PreflightSchema>;
export type Phase1Context = z.infer<typeof Phase1ContextSchema>;
export type Phase2Planning = z.infer<typeof Phase2PlanningSchema>;
export type Phase3Environment = z.infer<typeof Phase3EnvironmentSchema>;
export type Phase4Implementation = z.infer<typeof Phase4ImplementationSchema>;
export type Phase5Testing = z.infer<typeof Phase5TestingSchema>;
export type Phase6Visual = z.infer<typeof Phase6VisualSchema>;
export type Phase7Documentation = z.infer<typeof Phase7DocumentationSchema>;
export type Phase8PR = z.infer<typeof Phase8PRSchema>;
export type Phase9Review = z.infer<typeof Phase9ReviewSchema>;
export type Phase10Cleanup = z.infer<typeof Phase10CleanupSchema>;
export type RetryState = z.infer<typeof RetryStateSchema>;
export type ImplementTicketState = z.infer<typeof ImplementTicketStateSchema>;

// ============================================================================
// LANGGRAPH ANNOTATION (Required for state updates)
// ============================================================================

import { Annotation } from '@langchain/langgraph';

/**
 * LangGraph Annotation for Implement Ticket Workflow
 *
 * This Annotation uses merge reducers for:
 * - errors/warnings: Concatenate arrays from multiple nodes
 * - phase completion flags: Merge updates
 *
 * All other fields use LastValue reducer (default behavior)
 */
export const ImplementTicketAnnotation = Annotation.Root({
  // ============================================================================
  // INPUTS (use default LastValue reducer)
  // ============================================================================
  ticket_id: Annotation<string>,
  input_source: Annotation<'jira' | 'markdown' | 'input'>,
  input_value: Annotation<string>,
  project_path: Annotation<string>,
  framework_path: Annotation<string>,

  // ============================================================================
  // PHASE CONTROL (use default LastValue reducer)
  // ============================================================================
  start_phase: Annotation<number | undefined>,

  // ============================================================================
  // PHASE TRACKING (use custom reducer)
  // ============================================================================
  current_phase: Annotation<
    | 'init'
    | 'phase0_preflight'
    | 'phase1_context'
    | 'phase2_planning'
    | 'phase3_environment'
    | 'phase4_implementation'
    | 'phase5_testing'
    | 'phase6_visual'
    | 'phase7_documentation'
    | 'phase8_pr'
    | 'phase9_review'
    | 'phase10_cleanup'
    | 'complete'
    | 'failed'
  >({
    reducer: (left, right) => {
      // Priority order (highest to lowest)
      const priority = {
        'failed': 100,
        'complete': 90,
        'phase10_cleanup': 80,
        'phase9_review': 70,
        'phase8_pr': 60,
        'phase7_documentation': 50,
        'phase6_visual': 40,
        'phase5_testing': 30,
        'phase4_implementation': 20,
        'phase3_environment': 15,
        'phase2_planning': 12,
        'phase1_context': 11,
        'phase0_preflight': 10,
        'init': 0
      };

      const leftPriority = priority[left] ?? -1;
      const rightPriority = priority[right] ?? -1;

      return rightPriority >= leftPriority ? right : left;
    },
    default: () => 'init'
  }),

  // ============================================================================
  // PHASE COMPLETION FLAGS (use LastValue reducer with explicit value function)
  // ============================================================================
  phase0_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase1_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase2_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase3_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase4_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase5_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase6_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase7_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase8_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase9_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),
  phase10_complete: Annotation<boolean>({ value: (x, y) => y ?? x, default: () => false }),

  // ============================================================================
  // PHASE OUTPUTS (use default LastValue reducer)
  // ============================================================================
  phase0_preflight: Annotation<Phase0Preflight | undefined>,
  phase1_context: Annotation<Phase1Context | undefined>,
  phase2_planning: Annotation<Phase2Planning | undefined>,
  phase3_environment: Annotation<Phase3Environment | undefined>,
  phase4_implementation: Annotation<Phase4Implementation | undefined>,
  phase5_testing: Annotation<Phase5Testing | undefined>,
  phase6_visual: Annotation<Phase6Visual | undefined>,
  phase7_documentation: Annotation<Phase7Documentation | undefined>,
  phase8_pr: Annotation<Phase8PR | undefined>,
  phase9_review: Annotation<Phase9Review | undefined>,
  phase10_cleanup: Annotation<Phase10Cleanup | undefined>,

  // ============================================================================
  // TEMP DIRECTORY (use default LastValue reducer)
  // ============================================================================
  temp_dir: Annotation<string | undefined>,

  // ============================================================================
  // RETRY TRACKING (use default LastValue reducer)
  // ============================================================================
  phase0_retry: Annotation<RetryState | undefined>,
  phase1_retry: Annotation<RetryState | undefined>,
  phase2_retry: Annotation<RetryState | undefined>,
  phase3_retry: Annotation<RetryState | undefined>,
  phase4_retry: Annotation<RetryState | undefined>,
  phase5_retry: Annotation<RetryState | undefined>,
  phase6_retry: Annotation<RetryState | undefined>,
  phase7_retry: Annotation<RetryState | undefined>,
  phase8_retry: Annotation<RetryState | undefined>,
  phase9_retry: Annotation<RetryState | undefined>,
  phase10_retry: Annotation<RetryState | undefined>,

  // ============================================================================
  // ERROR TRACKING (use array concatenation reducer)
  // ============================================================================
  errors: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),

  warnings: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),

  // ============================================================================
  // METADATA (use default LastValue reducer)
  // ============================================================================
  started_at: Annotation<string | undefined>,
  completed_at: Annotation<string | undefined>,
  total_duration_ms: Annotation<number | undefined>,
  checkpoint_id: Annotation<string | undefined>
});
