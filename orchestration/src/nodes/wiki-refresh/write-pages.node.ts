import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';

/**
 * Persists all generated_pages to disk. This node is the single point where
 * files are written, which makes dry-run safe: all upstream nodes produce
 * content in state without touching the filesystem; this node writes only
 * when dry_run is false.
 */
export async function writePagesNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    return { current_phase: 'write_pages' };
  }

  const errors: string[] = [];

  for (const page of state.generated_pages) {
    const absolutePath = join(state.project_path, page.filename);
    try {
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, page.content, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`write_pages: failed to write ${page.filename}: ${message}`);
    }
  }

  return {
    current_phase: 'write_pages',
    errors,
  };
}
