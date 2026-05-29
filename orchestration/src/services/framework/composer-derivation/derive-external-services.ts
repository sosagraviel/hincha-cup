/**
 * External services derivation.
 *
 * Walks every manifest's dep list and matches against the registry's
 * `externalServiceSdks` table. Returns deduped Stripe / Sentry /
 * SendGrid / etc. entries with the dep token that triggered the match.
 */

import { extractDepsFromManifest } from './extract-deps.js';
import { matchExternalServiceSdks } from './registry-lookup.js';
import type { DeriveInput, DerivedExternalService } from './types.js';

export function deriveExternalServices(input: DeriveInput): DerivedExternalService[] {
  const allDeps = new Set<string>();
  for (const manifest of input.inspection.manifests) {
    for (const dep of extractDepsFromManifest(manifest)) {
      allDeps.add(dep);
    }
  }
  const matches = matchExternalServiceSdks(Array.from(allDeps));
  return matches.map((m) => ({
    name: m.vendor,
    sdk: m.pkg,
    purpose: m.purpose,
  }));
}
