/**
 * Phase 4: Language Extractor Helper
 *
 * Extracts language information from Phase 1 analyzer outputs. Every value
 * flows through `normalizeLanguage` so dialect tokens (`tsx`, `jsx`, `bash`,
 * `kt`, etc.) collapse to canonical names before deduping.
 *
 * Stack/structure-agnostic: reads `findings.languages` (universal).
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
    if (typeof langStr !== 'string') return;
    const match = langStr.match(/^([a-zA-Z+#-]+)/);
    if (match) add(match[1]);
  };

  const structureFindingsObj = isObject(structureFindings) ? structureFindings : {};
  const techStackFindingsObj = isObject(techStackFindings) ? techStackFindings : {};

  const topLanguages = (structureFindingsObj as Record<string, unknown>).languages;
  if (Array.isArray(topLanguages)) {
    for (const v of topLanguages) add(v);
  } else if (isObject(topLanguages)) {
    for (const v of Object.values(topLanguages)) addFromVersionString(v);
  }

  const techStackInline = (structureFindingsObj as Record<string, unknown>).tech_stack;
  if (isObject(techStackInline)) {
    const tsLanguages = (techStackInline as Record<string, unknown>).languages;
    if (Array.isArray(tsLanguages)) {
      for (const v of tsLanguages) add(v);
    } else if (isObject(tsLanguages)) {
      for (const v of Object.values(tsLanguages)) addFromVersionString(v);
    }
  }

  const services = (structureFindingsObj as Record<string, unknown>).services;
  if (Array.isArray(services)) {
    for (const svc of services) {
      if (!isObject(svc)) continue;
      add((svc as Record<string, unknown>).language);
    }
  }

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
