/**
 * Plan §I.6 (gira-exhaustive followup, 2026-05-05) — incremental
 * Phase 1 opt-in fast path.
 *
 * The Phase 1 analyzers are idempotent for a given graph state: if
 * the graph SHA hasn't changed since a prior run, the analyzers
 * would produce byte-identical (modulo timestamps) outputs. Re-
 * running them costs ~5 minutes and ~6× the LLM token budget for
 * zero new information.
 *
 * The incremental fast path:
 *   1. Hash the current graph DB → `currentGraphSha`.
 *   2. Read `<tempDir>/phase1-outputs/.incremental-state.json` for
 *      the prior `graphSha` and per-analyzer output paths.
 *   3. If the prior state matches AND every prior output file still
 *      exists, return `{ canSkip: true, restoredOutputs: [...] }`
 *      so the orchestrator can skip the analyzer agents entirely.
 *   4. Otherwise return `{ canSkip: false }` and the orchestrator
 *      proceeds with the normal Phase 1 flow. After Phase 1 finishes
 *      successfully, `recordIncrementalState` writes the new
 *      `.incremental-state.json` so the NEXT run can skip if the
 *      graph hasn't changed.
 *
 * **Default OFF** (per the plan): the fast path is opt-in via the
 * `--incremental` CLI flag (or `INCREMENTAL_PHASE1=1` env var). This
 * is risk-mitigation: graph-SHA equality is necessary but not
 * sufficient for correctness if the analyzer prompts themselves
 * changed between runs. Treating the prompt-byte-hash as part of
 * the "state matches" check would be overkill (every framework
 * upgrade would invalidate the cache); the opt-in flag puts the
 * decision in the operator's hands.
 *
 * Stack-agnostic: every operation is on the graph DB hash and the
 * Phase 1 output JSONs (already shape-only); no language assumption.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STATE_FILENAME = '.incremental-state.json';

const PHASE1_OUTPUT_FILES = [
  '01-structure-architecture.json',
  '02-tech-stack-dependencies.json',
  '03-code-patterns-testing.json',
  '04-data-flows-integrations.json',
] as const;

interface IncrementalState {
  graphSha: string;
  recordedAt: string;
  outputs: Record<string, string>; // filename → relative path
}

export interface IncrementalCheckResult {
  /**
   * True when every guard passed and the orchestrator can skip
   * Phase 1 entirely. The caller still emits the same `phase1_*`
   * state shape using the existing on-disk JSONs.
   */
  canSkip: boolean;
  /** Reason for the decision — surfaced in operator-facing logs. */
  reason: string;
  /** The current graph SHA, regardless of canSkip. */
  currentGraphSha: string;
}

/**
 * Check whether Phase 1 can be skipped. Pure file reads + a single
 * hash compute; no LLM calls, no MCP calls. Bounded cost: O(graph
 * file size) for the SHA + O(1) for the state file read.
 *
 * Stack-agnostic: hashes the DB file bytes (the graph format itself
 * is stack-agnostic by construction).
 */
export function checkIncrementalEligibility(
  graphDbPath: string,
  phase1OutputsDir: string,
  options: { enabled?: boolean } = {},
): IncrementalCheckResult {
  if (options.enabled !== true) {
    return {
      canSkip: false,
      reason: 'incremental mode disabled (default OFF; pass --incremental to opt in)',
      currentGraphSha: '',
    };
  }

  if (!existsSync(graphDbPath)) {
    return {
      canSkip: false,
      reason: `graph DB not found at ${graphDbPath}`,
      currentGraphSha: '',
    };
  }

  const currentGraphSha = hashFile(graphDbPath);

  const statePath = join(phase1OutputsDir, STATE_FILENAME);
  if (!existsSync(statePath)) {
    return {
      canSkip: false,
      reason: 'no prior incremental state — running Phase 1 fresh',
      currentGraphSha,
    };
  }

  let prior: IncrementalState;
  try {
    prior = JSON.parse(readFileSync(statePath, 'utf-8')) as IncrementalState;
  } catch {
    return {
      canSkip: false,
      reason: 'incremental state file unreadable / malformed',
      currentGraphSha,
    };
  }

  if (prior.graphSha !== currentGraphSha) {
    return {
      canSkip: false,
      reason: `graph SHA changed (${prior.graphSha.slice(0, 12)} → ${currentGraphSha.slice(0, 12)})`,
      currentGraphSha,
    };
  }

  // Every prior output file must still be on disk. A missing file
  // means somebody (CI / a developer / a cleanup script) wiped the
  // outputs; we can't honour the cache.
  for (const filename of PHASE1_OUTPUT_FILES) {
    const candidate = join(phase1OutputsDir, filename);
    if (!existsSync(candidate)) {
      return {
        canSkip: false,
        reason: `prior output missing: ${filename}`,
        currentGraphSha,
      };
    }
  }

  return {
    canSkip: true,
    reason: `graph SHA matches prior run (${currentGraphSha.slice(0, 12)})`,
    currentGraphSha,
  };
}

/**
 * Persist the post-Phase-1 incremental state so the NEXT run can
 * decide whether to skip. Called by the orchestrator after Phase 1
 * succeeds (every analyzer produced an output file).
 *
 * Defensive on missing dir: creates `phase1OutputsDir` if absent.
 */
export function recordIncrementalState(phase1OutputsDir: string, currentGraphSha: string): void {
  if (!currentGraphSha) return;
  mkdirSync(phase1OutputsDir, { recursive: true });
  const state: IncrementalState = {
    graphSha: currentGraphSha,
    recordedAt: new Date().toISOString(),
    outputs: Object.fromEntries(PHASE1_OUTPUT_FILES.map((f) => [f, f])),
  };
  writeFileSync(join(phase1OutputsDir, STATE_FILENAME), JSON.stringify(state, null, 2), 'utf-8');
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export const __INTERNAL = {
  STATE_FILENAME,
  PHASE1_OUTPUT_FILES,
};
