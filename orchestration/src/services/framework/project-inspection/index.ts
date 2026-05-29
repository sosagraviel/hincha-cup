/**
 * Project-inspection module entry-point.
 *
 * The inspector runs in Phase 0 and produces deterministic, parsed
 * data that Phase-1 analyzers consume instead of re-deriving via
 * LLM. Stack-agnostic by design: every language-specific decision
 * lives in a lookup table.
 */

export {
  inspectProject,
  PROJECT_INSPECTION_FILENAME,
  type InspectProjectArgs,
  type InspectProjectResult,
} from './inspector.service.js';

export { resolveLockFileManager, knownLockFileBasenames } from './lock-file-table.js';

export {
  resolveManifestMapping,
  knownExactManifestBasenames,
  knownManifestSuffixes,
  type ManifestFormat,
  type ManifestMapping,
} from './manifest-parser-table.js';

export {
  resolveRuntimeExtractor,
  knownRuntimeVersionFilenames,
  parseToolVersions,
  type RuntimeVersionExtractor,
} from './runtime-version-table.js';

export {
  ProjectInspectionSchema,
  type ProjectInspection,
  type ManifestEntry,
  type LockFileEntry,
} from '../../../schemas/project-inspection.schema.js';

export { buildServiceSeedFromInspection } from './service-seed.js';

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import type { ProjectInspection } from '../../../schemas/project-inspection.schema.js';
import {
  PROJECT_INSPECTION_FILENAME,
  ProjectInspectionSchema,
} from '../../../schemas/project-inspection.schema.js';

/**
 * Resolve the on-disk path the inspection JSON lives at, given the
 * project's per-provider temp directory.
 */
export function projectInspectionPath(tempDir: string): string {
  return join(tempDir, PROJECT_INSPECTION_FILENAME);
}

/**
 * Persist the inspection to disk. Best-effort: any failure is
 * silently swallowed so Phase 0 never fails on telemetry write.
 */
export function writeProjectInspection(tempDir: string, inspection: ProjectInspection): void {
  try {
    const path = projectInspectionPath(tempDir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(inspection, null, 2));
  } catch {}
}

/**
 * Load a previously-written inspection from `<tempDir>/project-inspection.json`.
 * Returns `undefined` when the file is missing, unreadable, or fails schema
 * validation — callers fall back to a no-inspection code path rather than
 * trying to make sense of malformed data.
 */
export function readProjectInspection(tempDir: string): ProjectInspection | undefined {
  try {
    const p = projectInspectionPath(tempDir);
    if (!existsSync(p)) return undefined;
    const raw = readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    const validated = ProjectInspectionSchema.safeParse(parsed);
    return validated.success ? validated.data : undefined;
  } catch {
    return undefined;
  }
}
