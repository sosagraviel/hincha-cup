import { z, ZodSchema } from 'zod';
import { normalizeLanguage } from './language-normalization.js';

// ============================================================================
// PHASE 1 AGENT OUTPUT SCHEMAS
// ============================================================================
// These schemas define the expected output structure for each Phase 1 analyzer agent.
// They are used for:
// 1. Validation in hooks (Stop hooks that validate agent output)
// 2. Validation in external validators (Phase 1 node validators)
// 3. Type inference in Phase 4 (context generation reads these with TypeScript types)
// 4. Documentation in agent prompts (agents know exact structure to produce)
// ============================================================================

// ----------------------------------------------------------------------------
// Agent 01: Structure & Architecture Analyzer
// ----------------------------------------------------------------------------

export const StructureAnalyzerServiceSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe("Service identifier (e.g., 'backend', 'frontend', 'auth-lambda')"),
    name: z.string().optional().describe('Human-readable service name from manifest or folder'),
    path: z
      .string()
      .describe('Relative path from repo root to service directory (DISCOVERED dynamically)'),
    type: z
      .enum([
        'backend',
        'frontend',
        'serverless',
        'mobile',
        'worker',
        'library',
        'cli',
        'desktop',
        'infrastructure',
      ])
      .describe('Service type inferred from dependencies and entry points'),
    language: z
      .string()
      .transform(normalizeLanguage)
      .describe(
        "Primary language. Normalized to canonical lowercase (e.g., 'typescript', 'python', 'go', 'csharp', 'php'). Aliases like 'tsx' / 'jsx' / 'cs' / 'cpp' / 'rb' / 'kt' / 'py' are auto-mapped. Unknown values pass through unchanged so legacy or unusual stacks still flow downstream.",
      ),
    language_version: z
      .string()
      .optional()
      .describe("Language version from manifest (e.g., '5.8', '3.11', '1.21')"),
    frameworks: z
      .object({
        main: z
          .string()
          .optional()
          .describe(
            "Main framework from dependencies (e.g., 'NestJS 11', 'React 19', 'Flask 3.0')",
          ),
        orm: z
          .string()
          .optional()
          .describe("ORM if detected in dependencies (e.g., 'TypeORM 0.3', 'SQLAlchemy')"),
      })
      .passthrough()
      .describe('Frameworks detected for this service'),
    environment: z
      .object({
        port: z.number().optional().describe('Port number if found in config or code'),
      })
      .passthrough()
      .optional()
      .describe('Environment configuration'),
    file_count: z.number().optional().describe('Number of files in service directory'),
    manifest_file: z
      .string()
      .optional()
      .describe("Path to manifest file (e.g., 'src/api/package.json')"),
  })
  .passthrough();
export type StructureAnalyzerService = z.infer<typeof StructureAnalyzerServiceSchema>;

