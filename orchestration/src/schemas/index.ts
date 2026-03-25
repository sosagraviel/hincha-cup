/**
 * Schemas Index
 *
 * Central export point for all schema definitions
 */

// Stack Profile schemas
export {
  StackProfileSchema,
  DetectedWorkspaceSchema,
  FileCountByLanguageSchema,
  FileCountsSchema,
  MultiStackWorkspaceSchema,
  MultiStackSchema,
  FrameworksByCategorySchema,
  type StackProfile,
  type DetectedWorkspace,
  type FileCountByLanguage,
  type FileCounts,
  type MultiStackWorkspace,
  type MultiStack,
  type FrameworksByCategory,
} from './stack-profile.schema.js';

// Framework Config schemas
export {
  FrameworkConfigSchema,
  ResourceInfoSchema,
  Phase3SynthesisSchema,
  AnalysisResultsSchema,
  ProjectMetadataSchema,
  ResourceStateSchema,
  type FrameworkConfig,
  type ResourceInfo,
  type Phase3Synthesis,
  type AnalysisResults,
  type ProjectMetadata,
  type ResourceState,
} from './framework-config.schema.js';
