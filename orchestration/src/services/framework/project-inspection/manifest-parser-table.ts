/**
 * Manifest-filename → parser mapping.
 *
 * This module is a thin view over the centralized language-config registry.
 * Add a new manifest by adding/updating its language entry under
 * `language-config/languages/`, not by editing this table.
 */

import {
  allManifests,
  knownExactManifestBasenames,
  knownManifestSuffixes,
  resolveManifestEntry,
} from '../language-config/index.js';
import type { ManifestFormat } from '../language-config/index.js';

export type { ManifestFormat };

export interface ManifestMapping {
  /** Exact filename, or `*.<ext>` for suffix-based matches. */
  readonly kind: string;
  /** Parser format. */
  readonly format: ManifestFormat;
}

/**
 * Computed once at module-load time from the language registry.
 * Kept for back-compat with consumers that read the table directly.
 */
export const MANIFEST_PARSER_TABLE: ReadonlyArray<ManifestMapping> = (() => {
  const seen = new Set<string>();
  const out: ManifestMapping[] = [];
  for (const m of allManifests()) {
    if (seen.has(m.kind)) continue;
    seen.add(m.kind);
    out.push({ kind: m.kind, format: m.format });
  }
  return out;
})();

/**
 * Resolve the manifest mapping for a given filename. Supports both
 * exact-filename and `*.<ext>` matches. Returns null when no entry
 * matches — caller treats null as "skip this file".
 */
export function resolveManifestMapping(filename: string): ManifestMapping | null {
  const entry = resolveManifestEntry(filename);
  if (!entry) return null;
  return { kind: entry.kind, format: entry.format };
}

export { knownExactManifestBasenames, knownManifestSuffixes };
