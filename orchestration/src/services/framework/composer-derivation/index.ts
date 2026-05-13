/**
 * Composer derivation library.
 *
 * Pure deterministic functions that produce composer-view inputs from
 * project-inspection.json + manifests + the language-config registry.
 * Used as the lowest-priority fallback in the composer-view builder
 * (slice → analyzer JSON → deterministic derivation → empty).
 *
 * Stack-agnostic by construction: every detection flows through the
 * plug-in language-config registry. Adding a new SDK / auth lib /
 * queue lib is a one-line change in `language-config/languages/<lang>.ts`.
 */

export { deriveRepositoryShapeSummary } from './derive-repository-shape.js';
export { deriveExternalServices } from './derive-external-services.js';
export { deriveQualityTools } from './derive-quality-tools.js';
export { deriveEnforcementSummary } from './derive-enforcement-summary.js';
export {
  deriveTestingRunners,
  deriveTestingFrameworksByService,
  deriveTestingProjectSummary,
} from './derive-testing.js';
export { deriveAuthFlow } from './derive-auth-flow.js';
export { deriveEventPipeline } from './derive-event-pipeline.js';

export { extractDepsFromManifest } from './extract-deps.js';
export {
  matchExternalServiceSdks,
  matchAuthLibraries,
  matchEventQueueLibraries,
  matchStringTokens,
} from './registry-lookup.js';

export type {
  DeriveInput,
  DeriveServiceRef,
  DeriveFileCountEntry,
  DerivedExternalService,
  DerivedQualityTools,
  DerivedTestingFrameworks,
  DerivedAuthFlow,
  DerivedEventPipeline,
} from './types.js';
