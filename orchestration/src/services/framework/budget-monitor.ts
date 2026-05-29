import { existsSync, readFileSync } from 'fs';
import type { TokenUsageRecord } from './debug-store/token-usage-emitter.js';
import { TOKEN_BUDGETS, type BudgetKey, type BudgetSpec } from './budgets.js';

export interface BudgetUtilization {
  budgetKey: BudgetKey;
  spec: BudgetSpec;
  /**
   * For fraction-budgets: tokens consumed across all matching records.
   * For count-budgets (planner_total_graph_queries): number of records.
   */
  consumed: number;
  /**
   * For fraction-budgets: ratio is consumed / contextWindow.
   * For count-budgets: ratio is consumed / target.
   */
  ratio: number;
  status: 'ok' | 'approaching_target' | 'over_target' | 'over_warn';
  /** Present only for fraction-budgets. */
  contextWindow?: number;
}

export interface BudgetSnapshotInput {
  /** Path to the JSONL file emitted by debug-store/token-usage-emitter. */
  jsonlPath: string;
  /** Optional filter: only records whose `agent` matches this string contribute. */
  agent?: string;
  /** Optional filter: only records whose `phase` matches this string contribute. */
  phase?: string;
  /** Total LLM context window in tokens. Default: 200_000 (Claude Opus). */
  contextWindow?: number;
}

const DEFAULT_CONTEXT_WINDOW = 200_000;

const COUNT_BUDGET_KEYS = new Set<BudgetKey>(['planner_total_graph_queries']);

function isFractionBudget(key: BudgetKey): boolean {
  return !COUNT_BUDGET_KEYS.has(key);
}

function parseJsonlRecords(jsonlPath: string): TokenUsageRecord[] {
  if (!existsSync(jsonlPath)) {
    return [];
  }

  const raw = readFileSync(jsonlPath, 'utf-8');
  const records: TokenUsageRecord[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      records.push(JSON.parse(trimmed) as TokenUsageRecord);
    } catch {
      process.stderr.write(
        `[budget-monitor] warn: skipping malformed JSONL line: ${trimmed.slice(0, 120)}\n`,
      );
    }
  }

  return records;
}

function filterRecords(
  records: TokenUsageRecord[],
  agent?: string,
  phase?: string,
): TokenUsageRecord[] {
  return records.filter((r) => {
    if (agent !== undefined && r.agent !== agent) return false;
    if (phase !== undefined && r.phase !== phase) return false;
    return true;
  });
}

function classifyRecord(record: TokenUsageRecord): BudgetKey | undefined {
  const tool = record.tool ?? '';

  if (tool === 'mcp__code_graph__get_minimal_context_tool') {
    return 'minimal_context_per_ticket';
  }

  if (tool === 'mcp__code_graph__get_architecture_overview' || tool.includes('overview')) {
    return 'overview_query';
  }

  if (record.phase === 'wiki_preload' || tool.startsWith('loadLlmWikiContext')) {
    return 'wiki_preload';
  }

  if (record.agent === 'planner' && tool.startsWith('mcp__code_graph')) {
    return 'planner_total_graph_queries';
  }

  return undefined;
}

/**
 * Determines status from a normalized ratio where 1.0 = at-target.
 * normWarn is the warn threshold expressed as a multiple of target (e.g. 2.0 for warn=16, target=8).
 */
function resolveStatus(ratio: number, normWarn: number): BudgetUtilization['status'] {
  if (ratio >= normWarn) return 'over_warn';
  if (ratio >= 1.0) return 'over_target';
  if (ratio >= 0.8) return 'approaching_target';
  return 'ok';
}

/**
 * Snapshot of every budget's current consumption based on the JSONL emitted
 * so far in the session. Cheap (linear in the file).
 *
 * Returns one BudgetUtilization per BudgetKey. If the JSONL file does not
 * exist (no events yet), every entry has consumed=0, ratio=0, status='ok'.
 */
export function snapshotBudgets(input: BudgetSnapshotInput): BudgetUtilization[] {
  const contextWindow = input.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const allRecords = parseJsonlRecords(input.jsonlPath);
  const records = filterRecords(allRecords, input.agent, input.phase);

  const tokenSums = new Map<BudgetKey, number>();
  const countSums = new Map<BudgetKey, number>();

  for (const key of Object.keys(TOKEN_BUDGETS) as BudgetKey[]) {
    tokenSums.set(key, 0);
    countSums.set(key, 0);
  }

  for (const record of records) {
    const key = record.budget_key ?? classifyRecord(record);
    if (key === undefined) continue;

    if (COUNT_BUDGET_KEYS.has(key)) {
      countSums.set(key, (countSums.get(key) ?? 0) + 1);
    } else {
      const tokens =
        (record.input_tokens > 0 ? record.input_tokens : 0) +
        (record.output_tokens > 0 ? record.output_tokens : 0);
      tokenSums.set(key, (tokenSums.get(key) ?? 0) + tokens);
    }
  }

  return (Object.keys(TOKEN_BUDGETS) as BudgetKey[]).map((key) => {
    const spec = TOKEN_BUDGETS[key];
    const fraction = isFractionBudget(key);

    const normWarn = spec.target > 0 ? spec.warn / spec.target : Infinity;
    if (fraction) {
      const consumed = tokenSums.get(key) ?? 0;
      const targetTokens = spec.target * contextWindow;
      const ratio = targetTokens > 0 ? consumed / targetTokens : 0;
      const status = resolveStatus(ratio, normWarn);
      return { budgetKey: key, spec, consumed, ratio, status, contextWindow };
    } else {
      const consumed = countSums.get(key) ?? 0;
      const ratio = spec.target > 0 ? consumed / spec.target : 0;
      const status = resolveStatus(ratio, normWarn);
      return { budgetKey: key, spec, consumed, ratio, status };
    }
  });
}

/**
 * Compact human-readable summary suitable for injection into a planner's
 * system message or a stop-hook output. Includes only entries with status
 * !== 'ok' (or returns an empty string if everything is fine).
 *
 * Example output:
 *   BUDGET WARNING (planner_total_graph_queries): 11 / target 8 (137%) — trim queries.
 *   BUDGET WARNING (wiki_preload): 56000 / target 50000 (112%) — over target, under warn ceiling.
 */
export function formatBudgetWarnings(utilizations: BudgetUtilization[]): string {
  const lines: string[] = [];

  for (const u of utilizations) {
    if (u.status === 'ok') continue;

    const pct = Math.round(u.ratio * 100);
    const fraction = isFractionBudget(u.budgetKey);

    let detail: string;
    if (fraction) {
      const targetTokens = Math.round(u.spec.target * (u.contextWindow ?? DEFAULT_CONTEXT_WINDOW));
      detail = `${u.consumed} / target ~${targetTokens} tokens (${pct}%)`;
    } else {
      detail = `${u.consumed} / target ${u.spec.target} (${pct}%)`;
    }

    const advice = budgetAdvice(u.budgetKey, u.status);
    lines.push(`⚠ BUDGET WARNING (${u.budgetKey}): ${detail} — ${advice}`);
  }

  return lines.join('\n');
}

function budgetAdvice(key: BudgetKey, status: BudgetUtilization['status']): string {
  const suffix = status === 'over_warn' ? 'over warn ceiling, stop now.' : 'trim queries.';
  switch (key) {
    case 'planner_total_graph_queries':
      return `${suffix}`;
    case 'wiki_preload':
      return `over target, under warn ceiling.`;
    case 'overview_query':
      return `reduce overview query scope.`;
    case 'minimal_context_per_ticket':
      return `tighten context filter.`;
  }
}
