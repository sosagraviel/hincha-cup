import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';

/**
 * Appends one structured entry to docs/llm-wiki/log.md. Maintains append-only
 * semantics — never overwrites existing entries. The entry records the
 * commit range, changed file count, refreshed pages, and lint status.
 */
export async function writeLogNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    return { current_phase: 'write_log' };
  }

  const logPath = join(state.project_path, 'docs', 'llm-wiki', 'log.md');
  const toCommit = resolveHeadCommit(state.project_path);

  const refreshedPages = state.generated_pages
    .map((p) => p.filename)
    .filter((f) => f !== 'docs/llm-wiki/CHANGELOG.md' && f !== 'docs/llm-wiki/log.md');

  const lintOk = !state.lint_report || state.lint_report.structural.length === 0;

  const entry = {
    ts: new Date().toISOString(),
    type: 'refresh',
    since_commit: state.since_commit ?? null,
    to_commit: toCommit,
    changed_files_count: state.changed_files.length,
    refreshed_pages: refreshedPages,
    lint_ok: lintOk,
  };

  const existingLog = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  const newEntry = JSON.stringify(entry) + '\n';
  const updatedLog = existingLog + newEntry;

  return {
    generated_pages: [
      {
        filename: 'docs/llm-wiki/log.md',
        content: updatedLog,
      },
    ],
    current_phase: 'write_log',
  };
}

function resolveHeadCommit(projectPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
