/**
 * Enforcement-summary derivation.
 *
 * Templated 1–2 sentence paragraph describing how lint / format /
 * pre-commit gates compose end-to-end. Mentions only tools actually
 * detected. LLM-narrative may overwrite via the composer-view fallback.
 */

import type { DeriveInput, DerivedQualityTools } from './types.js';

export function deriveEnforcementSummary(
  _input: DeriveInput,
  qualityTools: DerivedQualityTools,
  ciProvider?: string,
): string {
  const parts: string[] = [];

  const codeQuality: string[] = [];
  if (qualityTools.linter) codeQuality.push(qualityTools.linter);
  if (qualityTools.formatter && qualityTools.formatter !== qualityTools.linter)
    codeQuality.push(qualityTools.formatter);
  if (qualityTools.type_checker) codeQuality.push(qualityTools.type_checker);

  if (codeQuality.length > 0) {
    parts.push(`${codeQuality.join(' + ')} are configured.`);
  }

  if (qualityTools.pre_commit) {
    parts.push(
      `Local gate: ${qualityTools.pre_commit} runs the configured tools before each commit.`,
    );
  }

  if (ciProvider) {
    parts.push(`CI gate: ${ciProvider} re-runs the same checks on every push.`);
  }

  if (parts.length === 0) {
    return 'No automated quality gates detected.';
  }
  return parts.join(' ');
}
