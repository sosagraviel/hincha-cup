/**
 * Plan §I.4 (gira-exhaustive followup, 2026-05-05) — trim the
 * Phase 2 consolidation blob the synthesizer receives.
 *
 * Pre-trim the synthesizer ingested the full consolidated_findings
 * (merged Phase 1 outputs from all four analyzers) — typically
 * 30-50 KB of JSON containing every per-service breakdown,
 * dependency map, file_placement table, etc. The synthesizer
 * almost never needs that level of detail; it produces 5 high-level
 * sections (CLAUDE.md cheat-sheet + 3 prescriptive skills + 1
 * architectural narrative) using a curated subset of facts.
 *
 * The trim:
 *   - Keep `consolidated_gaps` + `consolidation_metadata` (the
 *     gap-question outputs the synthesizer must read).
 *   - Keep a curated `summary` block: services as { id, type,
 *     language, framework_main }, plus aggregate stack signals
 *     (languages, repository_type, monorepo, runtimes, build_tools).
 *   - Drop raw per-analyzer outputs, per-service dependency lists,
 *     file_placement tables, full database client lists, etc. — the
 *     synthesizer can Read on demand if it really needs them
 *     (and almost never does in practice).
 *
 * Stack-agnostic: every kept field is a top-level shape; no
 * language-specific values are filtered or rewritten.
 *
 * Saves ~37 KB per run (gira measurement; proportional savings on
 * any sufficiently-detailed Phase 2 output).
 */

import { buildCatalogFromConsolidation } from './build-catalog-from-consolidation.js';
import type {
  Automation,
  CommandCatalog,
  ReadmeRunSectionEntry,
} from '../../../../schemas/stack-profile.schema.js';

interface CuratedSynthesisInput {
  consolidated_gaps: unknown;
  consolidation_metadata: unknown;
  summary: {
    services: Array<{
      id: string;
      type?: string;
      language?: string;
      framework_main?: string;
      // Plan 22 — port discovery output. Surfaced to the synthesizer
      // so the `## Services & Ports` table can render real values.
      // When `port_applies === false`, the service legitimately has
      // no localhost port (Plan 21 opt-out shape).
      port?: number;
      port_applies?: boolean;
      port_applies_reason?: string;
    }>;
    // Plan 22 — infrastructure services (Postgres / Redis / Keycloak
    // server / Mailhog / RabbitMQ / SaaS like Sentry / etc.) from
    // the data-flows analyzer. The synthesizer renders these
    // alongside source-code services in `## Services & Ports`.
    infrastructure_services?: Array<{
      id: string;
      type?: string;
      name?: string;
      role?: string;
      port?: number;
      port_applies?: boolean;
      port_applies_reason?: string;
    }>;
    languages?: unknown;
    repository_type?: unknown;
    monorepo?: unknown;
    runtimes?: unknown;
    build_tools?: unknown;
    architecture_pattern?: unknown;
  };
  // Plan 15 §D.4 — pre-built command catalog. Closed-book synthesizer
  // reads `command_catalog` directly and renders the four-tier
  // `Essential Commands` table from it. Catalog ordering is decided
  // here (deterministic TypeScript), not by the LLM.
  command_catalog: CommandCatalog;
  // Surfaced for transparency / debugging — synthesizer renders the
  // catalog, not these. Wiki getting-started page (commit 4/5) reads
  // these too.
  automation?: Automation;
  readme_run_sections?: ReadmeRunSectionEntry[];
}

/**
 * Trim the consolidation blob to the synthesizer-relevant subset.
 * Pure function — no side effects. Returns a new object; the input
 * is not mutated.
 */
