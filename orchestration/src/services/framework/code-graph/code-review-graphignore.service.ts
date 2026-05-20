/**
 * Sync the user-supplied `--ignore` paths into the project's
 * `.code-review-graphignore` file via a framework-managed block.
 *
 * The upstream `code-review-graph build --repo <project>` reads
 * `.code-review-graphignore` from the project root to decide which paths to
 * skip during indexing. By default the framework seeds a small set of
 * universal entries (`node_modules`, `.git`, `dist`, etc.); the
 * `--ignore` flag adds user-specific extras.
 *
 * The managed block is bracketed by sentinel comments so a user's own
 * additions to `.code-review-graphignore` are preserved across runs.
 *
 *   # === framework: --ignore (managed; do not edit by hand) ===
 *   path1
 *   path2
 *   # === end framework: --ignore ===
 *
 * Stack-agnostic: the file's contents are project-relative paths; no
 * language / framework knowledge is encoded here.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const CODE_REVIEW_GRAPHIGNORE_FILENAME = '.code-review-graphignore';

const MANAGED_BLOCK_START = '# === framework: --ignore (managed; do not edit by hand) ===';
const MANAGED_BLOCK_END = '# === end framework: --ignore ===';

export interface SyncResult {
  /** True when the file's managed-block contents changed (or the file was newly written). */
  changed: boolean;
  /**
   * Sha-256 hash of the canonical managed-block content (after trimming and
   * sorting). Caller persists this alongside `.code-review-graph/.state.json`
   * so `decideGraphTier` can detect drift across runs.
   */
  hash: string;
}

/**
 * Compute the deterministic hash of a list of extra ignore paths. Trims +
 * sorts so order-of-arguments doesn't churn the hash.
 */
export function hashExtraIgnorePaths(paths: ReadonlyArray<string>): string {
  const normalised = paths
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .sort();
  return createHash('sha256').update(normalised.join('\n')).digest('hex');
}

/**
 * Read the current managed block from a `.code-review-graphignore` body.
 * Returns the contained paths (one per line, trimmed). Returns `null` when
 * the sentinels are absent.
 */
export function extractManagedBlock(body: string): string[] | null {
  const startIdx = body.indexOf(MANAGED_BLOCK_START);
  if (startIdx === -1) return null;
  const afterStart = body.slice(startIdx + MANAGED_BLOCK_START.length);
  const endRelIdx = afterStart.indexOf(MANAGED_BLOCK_END);
  if (endRelIdx === -1) return null;
  const inner = afterStart.slice(0, endRelIdx);
  return inner
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Splice the framework-managed block into the body. Preserves all other
 * content; replaces only the bracketed region. Appends the block at the end
 * when the sentinels are absent.
 */
export function spliceManagedBlock(body: string, paths: ReadonlyArray<string>): string {
  const trimmedPaths = Array.from(new Set(paths.map((p) => p.trim()).filter((p) => p.length > 0)));
  const blockLines = [MANAGED_BLOCK_START, ...trimmedPaths, MANAGED_BLOCK_END];
  const blockText = blockLines.join('\n');

  const startIdx = body.indexOf(MANAGED_BLOCK_START);
  if (startIdx !== -1) {
    const afterStart = body.slice(startIdx + MANAGED_BLOCK_START.length);
    const endRelIdx = afterStart.indexOf(MANAGED_BLOCK_END);
    if (endRelIdx !== -1) {
      const before = body.slice(0, startIdx);
      const after = body.slice(
        startIdx + MANAGED_BLOCK_START.length + endRelIdx + MANAGED_BLOCK_END.length,
      );
      return `${before}${blockText}${after}`;
    }
  }

  // Append at end with a separating newline (if needed).
  const sep = body.length === 0 || body.endsWith('\n') ? '' : '\n';
  return `${body}${sep}${blockText}\n`;
}

/**
 * Read `.code-review-graphignore` from `projectPath` (returns empty when the
 * file is absent), splice the managed block, write back if changed. The
 * caller passes the user-supplied `--ignore` paths and the template body
 * the framework seeds into a fresh project (typically read once at
 * `templates/code-review-graphignore`).
 *
 * When the file is absent AND the user passes no `--ignore` paths, the
 * function does nothing — leave seeding to the existing bash bootstrap.
 */
export function syncCodeReviewGraphIgnore(
  projectPath: string,
  extraIgnorePaths: ReadonlyArray<string>,
  options: { templateBody?: string } = {},
): SyncResult {
  const targetPath = join(projectPath, CODE_REVIEW_GRAPHIGNORE_FILENAME);
  const fileExists = existsSync(targetPath);

  if (!fileExists && extraIgnorePaths.length === 0) {
    return { changed: false, hash: hashExtraIgnorePaths([]) };
  }

  let currentBody = '';
  if (fileExists) {
    try {
      currentBody = readFileSync(targetPath, 'utf-8');
    } catch {
      currentBody = '';
    }
  } else if (options.templateBody) {
    currentBody = options.templateBody.endsWith('\n')
      ? options.templateBody
      : `${options.templateBody}\n`;
  }

  const nextBody = spliceManagedBlock(currentBody, extraIgnorePaths);
  const hash = hashExtraIgnorePaths(extraIgnorePaths);

  if (nextBody === currentBody) {
    return { changed: false, hash };
  }

  writeFileSync(targetPath, nextBody, 'utf-8');
  return { changed: true, hash };
}
