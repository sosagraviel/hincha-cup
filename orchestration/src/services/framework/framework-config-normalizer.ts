/**
 * Framework Config Normalizer
 *
 * Single source of truth for stripping volatile fields from
 * `framework-config.json`. These fields changed on every run (random hash +
 * per-resource timestamps), produced noisy git diffs and merge conflicts, and
 * are read by nothing. The current writer never emits them, but files
 * committed by older framework versions still carry them — every path that
 * touches the file (init Phase 6, the sync flow, the config-updater write
 * chokepoint) funnels through here so the on-disk shape converges and the
 * paths can never drift on what counts as "volatile".
 *
 * The one timestamp deliberately kept is the top-level
 * `resource_state.last_sync` — a single marker of when sync last changed
 * resource state. It is written only on real changes, so it never churns a
 * no-op run.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strip volatile fields from a parsed framework-config object, in place.
 *
 * Removes the entire `project_metadata` block (`project_path`,
 * `initialization_hash`, `last_analysis`) and any per-resource `last_sync`
 * under `resource_state.skills` / `resource_state.agents`. The top-level
 * `resource_state.last_sync` is intentionally preserved.
 *
 * @returns `true` when at least one field was removed, `false` otherwise.
 */
export function stripVolatileFields(config: Record<string, unknown>): boolean {
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(config, 'project_metadata')) {
    delete config.project_metadata;
    changed = true;
  }

  const resourceState = config.resource_state;
  if (isObject(resourceState)) {
    for (const resourceType of ['skills', 'agents'] as const) {
      const bucket = resourceState[resourceType];
      if (!isObject(bucket)) continue;
      for (const entry of Object.values(bucket)) {
        if (isObject(entry) && Object.prototype.hasOwnProperty.call(entry, 'last_sync')) {
          delete entry.last_sync;
          changed = true;
        }
      }
    }
  }

  return changed;
}

/**
 * Read `framework-config.json` at `filePath`, strip volatile fields, and
 * rewrite it only when something changed. Missing files, unreadable files, and
 * malformed JSON are treated as no-ops (returns `false`) — callers decide
 * whether to log. Idempotent: a second call on an already-clean file returns
 * `false` and leaves the bytes untouched.
 *
 * @returns `true` when the file was rewritten, `false` otherwise.
 */
export function stripVolatileFrameworkConfigFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isObject(parsed)) return false;

  if (!stripVolatileFields(parsed)) return false;

  try {
    writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}
