import { z, ZodSchema } from 'zod';

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

export const StructureAnalyzerServiceSchema = z.object({
  id: z.string().min(1).describe("Service identifier (e.g., 'backend', 'frontend', 'auth-lambda')"),
  name: z.string().optional().describe("Human-readable service name from manifest or folder"),
  path: z.string().describe("Relative path from repo root to service directory (DISCOVERED dynamically)"),
  type: z.enum([
    'backend',
    'frontend',
    'serverless',
    'mobile',
    'worker',
    'library',
    'cli',
    'desktop',
    'infrastructure',
  ]).describe("Service type inferred from dependencies and entry points"),
  language: z.string().describe("Primary language (e.g., 'typescript', 'python', 'go')"),
  language_version: z.string().optional().describe("Language version from manifest (e.g., '5.8', '3.11', '1.21')"),
  frameworks: z.object({
    main: z.string().optional().describe("Main framework from dependencies (e.g., 'NestJS 11', 'React 19', 'Flask 3.0')"),
    orm: z.string().optional().describe("ORM if detected in dependencies (e.g., 'TypeORM 0.3', 'SQLAlchemy')"),
  }).describe("Frameworks detected for this service"),
  environment: z.object({
    port: z.number().optional().describe("Port number if found in config or code"),
  }).optional().describe("Environment configuration"),
  file_count: z.number().optional().describe("Number of files in service directory"),
  manifest_file: z.string().optional().describe("Path to manifest file (e.g., 'src/api/package.json')"),
});
export type StructureAnalyzerService = z.infer<typeof StructureAnalyzerServiceSchema>;

export const StructureAnalyzerOutputSchema = z.object({
  agent_name: z.literal("structure-architecture-analyzer"),
  timestamp: z.string(),
  findings: z.object({
    services: z.array(StructureAnalyzerServiceSchema).min(1).describe("Array of discovered services (REQUIRED: at least 1)"),
    repository_type: z.enum(['monorepo', 'polyrepo', 'single-service']).optional(),
    monorepo_layout: z.object({
      root: z.string(),
      packages: z.array(z.string()).optional(),
      services: z.array(z.string()).optional(),
      other: z.array(z.string()).optional(),
    }).optional().describe("Monorepo layout if applicable"),
  }),
  needs_verification: z.array(z.object({
    id: z.string(),
    question: z.string(),
    reason: z.string(),
  })).optional().describe("Items that need clarification or verification"),
});
export type StructureAnalyzerOutput = z.infer<typeof StructureAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 02: Tech Stack & Dependencies Analyzer
// ----------------------------------------------------------------------------

export const TechStackAnalyzerServiceSchema = z.object({
  id: z.string().min(1).describe("Service ID (must match Agent 01 output)"),
  package_manager: z.string().optional().describe("Package manager detected (e.g., 'pnpm', 'poetry', 'go modules')"),
  manifest_file: z.string().optional().describe("Path to manifest file"),
  databases: z.array(z.object({
    type: z.string().describe("Database type from client library (e.g., 'postgresql', 'mongodb', 'redis')"),
    client_library: z.string().optional().describe("Client library from dependencies (e.g., 'pg', 'psycopg2', 'ioredis')"),
    orm: z.string().optional().describe("ORM name from dependencies (e.g., 'TypeORM', 'SQLAlchemy', 'Prisma')"),
    orm_version: z.string().optional().describe("ORM version from manifest"),
    migration_tool: z.string().optional().describe("Migration tool detected (e.g., 'TypeORM migrations', 'Alembic')"),
  })).optional().describe("Databases used by this service (discovered from dependencies)"),
});
export type TechStackAnalyzerService = z.infer<typeof TechStackAnalyzerServiceSchema>;

