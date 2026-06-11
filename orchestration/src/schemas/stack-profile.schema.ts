import { z } from 'zod';
import { ControlVersionProvidersSchema } from '../nodes/initialize-project/phase4/helpers/version-control-extractor.js';

/**
 * Stack profile schema (service-centric).
 *
 * Defines the structure of the `stack_profile` section in
 * `framework-config.json`. Services are the single source of truth;
 * every service is a first-class entity with a complete stack
 * definition. No static assumptions about folder structure or paths;
 * all service attributes are discovered dynamically by Phase 1 agents.
 * Supports multi-language, multi-service architectures (serverless,
 * microservices, monorepos).
 */

export const ServiceTypeEnum = z.enum([
  'backend',
  'frontend',
  'serverless',
  'mobile',
  'worker',
  'library',
  'cli',
  'desktop',
  'infrastructure',
]);
export type ServiceType = z.infer<typeof ServiceTypeEnum>;

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

export const ServiceEnvironmentSchema = z.object({
  port: z.number().optional().describe('Port number if found in config or code'),
  env_file: z.string().optional().describe('Path to environment file (e.g., ".env", ".env.local")'),
  deployment_target: z
    .string()
    .optional()
    .describe('Deployment target (e.g., "GCP Functions", "AWS Lambda", "Vercel")'),
  docker_image: z.string().optional().describe('Docker image name if service is containerized'),
  port_applies: z
    .boolean()
    .optional()
    .describe(
      'Set to false ONLY when the service genuinely has no port (serverless ' +
        'function invoked via event triggers, library, CLI tool, build step). ' +
        'Omit when a port is set or when no search has been done yet.',
    ),
  port_applies_reason: z
    .string()
    .optional()
    .describe(
      'When port_applies=false, a one-line reason ' +
        '(e.g. "AWS Lambda — invoked via API Gateway, no localhost port", ' +
        '"library — no runtime", "build step — runs and exits"). Required ' +
        'when port_applies=false.',
    ),
});
export type ServiceEnvironment = z.infer<typeof ServiceEnvironmentSchema>;

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

/**
 * Service-discovery quality floors enforced in Phase 4 context generation.
 *
 *   - `MIN_FILES_FOR_FALLBACK_SERVICE` (10): a language must have ≥ this many
 *     files to earn a fallback (no-manifest) service entry. Below this, we
 *     assume the language is incidental noise (one-off `*.sh` script,
 *     vendored snippet) and skip it.
 *   - `MIN_FILES_FOR_NO_MANIFEST_SERVICE` (5): final filter applied to ALL
 *     services regardless of how they were discovered. A service is dropped
 *     when it has no `manifest_file` AND its `file_count` is explicitly set
 *     to < 5. Manifest-backed services are kept at any size, and services
 *     with `file_count: undefined` are kept (no measurement = no evidence to
 *     drop).
 *
 * These constants live here as documentation; the enforcement is in
 * `phase4/context-generation.node.ts`.
 */
export const MIN_FILES_FOR_FALLBACK_SERVICE = 10;
export const MIN_FILES_FOR_NO_MANIFEST_SERVICE = 5;

