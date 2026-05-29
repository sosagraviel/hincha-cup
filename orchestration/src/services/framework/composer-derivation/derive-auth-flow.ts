/**
 * Auth-flow derivation.
 *
 * Walks all manifest deps; matches against the registry's
 * `authLibraries`; returns the strategy + library-display-names +
 * templated summary. Returns `undefined` when no auth library detected
 * (composer view will fall through to LLM enrichment).
 */

import { extractDepsFromManifest } from './extract-deps.js';
import { matchAuthLibraries } from './registry-lookup.js';
import type { DeriveInput, DerivedAuthFlow } from './types.js';

export function deriveAuthFlow(input: DeriveInput): DerivedAuthFlow | undefined {
  const deps = new Set<string>();
  for (const m of input.inspection.manifests) {
    for (const d of extractDepsFromManifest(m)) deps.add(d);
  }
  const matches = matchAuthLibraries(Array.from(deps));
  if (matches.length === 0) return undefined;

  const priority: Record<string, number> = {
    'oauth2-pkce': 1,
    'oauth2-code': 2,
    'jwt-bearer': 3,
    mtls: 4,
    'session-cookie': 5,
    'api-key': 6,
    'basic-auth': 7,
    other: 8,
  };
  const sorted = [...matches].sort(
    (a, b) => (priority[a.strategy] ?? 99) - (priority[b.strategy] ?? 99),
  );
  const primary = sorted[0];
  const libraries = sorted.map((m) => m.displayName);

  const summary = renderAuthSummary(primary.strategy, libraries);
  return {
    strategy: primary.strategy,
    libraries,
    summary,
  };
}

function renderAuthSummary(strategy: string, libraries: ReadonlyArray<string>): string {
  const libList = libraries.join(', ');
  switch (strategy) {
    case 'jwt-bearer':
      return `JWT-bearer authentication via ${libList}. Tokens are issued by the project's auth service and verified on each request.`;
    case 'session-cookie':
      return `Session-cookie authentication via ${libList}. The session is server-managed; the browser only carries the cookie.`;
    case 'oauth2-pkce':
      return `OAuth2 authorization-code flow with PKCE via ${libList}. Identity is delegated to an external provider.`;
    case 'oauth2-code':
      return `OAuth2 authorization-code flow via ${libList}. Identity is delegated to an external provider.`;
    case 'mtls':
      return `mTLS client certificate authentication via ${libList}.`;
    case 'api-key':
      return `API-key authentication via ${libList}.`;
    case 'basic-auth':
      return `HTTP Basic authentication via ${libList}.`;
    default:
      return `Authentication via ${libList}.`;
  }
}
