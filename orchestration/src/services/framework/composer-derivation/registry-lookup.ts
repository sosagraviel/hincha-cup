/**
 * Registry-driven dependency lookup helpers.
 *
 * `matchExternalServiceSdks(deps)` / `matchAuthLibraries(deps)` /
 * `matchEventQueueLibraries(deps)` take a flat dep-token list (from
 * `extractDepsFromManifest()`) and return the registry entries whose
 * `pkg` is a case-insensitive substring of any dep name.
 *
 * Returns deduped by registry entry's `pkg`. First-match-wins per dep
 * (the agent prompt + composer don't depend on multi-match ordering).
 */

import { getAllLanguages } from '../language-config/index.js';
import type {
  AuthLibraryEntry,
  EventQueueLibraryEntry,
  ExternalServiceSdkEntry,
} from '../language-config/types.js';

function collect<T extends { pkg: string }>(
  pick: (
    langTokens: ReturnType<typeof getAllLanguages>[number]['toolTokens'],
  ) => readonly T[] | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const lang of getAllLanguages()) {
    const entries = pick(lang.toolTokens) ?? [];
    for (const entry of entries) {
      if (seen.has(entry.pkg.toLowerCase())) continue;
      seen.add(entry.pkg.toLowerCase());
      out.push(entry);
    }
  }
  return out;
}

function matchAgainst<T extends { pkg: string }>(deps: ReadonlyArray<string>, registry: T[]): T[] {
  const lowerDeps = deps.map((d) => d.toLowerCase());
  const found = new Map<string, T>();
  for (const entry of registry) {
    const pkgLower = entry.pkg.toLowerCase();
    for (const dep of lowerDeps) {
      if (dep.includes(pkgLower)) {
        if (!found.has(pkgLower)) found.set(pkgLower, entry);
        break;
      }
    }
  }
  return Array.from(found.values());
}

export function matchExternalServiceSdks(deps: ReadonlyArray<string>): ExternalServiceSdkEntry[] {
  return matchAgainst(
    deps,
    collect((t) => t?.externalServiceSdks),
  );
}

export function matchAuthLibraries(deps: ReadonlyArray<string>): AuthLibraryEntry[] {
  return matchAgainst(
    deps,
    collect((t) => t?.authLibraries),
  );
}

export function matchEventQueueLibraries(deps: ReadonlyArray<string>): EventQueueLibraryEntry[] {
  return matchAgainst(
    deps,
    collect((t) => t?.eventQueueLibraries),
  );
}

/**
 * Match dep names against registry string-array tokens (linters /
 * formatters / typeCheckers / testRunners). Each token is a package
 * name; the match rule is:
 *
 *   - exact equality (case-insensitive), OR
 *   - scoped equality: `@<scope>/<token>` (Node), OR
 *   - dot-equality: dep ends with `.<token>` (.NET / Java packages
 *     like `Stripe.net`, `org.junit:junit-jupiter`)
 *
 * Returns the registry TOKEN (canonical short name), deduplicated +
 * sorted. Multi-language registries can have collisions on short
 * tokens (e.g. Dart's `test` vs Node's `@playwright/test`); exact /
 * boundary matching avoids false positives that plain substring
 * matching would produce.
 */
export function matchStringTokens(
  deps: ReadonlyArray<string>,
  registryTokens: ReadonlyArray<string>,
): string[] {
  const lowerDeps = deps.map((d) => d.toLowerCase());
  const found = new Set<string>();
  for (const token of registryTokens) {
    const t = token.toLowerCase();
    for (const dep of lowerDeps) {
      if (dep === t) {
        found.add(token);
        break;
      }
      if (dep.endsWith(`/${t}`) && dep.startsWith('@')) {
        found.add(token);
        break;
      }
      if (dep.endsWith(`.${t}`) || dep.endsWith(`:${t}`)) {
        found.add(token);
        break;
      }
    }
  }
  return Array.from(found).sort();
}
