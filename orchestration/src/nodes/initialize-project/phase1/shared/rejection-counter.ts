/**
 * Per-session rejection counter for the Phase 1 stop hook.
 *
 * When the model keeps emitting the same validation-failing field twice in a
 * row, the validation gate is treated as a `soft` warning instead of a hard
 * block: the framework attaches the message to `soft_warning[]` and allows
 * the agent to finish. This prevents the infinite-regeneration loops the
 * `stride-origin` run hit on E068 (missing judgment field for service) and
 * E061 (invalid attempted_resolution entry).
 *
 * The counter file lives next to the patch baseline at
 * `<tempDir>/phase1-outputs/<agent-output>.rejection-count.json` so it shares
 * the session lifecycle with the baseline (created when the first stop-hook
 * acceptance writes the baseline; reset each fresh init run when the temp
 * directory is rebuilt).
 *
 * Stack-agnostic: the counter doesn't know what `code` means; it just counts
 * (agent, code) pairs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const COUNTER_FILENAME_BY_AGENT: Record<string, string> = {
  'structure-architecture-analyzer': '01-structure-architecture.json',
  'tech-stack-dependencies-analyzer': '02-tech-stack-dependencies.json',
  'code-patterns-testing-analyzer': '03-code-patterns-testing.json',
  'data-flows-integrations-analyzer': '04-data-flows-integrations.json',
};

const COUNTER_SUFFIX = '.rejection-count.json';

/**
 * Threshold above which a soft-classified code stops blocking and is attached
 * to `soft_warning[]` instead. Two strikes is enough signal that the model
 * cannot resolve the gate from the available feedback — additional retries
 * just burn output tokens.
 */
export const REJECTION_AUTO_DOWNGRADE_THRESHOLD = 2;

function counterPath(tempDir: string, agentName: string): string {
  const filename = COUNTER_FILENAME_BY_AGENT[agentName] ?? `${agentName}.json`;
  return join(tempDir, 'phase1-outputs', `${filename}${COUNTER_SUFFIX}`);
}

function readCounter(p: string): Record<string, number> {
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
  } catch {}
  return {};
}

function writeCounter(p: string, data: Record<string, number>): void {
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

/**
 * Increment the rejection count for `(agentName, code)` and return the new
 * value. Best-effort: a write failure still returns the incremented in-memory
 * count so the hook can make its decision on this turn.
 */
export function recordRejection(tempDir: string, agentName: string, code: string): number {
  if (!tempDir || !agentName || !code) return 1;
  const p = counterPath(tempDir, agentName);
  const counts = readCounter(p);
  const next = (counts[code] ?? 0) + 1;
  counts[code] = next;
  writeCounter(p, counts);
  return next;
}

/**
 * Returns true when the framework should treat the current rejection as a
 * soft warning (attach to `soft_warning[]` + allow) rather than a hard block
 * (exit 2 + retry). Read-only — does NOT increment the counter.
 */
export function shouldAutoDowngrade(tempDir: string, agentName: string, code: string): boolean {
  if (!tempDir || !agentName || !code) return false;
  const counts = readCounter(counterPath(tempDir, agentName));
  return (counts[code] ?? 0) >= REJECTION_AUTO_DOWNGRADE_THRESHOLD;
}
