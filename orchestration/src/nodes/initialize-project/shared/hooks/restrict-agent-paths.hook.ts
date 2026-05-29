#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook: hard-enforce path restrictions.
 *
 * WHY A HOOK, NOT A PROMPT:
 *   The prompt-level <excluded_directories> block is instruction-following,
 *   not enforcement. A single `Glob **\/*.ts` from repo root walks through
 *   node_modules, the framework, .claude-temp, etc. This hook runs BEFORE
 *   every tool call and rejects the call outright if the target path is
 *   outside the project or inside a known-excluded dir.
 *
 * SECURITY POSTURE — FAIL CLOSED:
 *   When FRAMEWORK_ENFORCE=1 is set (our spawn path does this), any internal
 *   error in this hook blocks the tool call. We never silently let a tool
 *   call through because the hook crashed — that defeats the point.
 *
 *   When FRAMEWORK_ENFORCE is unset (ad-hoc `claude` invocations outside our
 *   spawn), the hook is a silent no-op so it doesn't break developer flow.
 *
 * WHY NOT REWRITE COMMANDS?
 *   Claude's Glob/Grep have no exclude parameter, so rewriting Glob/Grep
 *   calls is impossible. Bash rewriting is fragile (arbitrary shell,
 *   subshells, pipes, command substitution). And `hookSpecificOutput.
 *   updatedInput` support is uneven across Claude CLI versions — a rewrite
 *   that isn't honored means the original unsafe command runs. Blocking is
 *   strictly safer and teaches the agent; rewriting hides errors. We emit
 *   ready-to-paste corrected commands in the block message instead.
 *
 * PROTOCOL (Claude Code PreToolUse):
 *   stdin:  { session_id, transcript_path, cwd, hook_event_name,
 *             tool_name, tool_input }
 *   exit 0 + no output → allow unchanged
 *   exit 2 + stderr    → block, feedback visible to the agent
 *
 * ENV CONTRACT (read from process.env):
 *   FRAMEWORK_ENFORCE         — "1" to enable enforcement (required in prod)
 *   FRAMEWORK_PROJECT_PATH    — absolute path to the project being analyzed
 *   FRAMEWORK_PATH            — absolute path to the framework checkout
 *   FRAMEWORK_EXCLUDED_DIRS   — JSON array of dir names to forbid at any depth
 *   FRAMEWORK_ALLOW_READ_PATHS — JSON array of absolute file paths that are
 *                                allowed regardless of the excluded-dir check
 *                                (e.g. `.claude-temp/initialize-project/project-inspection.json`).
 *                                Empty / absent → no exemptions.
 */

import path from 'path';
import process from 'process';
import { isPathExcluded } from '../../../../utils/shared/prompt-loader.js';

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Tools whose `path`-ish arguments we inspect. */
const PATH_TOOLS: Record<string, ReadonlyArray<string>> = {
  Glob: ['path'],
  Grep: ['path'],
  Read: ['file_path'],
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  LS: ['path'],
  NotebookEdit: ['notebook_path'],
};

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk.toString());
  }
  return chunks.join('');
}

function allow(): never {
  process.exit(0);
}

/**
 * Block the tool call. Exit code 2 + stderr is Claude Code's "blocked"
 * signal; the agent sees the message and can choose a different action.
 */
