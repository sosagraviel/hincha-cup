import { join } from 'path';
import { lintLlmWiki } from '../../services/graph-wiki/wiki-lint.service.js';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';
import type { LintReport } from '../../services/graph-wiki/wiki-lint.service.js';

/**
 * Runs the full wiki-lint service over docs/llm-wiki/wiki/ and persists the
 * report to the artifacts directory. Passes changedPages from the refresh set
 * so the semantic contradiction check has a scoped target.
 *
 * The update-state node downstream reads lint_report.structural.length to
 * decide whether to advance .state.json — leave that routing intact.
 */
export async function runLintNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    const emptyReport: LintReport = {
      structural: [],
      semantic: [],
      stats: { pages_scanned: 0, duration_ms: 0 },
    };
    return { lint_report: emptyReport, current_phase: 'run_lint' };
  }

  try {
    const graphDbPath = join(state.project_path, '.code-graph.db');
    const artifactsDir = join(state.project_path, '.claude-temp', 'wiki-lint');

    const report = await lintLlmWiki({
      projectPath: state.project_path,
      graphDbPath,
      changedPages: state.refresh_set.length > 0 ? state.refresh_set : undefined,
      skipSemantic: false,
      artifactsDir,
    });

    return { lint_report: report, current_phase: 'run_lint' };
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
      throw error;
    }

    const fallbackReport: LintReport = {
      structural: [],
      semantic: [],
      stats: { pages_scanned: 0, duration_ms: 0 },
    };
    return {
      lint_report: fallbackReport,
      errors: [`run-lint: ${err.message}`],
      current_phase: 'run_lint',
    };
  }
}
