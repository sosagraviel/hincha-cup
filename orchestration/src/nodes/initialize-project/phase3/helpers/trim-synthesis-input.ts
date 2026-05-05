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

interface CuratedSynthesisInput {
  consolidated_gaps: unknown;
  consolidation_metadata: unknown;
  summary: {
    services: Array<{
      id: string;
      type?: string;
      language?: string;
      framework_main?: string;
    }>;
    languages?: unknown;
    repository_type?: unknown;
    monorepo?: unknown;
    runtimes?: unknown;
    build_tools?: unknown;
    architecture_pattern?: unknown;
  };
}

/**
 * Trim the consolidation blob to the synthesizer-relevant subset.
 * Pure function — no side effects. Returns a new object; the input
 * is not mutated.
 */
export function trimSynthesisInput(consolidation: unknown): CuratedSynthesisInput {
  const root = isObject(consolidation) ? consolidation : {};
  const findings = isObject(root.consolidated_findings) ? root.consolidated_findings : {};

  // Services come from the structure-architecture analyzer's slice
  // OR from the consolidator's merged top-level (varies by run).
  const servicesRaw = pickServices(findings) ?? pickServices(root) ?? [];
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
    services.push(entry);
  }

  return {
    consolidated_gaps: pickConsolidatedGaps(root),
    consolidation_metadata: pickConsolidationMetadata(root),
    summary: {
      services,
      languages: pickFirst(findings.languages, root.languages),
      repository_type: pickFirst(findings.repository_type, root.repository_type),
      monorepo: pickFirst(findings.monorepo, findings.monorepo_layout, root.monorepo),
      runtimes: pickFirst(findings.runtimes, root.runtimes),
      build_tools: pickFirst(findings.build_tools, root.build_tools),
      architecture_pattern: pickFirst(findings.architecture_pattern, root.architecture_pattern),
    },
  };
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
