/**
 * Phase 4: Language Extractor Helper
 *
 * Extracts language information from Phase 1 analyzer outputs.
 *
 * Plan v4 Phase A.2 (2026-05-09) — every value flows through
 * `normalizeLanguage` (the shared alias map) so dialect tokens
 * (`tsx`, `jsx`, `mjs`, `cjs`, `bash`, `zsh`, `cs`, `cpp`, `kt`,
 * `py`, `rs`, …) collapse to canonical names BEFORE deduping.
 * Without this, a project that emits both `typescript` and `tsx`
 * would surface BOTH in the Tech Stack `Languages: …` bullet (the
 * user-visible regression from archive/v3-iteration-100). Per-service
 * language fields go through the same alias map via the Zod transform
 * on the schema; this helper covers the top-level / nested / object
 * forms the schema's `findings.passthrough()` surface never normalises.
 *
 * Stack/structure-agnostic: every primary path reads
 * `findings.languages` (universal). The legacy `backend.language` /
 * `frontend.language` fallback paths from prior iterations have been
 * dropped — they hardcoded role-named keys, biasing the discovery to
 * web-app shapes. The structure-analyzer's per-service `language`
 * field (universal) is the canonical source.
 */

import { normalizeLanguage } from '../../../../schemas/language-normalization.js';

/**
 * Extract languages from Phase 1 structure and tech-stack analyzers.
 *
 * Handles three shapes the analyzer might emit:
 * - Array of language strings: `["typescript", "tsx", "python"]` → `["typescript", "python"]`
 * - Object map of role → version-string: `{ api: "TypeScript 5.8", web: "JavaScript" }`
 * - Per-service array under `services[]` with `service.language`
 *
 * @param structureFindings - Findings from structure-architecture analyzer
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns Deduped array of canonical language names
 */
export function extractLanguagesFromPhase1(
  structureFindings: unknown,
  techStackFindings: unknown,
): string[] {
  const languageSet = new Set<string>();
  const add = (raw: unknown): void => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const canonical = normalizeLanguage(trimmed);
    if (canonical) languageSet.add(canonical);
  };
  const addFromVersionString = (langStr: unknown): void => {
    // "TypeScript 5.8.x" → captured "TypeScript" → normalised to
    // "typescript". The captured group accepts letters + a couple of
    // language-name punctuations (C++, C#, F#) before passing to the
    // canonical normaliser.
    if (typeof langStr !== 'string') return;
    const match = langStr.match(/^([a-zA-Z+#-]+)/);
    if (match) add(match[1]);
  };

  // Pass 1 — direct array on the structure analyzer's `findings.languages`
  // (the canonical universal shape). This is the primary path.
  const structureFindingsObj = isObject(structureFindings) ? structureFindings : {};
  const techStackFindingsObj = isObject(techStackFindings) ? techStackFindings : {};

  const topLanguages = (structureFindingsObj as Record<string, unknown>).languages;
  if (Array.isArray(topLanguages)) {
    for (const v of topLanguages) add(v);
  } else if (isObject(topLanguages)) {
    // Object map (role → version-string). Extract the first word from
    // each value, treating it as the language token.
    for (const v of Object.values(topLanguages)) addFromVersionString(v);
  }

  // Pass 2 — if `findings.tech_stack.languages` is set (legacy
  // tech-stack analyzer shape), include it. Same array-or-object
  // handling.
  const techStackInline = (structureFindingsObj as Record<string, unknown>).tech_stack;
  if (isObject(techStackInline)) {
    const tsLanguages = (techStackInline as Record<string, unknown>).languages;
    if (Array.isArray(tsLanguages)) {
      for (const v of tsLanguages) add(v);
    } else if (isObject(tsLanguages)) {
      for (const v of Object.values(tsLanguages)) addFromVersionString(v);
    }
  }

  // Pass 3 — pull per-service language from the structure analyzer's
  // `services[]` (universal). This catches every shape via the same
  // canonical surface.
  const services = (structureFindingsObj as Record<string, unknown>).services;
  if (Array.isArray(services)) {
    for (const svc of services) {
      if (!isObject(svc)) continue;
      add((svc as Record<string, unknown>).language);
    }
  }

  // Pass 4 — same for tech-stack analyzer's services (if it has them).
  const techStackServices = (techStackFindingsObj as Record<string, unknown>).services;
  if (Array.isArray(techStackServices)) {
    for (const svc of techStackServices) {
      if (!isObject(svc)) continue;
      add((svc as Record<string, unknown>).language);
    }
  }

  return Array.from(languageSet);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
