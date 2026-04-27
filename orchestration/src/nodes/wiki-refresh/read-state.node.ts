import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';

interface WikiStateJson {
  last_indexed_commit?: string;
  last_ingest_at?: string;
  graph_commit?: string;
  graph_sha?: string;
  pipeline_version?: string;
}

/**
 * Reads docs/llm-wiki/.state.json and sets since_commit to last_indexed_commit
 * so downstream nodes can compute an incremental diff. When --force is set or
 * the state file is absent, since_commit is left undefined, signalling the
 * full-regenerate path.
 */
export async function readStateNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  const statePath = join(state.project_path, 'docs', 'llm-wiki', '.state.json');

  if (state.force || !existsSync(statePath)) {
    return {
      since_commit: undefined,
      current_phase: 'read_state',
    };
  }

  try {
    const raw = readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as WikiStateJson;
    const lastIndexedCommit = parsed.last_indexed_commit;

    if (!lastIndexedCommit || lastIndexedCommit === 'unknown') {
      return {
        since_commit: undefined,
        current_phase: 'read_state',
      };
    }

    return {
      since_commit: lastIndexedCommit,
      current_phase: 'read_state',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      since_commit: undefined,
      current_phase: 'read_state',
      errors: [`read_state: failed to parse .state.json: ${message}`],
    };
  }
}
