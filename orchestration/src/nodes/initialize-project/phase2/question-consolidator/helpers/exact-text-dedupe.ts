/**
 * Plan 14 §C.9.3 (gira-exhaustive-followup-2, 2026-05-05) —
 * deterministic exact-text dedupe for the Phase 2 consolidator.
 *
 * The consolidator's job is set-dedupe by question text. Most
 * duplicates analyzers emit are byte-identical (or near-identical
 * after whitespace normalisation): three of four analyzers asking
 * "What is the testing coverage policy?" with identical wording
 * is the common shape. Spawning the LLM agent to handle that case
 * costs ~10-15s for zero semantic work — the dedupe is structural,
 * not semantic.
 *
 * This pre-pass runs BEFORE the LLM agent is spawned. It collapses
 * normalised-text duplicates into a single canonical entry whose
 * `consolidated_from` is the union of source agents. Anything left
 * in `dedupedGaps` is genuinely paraphrased (or genuinely unique)
 * and worth the LLM round-trip.
 *
 * Stack-agnostic: text normalisation is whitespace + lowercase
 * only; no language-family or framework token assumptions.
 */

import type { Gap, ConsolidatedGap } from '../types.js';

export interface ExactTextDedupeResult {
  /**
   * Gaps that survived the dedupe pass. Each is the
   * canonical-text entry of its equivalence class; duplicates are
   * folded into `consolidated_from` and `original_count`.
   */
  dedupedGaps: ConsolidatedGap[];
  /**
   * The number of input gaps the dedupe pass collapsed (i.e.
   * `inputGaps.length - dedupedGaps.length`). Surfaced in the
   * consolidator metadata so the run report can show how much
   * structural work was done before the LLM saw anything.
   */
  eliminatedDuplicates: number;
  /**
   * Map of normalised question text → group_id. Used by the
   * orchestrator to merge `consolidation_groups` from the LLM's
   * output with the deterministic groups produced here.
   */
  deterministicGroups: Array<{
    group_id: number;
    topic: string;
    original_items: string[];
    consolidated_to: string;
    reason: string;
  }>;
}

/**
 * Normalise a question for byte-identity comparison:
 *   - Trim leading/trailing whitespace.
 *   - Collapse internal whitespace runs to single space.
 *   - Lowercase.
 *   - Strip a trailing question mark + punctuation (so
 *     "What is X?" and "What is X" are the same gap).
 *
 * Stack-agnostic — no language-family text rules.
 */
export function normaliseQuestion(question: string): string {
  return question
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[?!.]+$/, '')
    .toLowerCase();
}

/**
 * Group gaps by normalised question text. Each group becomes a
 * single `ConsolidatedGap` whose:
 *   - canonical text comes from the FIRST gap in the group (so
 *     the agent's chosen wording survives, not a normalised one);
 *   - `consolidated_from` is the union of source agents
 *     (deduped, sorted for stable output);
 *   - `original_count` equals the group size;
 *   - `attempted_resolution` is the union of all groups'
 *     resolutions (deduped while preserving order);
 *   - `impact` keeps the longest impact text (most-specific
 *     wording usually wins).
 *
 * Singleton groups (size 1) survive as-is, just promoted to
 * `ConsolidatedGap` shape with `original_count: 1`.
 */
export function exactTextDedupe(gaps: Gap[]): ExactTextDedupeResult {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return { dedupedGaps: [], eliminatedDuplicates: 0, deterministicGroups: [] };
  }

  const groups = new Map<string, Gap[]>();
  for (const gap of gaps) {
    const key = normaliseQuestion(gap.question ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(gap);
  }

  const dedupedGaps: ConsolidatedGap[] = [];
  const deterministicGroups: ExactTextDedupeResult['deterministicGroups'] = [];
  let nextGroupId = 1;
  let eliminatedDuplicates = 0;

  for (const [, group] of groups) {
    const canonical = group[0];
    const sourceAgents = uniqueSorted(group.map((g) => g.agent ?? '')).filter((a) => a.length > 0);
    const resolutions = uniquePreserveOrder(
      group.flatMap((g) => readArray(g.attempted_resolution)),
    );
    const impactCandidates = group.map((g) => readString(g.impact)).filter((s) => s.length > 0);
    const longestImpact = impactCandidates.sort((a, b) => b.length - a.length)[0];

    const consolidated: ConsolidatedGap = {
      ...canonical,
      consolidated_from: sourceAgents.length > 0 ? sourceAgents : [canonical.agent ?? ''],
      original_count: group.length,
    };

    if (resolutions.length > 0) {
      consolidated.attempted_resolution = resolutions;
    }
    if (longestImpact) {
      consolidated.impact = longestImpact;
    }

    dedupedGaps.push(consolidated);

    if (group.length > 1) {
      eliminatedDuplicates += group.length - 1;
      deterministicGroups.push({
        group_id: nextGroupId++,
        topic: canonical.item ?? canonical.question ?? `group-${nextGroupId}`,
        original_items: group.map((g) => g.item ?? g.question ?? '').filter((s) => s.length > 0),
        consolidated_to: canonical.question ?? '',
        reason: 'Identical question text (after whitespace + case normalisation).',
      });
    }
  }

  return { dedupedGaps, eliminatedDuplicates, deterministicGroups };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function readArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
