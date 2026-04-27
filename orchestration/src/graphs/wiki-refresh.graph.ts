import { StateGraph, END, START } from '@langchain/langgraph';
import { WikiRefreshAnnotation } from '../state/schemas/wiki-refresh.schema.js';
import type { WikiRefreshState } from '../state/schemas/wiki-refresh.schema.js';

import { readStateNode } from '../nodes/wiki-refresh/read-state.node.js';
import { computeDiffNode } from '../nodes/wiki-refresh/compute-diff.node.js';
import { codeGraphUpdateNode } from '../nodes/wiki-refresh/code-graph-update.node.js';
import { computeRefreshSetNode } from '../nodes/wiki-refresh/compute-refresh-set.node.js';
import { refreshPagesNode } from '../nodes/wiki-refresh/refresh-pages.node.js';
import { writeChangelogNode } from '../nodes/wiki-refresh/write-changelog.node.js';
import { writeLogNode } from '../nodes/wiki-refresh/write-log.node.js';
import { runLintNode } from '../nodes/wiki-refresh/run-lint.node.js';
import { updateStateNode } from '../nodes/wiki-refresh/update-state.node.js';
import { writePagesNode } from '../nodes/wiki-refresh/write-pages.node.js';

/**
 * Routes after compute_diff. When no changes were detected and --force was
 * not set, skip all regeneration and go directly to END.
 */
export function routeAfterComputeDiff(state: WikiRefreshState): string {
  if (state.current_phase === 'no_changes') {
    return END;
  }
  return 'code_graph_update';
}

/**
 * Routes after run_lint. When structural failures are present, skip
 * update_state so .state.json is not advanced to a broken commit.
 */
export function routeAfterRunLint(state: WikiRefreshState): string {
  const structuralFailures = state.lint_report?.structural.length ?? 0;
  if (structuralFailures > 0) {
    return END;
  }
  return 'update_state';
}

/**
 * Wiki-Refresh LangGraph workflow.
 *
 * Linear pipeline:
 *   read_state → compute_diff → [skip on no_changes] → code_graph_update →
 *   compute_refresh_set → refresh_pages → write_changelog → write_log →
 *   run_lint → [skip update_state on structural failures] → update_state →
 *   write_pages → END
 *
 * All file writes (wiki pages, CHANGELOG.md, log.md, .state.json) are
 * collected as generated_pages in state and persisted in a single write_pages
 * node at the end. This keeps all upstream nodes side-effect-free and makes
 * dry-run completely safe.
 */
export const wikiRefreshGraph = new StateGraph(WikiRefreshAnnotation)
  .addNode('read_state', readStateNode)
  .addNode('compute_diff', computeDiffNode)
  .addNode('code_graph_update', codeGraphUpdateNode)
  .addNode('compute_refresh_set', computeRefreshSetNode)
  .addNode('refresh_pages', refreshPagesNode)
  .addNode('write_changelog', writeChangelogNode)
  .addNode('write_log', writeLogNode)
  .addNode('run_lint', runLintNode)
  .addNode('update_state', updateStateNode)
  .addNode('write_pages', writePagesNode)
  // Entry point
  .addEdge(START, 'read_state')
  // Linear through read_state → compute_diff
  .addEdge('read_state', 'compute_diff')
  // Conditional: skip regeneration when nothing changed
  .addConditionalEdges('compute_diff', routeAfterComputeDiff, {
    code_graph_update: 'code_graph_update',
    [END]: END,
  })
  // Regeneration pipeline
  .addEdge('code_graph_update', 'compute_refresh_set')
  .addEdge('compute_refresh_set', 'refresh_pages')
  .addEdge('refresh_pages', 'write_changelog')
  .addEdge('write_changelog', 'write_log')
  .addEdge('write_log', 'run_lint')
  // Conditional: skip update_state on structural lint failures
  .addConditionalEdges('run_lint', routeAfterRunLint, {
    update_state: 'update_state',
    [END]: 'write_pages',
  })
  .addEdge('update_state', 'write_pages')
  .addEdge('write_pages', END);

/**
 * Creates a compiled wiki-refresh workflow with the given checkpointer.
 * Pass MemorySaver for development and a persistent SQLite checkpointer for
 * production (matching the pattern used by createInitializeProjectGraph).
 */
export async function createWikiRefreshGraph(checkpointer: unknown) {
  return wikiRefreshGraph.compile({ checkpointer } as Parameters<
    typeof wikiRefreshGraph.compile
  >[0]);
}
