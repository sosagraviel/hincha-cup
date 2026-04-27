import { execSync } from 'child_process';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';

const GIT_TIMEOUT_MS = 30000;

/**
 * Computes the set of changed files relative to since_commit. When
 * since_commit is undefined (full-regenerate path) or --force is set, uses
 * git ls-files to return the entire tracked tree. Sets current_phase to
 * 'no_changes' when the diff is empty and --force was not requested, so
 * downstream nodes can short-circuit.
 */
export async function computeDiffNode(state: WikiRefreshState): Promise<Partial<WikiRefreshState>> {
  try {
    let changedFiles: string[];

    if (!state.since_commit || state.force) {
      changedFiles = listAllFiles(state.project_path);
    } else {
      changedFiles = computeGitDiff(state.project_path, state.since_commit);
    }

    if (changedFiles.length === 0 && !state.force) {
      return {
        changed_files: [],
        current_phase: 'no_changes',
      };
    }

    return {
      changed_files: changedFiles,
      current_phase: 'compute_diff',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      changed_files: [],
      current_phase: 'compute_diff',
      errors: [`compute_diff: ${message}`],
    };
  }
}

function computeGitDiff(projectPath: string, sinceCommit: string): string[] {
  try {
    const output = execSync(`git -C "${projectPath}" diff ${sinceCommit}..HEAD --name-only`, {
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return listAllFiles(projectPath);
  }
}

function listAllFiles(projectPath: string): string[] {
  try {
    const output = execSync(`git -C "${projectPath}" ls-files`, {
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ls-files failed: ${message}`);
  }
}