export const StructureAnalyzerOutputSchema = z
  .object({
    agent_name: z.literal('structure-architecture-analyzer'),
    timestamp: z.string(),
    graph_queries_used: z.array(z.string()).default([]),
    /**
     * Count of graph tool calls whose result exceeded the per-call token cap.
     * Derived by `applyGraphToolUsageFromSidecar` from the Stop hook's sidecar.
     * Optional for back-compat (older replays predate Phase 3 of the
     * graph-navigation redesign and have no value here).
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`. See gira-init-run audit Phase E.
     */
    soft_warning: z.array(z.string()).optional(),
    findings: z
      .object({
        services: z
          .array(StructureAnalyzerServiceSchema)
          .min(1)
          .describe(
            'Array of discovered services (REQUIRED: at least 1) - SINGLE SOURCE OF TRUTH for service discovery',
          ),
        repository_type: z.enum(['monorepo', 'polyrepo', 'single-service']).optional(),
        monorepo_layout: z
          .object({
            root: z.string(),
            // REMOVED: packages array - derivable from services[].path, creates redundancy
            workspace_tool: z
              .string()
              .optional()
              .describe("Workspace manager (e.g., 'pnpm workspaces', 'yarn workspaces', 'lerna')"),
            workspace_paths: z
              .array(z.string())
              .optional()
              .describe("Workspace glob patterns from config (e.g., ['packages/*', 'apps/*'])"),
          })
          .passthrough()
          .optional()
          .describe('Monorepo layout if applicable'),
        automation: z
          .object({
            makefiles: z
              .array(
                z.object({
                  path: z.string().describe('Path to Makefile relative to repo root'),
                  targets: z.array(z.string()).describe('List of make targets found in the file'),
                }),
              )
              .optional()
              .describe('Makefiles found in the project'),
            shell_scripts: z
              .array(
                z.object({
                  path: z.string().describe('Path to shell script relative to repo root'),
                  name: z.string().describe('Script name (filename without path)'),
                  purpose: z
                    .string()
                    .optional()
                    .describe('Script purpose inferred from comments or usage'),
                }),
              )
              .optional()
              .describe('Shell scripts found in the project'),
            justfiles: z
              .array(
                z.object({
                  path: z.string().describe('Path to justfile relative to repo root'),
                  targets: z.array(z.string()).describe('List of just targets found in the file'),
                }),
              )
              .optional()
              .describe('Justfiles found in the project'),
          })
          .optional()
          .describe('Project automation scripts and build files'),
      })
      .passthrough(), // Allow languages[], runtimes{}, architecture_pattern, file_placement{}, path_aliases{}, database{} (multi_stack merged into services)
    needs_verification: z
      .array(
        z
          .object({
            id: z.string(),
            question: z.string(),
            reason: z.string(),
          })
          .passthrough(),
      )
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type StructureAnalyzerOutput = z.infer<typeof StructureAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 02: Tech Stack & Dependencies Analyzer
// ----------------------------------------------------------------------------

export const TechStackAnalyzerServiceSchema = z
  .object({
    id: z.string().min(1).describe('Service ID (must match Agent 01 output)'),
    package_manager: z
      .string()
      .optional()
      .describe("Package manager detected (e.g., 'pnpm', 'poetry', 'go modules')"),
    manifest_file: z.string().optional().describe('Path to manifest file'),
    databases: z
      .array(
        z
          .object({
            type: z
              .string()
              .describe(
                "Database type from client library (e.g., 'postgresql', 'mongodb', 'redis')",
              ),
            client_library: z
              .string()
              .optional()
              .describe("Client library from dependencies (e.g., 'pg', 'psycopg2', 'ioredis')"),
            orm: z
              .string()
              .optional()
              .describe("ORM name from dependencies (e.g., 'TypeORM', 'SQLAlchemy', 'Prisma')"),
            orm_version: z.string().optional().describe('ORM version from manifest'),
            migration_tool: z
              .string()
              .optional()
              .describe("Migration tool detected (e.g., 'TypeORM migrations', 'Alembic')"),
          })
          .passthrough(),
      )
      .optional()
      .describe('Databases used by this service (discovered from dependencies)'),
  })
  .passthrough();
export type TechStackAnalyzerService = z.infer<typeof TechStackAnalyzerServiceSchema>;

export const TechStackAnalyzerOutputSchema = z
  .object({
    agent_name: z.literal('tech-stack-dependencies-analyzer'),
    timestamp: z.string(),
    graph_queries_used: z.array(z.string()).default([]),
    /**
     * Count of graph tool calls whose result exceeded the per-call token cap.
     * Derived by `applyGraphToolUsageFromSidecar` from the Stop hook's sidecar.
     * Optional for back-compat (older replays predate Phase 3 of the
     * graph-navigation redesign and have no value here).
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`. See gira-init-run audit Phase E.
     */
    soft_warning: z.array(z.string()).optional(),
    findings: z
      .object({
        // FORBIDDEN: the `services` array is no longer accepted on this analyzer.
        // Structure Analyzer (01) is the single source of truth for service
        // discovery (its services[] is injected into this prompt as the
        // AUTHORITATIVE SERVICE LIST). Use the `dependencies.by_service` map
        // keyed by those service IDs instead. Schema rejects any output that
        // includes this key (see plans/2026-04-29-gira-init-run-audit-refactor.md
        // findings F8/F22).
        services: z
          .never()
          .optional()
          .describe(
            'FORBIDDEN: top-level findings.services[] is not accepted on this analyzer. Use dependencies.by_service map keyed by service IDs from the AUTHORITATIVE SERVICE LIST in your prompt.',
          ),
        dependencies: z
          .object({
            by_service: z
              .record(
                z.string(),
                z
                  .object({
                    production: z.array(z.string()).optional().describe('Production dependencies'),
                    development: z
                      .array(z.string())
                      .optional()
                      .describe('Development dependencies'),
                  })
                  .passthrough(),
              )
              .optional()
              .describe("Dependencies grouped by service ID (e.g., 'backend', 'web-frontend')"),
          })
          .passthrough()
          .optional()
          .describe('Dependency information organized by service'),
        monorepo: z
          .object({
            package_manager: z.string().optional(),
            workspace_manager: z.string().optional(),
          })
          .passthrough()
          .optional()
          .describe('Monorepo-level configuration if applicable'),
        documented_commands: z
          .object({
            by_task: z
              .object({
                dev: z.string().optional().describe('Development server command'),
                test: z.string().optional().describe('Test execution command'),
                build: z.string().optional().describe('Build command'),
                lint: z.string().optional().describe('Linting command'),
                typecheck: z.string().optional().describe('Type checking command'),
                deploy: z.string().optional().describe('Deployment command'),
              })
              .passthrough()
              .optional()
              .describe('Commands organized by common development tasks'),
            source: z
              .enum(['documented', 'makefile', 'scripts', 'package_json'])
              .optional()
              .describe('Primary source where commands were found'),
            conflicts: z
              .array(
                z.object({
                  task: z.string().describe('Task name that has conflicting commands'),
                  documented: z.string().describe('Command from documentation'),
                  discovered: z.string().describe('Command from other sources'),
                }),
              )
              .optional()
              .describe('Conflicts between documented and discovered commands'),
          })
          .optional()
          .describe('Commands documented in project README, CONTRIBUTING, etc.'),
      })
      .passthrough(), // Allow infrastructure[], ci_cd{}, deployment{}, environment{}, databases[], external_services[], build_tools{}
    needs_verification: z
      .array(
        z
          .object({
            id: z.string(),
            question: z.string(),
            reason: z.string(),
          })
          .passthrough(),
      )
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type TechStackAnalyzerOutput = z.infer<typeof TechStackAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 03: Code Patterns & Testing Analyzer
// ----------------------------------------------------------------------------

export const TestingConfigSchema = z
  .object({
    framework: z.string().describe("Testing framework name (e.g., 'Jest', 'Pytest', 'Playwright')"),
    config_file: z.string().optional().describe('Path to config file relative to repo root'),
    file_pattern: z
      .string()
      .optional()
      .describe("Test file pattern from config (e.g., '**/*.spec.ts')"),
    file_count: z.number().optional().describe('Number of test files matching pattern'),
  })
  .passthrough();

export const CodePatternsAnalyzerServiceSchema = z
  .object({
    id: z.string().min(1).describe('Service ID (must match Agent 01 output)'),
    // REMOVED: frameworks.testing - duplicates testing.*.framework information
    testing: z
      .object({
        unit: TestingConfigSchema.optional().describe(
          'Unit testing configuration (framework is in TestingConfigSchema)',
        ),
        integration: TestingConfigSchema.optional().describe('Integration testing configuration'),
        e2e: TestingConfigSchema.optional().describe('E2E testing configuration'),
      })
      .passthrough()
      .optional()
      .describe('Testing configuration for this service'),
  })
  .passthrough();
export type CodePatternsAnalyzerService = z.infer<typeof CodePatternsAnalyzerServiceSchema>;

export const CodePatternsAnalyzerOutputSchema = z
  .object({
    agent_name: z.literal('code-patterns-testing-analyzer'),
    timestamp: z.string(),
    graph_queries_used: z.array(z.string()).default([]),
    /**
     * Count of graph tool calls whose result exceeded the per-call token cap.
     * Derived by `applyGraphToolUsageFromSidecar` from the Stop hook's sidecar.
     * Optional for back-compat (older replays predate Phase 3 of the
     * graph-navigation redesign and have no value here).
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`. See gira-init-run audit Phase E.
     */
    soft_warning: z.array(z.string()).optional(),
    findings: z
      .object({
        // FORBIDDEN: see TechStackAnalyzerOutputSchema for the rationale.
        // Use the `testing` / `api_patterns` / etc. records keyed by the
        // service IDs supplied in your AUTHORITATIVE SERVICE LIST.
        services: z
          .never()
          .optional()
          .describe(
            'FORBIDDEN: top-level findings.services[] is not accepted on this analyzer. Organize findings by service ID under testing{}/api_patterns{}/etc., using IDs from the AUTHORITATIVE SERVICE LIST in your prompt.',
          ),
        testing: z
          .record(
            z.string(),
            z
              .object({
                unit: TestingConfigSchema.optional(),
                integration: TestingConfigSchema.optional(),
                e2e: TestingConfigSchema.optional(),
              })
              .passthrough(),
          )
          .optional()
          .describe("Testing configuration by service ID (e.g., 'backend': { unit: {...} })"),
      })
      .passthrough(), // Allow additional code pattern and architecture information (api_patterns, naming_conventions, error_handling, async_patterns, etc.)
    needs_verification: z
      .array(
        z
          .object({
            id: z.string(),
            question: z.string(),
            reason: z.string(),
          })
          .passthrough(),
      )
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type CodePatternsAnalyzerOutput = z.infer<typeof CodePatternsAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 04: Data Flows & Integrations Analyzer (Optional)
// ----------------------------------------------------------------------------

export const InfrastructureServiceSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .describe("Infrastructure service identifier (e.g., 'redis', 'postgres', 'mailhog')"),
    type: z
      .string()
      .describe("Infrastructure type (e.g., 'cache', 'database', 'message_queue', 'email')"),
    port: z.number().optional().describe('Port number if configured'),
    used_by: z
      .array(z.string())
      .optional()
      .describe(
        'Array of service IDs that use this infrastructure (references Structure Analyzer services)',
      ),
  })
  .passthrough();

export const DataFlowsAnalyzerOutputSchema = z.object({
  agent_name: z.literal('data-flows-integrations-analyzer'),
  timestamp: z.string(),
  graph_queries_used: z.array(z.string()).default([]),
  /**
   * Count of graph tool calls whose result exceeded the per-call token cap.
   * Derived by `applyGraphToolUsageFromSidecar` from the Stop hook's sidecar.
   */
  graph_overflow_count: z.number().optional(),
  /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
  graph_overflow_tools: z.array(z.string()).optional(),
  findings: z
    .object({
      // FORBIDDEN: top-level `findings.services[]` is rejected here. Application
      // services come from Structure Analyzer (01) via the AUTHORITATIVE SERVICE
      // LIST in this analyzer's prompt. This analyzer's job is to surface
      // INFRASTRUCTURE services (caches, databases, queues, mail servers) under
      // `infrastructure_services` and inter-service communication patterns
      // under `service_communication`. Schema rejects the deprecated key
      // (see plans/2026-04-29-gira-init-run-audit-refactor.md finding F8).
      services: z
        .never()
        .optional()
        .describe(
          'FORBIDDEN: this analyzer does not emit application services. Use infrastructure_services[] for caches/DBs/queues/mail and service_communication{} for service-to-service patterns.',
        ),
      // IMPORTANT: Focus ONLY on infrastructure services (redis, postgres, message queues, email servers)
      // DO NOT list application services here - Structure Analyzer (01) is the single source of truth
      infrastructure_services: z
        .array(InfrastructureServiceSchema)
        .optional()
        .describe(
          'Infrastructure services ONLY (redis, postgres, mailhog, rabbitmq, etc.) - NOT application services',
        ),
      service_communication: z
        .record(
          z.string(),
          z
            .object({
              exposes_api: z.boolean().optional().describe('Whether this service exposes an API'),
              consumed_by: z
                .array(z.string())
                .optional()
                .describe("Service IDs that consume this service's API"),
              protocols: z
                .array(z.string())
                .optional()
                .describe("Communication protocols (e.g., 'rest', 'graphql', 'grpc')"),
            })
            .passthrough(),
        )
        .optional()
        .describe('Service-to-service communication patterns (use service IDs as keys)'),
    })
    .passthrough(), // Allow authentication{}, external_integrations{}, api_design{}, data_patterns{}, etc.
  needs_verification: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        reason: z.string(),
      }),
    )
    .optional()
    .describe('Items that need clarification or verification'),
});
export type DataFlowsAnalyzerOutput = z.infer<typeof DataFlowsAnalyzerOutputSchema>;

// ============================================================================
// SCHEMA REGISTRY - Centralized schema lookup by agent name
// ============================================================================

export const AGENT_OUTPUT_SCHEMAS = {
  'structure-architecture-analyzer': StructureAnalyzerOutputSchema,
  'tech-stack-dependencies-analyzer': TechStackAnalyzerOutputSchema,
  'code-patterns-testing-analyzer': CodePatternsAnalyzerOutputSchema,
  'data-flows-integrations-analyzer': DataFlowsAnalyzerOutputSchema,
} as const;

export type AgentName = keyof typeof AGENT_OUTPUT_SCHEMAS;

/**
 * Get schema for a specific analyzer agent
 * @param agentName - The agent_name field from the output JSON
 * @returns Zod schema for validation, or null if unknown agent
 */
export function getSchemaForAgent(agentName: string): ZodSchema | null {
  if (agentName in AGENT_OUTPUT_SCHEMAS) {
    return AGENT_OUTPUT_SCHEMAS[agentName as AgentName];
  }
  return null;
}

/**
 * Validate agent output with automatic schema selection
 *
 * This function:
 * 1. Checks that output is an object with agent_name field
 * 2. Validates agent_name is a known agent
 * 3. Selects the correct schema from registry
 * 4. Validates output against that schema
 * 5. Returns typed data on success or detailed errors on failure
 *
 * @param output - The parsed JSON output from the agent
 * @returns Validation result with typed data or errors
 */
export function validateAgentOutput(output: unknown): {
  success: boolean;
  data?: any;
  errors?: z.ZodError;
  agentName?: string;
} {
  // First, check if output is an object with agent_name
  if (!output || typeof output !== 'object' || !('agent_name' in output)) {
    return {
      success: false,
      errors: new z.ZodError([
        {
          code: 'custom',
          path: ['agent_name'],
          message: 'Output must be an object with "agent_name" field',
        },
      ]),
    };
  }

  const agentName = (output as any).agent_name;
  if (typeof agentName !== 'string') {
    return {
      success: false,
      errors: new z.ZodError([
        {
          code: 'custom',
          path: ['agent_name'],
          message: 'agent_name must be a string',
        },
      ]),
    };
  }

  // Get schema for this agent
  const schema = getSchemaForAgent(agentName);
  if (!schema) {
    return {
      success: false,
      agentName,
      errors: new z.ZodError([
        {
          code: 'custom',
          path: ['agent_name'],
          message: `Unknown agent_name: "${agentName}". Expected one of: ${Object.keys(AGENT_OUTPUT_SCHEMAS).join(', ')}`,
        },
      ]),
    };
  }

  // Validate against schema
  const result = schema.safeParse(output);
  if (result.success) {
    return {
      success: true,
      data: result.data,
      agentName,
    };
  } else {
    return {
      success: false,
      agentName,
      errors: result.error,
    };
  }
}
