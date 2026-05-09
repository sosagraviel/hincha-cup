import { z, ZodSchema } from 'zod';
import { normalizeLanguage } from './language-normalization.js';
import { AutomationSchema, ReadmeRunSectionEntrySchema } from './stack-profile.schema.js';
import { CodeSnippetSchema } from './phase1-base.schema.js';

// Re-export so existing imports continue to work alongside the v4 base.
export { CodeSnippetSchema };
export type { CodeSnippet } from './phase1-base.schema.js';

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

/**
 * Shared shape for every `needs_verification` entry across all four
 * Phase 1 analyzers AND the Phase 2 consolidator (the consolidator
 * passes the fields through unchanged).
 *
 * Plan 14 §C.1 + §C.7 (gira-exhaustive-followup-2, 2026-05-05):
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
        architecture: z
          .object({
            /**
             * Hub + bridge nodes from the graph's top topology results.
             * Plan §C 2.4 (gira-exhaustive followup, 2026-05-05): the
             * structure-architecture analyzer must surface these so the
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
        // Plan 15 §D.3 — full Tier-1 automation surface:
        // makefiles / justfiles / taskfiles with structured targets
        // (`{name, group?, description?}`), shell_scripts with the
        // `purpose` enum, devcontainer hooks, and CI hints.
        // Reuses `AutomationSchema` from `stack-profile.schema.ts` so the
        // analyzer output and the persisted stack profile share one
        // contract end-to-end.
        automation: AutomationSchema.optional().describe(
          'Project automation surface (Tier-1 wrapper entry points). Structured ' +
            'shape — see AutomationSchema in stack-profile.schema.ts.',
        ),
        // Plan 15 §D.3 — README "Getting Started" / "Setup" / "Quickstart"
        // verbatim extracts. Drives Tier-2 of the command catalog.
        readme_run_sections: z
          .array(ReadmeRunSectionEntrySchema)
          .optional()
          .describe(
            'README sections matching `Getting Started` / `Setup` / `Quickstart` / ' +
              '`Installation` / `Development` / `Running Locally` / `How to Run` ' +
              '(case-insensitive). Reproduced verbatim with attribution.',
          ),
        // Plan v4 Phase C (2026-05-09) — repository_shape_summary.
        repository_shape_summary: z
          .string()
          .max(600)
          .optional()
          .describe(
            'One short paragraph (≤ 600 chars) summarising the repository shape: ' +
              'monorepo vs single-service, top-level layout, language families, ' +
              'workspace tooling, and any unusual conventions. Read by the ' +
              'synthesizer (Phase 3) instead of re-derived from services[] / ' +
              'monorepo_layout. Stack-agnostic free-form prose.',
          ),
        // Plan v4 Phase C (2026-05-09) — project-level architecture_decisions[].
        // Per-service architecture_decisions move to Phase D fan-out.
        architecture_decisions: z
          .array(
            z
              .object({
                decision: z.string().min(1).max(200),
                rationale: z.string().min(1).max(400),
              })
              .strict(),
          )
          .max(8)
          .optional()
          .describe(
            '3–5 project-level architecture decisions. `decision` ≤ 200 chars; ' +
              '`rationale` ≤ 400 chars. Free-form text — no closed enum on decision ' +
              'category. Stack-agnostic by construction: a Go monorepo, a PHP ' +
              'MVC monolith, and a Rust CLI all surface their own decision shapes.',
          ),
      })
      .passthrough(), // Allow languages[], runtimes{}, architecture_pattern, file_placement{}, path_aliases{}, database{} (multi_stack merged into services)
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
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
        // Plan v4 Phase C (2026-05-09) — runtime_versions copied verbatim
        // from the Phase 0 inspection. Free-form { language: version }
        // map; analyzers do not normalise. Stack-agnostic.
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
        // Plan v4 Phase C (2026-05-09) — external_services[] with optional
        // provenance. The `sample_usage_quote` (CodeSnippet) is OPTIONAL
        // here; per-service rich extraction goes to Phase D fan-out.
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
                  'OPTIONAL in Phase C — Phase D fan-out per-service extractors fill ' +
                    'this in for graph-confirmed integrations.',
                ),
              })
              .passthrough(),
          )
          .optional()
          .describe(
            'Third-party services the project integrates with (Stripe, Sentry, ' +
              'Sendgrid, Twilio, Auth0, etc.). Free-form `name` (no closed enum). ' +
              '`sample_usage_quote` provenance is filled in by Phase D fan-out, not ' +
              'this analyzer.',
          ),
      })
      .passthrough(), // Allow infrastructure[], ci_cd{}, deployment{}, environment{}, databases[], build_tools{}
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
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
        // Plan v4 Phase C (2026-05-09) — quality_tools.enforcement_summary
        // (project-level, ≤ 600 chars). The synthesizer drops this paragraph
        // verbatim into the quality skill. NO per-service `code_patterns`
        // map yet — that's the heaviest §B.3 field and goes to Phase D
        // fan-out (one per-service sub-agent) to keep the analyzer's
        // wall-clock bounded.
        quality_tools: z
          .object({
            linter: z.string().optional(),
            formatter: z.string().optional(),
            type_checker: z.string().optional(),
            pre_commit: z.string().optional(),
            enforcement_summary: z
              .string()
              .max(600)
              .optional()
              .describe(
                'One short paragraph (≤ 600 chars) describing how lint / format / ' +
                  'pre-commit / CI gates compose end-to-end. Free-form prose. ' +
                  'Synthesizer drops this verbatim into the quality skill body.',
              ),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(), // Allow additional code pattern and architecture information (api_patterns, naming_conventions, error_handling, async_patterns, etc.)
    needs_verification: z
      .array(NeedsVerificationEntrySchema)
      .max(3)
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
    // Plan 22 — explicit opt-out for infrastructure services that
    // legitimately have no localhost port (SaaS / vendor-hosted /
    // accessed via HTTPS to a remote URL). Same shape as the
    // per-service opt-out in `ServiceEnvironmentSchema` (Plan 21).
    // The data-flows-analyzer Stop hook hard-rejects entries that
    // omit port AND don't carry the explicit opt-out.
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
      // Plan v4 Phase C (2026-05-09) — project-level event_pipeline (single
      // object, not per-service). Per-service request_lifecycle moves to
      // Phase D fan-out. Free-form `pattern` and `technology` (no closed
      // enum): a Go project might emit `{ pattern: "channel-fanout",
      // technology: "stdlib" }`; an Erlang project `{ pattern: "actor-mailbox",
      // technology: "OTP" }`; a Node project `{ pattern: "task-queue",
      // technology: "BullMQ" }`. Examples optional in Phase C; Phase D
      // fan-out fills snippets when applicable.
      event_pipeline: z
        .object({
          pattern: z
            .string()
            .min(1)
            .max(80)
            .describe(
              'Free-form pattern label — verbatim from the project. ' +
                'Examples: "task-queue" / "pubsub" / "websocket" / "actor-mailbox" / ' +
                '"channel-fanout" / "kafka-streams" / "genserver-message-passing". ' +
                'No closed enum.',
            ),
          technology: z
            .string()
            .min(1)
            .max(80)
            .describe(
              'Concrete library / runtime ("BullMQ" / "Celery" / "OTP" / "stdlib" / ' +
                '"akka.actor"). Free-form.',
            ),
          examples: z.array(CodeSnippetSchema).max(3).optional(),
        })
        .strict()
        .optional()
        .describe('Absent when no event pipeline exists.'),
      // Plan v4 Phase C (2026-05-09) — project-level auth_flow. Per-service
      // request_lifecycle (the per-service auth chain) moves to Phase D
      // fan-out. Free-form strategy: "jwt-bearer" / "session-cookie" /
      // "oauth2-pkce" / "basic-auth" / "api-key" / "mtls" / "none" / etc.
      auth_flow: z
        .object({
          strategy: z.string().min(1).max(80),
          libraries: z.array(z.string().min(1)).min(1).max(10),
          summary: z.string().min(1).max(800),
          examples: z.array(CodeSnippetSchema).max(3).optional(),
        })
        .strict()
        .optional()
        .describe('Present only when authentication is observable.'),
    })
    .passthrough(), // Allow authentication{}, external_integrations{}, api_design{}, data_patterns{}, etc.
  needs_verification: z
    .array(NeedsVerificationEntrySchema)
    .max(3)
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
