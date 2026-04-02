/**
 * Schemas Index
 *
 * Central export point for all schema definitions
 */

// Stack Profile schemas (Service-Centric)
export {
  StackProfileSchema,
  ServiceSchema,
  ServiceTypeEnum,
  ServiceTestingSchema,
  ServiceTestingConfigSchema,
  ServiceDatabaseSchema,
  ServiceEnvironmentSchema,
  ServiceFrameworksSchema,
  type StackProfile,
  type Service,
  type ServiceType,
  type ServiceTesting,
  type ServiceTestingConfig,
  type ServiceDatabase,
  type ServiceEnvironment,
  type ServiceFrameworks,
  // Helper functions
  getLanguagesFromStackProfile,
  getPrimaryLanguage,
  getAllDatabases,
  getServicesByType,
  getServicesByLanguage,
  isPolyglotArchitecture,
  getAllTestingFrameworks,
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

// UI Visual Testing schemas
export {
  ViewportSchema,
  IgnoreRegionSchema,
  ScreenEntrySchema,
  ThresholdsSchema,
  FigmaConfigSchema,
  UIVisualTestingConfigSchema,
  type Viewport,
  type IgnoreRegion,
  type ScreenEntry,
  type Thresholds,
  type FigmaConfig,
  type UIVisualTestingConfig,
} from './ui-visual-testing.schema.js';
