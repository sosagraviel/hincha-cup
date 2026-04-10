import { z } from 'zod';

// ============================================================================
// STACK PROFILE SCHEMA - SERVICE-CENTRIC ARCHITECTURE
// ============================================================================
// This schema defines the structure of the stack_profile section in framework-config.json.
// It is fully service-centric with NO backward compatibility for legacy flat structures.
//
// Key Principles:
// - Services array is the single source of truth
// - Each service is a first-class entity with complete stack definition
// - NO static assumptions about folder structure or paths
// - All service attributes are discovered dynamically by Phase 1 agents
// - Supports multi-language, multi-service architectures (serverless, microservices, monorepos)
// ============================================================================

// ----------------------------------------------------------------------------
// Service Type Enumeration
// ----------------------------------------------------------------------------

export const ServiceTypeEnum = z.enum([
  'backend', // API servers, GraphQL servers, REST APIs
  'frontend', // Web applications, SPAs, SSR applications
  'serverless', // Lambda functions, Cloud Functions, Firebase Functions
  'mobile', // React Native, Flutter, native iOS/Android
  'worker', // Background job processors, queue workers
  'library', // Shared packages, utility libraries
  'cli', // Command-line tools
  'desktop', // Electron apps, native desktop applications
  'infrastructure', // Terraform, Pulumi, CDK scripts
]);
export type ServiceType = z.infer<typeof ServiceTypeEnum>;

// ----------------------------------------------------------------------------
// Service Testing Configuration
// ----------------------------------------------------------------------------

export const ServiceTestingConfigSchema = z.object({
  framework: z.string().describe('Testing framework name (e.g., "Jest", "Pytest", "Playwright")'),
  config_file: z.string().optional().describe('Path to config file relative to repo root'),
  file_pattern: z
    .string()
    .optional()
    .describe('Test file pattern from config (e.g., "**/*.spec.ts")'),
  file_count: z.number().optional().describe('Number of test files matching pattern'),
});
export type ServiceTestingConfig = z.infer<typeof ServiceTestingConfigSchema>;

export const ServiceTestingSchema = z.object({
  unit: ServiceTestingConfigSchema.optional().describe('Unit testing configuration'),
  integration: ServiceTestingConfigSchema.optional().describe('Integration testing configuration'),
  e2e: ServiceTestingConfigSchema.optional().describe('E2E testing configuration'),
});
export type ServiceTesting = z.infer<typeof ServiceTestingSchema>;

// ----------------------------------------------------------------------------
// Service Database Configuration
// ----------------------------------------------------------------------------

export const ServiceDatabaseSchema = z.object({
  type: z.string().describe('Database type (e.g., "postgresql", "mongodb", "redis")'),
  client_library: z
    .string()
    .optional()
    .describe('Client library from dependencies (e.g., "pg", "psycopg2", "ioredis")'),
  orm: z
    .string()
    .optional()
    .describe('ORM name from dependencies (e.g., "TypeORM", "SQLAlchemy", "Prisma")'),
  orm_version: z.string().optional().describe('ORM version from manifest'),
  migration_tool: z
    .string()
    .optional()
    .describe('Migration tool detected (e.g., "TypeORM migrations", "Alembic")'),
});
export type ServiceDatabase = z.infer<typeof ServiceDatabaseSchema>;

// ----------------------------------------------------------------------------
// Service Environment Configuration
// ----------------------------------------------------------------------------

export const ServiceEnvironmentSchema = z.object({
  port: z.number().optional().describe('Port number if found in config or code'),
  env_file: z.string().optional().describe('Path to environment file (e.g., ".env", ".env.local")'),
  deployment_target: z
    .string()
    .optional()
    .describe('Deployment target (e.g., "GCP Functions", "AWS Lambda", "Vercel")'),
  docker_image: z.string().optional().describe('Docker image name if service is containerized'),
});
export type ServiceEnvironment = z.infer<typeof ServiceEnvironmentSchema>;

// ----------------------------------------------------------------------------
// Service Frameworks
// ----------------------------------------------------------------------------

export const ServiceFrameworksSchema = z.object({
  main: z
    .string()
    .optional()
    .describe('Main framework (e.g., "NestJS 11", "React 19", "Flask 3.0")'),
  orm: z.string().optional().describe('ORM framework (e.g., "TypeORM 0.3", "SQLAlchemy 2.0")'),
  ui: z
    .string()
    .optional()
    .describe('UI library/framework (e.g., "shadcn/ui", "Material-UI", "Tailwind CSS v4")'),
  testing: z
    .string()
    .optional()
    .describe('Primary testing framework (e.g., "Jest", "Pytest", "Playwright")'),
  additional: z
    .array(z.string())
    .optional()
    .describe('Additional frameworks (e.g., ["Socket.IO", "BullMQ"])'),
});
export type ServiceFrameworks = z.infer<typeof ServiceFrameworksSchema>;

// ----------------------------------------------------------------------------
// Complete Service Schema
// ----------------------------------------------------------------------------