export function trimSynthesisInput(consolidation: unknown): CuratedSynthesisInput {
  const root = isObject(consolidation) ? consolidation : {};

  // Plan 16 §C.1 — `consolidated_findings` is keyed by analyzer
  // slug, not flat-merged. Build an ordered list of findings-shape
  // sources to walk: every `consolidated_findings.<slug>.findings`
  // first, then `consolidated_findings` itself (flat-shape fixtures),
  // then `root.findings`, then root. The pre-fix code read
  // `findings.build_tools` against the analyzer-keyed map and
  // silently produced `undefined` — `summary.build_tools` was empty
  // for every project.
  const sources = collectFindingsSources(root);

  // Services come from the structure-architecture analyzer's slice
  // OR from the consolidator's merged top-level (varies by run).
  let servicesRaw: unknown[] | null = null;
  for (const src of sources) {
    servicesRaw = pickServices(src);
    if (servicesRaw && servicesRaw.length > 0) break;
  }
  servicesRaw = servicesRaw ?? [];
  const services: CuratedSynthesisInput['summary']['services'] = [];
  for (const s of servicesRaw) {
    if (!isObject(s)) continue;
    const id = typeof s.id === 'string' ? s.id : typeof s.name === 'string' ? s.name : null;
    if (!id) continue;
    const entry: CuratedSynthesisInput['summary']['services'][number] = { id };
    if (typeof s.type === 'string') entry.type = s.type;
    if (typeof s.language === 'string') entry.language = s.language;
    if (isObject(s.frameworks) && typeof s.frameworks.main === 'string') {
      entry.framework_main = s.frameworks.main;
    }
    // Plan 22 — surface port info to the synthesizer for the
    // `## Services & Ports` table.
    if (isObject(s.environment)) {
      const env = s.environment;
      if (typeof env.port === 'number' && env.port > 0) entry.port = env.port;
      if (env.port_applies === false) entry.port_applies = false;
      if (typeof env.port_applies_reason === 'string') {
        entry.port_applies_reason = env.port_applies_reason;
      }
    }
    services.push(entry);
  }

  // Plan 22 — infrastructure services from the data-flows analyzer.
  // The synthesizer renders these alongside source-code services.
  const infrastructureRaw = firstFromSources(sources, 'infrastructure_services');
  const infrastructureServices: NonNullable<
    CuratedSynthesisInput['summary']['infrastructure_services']
  > = [];
  if (Array.isArray(infrastructureRaw)) {
    for (const item of infrastructureRaw) {
      if (!isObject(item)) continue;
      if (typeof item.id !== 'string' || item.id.length === 0) continue;
      const entry: NonNullable<
        CuratedSynthesisInput['summary']['infrastructure_services']
      >[number] = { id: item.id };
      if (typeof item.type === 'string') entry.type = item.type;
      if (typeof item.name === 'string') entry.name = item.name;
      if (typeof item.role === 'string') entry.role = item.role;
      if (typeof item.port === 'number' && item.port > 0) entry.port = item.port;
      if (item.port_applies === false) entry.port_applies = false;
      if (typeof item.port_applies_reason === 'string') {
        entry.port_applies_reason = item.port_applies_reason;
      }
      infrastructureServices.push(entry);
    }
  }

  // Plan 15 §D.4: build the deterministic command catalog from the
  // consolidation BEFORE the closed-book synthesizer sees it. The
  // synthesizer renders `command_catalog` verbatim — it never decides
  // tier ordering itself.
  const bundle = buildCatalogFromConsolidation(consolidation);

  const result: CuratedSynthesisInput = {
    consolidated_gaps: pickConsolidatedGaps(root),
    consolidation_metadata: pickConsolidationMetadata(root),
    summary: {
      services,
      ...(infrastructureServices.length > 0
        ? { infrastructure_services: infrastructureServices }
        : {}),
      languages: firstFromSources(sources, 'languages'),
      repository_type: firstFromSources(sources, 'repository_type'),
      monorepo: firstFromSources(sources, 'monorepo', 'monorepo_layout'),
      runtimes: firstFromSources(sources, 'runtimes'),
      build_tools: firstFromSources(sources, 'build_tools'),
      architecture_pattern: firstFromSources(sources, 'architecture_pattern'),
    },
    command_catalog: bundle.command_catalog,
  };
  if (bundle.automation) result.automation = bundle.automation;
  if (bundle.readme_run_sections) result.readme_run_sections = bundle.readme_run_sections;
  return result;
}

/**
 * Collect ordered findings-shape sources from a Phase 2 consolidation
 * blob. Mirrors the helper in `build-catalog-from-consolidation.ts`
 * to keep the navigation contract consistent across both consumers.
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

/**
 * Pull the first defined value for any of the given keys across an
 * ordered list of source objects. Returns `undefined` when no key
 * resolves on any source.
 */
function firstFromSources(sources: Record<string, unknown>[], ...keys: string[]): unknown {
  for (const src of sources) {
    for (const key of keys) {
      const v = src[key];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pickServices(obj: Record<string, unknown> | undefined): unknown[] | null {
  if (!obj) return null;
  const candidates = [obj.services, obj.consolidated_findings];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (isObject(c)) {
      const nested = (c as Record<string, unknown>).services;
      if (Array.isArray(nested)) return nested;
    }
  }
  return null;
}

function pickConsolidatedGaps(root: Record<string, unknown>): unknown {
  // The consolidator writes `gaps` (renamed from `consolidated_gaps`
  // by the Phase 2 node) and the agent's raw output had
  // `consolidated_gaps`. Accept either; prefer the agent's name.
  if (Array.isArray(root.consolidated_gaps)) return root.consolidated_gaps;
  if (Array.isArray(root.gaps)) return root.gaps;
  return [];
}

function pickConsolidationMetadata(root: Record<string, unknown>): unknown {
  // Accept either spelling — the consolidator persists this under
  // `question_consolidation`; the validator emits `consolidation_metadata`.
  if (isObject(root.consolidation_metadata)) return root.consolidation_metadata;
  if (isObject(root.question_consolidation)) return root.question_consolidation;
  return {};
}

function pickFirst(...candidates: unknown[]): unknown {
  for (const c of candidates) {
    if (c !== undefined && c !== null) return c;
  }
  return undefined;
}
