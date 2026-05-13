/**
 * Lock-file → manager mapping.
 *
 * This module is a thin view over the centralized language-config registry.
 * Add a new lock file by adding/updating its language entry under
 * `language-config/languages/`, not by editing this table.
 *
 * Stack-agnostic by enumeration — every entry comes from the language
 * registry. The `manager` value is a free-form lowercase identifier the
 * rest of the framework treats as opaque.
 */

import {
  knownLockFileBasenames,
  resolveLockFileManager as registryResolveLockFileManager,
  allLockFiles,
} from '../language-config/index.js';

export interface LockFileMapping {
  /** Exact filename (no glob expansion needed for the canonical cases). */
  readonly filename: string;
  /** Free-form lowercase identifier of the package manager / build tool. */
  readonly manager: string;
}

/**
 * Computed once at module-load time from the language registry.
 * Kept for back-compat with consumers that read the table directly.
 */
export const LOCK_FILE_TABLE: ReadonlyArray<LockFileMapping> = allLockFiles().map((e) => ({
  filename: e.filename,
  manager: e.manager,
}));

/**
 * Resolve the manager identifier for a given filename. Returns null
 * when the filename is not in the table — caller treats null as
 * "ignore this file, analyzers will figure it out".
 */
export function resolveLockFileManager(filename: string): string | null {
  return registryResolveLockFileManager(filename);
}

/** All canonical lock-file basenames the inspector recognises. */
export { knownLockFileBasenames };