export const ServiceSchema = z.object({
  // Identity
  id: z.string().min(1).describe('Service identifier (e.g., "backend", "frontend", "auth-lambda")'),
  name: z.string().optional().describe('Human-readable service name from manifest or folder'),
  path: z
    .string()
    .describe('Relative path from repo root to service directory (DISCOVERED dynamically)'),
  type: ServiceTypeEnum.describe('Service type inferred from dependencies and entry points'),

  // Stack
  language: z.string().describe('Primary language (e.g., "typescript", "python", "go")'),
  language_version: z
    .string()
    .optional()
    .describe('Language version from manifest (e.g., "5.8", "3.11", "1.21")'),
  frameworks: ServiceFrameworksSchema.describe('Frameworks detected for this service'),

  // Testing (per-service)
  testing: ServiceTestingSchema.optional().describe('Testing configuration for this service'),

  // Databases (per-service, supports polyglot persistence)
  databases: z
    .array(ServiceDatabaseSchema)
    .optional()
    .describe('Databases used by this service (discovered from dependencies)'),

  // Environment
  environment: ServiceEnvironmentSchema.optional().describe('Environment configuration'),

  // Metadata
  file_count: z.number().optional().describe('Number of files in service directory'),
  package_manager: z
    .string()
    .optional()
    .describe('Package manager detected (e.g., "pnpm", "poetry", "go modules")'),
  manifest_file: z
    .string()
    .optional()
    .describe('Path to manifest file (DISCOVERED dynamically, e.g., "src/api/package.json")'),
});
export type Service = z.infer<typeof ServiceSchema>;

// ----------------------------------------------------------------------------
// Stack Profile Schema - CLEAN, SERVICE-CENTRIC ONLY
// ----------------------------------------------------------------------------

export const StackProfileSchema = z
  .object({
    // CORE: Services array (source of truth)
    services: z
      .array(ServiceSchema)
      .min(1)
      .describe(
        'Array of discovered services. Each service is a first-class entity with complete stack definition. ' +
          'REQUIRED: At least 1 service must be present.',
      ),

    // METADATA: Repository-level information
    is_monorepo: z
      .boolean()
      .describe('Whether the project is a monorepo (multiple packages/services in one repository)'),
    workspace_tool: z
      .string()
      .optional()
      .describe('Workspace tool detected (e.g., "pnpm workspaces", "Nx", "Turborepo", "Lerna")'),
    package_manager: z
      .string()
      .optional()
      .describe('Root-level package manager (e.g., "pnpm", "npm", "yarn")'),
    infrastructure: z
      .array(z.string())
      .optional()
      .describe('Infrastructure tools detected (e.g., ["Docker", "Kubernetes", "Terraform"])'),

    // File counts (optional metadata for context)
    file_counts: z
      .object({
        total: z.number().describe('Total number of files in repository'),
        by_language: z
          .record(z.string(), z.number())
          .describe('File counts grouped by language extension'),
      })
      .optional()
      .describe('File statistics for the repository'),
  })
  .refine(
    (data) => {
      // Validation: Ensure unique service IDs
      const ids = data.services.map((s) => s.id);
      return new Set(ids).size === ids.length;
    },
    {
      message: 'Service IDs must be unique across all services',
      path: ['services'],
    },
  );

export type StackProfile = z.infer<typeof StackProfileSchema>;

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

/**
 * Get all unique languages from services
 */
export function getLanguagesFromStackProfile(stackProfile: StackProfile): string[] {
  const languages = new Set(stackProfile.services.map((s) => s.language));
  return Array.from(languages).sort();
}

/**
 * Get primary language (language with most files)
 */
export function getPrimaryLanguage(stackProfile: StackProfile): string | undefined {
  if (stackProfile.services.length === 0) return undefined;

  const languageCounts: Record<string, number> = {};
  for (const service of stackProfile.services) {
    const lang = service.language;
    languageCounts[lang] = (languageCounts[lang] || 0) + (service.file_count || 1);
  }

  return Object.entries(languageCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
}

/**
 * Get all unique databases from all services
 */
export function getAllDatabases(stackProfile: StackProfile): string[] {
  const databases = new Set<string>();

  for (const service of stackProfile.services) {
    if (service.databases) {
      for (const db of service.databases) {
        databases.add(db.type);
      }
    }
  }

  return Array.from(databases).sort();
}

/**
 * Get services by type
 */
export function getServicesByType(stackProfile: StackProfile, type: ServiceType): Service[] {
  return stackProfile.services.filter((s) => s.type === type);
}

/**
 * Get services by language
 */
export function getServicesByLanguage(stackProfile: StackProfile, language: string): Service[] {
  return stackProfile.services.filter((s) => s.language.toLowerCase() === language.toLowerCase());
}

/**
 * Check if project is polyglot (uses multiple languages)
 */
export function isPolyglotArchitecture(stackProfile: StackProfile): boolean {
  const languages = getLanguagesFromStackProfile(stackProfile);
  return languages.length > 1;
}

/**
 * Get all testing frameworks used across all services
 */
export function getAllTestingFrameworks(stackProfile: StackProfile): string[] {
  const frameworks = new Set<string>();

  for (const service of stackProfile.services) {
    if (service.testing?.unit?.framework) frameworks.add(service.testing.unit.framework);
    if (service.testing?.integration?.framework)
      frameworks.add(service.testing.integration.framework);
    if (service.testing?.e2e?.framework) frameworks.add(service.testing.e2e.framework);
  }

  return Array.from(frameworks).sort();
}