function block(reason: string): never {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

function isInside(abs: string, root: string): boolean {
  const rel = path.relative(root, abs);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Return the excluded-list entry that matches `abs`, or null. Single-segment
 * entries match wherever they appear as a path component in `abs` (any-depth
 * semantics, applied without needing `projectPath`). Multi-segment entries
 * like `orchestration/test/integration/initialize-project` are
 * project-root-anchored — we convert `abs` to a project-relative path before
 * comparison so the prefix match is meaningful.
 */
function findExcludedMatch(abs: string, projectPath: string, excluded: string[]): string | null {
  const segments = abs.split(path.sep);
  for (const entry of excluded) {
    if (!entry || entry.includes('/') || entry.includes('\\')) continue;
    if (segments.includes(entry)) return entry;
  }
  if (isInside(abs, projectPath)) {
    const rel = path.relative(projectPath, abs);
    for (const entry of excluded) {
      if (!entry || !(entry.includes('/') || entry.includes('\\'))) continue;
      if (isPathExcluded(rel, [entry])) return entry;
    }
  }
  return null;
}

/**
 * Emit a ready-to-paste Bash filter for the given excluded dirs, suitable
 * for `find`'s `-prune` idiom:
 *   \( -path './node_modules' -o -path './dist' -o ... \) -prune -o
 */
function findPruneFragment(excluded: string[]): string {
  const parts = excluded.map((d) => `-path './${d}'`).join(' -o ');
  return `\\( ${parts} \\) -prune -o`;
}

/**
 * Build the recommended grep/rg exclusion flags:
 *   --exclude-dir=node_modules --exclude-dir=.claude-temp ...
 */
function grepExcludeFlags(excluded: string[]): string {
  return excluded.map((d) => `--exclude-dir='${d}'`).join(' ');
}

/**
 * Enumerator commands that scan from project root by default. We flag these
 * whenever the agent runs them without proper dir exclusions.
 */
interface EnumeratorRule {
  name: string;
  /** Match the first token of the command (after any env/space prefix). */
  match: RegExp;
  /** Does the command already filter out excluded dirs? */
  alreadyFiltered: (cmd: string, excluded: string[]) => boolean;
  /** Root-scope detector: is this command scanning from project root? */
  scansFromRoot: (cmd: string, projectPath: string) => boolean;
  /** Produce a ready-to-paste corrected command example. */
  suggest: (cmd: string, excluded: string[]) => string;
}

const ENUMERATOR_RULES: EnumeratorRule[] = [
  {
    name: 'find',
    match: /^find(\s|$)/,
    alreadyFiltered: (cmd, excluded) => {
      return excluded.some((d) =>
        new RegExp(String.raw`-(prune|path)[\s=]+['"]?[^\s]*${escapeRe(d)}\b`, 'i').test(cmd),
      );
    },
    scansFromRoot: (cmd, projectPath) => {
      if (/^find\s+(\.|\.\/)(\s|$)/.test(cmd)) return true;
      const absMatch = cmd.match(/^find\s+('?)([^\s'"]+)/);
      if (absMatch) {
        const arg = absMatch[2];
        if (path.isAbsolute(arg)) return arg === projectPath || arg === projectPath + path.sep;
        return false;
      }
      if (/^find\s+-/.test(cmd)) return true;
      return false;
    },
    suggest: (cmd, excluded) => {
      const prune = findPruneFragment(excluded);
      const stripped = cmd.replace(/^find\s+(\.|\.\/)?\s*/, 'find . ');
      return stripped.replace(/^find\s+\.\s+/, `find . ${prune} `);
    },
  },
  {
    name: 'grep',
    match: /^grep\s+(-[A-Za-z]*[rR][A-Za-z]*|--recursive)\b/,
    alreadyFiltered: (cmd, excluded) => {
      return excluded.some((d) =>
        new RegExp(String.raw`--exclude-dir[=\s]+['"]?${escapeRe(d)}\b`, 'i').test(cmd),
      );
    },
    scansFromRoot: () => true,
    suggest: (cmd, excluded) => {
      const flags = grepExcludeFlags(excluded);
      return cmd.replace(/^grep\s+/, `grep ${flags} `);
    },
  },
  {
    name: 'rg',
    match: /^rg(\s|$)/,
    alreadyFiltered: (cmd, excluded) => {
      if (!/\s(-u+|--no-ignore(-dir|-files|-global|-parent|-vcs)?)\b/.test(cmd)) return true;
      return excluded.some((d) =>
        new RegExp(String.raw`--glob\s+['"]?!${escapeRe(d)}\b`, 'i').test(cmd),
      );
    },
    scansFromRoot: () => true,
    suggest: (_cmd, excluded) => {
      const globs = excluded.map((d) => `--glob '!${d}'`).join(' ');
      return `rg ${globs} <pattern>`;
    },
  },
  {
    name: 'ls-recursive',
    match: /^ls\s+.*-[A-Za-z]*R[A-Za-z]*/,
    alreadyFiltered: () => false,
    scansFromRoot: (cmd) => /^ls\s+.*(\s\.|$|\s\.\/)/.test(cmd) || /^ls\s+-[A-Za-z]+\s*$/.test(cmd),
    suggest: () =>
      `Use Glob with a narrowed path (e.g. 'src/**/*.ts') or Grep with a path and glob filter`,
  },
  {
    name: 'tree',
    match: /^tree(\s|$)/,
    alreadyFiltered: (cmd) => /-I\s+\S/.test(cmd),
    scansFromRoot: () => true,
    suggest: (_cmd, excluded) => `tree -I '${excluded.join('|')}'`,
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort Bash scan. Catches three classes of problem:
 *  1. Absolute paths escaping the project, or entering excluded dirs.
 *  2. Unscoped enumerator commands (find/grep -r/rg/ls -R/tree) without
 *     exclusion flags.
 *  3. Excluded dir names used as bare path tokens.
 */
function scanBashCommand(
  command: string,
  excluded: string[],
  projectPath: string,
): { reason: string; suggestion?: string } | null {
  const normalized = command.trim();

  const absRe = /(?:^|[\s'"`|;&<>()=])(\/[^\s'"`|;&<>()]+)/g;
  let match: RegExpExecArray | null;
  while ((match = absRe.exec(normalized)) !== null) {
    const abs = match[1];
    if (!path.isAbsolute(abs)) continue;
    if (abs.startsWith('/bin/') || abs.startsWith('/usr/') || abs.startsWith('/etc/')) continue;
    if (!isInside(abs, projectPath)) {
      return { reason: `absolute path '${abs}' escapes the project (${projectPath})` };
    }
    const excludedMatch = findExcludedMatch(abs, projectPath, excluded);
    if (excludedMatch) {
      return { reason: `path '${abs}' contains excluded dir '${excludedMatch}'` };
    }
  }

  let matchedEnumerator = false;
  for (const rule of ENUMERATOR_RULES) {
    if (!rule.match.test(normalized)) continue;
    matchedEnumerator = true;
    if (!rule.scansFromRoot(normalized, projectPath)) continue;
    if (rule.alreadyFiltered(normalized, excluded)) continue;
    return {
      reason: `'${rule.name}' would scan excluded directories (no exclusion flags present)`,
      suggestion: rule.suggest(normalized, excluded),
    };
  }
  if (matchedEnumerator) return null;

  for (const dir of excluded) {
    const escaped = escapeRe(dir);
    const re = new RegExp(
      String.raw`(?:^|[\s'"|/&;(])` + escaped + String.raw`(?:$|[\s'"|/&;)])`,
      'i',
    );
    if (re.test(normalized)) {
      return { reason: `command references excluded dir '${dir}'` };
    }
  }

  return null;
}

function validateGlobPattern(input: Record<string, unknown>, excluded: string[]): string | null {
  const pattern = (input.pattern as string | undefined) ?? '';
  if (!pattern) return null;
  const segments = pattern.split(/[\/\\]/);
  for (const dir of excluded) {
    if (!dir) continue;
    if (dir.includes('/') || dir.includes('\\')) {
      const normalisedPattern = pattern.replace(/\\/g, '/').replace(/^\.\/+/, '');
      const normalisedDir = dir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
      if (
        normalisedPattern === normalisedDir ||
        normalisedPattern.startsWith(normalisedDir + '/')
      ) {
        return `glob pattern enters excluded dir '${dir}'`;
      }
    } else if (segments.some((seg) => seg === dir)) {
      return `glob pattern enters excluded dir '${dir}'`;
    }
  }
  return null;
}

interface Config {
  enforce: boolean;
  projectPath: string;
  frameworkPath?: string;
  excluded: string[];
  allowReadPaths: Set<string>;
}

function readConfig(): Config | null {
  const enforce = process.env.FRAMEWORK_ENFORCE === '1';
  const projectPath = process.env.FRAMEWORK_PROJECT_PATH;
  const frameworkPath = process.env.FRAMEWORK_PATH;
  const excludedRaw = process.env.FRAMEWORK_EXCLUDED_DIRS;
  const allowReadRaw = process.env.FRAMEWORK_ALLOW_READ_PATHS;

  if (!enforce) return null;
  if (!projectPath || !excludedRaw) return null;

  let excluded: string[];
  try {
    const parsed = JSON.parse(excludedRaw);
    excluded = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    excluded = [];
  }

  const allowReadPaths = new Set<string>();
  if (allowReadRaw) {
    try {
      const parsed = JSON.parse(allowReadRaw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string' && entry.length > 0) {
            allowReadPaths.add(path.resolve(entry));
          }
        }
      }
    } catch {
      // Malformed allow list silently ignored — fail closed to deny.
    }
  }

  return { enforce, projectPath, frameworkPath, excluded, allowReadPaths };
}

async function main(): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return allow();

  let raw: string;
  try {
    raw = await readStdin();
  } catch (err) {
    return block(
      `❌ PATH EXCLUSION: hook internal error reading stdin — failing closed.\n` +
        `  ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return block(
      `❌ PATH EXCLUSION: hook received unparseable stdin — failing closed.\n` +
        `  bytes=${raw.length}`,
    );
  }

  const toolName = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};
  const baseCwd = input.cwd || cfg.projectPath;

  if (toolName === 'Bash') {
    const cmd = (toolInput.command as string | undefined) ?? '';
    const hit = scanBashCommand(cmd, cfg.excluded, cfg.projectPath);
    if (hit) {
      return block(
        [
          `❌ PATH EXCLUSION: Bash command blocked.`,
          `  Reason:   ${hit.reason}`,
          `  Command:  ${cmd}`,
          hit.suggestion ? `  Suggested: ${hit.suggestion}` : '',
          ``,
          `Excluded at any depth: ${cfg.excluded.join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    return allow();
  }

  if (toolName === 'Glob') {
    const reason = validateGlobPattern(toolInput, cfg.excluded);
    if (reason) {
      return block(
        [
          `❌ PATH EXCLUSION: Glob blocked.`,
          `  Reason:  ${reason}`,
          `  Pattern: ${String(toolInput.pattern ?? '')}`,
          ``,
          `Narrow the pattern to specific subdirectories (e.g.`,
          `  "services/**/*.ts" instead of "**/*.ts"). Never include`,
          `  any of these segments: ${cfg.excluded.join(', ')}`,
        ].join('\n'),
      );
    }
  }

  const argNames = PATH_TOOLS[toolName];
  if (!argNames) return allow();

  for (const argName of argNames) {
    const rawPath = toolInput[argName];
    if (typeof rawPath !== 'string' || rawPath === '') continue;
    const abs = path.resolve(baseCwd, rawPath);

    if (cfg.allowReadPaths.has(abs) && (toolName === 'Read' || toolName === 'NotebookEdit')) {
      continue;
    }

    if (!isInside(abs, cfg.projectPath)) {
      const frameworkMsg =
        cfg.frameworkPath && isInside(abs, cfg.frameworkPath)
          ? ` (this is the framework checkout; agents must only read the target project)`
          : '';
      return block(
        [
          `❌ PATH EXCLUSION: ${toolName} blocked — path is outside the project.`,
          `  Tool arg: ${argName}=${rawPath}`,
          `  Resolved: ${abs}${frameworkMsg}`,
          `  Project:  ${cfg.projectPath}`,
          ``,
          `Pick a path under the project root.`,
        ].join('\n'),
      );
    }

    const match = findExcludedMatch(abs, cfg.projectPath, cfg.excluded);
    if (match) {
      return block(
        [
          `❌ PATH EXCLUSION: ${toolName} blocked — path enters excluded dir '${match}'.`,
          `  Tool arg: ${argName}=${rawPath}`,
          `  Resolved: ${abs}`,
          ``,
          `Excluded dirs (any depth):`,
          `  ${cfg.excluded.join(', ')}`,
        ].join('\n'),
      );
    }
  }

  return allow();
}

main().catch((err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`❌ PATH EXCLUSION: hook internal error — failing closed.\n${msg}\n`);
  process.exit(2);
});
