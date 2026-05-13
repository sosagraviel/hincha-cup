/**
 * Phase 4: Context Generation Types
 *
 * Centralized type definitions for Phase 4 components
 */

import type {
  Service,
  ServiceTesting,
  ServiceDatabase,
  ServiceEnvironment,
} from '../../../schemas/stack-profile.schema.js';

/**
 * File count information for a specific language
 */
export interface FileCount {
  language: string;
  extensions: string[];
  count: number;
  directories: string[];
}

/**
 * Result of file counting operation. `tooling_config_counts` is the
 * per-language count of tooling-config files excluded from `by_language`.
 * Validators use it to differentiate fabricated languages from config-only ones.
 * Optional for back-compat with older mocks; the runtime always populates it.
 */
export interface FileCountResult {
  total_files: number;
  by_language: FileCount[];
  scanned_directories: number;
  errors: string[];
  tooling_config_counts?: Record<string, number>;
}

/**
 * Represents a discovered workspace in a project
 */
export interface Workspace {
  path: string;
  manifest_file: string;
  language: string;
  type: string;
  name?: string;
}

/**
 * Result of workspace detection
 */
export interface WorkspaceDetectionResult {
  workspaces: Workspace[];
  is_monorepo: boolean;
  total_workspaces: number;
  errors: string[];
}

/**
 * Manifest file information
 */
export interface ManifestInfo {
  language: string;
  type: string;
}

/**
 * Phase 1 Analysis Data (read from disk files)
 */
export interface Phase1AnalysisData {
  structure_architecture: any;
  tech_stack_dependencies: any;
  code_patterns_testing: any;
  data_flows_integrations?: any;
}

/**
 * Result of language extraction from Phase 1 analyzers
 */
export interface LanguageExtractionResult {
  languages: string[];
  sources: {
    from_tech_stack_languages?: string[];
    from_backend_language?: string[];
    from_frontend_language?: string[];
    from_top_level?: string[];
  };
}

/**
 * Result of language cross-validation
 */
export interface LanguageValidationResult {
  validated_languages: string[];
  added_from_file_count: string[];
  added_from_workspaces: string[];
}

/**
 * Context for extracting service information
 */
export interface ServiceExtractionContext {
  structureFindings: any;
  techStackFindings: any;
  codePatternsFindings: any;
  dataFlowsFindings?: any;
}

/**
 * Helper functions for service extraction
 */
export interface ServiceExtractionHelpers {
  extractTestingForService: (
    serviceId: string,
    codePatternsFindings: any,
  ) => ServiceTesting | undefined;
  extractTestingFrameworkForService: (
    serviceId: string,
    codePatternsFindings: any,
  ) => string | undefined;
  extractDatabasesForService: (
    serviceId: string,
    techStackFindings: any,
    dataFlowsFindings?: any,
  ) => ServiceDatabase[] | undefined;
  extractORMForService: (serviceId: string, techStackFindings: any) => string | undefined;
  extractEnvironmentForService: (
    serviceId: string,
    structureFindings: any,
  ) => ServiceEnvironment | undefined;
  extractPackageManagerForService: (
    serviceId: string,
    techStackFindings: any,
  ) => string | undefined;
  extractManifestFileForService: (serviceId: string, techStackFindings: any) => string | undefined;
}

/**
 * Result of framework extraction
 */
export interface FrameworkExtractionResult {
  frontendFrameworks: string[];
  backendFrameworks: string[];
}

/**
 * Result of infrastructure extraction
 */
export interface InfrastructureExtractionResult {
  infrastructure: string[];
}

/**
 * Result of stack profile validation
 */
export interface StackProfileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of synthesis content extraction and writing.
 *
 * Phase 3 synthesis emits five sections; Phase 4 writes the four file-bound
 * sections (CLAUDE.md + three prescriptive convention skills) and surfaces
 * the architectural narrative as in-memory prose for the wiki-generator.
 *
 * Authoritative shape lives in `helpers/synthesis-extractor.ts`.
 */
export type { SynthesisExtractionResult } from './helpers/synthesis-extractor.js';
