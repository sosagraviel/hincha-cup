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
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative } from 'path';

import { getAllProviderConfigDirs } from '../../../../utils/provider-paths.js';

const NON_PORTABLE_ABSOLUTE_PATTERN = /(?<![A-Za-z])\/(?:Users|home)\/[a-zA-Z][a-zA-Z0-9_.-]*\//;

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
 */
export function validatePortability(projectPath: string): PortabilityValidationResult {
  const violations: PortabilityViolation[] = [];
  let filesScanned = 0;

  for (const configDir of getAllProviderConfigDirs()) {
    const root = join(projectPath, configDir);
    if (!existsSync(root)) continue;
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

function stripExampleFences(content: string): string {
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
