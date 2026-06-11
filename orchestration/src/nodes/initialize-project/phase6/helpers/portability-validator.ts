/**
 * Walks `<project>/.claude/` and `<project>/.codex/` after generation and fails
 * the workflow run if any committed text file contains a non-portable absolute
 * filesystem path (e.g. `/Users/<name>/...` or `/home/<name>/...`).
 *
 * This is layer 4 of the portability guarantee from D6: even if a writer slips
 * past the type system + Zod refinement + PortableWriter assertion, the runtime
 * scan catches the leak before the run reports success.
 *
 * Scope carve-out — `settings.local.json` is never a hard violation. The
 * Claude/Codex CLI auto-writes machine-specific absolute paths into it; it is
 * per-developer and not meant to be committed. It is always skipped. If it
 * happens to be git-tracked *and* carries a non-portable path, the file is
 * reported (as `trackedLocalSettings`) so the caller can advise `git rm
 * --cached` — but it never fails the scan.
 *
 * Allowlists mirror PortablePathResolver: `/tmp/` is POSIX-standard, URLs are
 * machine-agnostic, and explicit example fences let docs reference paths
 * intentionally without tripping the validator.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';

import { NON_PORTABLE_ABSOLUTE_PATTERN } from '../../../../services/framework/portable-paths/patterns.js';
import { removeCodeGraphMcpTomlBlock } from '../../../../services/framework/codex-mcp-toml.js';
import { stripVolatileFrameworkConfigFile } from '../../../../services/framework/framework-config-normalizer.js';
import { logger } from '../../../../utils/logger.js';
import { getAllProviderConfigDirs } from '../../../../utils/provider-paths.js';

export { NON_PORTABLE_ABSOLUTE_PATTERN };

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const SKIP_DIRS = new Set(['node_modules', '.git']);

const EXAMPLE_FENCE_OPEN = '<!-- portable-example-start -->';
const EXAMPLE_FENCE_CLOSE = '<!-- portable-example-end -->';

export interface PortabilityViolation {
  file: string;
  line: number;
  content: string;
}

export interface PortabilityValidationResult {
  ok: boolean;
  violations: PortabilityViolation[];
  filesScanned: number;
  /**
   * Relative paths of `settings.local.json` files that are git-tracked AND
   * carry non-portable absolute paths. The Claude/Codex CLI auto-writes
   * machine-specific paths into this file, so it is never a hard violation —
   * but if it is tracked the developer is committing those paths, so the
   * caller surfaces an actionable `git rm --cached` warning. Never affects `ok`.
   */
  trackedLocalSettings: string[];
}

/**
 * Validate every committed text file under `<project>/.claude/` and
 * `<project>/.codex/` for non-portable absolute paths. Returns a structured
 * result; the caller decides how to report it.
 *
 * Before scanning, runs a housekeeping pass that strips known-stale fields
 * from any pre-existing `framework-config.json` files in the scanned dirs.
 * This handles the asymmetric-write problem: when the active provider doesn't
 * touch the other provider's tree, stale files from prior runs (which may
 * carry fields the current writer no longer emits) would otherwise trip the
 * validator forever.
 */
export function validatePortability(projectPath: string): PortabilityValidationResult {
  const violations: PortabilityViolation[] = [];
  const trackedLocalSettings = new Set<string>();
  let filesScanned = 0;

  for (const configDir of getAllProviderConfigDirs()) {
    const root = join(projectPath, configDir);
    if (!existsSync(root)) continue;
    stripStaleFrameworkConfigFields(root, projectPath);
    stripStaleCodexMcpServerBlock(root, projectPath);

    walkAndScan(
      root,
      projectPath,
      (file, line, content) => {
        violations.push({ file, line, content });
      },
      () => {
        filesScanned += 1;
      },
      (rel) => {
        trackedLocalSettings.add(rel);
      },
    );
  }

  return {
    ok: violations.length === 0,
    violations,
    filesScanned,
    trackedLocalSettings: Array.from(trackedLocalSettings).sort(),
  };
}

/**
 * True when `rel` (relative to `projectPath`) is git-tracked. Used to decide
 * whether a skipped `settings.local.json` warrants an actionable
 * `git rm --cached` warning. Returns `false` on any git error / non-repo.
 */
