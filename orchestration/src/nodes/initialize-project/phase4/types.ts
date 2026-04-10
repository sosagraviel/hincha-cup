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

// ============================================================================
// FILE COUNTER TYPES
// ============================================================================

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
 * Result of file counting operation
 */
export interface FileCountResult {
  total_files: number;
  by_language: FileCount[];
  scanned_directories: number;
  errors: string[];
}

// ============================================================================
// WORKSPACE DETECTOR TYPES
// ============================================================================

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

// ============================================================================
// CONFIG GENERATOR TYPES
// ============================================================================

/**
 * Phase 1 Analysis Data (read from disk files)
 */
export interface Phase1AnalysisData {
  structure_architecture: any;
  tech_stack_dependencies: any;
  code_patterns_testing: any;
  data_flows_integrations?: any;
}

// ============================================================================
// LANGUAGE EXTRACTION TYPES
// ============================================================================

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

// ============================================================================
// SERVICE EXTRACTION TYPES
// ============================================================================

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

// ============================================================================
// FRAMEWORK EXTRACTION TYPES
// ============================================================================

/**
 * Result of framework extraction
 */
export interface FrameworkExtractionResult {
  frontendFrameworks: string[];
  backendFrameworks: string[];
}

// ============================================================================
// INFRASTRUCTURE EXTRACTION TYPES
// ============================================================================

/**
 * Result of infrastructure extraction
 */
export interface InfrastructureExtractionResult {
  infrastructure: string[];
}

// ============================================================================
// STACK PROFILE VALIDATION TYPES
// ============================================================================

/**
 * Result of stack profile validation
 */
export interface StackProfileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// SYNTHESIS EXTRACTION TYPES
// ============================================================================

/**
 * Result of synthesis content extraction and writing
 */
export interface SynthesisExtractionResult {
  claudeMdContent: string;
  projectContextContent: string;
  claudeMdPath: string;
  projectContextPath: string;
  claudeMdLines: number;
  projectContextLines: number;
}
