/**
 * Deterministic service-id normalisation.
 *
 * Rewrites every service whose `id !== basename(path)` to the folder basename
 * and propagates the mapping through every downstream id-keyed map across all
 * four analyzer slices (`build_tools`, `testing`, `dependencies.by_service`, etc.).
 *
 * Stack-agnostic: pure path manipulation. No language assumptions.
 */

/**
 * Mapping from the analyzer-emitted id to the canonical
 * folder-basename id. Returned alongside the rewritten consolidation
 * for visibility / debugging.
 */
export type ServiceIdRewrites = Record<string, string>;

export interface NormaliseResult {
  /** Deep-copied + rewritten consolidation. The input is not mutated. */
  consolidation: unknown;
  /** Map of legacy id → canonical id. Empty when no rewrites happened. */
  rewrites: ServiceIdRewrites;
}

/**
 * Normalise service IDs across a Phase 2 consolidation blob.
 *
 * Rewrites:
 *   - `consolidated_findings.<analyzer>.findings.services[].id`
 *     (structure analyzer)
 *   - Top-level keys of `findings.build_tools.<id>` (tech-stack)
 *   - Top-level keys of `findings.testing.<id>` (code-patterns)
 *   - Top-level keys of `findings.dependencies.by_service.<id>`
 *   - Any `services[].id` references in nested findings shapes.
 *
 * No-op when every service already has `id === basename(path)`.
 * Returns the deep-copied consolidation; never mutates the input.
 */
export function normaliseServiceIds(consolidation: unknown): NormaliseResult {
  if (!isObject(consolidation)) {
    return { consolidation, rewrites: {} };
  }

  const cloned = structuredClone(consolidation) as Record<string, unknown>;

  const sources = collectFindingsSources(cloned);
  const rewrites = computeServiceIdRewrites(sources);

  if (Object.keys(rewrites).length === 0) {
    return { consolidation: cloned, rewrites: {} };
  }

  for (const src of sources) {
    applyServiceIdRewritesToFindings(src, rewrites);
  }

  return { consolidation: cloned, rewrites };
}

/**
 * Compute the legacy → canonical service-id rewrites from any
 * findings-shape sources that contain a `services[]` array.
 *
 * Collision-safe: when two services would collapse onto the same canonical id
 * (e.g. `firebase/functions` and `functions/` both canonicalise to
 * `functions`), the rewrite is SKIPPED for the colliding services. Their
 * legacy ids stay intact (the structure analyzer already disambiguates them
 * with multi-segment forms like `firebase-functions` /
 * `functions-python-lib-logging`); rewriting them would create duplicate ids
 * in `stack_profile.services`, which `StackProfileSchema.refine()` rejects
 * with `Service IDs must be unique across all services`.
 *
 * Public so callers that operate on separate analyzer blobs (Phase 4's
 * context-generation node loads four analyzer files individually) can derive
 * the rewrites once from the structure analyzer's slice and reuse them
 * across the other three.
 */
export function computeServiceIdRewrites(
  findingsSources: Array<Record<string, unknown> | undefined>,
): ServiceIdRewrites {
  type Candidate = { legacyId: string; canonical: string };
  const candidates: Candidate[] = [];
  const reservedCanonicalsFromLegacy = new Set<string>();

  for (const src of findingsSources) {
    if (!src) continue;
    const services = src.services;
    if (!Array.isArray(services)) continue;
    for (const s of services) {
      if (!isObject(s)) continue;
      const legacyId = typeof s.id === 'string' ? s.id : undefined;
      const path = typeof s.path === 'string' ? s.path : undefined;
      if (!legacyId || !path) continue;
      const canonical = canonicalIdFromPath(path);
      if (!canonical) continue;
      if (canonical === legacyId) {
        reservedCanonicalsFromLegacy.add(legacyId);
        continue;
      }
      candidates.push({ legacyId, canonical });
    }
  }

  const canonicalCounts = new Map<string, number>();
  for (const c of candidates) {
    canonicalCounts.set(c.canonical, (canonicalCounts.get(c.canonical) ?? 0) + 1);
  }

  const rewrites: ServiceIdRewrites = {};
  for (const { legacyId, canonical } of candidates) {
    const collidesWithOtherCandidate = (canonicalCounts.get(canonical) ?? 0) > 1;
    const collidesWithExistingLegacyId = reservedCanonicalsFromLegacy.has(canonical);
    if (collidesWithOtherCandidate || collidesWithExistingLegacyId) continue;
    if (!(legacyId in rewrites)) rewrites[legacyId] = canonical;
  }
  return rewrites;
}

/**
 * Apply id-rewrites to a single findings-shape slice. Mutates the
 * input. Public so Phase 4 can apply the rewrites across the four
 * separate analyzer files.
 */
export function applyServiceIdRewritesToFindings(
  findings: Record<string, unknown> | undefined,
  rewrites: ServiceIdRewrites,
): void {
  if (!findings) return;
  if (Object.keys(rewrites).length === 0) return;

  rewriteServicesArray(findings.services, rewrites);
  rewriteIdKeyedMap(findings.build_tools, rewrites);
  rewriteIdKeyedMap(findings.testing, rewrites);
  rewriteIdKeyedMap(findings.environment, rewrites);
  if (isObject(findings.dependencies)) {
    rewriteIdKeyedMap(findings.dependencies.by_service, rewrites);
  }
  for (const [key, value] of Object.entries(findings)) {
    if (!key.endsWith('_by_service')) continue;
    rewriteIdKeyedMap(value, rewrites);
  }
}

/**
 * Compute the canonical service id for a service path:
 * `slugify(basename(path))` — lowercase, ASCII letters/digits/dashes
 * only, leading/trailing dashes trimmed.
 *
 * Examples:
 *   `services/backend`           → `backend`
 *   `apps/web-frontend`          → `web-frontend`
 *   `packages/@scope/shared`     → `shared`
 *   `seeds/scripts`              → `scripts`
 *   `.`                          → `''` (caller treats empty as "no rewrite")
 */
export function canonicalIdFromPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '').replace(/^\/+/, '');
  if (trimmed.length === 0 || trimmed === '.') return '';
  const segments = trimmed.split('/').filter((s) => s.length > 0 && !s.startsWith('@'));
  if (segments.length === 0) return '';
  const base = segments[segments.length - 1];
  return slugify(base);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Mirror of the helper in `build-catalog-from-consolidation.ts`.
 * Returns a list of `findings`-shape sources to walk (analyzer-keyed
 * slices first, then flat-shape fallbacks).
 */
function collectFindingsSources(root: Record<string, unknown>): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  if (isObject(root.consolidated_findings)) {
    for (const value of Object.values(root.consolidated_findings)) {
      if (!isObject(value)) continue;
      if (isObject(value.findings)) sources.push(value.findings);
      sources.push(value);
    }
    sources.push(root.consolidated_findings);
  }
  if (isObject(root.findings)) sources.push(root.findings);
  sources.push(root);
  return sources;
}

function rewriteServicesArray(value: unknown, rewrites: ServiceIdRewrites): void {
  if (!Array.isArray(value)) return;
  for (const s of value) {
    if (!isObject(s)) continue;
    if (typeof s.id !== 'string') continue;
    const canonical = rewrites[s.id];
    if (canonical) s.id = canonical;
  }
}

function rewriteIdKeyedMap(value: unknown, rewrites: ServiceIdRewrites): void {
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const canonical = rewrites[key];
    if (!canonical) continue;
    if (canonical === key) continue;
    if (!(canonical in value)) {
      value[canonical] = entry;
    }
    delete value[key];
  }
}
