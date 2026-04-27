import { join } from 'path';
import { existsSync } from 'fs';
import { buildCodeGraph } from '../../services/graph-wiki/code-graph.service.js';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';

/**
 * Triggers an incremental code graph update via the existing buildCodeGraph()
 * service. The update-vs-build decision is already implemented in Phase C's
 * code-graph.service.ts — this node simply delegates to that service so the
 * wiki-refresh workflow picks up fresh graph state before regenerating pages.
 */
export async function codeGraphUpdateNode(
  state: WikiRefreshState,
): Promise<Partial<WikiRefreshState>> {
  const graphDbPath = join(state.project_path, '.code-graph.db');

  if (!existsSync(graphDbPath) && !state.force) {
    return {
      current_phase: 'code_graph_update',
      errors: [
        `code_graph_update: .code-graph.db not found at ${graphDbPath}. Run /initialize-project first or pass --force to skip.`,
      ],
    };
  }

  try {
    await buildCodeGraph({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
    });

    return {
      current_phase: 'code_graph_update',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      current_phase: 'code_graph_update',
      errors: [`code_graph_update: ${message}`],
    };
  }
}