function isPathTracked(projectPath: string, rel: string): boolean {
  try {
    const out = execFileSync('git', ['-C', projectPath, 'ls-files', '--cached', '--', rel], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** True when any line (outside example fences) carries a non-portable path. */
function containsNonPortable(content: string): boolean {
  return stripExampleFences(content)
    .split('\n')
    .some((line) => NON_PORTABLE_ABSOLUTE_PATTERN.test(line));
}

/**
 * Surgical strip of known-stale fields from `framework-config.json` files
 * left behind by older versions of the framework. The current writer emits a
 * deterministic config, but pre-existing committed files still carry volatile
 * fields that churned on every run — the whole `project_metadata` block
 * (`project_path`, `initialization_hash`, `last_analysis`) and `last_sync`
 * timestamps (top-level `resource_state.last_sync` plus per-resource entries).
 * Stripping them here clears the noise on the next run even when only
 * `sync-framework-resources` ran (a full regen would overwrite the file
 * anyway).
 *
 * Surgical = preserve every other field (the entire `stack_profile`, the
 * `resource_state` entries minus their timestamps, etc.). Compare-then-write:
 * the file is rewritten only when a stale field was actually present, so the
 * pass is idempotent.
 */
function stripStaleFrameworkConfigFields(configDirRoot: string, projectPath: string): void {
  const filePath = join(configDirRoot, 'framework-config.json');
  if (stripVolatileFrameworkConfigFile(filePath)) {
    logger.info(
      `[portability] stripped stale volatile fields from ${relative(projectPath, filePath)}`,
    );
  }
}

/**
 * Surgical strip of the `[mcp_servers.code_graph]` block from
 * `<config>/config.toml` (Codex). The block carries absolute paths
 * (`/Users/...` or `/home/...`) that must NOT be committed: the next
 * `ensure-context.sh` run re-emits the block with the local machine's paths.
 *
 * Operates only on `.codex/config.toml` (Codex provider). Compare-then-write:
 * skips the rewrite when the block is absent, so this is idempotent.
 *
 * Surgical = the rest of `config.toml` (model selection, sandbox policy,
 * other `[mcp_servers.*]` blocks for unrelated servers, etc.) is preserved
 * byte-for-byte.
 */
function stripStaleCodexMcpServerBlock(configDirRoot: string, projectPath: string): void {
  const filePath = join(configDirRoot, 'config.toml');
  if (!existsSync(filePath)) return;

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const stripped = removeCodeGraphMcpTomlBlock(content);
  if (stripped === content) return;

  try {
    writeFileSync(filePath, stripped, 'utf-8');
    logger.info(
      `[portability] stripped stale [mcp_servers.code_graph] block from ${relative(projectPath, filePath)} ` +
        `(ensure-context.sh re-emits it locally with the developer's absolute paths)`,
    );
  } catch {}
}

function walkAndScan(
  dir: string,
  projectPath: string,
  onViolation: (file: string, line: number, content: string) => void,
  onFile: () => void,
  onTrackedLocalSettings: (rel: string) => void,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walkAndScan(full, projectPath, onViolation, onFile, onTrackedLocalSettings);
      continue;
    }
    if (!s.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) continue;

    // Normalize to POSIX separators so reported paths and the git pathspec
    // below are stable across platforms (`path.relative` yields `\` on Windows).
    const rel = relative(projectPath, full).split(sep).join('/');

    // `settings.local.json` is CLI-managed and machine-local by design (the
    // Claude/Codex CLI auto-writes absolute paths into it), so it is never a
    // hard violation. If it is git-tracked AND carries a non-portable path,
    // flag it so the caller can advise `git rm --cached`.
    if (basename(full) === 'settings.local.json') {
      if (isPathTracked(projectPath, rel)) {
        let local = '';
        try {
          local = readFileSync(full, 'utf-8');
        } catch {}
        if (containsNonPortable(local)) onTrackedLocalSettings(rel);
      }
      continue;
    }

    onFile();
    let content: string;
    try {
      content = readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    scanTextForViolations(stripExampleFences(content), (lineNum, lineText) => {
      onViolation(rel, lineNum, lineText.trim().slice(0, 200));
    });
  }
}

function scanTextForViolations(
  content: string,
  onMatch: (line: number, text: string) => void,
): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (NON_PORTABLE_ABSOLUTE_PATTERN.test(lines[i])) {
      onMatch(i + 1, lines[i]);
    }
  }
}

export function stripExampleFences(content: string): string {
  if (!content.includes(EXAMPLE_FENCE_OPEN)) return content;
  let result = '';
  let cursor = 0;
  while (cursor < content.length) {
    const open = content.indexOf(EXAMPLE_FENCE_OPEN, cursor);
    if (open === -1) {
      result += content.slice(cursor);
      break;
    }
    result += content.slice(cursor, open);
    const close = content.indexOf(EXAMPLE_FENCE_CLOSE, open);
    cursor = close === -1 ? content.length : close + EXAMPLE_FENCE_CLOSE.length;
  }
  return result;
}
