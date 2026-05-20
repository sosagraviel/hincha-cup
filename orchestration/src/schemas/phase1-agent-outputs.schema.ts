import { z, ZodSchema } from 'zod';
import { normalizeLanguage } from './language-normalization.js';
import { AutomationSchema, ReadmeRunSectionEntrySchema } from './stack-profile.schema.js';
import { CodeSnippetSchema, CodeSnippetWithCitationSchema } from './phase1-base.schema.js';
import { RequestLifecycleStepSchema, TestingExampleSchema } from './service-detail-slice.schema.js';

export { CodeSnippetSchema };
export type { CodeSnippet } from './phase1-base.schema.js';

/**
 * Phase 1 agent output schemas.
 *
 * These schemas define the expected output structure for each Phase 1
 * analyzer agent. They are used for:
 * 1. Validation in hooks (Stop hooks that validate agent output)
 * 2. Validation in external validators (Phase 1 node validators)
 * 3. Type inference in Phase 4 (context generation reads these with
 *    TypeScript types)
 * 4. Documentation in agent prompts (agents know exact structure to
 *    produce)
 */

/**
 * Shared shape for every `needs_verification` entry across all four
 * Phase 1 analyzers AND the Phase 2 consolidator (the consolidator
 * passes the fields through unchanged).
 *
 * `attempted_resolution` (≥2 entries) and `impact` (≥40 chars) are
 * required so an item proves the agent searched and that the
 * answer changes a concrete artefact. The text-shape rules
 * (graph-internals ban, fabricated numbers, generic impact) live
 * in `validateNeedsVerificationProse` (see
 * `phase1/shared/needs-verification-quality.ts`) — those are
 * applied by the analyzer Stop hook on top of this shape.
 *
 * Stack-agnostic by construction: every field is text-shape only;
 * no language family or framework token appears.
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
          'agent ran BEFORE surfacing this item. Minimum 2 entries; ≥1 entry MUST be a ' +
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
    service_is_real: z
      .boolean()
      .optional()
      .describe(
        'Judgment flag — set to FALSE when the directory looks like a service ' +
          'from its manifest/file presence but is not actually production-runnable ' +
          'as its own service (e.g. workspace-yaml-derived directory holding only ' +
          'SQL migrations, only test fixtures, only generated artifacts, or a ' +
          'historical scaffold that no longer ships). When omitted, treated as TRUE. ' +
          'Phase 2 composer-views filter out services flagged false so the ' +
          'synthesizer and per-service wiki pages never document non-services. ' +
          'Set conservatively — false is a strong claim that requires reading the ' +
          "directory's contents.",
      ),
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
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`.
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
        architecture: z
          .object({
            /**
             * Hub + bridge nodes from the graph's top topology results.
             * The structure-architecture analyzer must surface these so the
             * Phase 4 architecture wiki page can render a "Coupling
             * hotspots" section. Stack-agnostic — `qualified_name`,
             * `kind`, and `score` are graph-native.
             */
            coupling: z
              .object({
                hubs: z
                  .array(
                    z
                      .object({
                        qualified_name: z.string(),
                        kind: z.string().optional(),
                        score: z.number().optional(),
                      })
                      .passthrough(),
                  )
                  .describe(
                    'Top hub nodes (most-connected). Aim for 3+ entries; tiny graphs surface needs_verification when fewer.',
                  ),
                bridges: z
                  .array(
                    z
                      .object({
                        qualified_name: z.string(),
                        kind: z.string().optional(),
                        score: z.number().optional(),
                      })
                      .passthrough(),
                  )
                  .describe('Top bridge nodes (cross-community shortest-path hotspots).'),
              })
              .passthrough()
              .describe('Coupling hotspots — populated from get_hub_nodes + get_bridge_nodes.'),
          })
          .passthrough()
          .optional()
          .describe(
            'Architectural topology surfaced from the graph. `coupling` is the canonical home for hub/bridge findings.',
          ),
        automation: AutomationSchema.optional().describe(
          'Project automation surface (Tier-1 wrapper entry points). Structured ' +
            'shape — see AutomationSchema in stack-profile.schema.ts.',
        ),
        readme_run_sections: z
          .array(ReadmeRunSectionEntrySchema)
          .optional()
          .describe(
            'README sections matching `Getting Started` / `Setup` / `Quickstart` / ' +
              '`Installation` / `Development` / `Running Locally` / `How to Run` ' +
              '(case-insensitive). Reproduced verbatim with attribution.',
          ),
        repository_shape_summary: z
          .string()
          .max(2400)
          .optional()
          .describe(
            'Paragraph(s) (≤ 2400 chars) summarising the repository shape: ' +
              'monorepo vs single-service, top-level layout, language families, ' +
              'workspace tooling, and any unusual conventions. Lands in the wiki ' +
              'main page; loaded on-demand.',
          ),
        architecture_decisions: z
          .array(
            z
              .object({
                decision: z.string().min(1).max(400),
                rationale: z.string().min(1).max(1200),
              })
              .strict(),
          )
          .max(15)
          .optional()
          .describe(
            'Project-level architecture decisions (≤ 15). `decision` ≤ 400 chars; ' +
              '`rationale` ≤ 1200 chars. Free-form text — no closed enum on decision ' +
              'category. Stack-agnostic. Rendered into the ADR wiki section; ' +
              'loaded on-demand.',
          ),
      })
      .passthrough(),
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type StructureAnalyzerOutput = z.infer<typeof StructureAnalyzerOutputSchema>;

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
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`.
     */
    soft_warning: z.array(z.string()).optional(),
    findings: z
      .object({
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
        runtime_versions: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Free-form { language-family: version } map copied verbatim from ' +
              '`<tempDir>/project-inspection.json::runtime_versions`. The synthesizer ' +
              'reads from here for the `Tech Stack` block. Examples: ' +
              '`{ node: "22.5.1", python: "3.11.5", go: "1.22" }`. ' +
              'No normalisation — the inspection is authoritative.',
          ),
        external_services: z
          .array(
            z
              .object({
                name: z.string().min(1).describe('Vendor / product name (e.g. "Stripe", "Sentry")'),
                sdk: z
                  .string()
                  .optional()
                  .describe('SDK package name + version when known (e.g. "stripe@14.0.0")'),
                config_location: z
                  .string()
                  .optional()
                  .describe('Where the SDK is configured (path / env-var / config block).'),
                purpose: z.string().optional().describe('One-line purpose of the integration.'),
                sample_usage_quote: CodeSnippetSchema.optional().describe(
                  'Optional per-vendor code excerpt populated by the per-service ' +
                    'extractor for graph-confirmed integrations.',
                ),
              })
              .passthrough(),
          )
          .optional()
          .describe(
            'Third-party services the project integrates with (Stripe, Sentry, ' +
              'Sendgrid, Twilio, Auth0, etc.). Free-form `name` (no closed enum). ' +
              '`sample_usage_quote` provenance is filled in by the per-service ' +
              'extractor, not this analyzer.',
          ),
      })
      .passthrough(),
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type TechStackAnalyzerOutput = z.infer<typeof TechStackAnalyzerOutputSchema>;

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
     */
    graph_overflow_count: z.number().optional(),
    /** Sorted unique tool names whose results overflowed; empty array when count = 0. */
    graph_overflow_tools: z.array(z.string()).optional(),
    /**
     * Soft warnings emitted by `applyGraphToolUsageFromSidecar` after
     * comparing the analyzer's tool-call distribution against per-analyzer
     * caps and graph-first thresholds. Non-blocking; values come from a
     * fixed vocabulary: `low_graph_ratio`, `graph_search_overuse`,
     * `tool_call_budget_exceeded`.
     */
    soft_warning: z.array(z.string()).optional(),
    findings: z
      .object({
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
                representative_examples: z
                  .array(TestingExampleSchema)
                  .max(5)
                  .optional()
                  .describe(
                    "Up to 5 concrete tests illustrating this service's conventions. " +
                      'Feeds the testing-conventions composer view.',
                  ),
                notes: z
                  .string()
                  .max(2400)
                  .optional()
                  .describe(
                    'Free-form narrative (≤ 2400) about how this service tests. ' +
                      'Feeds the testing-conventions composer view.',
                  ),
              })
              .passthrough(),
          )
          .optional()
          .describe("Testing configuration by service ID (e.g., 'backend': { unit: {...} })"),
        code_patterns: z
          .record(
            z.string(),
            z
              .object({
                patterns: z.array(CodeSnippetWithCitationSchema).max(15).optional(),
                notable: z.array(z.string().max(280)).max(8).optional(),
              })
              .passthrough(),
          )
          .optional()
          .describe(
            'Per-service code-shape patterns (≤ 15) + notable gotchas (≤ 8). ' +
              'Keys are service IDs from your AUTHORITATIVE SERVICE LIST. ' +
              'Each pattern is a code snippet WITH citation (`source_file` + ' +
              '`source_line` are required). ' +
              'Feeds the code-conventions composer view.',
          ),
        quality_tools: z
          .object({
            linter: z.string().optional(),
            formatter: z.string().optional(),
            type_checker: z.string().optional(),
            pre_commit: z.string().optional(),
            enforcement_summary: z
              .string()
              .max(2400)
              .optional()
              .describe(
                'Paragraph(s) (≤ 2400 chars) describing how lint / format / ' +
                  'pre-commit / CI gates compose end-to-end. Free-form prose. ' +
                  'Synthesizer drops this verbatim into the quality skill body; ' +
                  'skills are loaded on-demand so length is not a prompt cost.',
              ),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
      .optional()
      .describe('Items that need clarification or verification'),
  })
  .passthrough();
export type CodePatternsAnalyzerOutput = z.infer<typeof CodePatternsAnalyzerOutputSchema>;

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
    port_applies: z
      .boolean()
      .optional()
      .describe(
        'Set to false ONLY when the infrastructure service has no localhost port ' +
          '(SaaS like Sentry / Datadog / Stripe, vendor-managed cloud services, ' +
          'CDN-only). Omit when a port is set or when no search has been done yet.',
      ),
    port_applies_reason: z
      .string()
      .optional()
      .describe(
        'When port_applies=false, a one-line reason ' +
          '(e.g. "SaaS — accessed via HTTPS to vendor DSN, no localhost port", ' +
          '"managed cloud service — no local emulator").',
      ),
    port_search_evidence: z
      .array(z.string())
      .optional()
      .describe(
        'When port is omitted AND port_applies=false, list ≥2 search attempts ' +
          'that established no port applies (e.g. ["Read package.json — @sentry/* ' +
          'via cloud DSN", "Glob docker-compose — no sentry container"]).',
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
      services: z
        .never()
        .optional()
        .describe(
          'FORBIDDEN: this analyzer does not emit application services. Use infrastructure_services[] for caches/DBs/queues/mail and service_communication{} for service-to-service patterns.',
        ),
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
      request_lifecycle: z
        .record(z.string(), z.array(RequestLifecycleStepSchema).max(10))
        .optional()
        .describe(
          'Per-service request / job lifecycle (≤ 10 steps each). Keys are ' +
            'service IDs from your AUTHORITATIVE SERVICE LIST (backend / serverless / ' +
            'worker only — skip libraries / CLI / infrastructure). Feeds the ' +
            'multi-file-workflows composer view.',
        ),
      event_pipeline: z
        .object({
          pattern: z
            .string()
            .min(1)
            .max(200)
            .describe('Free-form pattern label — verbatim from the project. No closed enum.'),
          technology: z.string().min(1).max(200).describe('Concrete library / runtime. Free-form.'),
          examples: z.array(CodeSnippetSchema).max(5).optional(),
        })
        .strict()
        .optional()
        .describe('Absent when no event pipeline exists.'),
      auth_flow: z
        .object({
          strategy: z.string().min(1).max(200),
          libraries: z.array(z.string().min(1)).min(1).max(20),
          summary: z.string().min(1).max(2400),
          examples: z.array(CodeSnippetSchema).max(5).optional(),
        })
        .strict()
        .optional()
        .describe('Present only when authentication is observable.'),
    })
    .passthrough(),
  needs_verification: z
    .array(NeedsVerificationEntrySchema)
    .max(3)
    .optional()
    .describe('Items that need clarification or verification'),
});
export type DataFlowsAnalyzerOutput = z.infer<typeof DataFlowsAnalyzerOutputSchema>;

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