export const ServiceSchema = z.object({
  id: z.string().min(1).describe('Service identifier (e.g., "backend", "frontend", "auth-lambda")'),
  name: z.string().optional().describe('Human-readable service name from manifest or folder'),
  path: z
    .string()
    .describe('Relative path from repo root to service directory (DISCOVERED dynamically)'),
  type: ServiceTypeEnum.describe('Service type inferred from dependencies and entry points'),
  language: z.string().describe('Primary language (e.g., "typescript", "python", "go")'),
  language_version: z
    .string()
    .optional()
    .describe('Language version from manifest (e.g., "5.8", "3.11", "1.21")'),
  frameworks: ServiceFrameworksSchema.describe('Frameworks detected for this service'),
  testing: ServiceTestingSchema.optional().describe('Testing configuration for this service'),
  databases: z
    .array(ServiceDatabaseSchema)
    .optional()
    .describe('Databases used by this service (discovered from dependencies)'),
  environment: ServiceEnvironmentSchema.optional().describe('Environment configuration'),
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

/**
 * Stack-agnostic command-discovery contract: Phase 1 captures Tier-1
 * wrapper entry points (Make/Just/Task/scripts/devcontainer/CI) plus
 * the README "Getting Started" section verbatim, then a pure
 * deterministic builder produces a `command_catalog` keyed by
 * operation. The closed-book Phase 3 synthesizer renders the catalog
 * directly — it never decides tier ordering itself.
 */

export const AutomationTargetSchema = z.object({
  name: z.string().min(1).describe('Target / recipe / task name (e.g., "setup", "test:e2e")'),
  group: z
    .string()
    .optional()
    .describe(
      'Group annotation extracted from leading comment (e.g., "@docker" → "docker"). ' +
        'Free-form; the Makefile / Justfile / Taskfile author chose it.',
    ),
  description: z
    .string()
    .optional()
    .describe('Description text extracted verbatim from the target comment.'),
});
export type AutomationTarget = z.infer<typeof AutomationTargetSchema>;

export const AutomationFileSchema = z.object({
  path: z.string().min(1).describe('Path relative to repo root (or relative to per-service root).'),
  targets: z
    .array(AutomationTargetSchema)
    .describe('Targets / recipes / tasks discovered in the file.'),
});
export type AutomationFile = z.infer<typeof AutomationFileSchema>;

export const AutomationShellScriptSchema = z.object({
  path: z.string().min(1).describe('Path relative to repo root.'),
  purpose: z
    .enum(['setup', 'bootstrap', 'dev', 'test', 'reset', 'unknown'])
    .describe('Inferred purpose from filename / shebang / comment block.'),
  shebang: z.string().optional().describe('First line if it starts with `#!`.'),
});
export type AutomationShellScript = z.infer<typeof AutomationShellScriptSchema>;

export const AutomationDevcontainerSchema = z.object({
  postCreateCommand: z.string().optional(),
  postStartCommand: z.string().optional(),
});
export type AutomationDevcontainer = z.infer<typeof AutomationDevcontainerSchema>;

export const AutomationCiHintSchema = z.object({
  file: z
    .string()
    .min(1)
    .describe('Path to the CI definition (e.g., ".github/workflows/test.yml")'),
  commands: z
    .array(z.string().min(1))
    .describe('Command lines extracted from `run:` / script steps in the CI file.'),
});
export type AutomationCiHint = z.infer<typeof AutomationCiHintSchema>;

export const AutomationSchema = z.object({
  makefiles: z.array(AutomationFileSchema).default([]),
  justfiles: z.array(AutomationFileSchema).default([]),
  taskfiles: z.array(AutomationFileSchema).default([]),
  shell_scripts: z.array(AutomationShellScriptSchema).default([]),
  devcontainer: AutomationDevcontainerSchema.optional(),
  ci_hints: z.array(AutomationCiHintSchema).default([]),
});
export type Automation = z.infer<typeof AutomationSchema>;

export const ReadmeRunSectionEntrySchema = z.object({
  path: z.string().min(1).describe('README path (e.g., "README.md")'),
  heading: z.string().min(1).describe('Heading text matched verbatim (e.g., "Getting Started")'),
  body: z.string().describe('Section body verbatim (raw markdown until next `## ` heading).'),
  fenced_blocks: z
    .array(z.string())
    .describe('Fenced code-block contents within the section, in document order.'),
});
export type ReadmeRunSectionEntry = z.infer<typeof ReadmeRunSectionEntrySchema>;

export const CommandCatalogOperationEnum = z.enum([
  'setup',
  'start_dev',
  'run_tests',
  'run_unit_tests',
  'run_integration_tests',
  'run_e2e',
  'run_lint',
  'run_format',
  'run_typecheck',
  'run_build',
  'run_migrations',
  'generate_migration',
  'revert_migration',
  'seed',
  'reset',
]);
export type CommandCatalogOperation = z.infer<typeof CommandCatalogOperationEnum>;

export const CommandCatalogTierEnum = z.enum(['wrapper', 'readme', 'package_manager', 'ci']);
export type CommandCatalogTier = z.infer<typeof CommandCatalogTierEnum>;

export const CommandCatalogEntrySchema = z.object({
  tier: CommandCatalogTierEnum.describe(
    'Preference tier: `wrapper` > `readme` > `package_manager` > `ci`. ' +
      'The synthesizer renders entries grouped by tier; lower tiers are ' +
      'never listed before higher tiers for the same operation.',
  ),
  command: z.string().min(1).describe('Exact command line (e.g., "make setup", "pnpm test")'),
  description: z
    .string()
    .optional()
    .describe(
      'Description verbatim from source (Makefile comment, README prose, etc.). ' +
        'Never paraphrased — preserves stack-specific terms only when the source used them.',
    ),
  source: z.string().min(1).describe('File path the command came from (provenance, audit-trail).'),
  per_service: z
    .string()
    .optional()
    .describe('Service id when the command runs against a single service (Tier 3 only).'),
});
export type CommandCatalogEntry = z.infer<typeof CommandCatalogEntrySchema>;

export const CommandCatalogSchema = z
  .partialRecord(CommandCatalogOperationEnum, z.array(CommandCatalogEntrySchema))
  .describe(
    'Map of operation → ordered array of candidate commands across all four tiers. ' +
      'Operations with no candidates are omitted. The first array entry is the ' +
      'preferred command; subsequent entries are fallbacks.',
  );
export type CommandCatalog = z.infer<typeof CommandCatalogSchema>;

export const StackProfileSchema = z
  .object({
    services: z
      .array(ServiceSchema)
      .min(1)
      .describe(
        'Array of discovered services. Each service is a first-class entity with complete stack definition. ' +
          'REQUIRED: At least 1 service must be present.',
      ),
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
    software_version_control: ControlVersionProvidersSchema.optional().describe(
      'VCS hosting platform detected from the git origin remote ' +
        '(e.g., "github", "gitlab", "azure-devops", "bitbucket")',
    ),
    file_counts: z
      .object({
        total: z.number().describe('Total number of files in repository'),
        by_language: z
          .record(z.string(), z.number())
          .describe('File counts grouped by language extension'),
      })
      .optional()
      .describe('File statistics for the repository'),
    automation: AutomationSchema.optional().describe(
      'Discovered Tier-1 automation entry points: Make/Just/Task targets, ' +
        'shell scripts, devcontainer hooks, CI hints. Populated by Phase 1 ' +
        'structure-architecture-analyzer.',
    ),
    readme_run_sections: z
      .array(ReadmeRunSectionEntrySchema)
      .optional()
      .describe(
        'README sections matching `Getting Started` / `Setup` / `Quickstart` / ' +
          '`Installation` / `Development` / `Running Locally` / `How to Run` ' +
          '(case-insensitive). Reproduced verbatim with attribution.',
      ),
    command_catalog: CommandCatalogSchema.optional().describe(
      'Operation → ordered list of candidate commands. Built deterministically ' +
        'from `automation`, `readme_run_sections`, and per-service package- ' +
        'manager scripts. Closed-book consumers (synthesizer, wiki generator, ' +
        'skills) render this verbatim — never re-order tiers.',
    ),
  })
  .refine(
    (data) => {
      const ids = data.services.map((s) => s.id);
      return new Set(ids).size === ids.length;
    },
    {
      message: 'Service IDs must be unique across all services',
      path: ['services'],
    },
  );

export type StackProfile = z.infer<typeof StackProfileSchema>;

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
