import { execSync } from 'child_process';
import { join } from 'path';
import type { WikiRefreshState, GeneratedPage } from '../../state/schemas/wiki-refresh.schema.js';

/**
 * Writes an updated .state.json to docs/llm-wiki/ only when structural lint
 * checks pass (or no lint report was produced). Skips the write when the
 * lint report contains structural failures, leaving the prior state intact
 * so the next run does not silently adopt a broken commit as the baseline.
 */
export async function updateStateNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    return { current_phase: 'update_state' };
  }

  const structuralFailures = state.lint_report?.structural.length ?? 0;

  if (structuralFailures > 0) {
    process.stderr.write(
      `[wiki-refresh] WARNING: skipping .state.json update — ${structuralFailures} structural lint failure(s) present. Fix the violations and re-run /wiki-refresh.\n`,
    );
    return { current_phase: 'update_state' };
  }

  const headCommit = resolveHeadCommit(state.project_path);
  const newState = {
    last_indexed_commit: headCommit,
    last_ingest_at: new Date().toISOString(),
  };

  const stateFile: GeneratedPage = {
    filename: 'docs/llm-wiki/.state.json',
    content: JSON.stringify(newState, null, 2) + '\n',
  };

  return {
    generated_pages: [stateFile],
    current_phase: 'update_state',
  };
}

function resolveHeadCommit(projectPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
