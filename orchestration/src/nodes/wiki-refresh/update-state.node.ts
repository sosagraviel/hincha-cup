import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WikiRefreshState, GeneratedPage } from '../../state/schemas/wiki-refresh.schema.js';

/**
 * Writes an updated .state.json to docs/llm-wiki/ only when structural lint
 * checks pass (or no lint report was produced). Skips the write when the
 * lint report contains structural failures, leaving the prior state intact
 * so the next run does not silently adopt a broken commit as the baseline.
 *
 * Preserves the non-incremental fields written by Phase 4 of
 * `/initialize-project` (`graph_commit`, `graph_sha`, `pipeline_version`,
 * `graph_stats`). Pre-Wave 1.6 this node rewrote `.state.json` with only
 * `last_indexed_commit` + `last_ingest_at`, silently dropping every
 * other field on the first refresh after init. The merge here keeps
 * the durable preflight metadata intact across refresh cycles.
 *
 * Stack-agnostic: every preserved field is shape-only.
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
  const existing = loadExistingState(state.project_path);
  const merged: Record<string, unknown> = {
    ...existing,
    last_indexed_commit: headCommit,
    last_ingest_at: new Date().toISOString(),
  };

  const stateFile: GeneratedPage = {
    filename: 'docs/llm-wiki/.state.json',
    content: JSON.stringify(merged, null, 2) + '\n',
  };

  return {
    generated_pages: [stateFile],
    current_phase: 'update_state',
  };
}

function loadExistingState(projectPath: string): Record<string, unknown> {
  const statePath = join(projectPath, 'docs', 'llm-wiki', '.state.json');
  if (!existsSync(statePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveHeadCommit(projectPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