export const TechStackAnalyzerOutputSchema = z.object({
  agent_name: z.literal("tech-stack-dependencies-analyzer"),
  timestamp: z.string(),
  findings: z.object({
    services: z.array(TechStackAnalyzerServiceSchema).min(1).describe("Per-service dependency information (REQUIRED: at least 1)"),
    monorepo: z.object({
      package_manager: z.string().optional(),
      workspace_manager: z.string().optional(),
    }).optional().describe("Monorepo-level configuration if applicable"),
  }),
  needs_verification: z.array(z.object({
    id: z.string(),
    question: z.string(),
    reason: z.string(),
  })).optional().describe("Items that need clarification or verification"),
});
export type TechStackAnalyzerOutput = z.infer<typeof TechStackAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 03: Code Patterns & Testing Analyzer
// ----------------------------------------------------------------------------

export const TestingConfigSchema = z.object({
  framework: z.string().describe("Testing framework name (e.g., 'Jest', 'Pytest', 'Playwright')"),
  config_file: z.string().optional().describe("Path to config file relative to repo root"),
  file_pattern: z.string().optional().describe("Test file pattern from config (e.g., '**/*.spec.ts')"),
  file_count: z.number().optional().describe("Number of test files matching pattern"),
});

export const CodePatternsAnalyzerServiceSchema = z.object({
  id: z.string().min(1).describe("Service ID (must match Agent 01 output)"),
  frameworks: z.object({
    testing: z.string().optional().describe("Primary testing framework (e.g., 'Jest', 'Pytest', 'Playwright')"),
  }).optional(),
  testing: z.object({
    unit: TestingConfigSchema.optional().describe("Unit testing configuration"),
    integration: TestingConfigSchema.optional().describe("Integration testing configuration"),
    e2e: TestingConfigSchema.optional().describe("E2E testing configuration"),
  }).optional().describe("Testing configuration for this service"),
});
export type CodePatternsAnalyzerService = z.infer<typeof CodePatternsAnalyzerServiceSchema>;

export const CodePatternsAnalyzerOutputSchema = z.object({
  agent_name: z.literal("code-patterns-testing-analyzer"),
  timestamp: z.string(),
  findings: z.object({
    services: z.array(CodePatternsAnalyzerServiceSchema).min(1).describe("Per-service testing information (REQUIRED: at least 1)"),
  }),
  needs_verification: z.array(z.object({
    id: z.string(),
    question: z.string(),
    reason: z.string(),
  })).optional().describe("Items that need clarification or verification"),
});
export type CodePatternsAnalyzerOutput = z.infer<typeof CodePatternsAnalyzerOutputSchema>;

// ----------------------------------------------------------------------------
// Agent 04: Data Flows & Integrations Analyzer (Optional)
// ----------------------------------------------------------------------------

export const DataFlowsAnalyzerOutputSchema = z.object({
  agent_name: z.literal("data-flows-integrations-analyzer"),
  timestamp: z.string(),
  findings: z.object({
    // Add specific fields as needed for data flows analysis
  }).passthrough(), // Allow any additional fields for now
  needs_verification: z.array(z.object({
    id: z.string(),
    question: z.string(),
    reason: z.string(),
  })).optional().describe("Items that need clarification or verification"),
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
      errors: new z.ZodError([{
        code: 'custom',
        path: ['agent_name'],
        message: 'Output must be an object with "agent_name" field',
      }]),
    };
  }

  const agentName = (output as any).agent_name;
  if (typeof agentName !== 'string') {
    return {
      success: false,
      errors: new z.ZodError([{
        code: 'custom',
        path: ['agent_name'],
        message: 'agent_name must be a string',
      }]),
    };
  }

  // Get schema for this agent
  const schema = getSchemaForAgent(agentName);
  if (!schema) {
    return {
      success: false,
      agentName,
      errors: new z.ZodError([{
        code: 'custom',
        path: ['agent_name'],
        message: `Unknown agent_name: "${agentName}". Expected one of: ${Object.keys(AGENT_OUTPUT_SCHEMAS).join(', ')}`,
      }]),
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
