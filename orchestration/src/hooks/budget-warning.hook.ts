import { snapshotBudgets, formatBudgetWarnings } from '../services/framework/budget-monitor.js';
import { resolveTokenUsageJsonlPath } from '../services/framework/debug-store/token-usage-emitter.js';

/**
 * Reads the current session's token-usage.jsonl and returns a budget warning
 * string suitable for injection into the agent's next turn. Empty when
 * nothing is over budget.
 *
 * Stop hook entry point. Reads project path from env / cwd.
 */
export async function emitBudgetWarning(opts: {
  projectPath?: string;
  agent?: string;
  phase?: string;
}): Promise<string> {
  const projectPath = opts.projectPath ?? process.env['PROJECT_PATH'] ?? process.cwd();
  const jsonlPath = resolveTokenUsageJsonlPath(projectPath);

  const utilizations = snapshotBudgets({
    jsonlPath,
    agent: opts.agent,
    phase: opts.phase,
  });

  return formatBudgetWarnings(utilizations);
}
