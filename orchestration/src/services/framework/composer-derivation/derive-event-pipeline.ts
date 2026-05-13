/**
 * Event-pipeline derivation.
 *
 * Walks all manifest deps; matches against the registry's
 * `eventQueueLibraries`; picks `pattern` + `technology` from the first
 * matched library. Returns `undefined` when no library is detected.
 */

import { extractDepsFromManifest } from './extract-deps.js';
import { matchEventQueueLibraries } from './registry-lookup.js';
import type { DeriveInput, DerivedEventPipeline } from './types.js';

export function deriveEventPipeline(input: DeriveInput): DerivedEventPipeline | undefined {
  const deps = new Set<string>();
  for (const m of input.inspection.manifests) {
    for (const d of extractDepsFromManifest(m)) deps.add(d);
  }
  const matches = matchEventQueueLibraries(Array.from(deps));
  if (matches.length === 0) return undefined;
  const primary = matches[0];
  return {
    pattern: primary.pattern,
    technology: primary.displayName,
  };
}
