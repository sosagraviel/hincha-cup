/**
 * Input and output types for the derivation library.
 *
 * Every derivation function takes a `DeriveInput` (project inspection +
 * optional context from earlier phases) and returns either the derived
 * shape or `undefined`. Pure functions: no I/O beyond reading the data
 * already passed in.
 */

import type { ProjectInspection } from '../../../schemas/project-inspection.schema.js';

export interface DeriveServiceRef {
  readonly id: string;
  readonly path: string;
  readonly type?: string;
  readonly language?: string;
}

export interface DeriveFileCountEntry {
  readonly language: string;
  readonly count: number;
}

export interface DeriveInput {
  /** Phase 0 inspection. Required — every derivation reads from here. */
  readonly inspection: ProjectInspection;
  /**
   * Structure analyzer's discovered services. Optional: when absent
   * (e.g. on the first attempt before any analyzer ran), derivation
   * falls back to one logical service per manifest entry.
   */
  readonly services?: ReadonlyArray<DeriveServiceRef>;
  /**
   * Phase 4 file-counter result. Optional: enables per-language stats
   * in `deriveRepositoryShapeSummary`.
   */
  readonly fileCounts?: ReadonlyArray<DeriveFileCountEntry>;
}

export interface DerivedExternalService {
  readonly name: string;
  readonly sdk: string;
  readonly purpose: string;
}

export interface DerivedQualityTools {
  readonly linter?: string;
  readonly formatter?: string;
  readonly type_checker?: string;
  readonly pre_commit?: string;
}

export interface DerivedTestingFrameworks {
  readonly unit?: string;
  readonly integration?: string;
  readonly e2e?: string;
}

export interface DerivedAuthFlow {
  readonly strategy: string;
  readonly libraries: ReadonlyArray<string>;
  readonly summary: string;
}

export interface DerivedEventPipeline {
  readonly pattern: string;
  readonly technology: string;
}
