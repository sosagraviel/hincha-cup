/**
 * Walks `<project>/.claude/` and `<project>/.codex/` after generation and fails
 * the workflow run if any committed text file contains a non-portable absolute
 * filesystem path (e.g. `/Users/<name>/...` or `/home/<name>/...`).
 *
 * This is layer 4 of the portability guarantee from D6: even if a writer slips
 * past the type system + Zod refinement + PortableWriter assertion, the runtime
 * scan catches the leak before the run reports success.
 *
 * Allowlists mirror PortablePathResolver: `/tmp/` is POSIX-standard, URLs are
 * machine-agnostic, and explicit example fences let docs reference paths
 * intentionally without tripping the validator.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { extname, join, relative } from 'path';

import { removeCodeGraphMcpTomlBlock } from '../../../../services/framework/codex-mcp-toml.js';
import { logger } from '../../../../utils/logger.js';
import { getAllProviderConfigDirs } from '../../../../utils/provider-paths.js';

/**
 * Regex used by both the runtime portability validator and the framework
 * skill-portability CI guard. Exported so the two stay in lockstep.
 */
export const NON_PORTABLE_ABSOLUTE_PATTERN =
  /(?<![A-Za-z])\/(?:Users|home)\/[a-zA-Z][a-zA-Z0-9_.-]*\//;

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
    );
  }

  return {
    ok: violations.length === 0,
    violations,
    filesScanned,
  };
}

/**
 * Surgical strip of known-stale fields from `framework-config.json` files
 * left behind by older versions of the framework. Today the only such field
 * is `project_metadata.project_path` — the current writer never emits it,
 * but pre-existing files (e.g. an older `--provider codex` run) still
 * carry it and would otherwise fail the portability scan.
 *
 * Surgical = preserve every other field (`initialization_hash`,
 * `last_analysis`, the entire `stack_profile`, etc.). We only touch the one
 * field whose presence we already disabled in the writer.
 */
function stripStaleFrameworkConfigFields(configDirRoot: string, projectPath: string): void {
  const filePath = join(configDirRoot, 'framework-config.json');
  if (!existsSync(filePath)) return;

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isObject(parsed)) return;

  const meta = (parsed as Record<string, unknown>).project_metadata;
  if (!isObject(meta)) return;

  if (!Object.prototype.hasOwnProperty.call(meta, 'project_path')) return;

  delete (meta as Record<string, unknown>).project_path;
  try {
    writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    logger.info(
      `[portability] stripped stale project_path field from ${relative(projectPath, filePath)}`,
    );
  } catch {
    // Best-effort: if the rewrite fails, the scanner will still report the
    // violation and the developer can fix it manually.
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
  } catch {
    // Best-effort: scanner will catch the leak if the rewrite fails.
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walkAndScan(
  dir: string,
  projectPath: string,
  onViolation: (file: string, line: number, content: string) => void,
  onFile: () => void,
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
      walkAndScan(full, projectPath, onViolation, onFile);
      continue;
    }
    if (!s.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) continue;

    onFile();
    let content: string;
    try {
      content = readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    scanTextForViolations(stripExampleFences(content), (lineNum, lineText) => {
      onViolation(relative(projectPath, full), lineNum, lineText.trim().slice(0, 200));
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
