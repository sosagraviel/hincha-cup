/**
 * Single source of truth for translating the framework's excluded-directories
 * list into Claude Code `permissions.deny` rules — plus the per-agent
 * `permissions.allow` punch-throughs that grant access to specific files
 * inside otherwise-excluded directories.
 *
 * Rule format: `Read(<gitignore-pattern>)`. The Read prefix applies
 * "best-effort" to all built-in file-reading tools (Read, Glob, Grep) per
 * the official permissions docs (https://code.claude.com/docs/en/permissions).
 *
 * Stack-agnostic: only directory NAMES (no language-specific extensions, no
 * framework-specific path roots).
 */
import { join } from 'path';
import { getExcludedDirectories } from '../../../utils/shared/prompt-loader.js';
import { getAllProviderTempDirs } from '../../../utils/provider-paths.js';

/**
 * Build the canonical list of `Read(...)` deny rules for a project.
 *
 * For each directory in `excludedDirsOverride ??
 * getExcludedDirectories(projectPath, frameworkPath)` we emit two rules:
 *
 *   1. `Read(./<dir>/**)` — top-level only (the gitignore pattern that
 *      most projects expect — matches the project root's `node_modules/`).
 *   2. `Read(**\/<dir>/**)` — any depth (catches nested copies, e.g.
 *      yarn-workspace projects with `packages/<x>/node_modules/`,
 *      Gradle multi-module builds with `<sub>/build/`, etc.).
 *
 * Cost is near-zero (rules are cheap; Claude CLI evaluates them at
 * filesystem-walk time) and coverage is maximal across workspace tools
 * that hoist vs. don't hoist.
 *
 * Stack-agnostic: every dir name is a noun, not a path; the function
 * has no knowledge of any specific language or framework.
 *
 * `excludedDirsOverride` allows a per-agent exemption list so agents that
 * legitimately need access to an "excluded" directory are not silently
 * blocked. The override shape mirrors the PreToolUse path-restriction hook.
 */
export function buildClaudeDenyRules(
  projectPath: string,
  frameworkPath?: string,
  excludedDirsOverride?: ReadonlyArray<string>,
): string[] {
  const dirs = excludedDirsOverride ?? getExcludedDirectories(projectPath, frameworkPath);
  const rules: string[] = [];
  for (const dir of dirs) {
    if (!dir || typeof dir !== 'string') continue;
    const cleaned = dir.replace(/^[/\\\s]+|[/\\\s]+$/g, '');
    if (!cleaned) continue;
    rules.push(`Read(./${cleaned}/**)`);
    rules.push(`Read(**/${cleaned}/**)`);
  }
  return rules;
}

/**
 * Render `buildClaudeDenyRules` as the JSON-array-content fragment expected
 * by the settings.json placeholder substitution. The fragment includes the
 * outer quotes and commas EXCEPT the surrounding `[` and `]` brackets so it
 * can be substituted in place of a single quoted placeholder entry like
 * `"${FRAMEWORK_EXCLUDED_DENY_RULES}"` inside an existing JSON array.
 *
 * Example output (truncated):
 *   `"Read(./node_modules/**)", "Read(**\/node_modules/**)", "Read(./.git/**)", ...`
 *
 * Why this shape: the settings.json file declares the array bracket itself
 * (`"deny": [...]`), and our substitution replaces the placeholder string
 * (one quoted entry) with N comma-separated quoted entries. The resulting
 * JSON stays valid; if a rule contains a backslash or quote, JSON.stringify
 * escapes it correctly.
 */
export function renderDenyRulesPlaceholderValue(rules: string[]): string {
  return rules.map((r) => JSON.stringify(r)).join(', ');
}

/**
 * The literal placeholder token settings.json files use to opt into
 * deny-rules substitution. Exported as a constant so producer (the
 * settings.json files) and consumer (the spawn-time substitution in
 * `cli-agent-impl.ts`) cannot drift apart.
 *
 * Substitution pattern (used by `cli-agent-impl.ts`):
 *   replace  `"${FRAMEWORK_EXCLUDED_DENY_RULES}"`  (the full quoted token)
 *   with     `"Read(./node_modules/**)", "Read(**\/node_modules/**)", ...`
 */
export const FRAMEWORK_EXCLUDED_DENY_RULES_PLACEHOLDER = '"${FRAMEWORK_EXCLUDED_DENY_RULES}"';

/**
 * Filenames inside `<provider-temp>/initialize-project/` that the four Phase 1
 * analyzer agents are allowed to read despite the provider-temp directory being
 * on the standard deny list.
 *
 * The Phase 0 graph-foundation node writes these as a deterministic seed for
 * downstream analyzers — losing the read access turns the seed into wasted I/O
 * and forces analyzers to re-derive the same data from the filesystem.
 *
 * Stack-agnostic: filenames only; no language/framework/project assumption.
 */
const ANALYZER_TEMP_ALLOW_FILENAMES: ReadonlyArray<string> = [
  'project-inspection.json',
  'graph-prefetch.json',
];

/**
 * Per-agent excluded-directories override for the four Phase 1 analyzers.
 *
 * Claude CLI's permission resolver treats `deny` as taking precedence over
 * `allow`, so a surgical `permissions.allow` for `<provider-temp>/<file>` is
 * defeated by an equally-matching `permissions.deny: <provider-temp>/**`
 * entry. To make the allow-list effective, we strip the provider temp
 * directories from the deny list for these analyzers. The PreToolUse
 * `restrict-agent-paths` hook still enforces a per-agent file allow-list
 * (see `analyzerReadableTempPaths`), so the analyzers can only Read the two
 * seed files — every other path under `.claude-temp/` / `.codex-temp/`
 * remains blocked at the hook layer.
 *
 * Stack-agnostic: only directory NAMES are listed, identical in shape to the
 * underlying default produced by `getExcludedDirectories`.
 */
export function analyzerExcludedDirsOverride(
  projectPath: string,
  frameworkPath?: string,
): string[] {
  const tempDirsToStrip = new Set(getAllProviderTempDirs());
  return getExcludedDirectories(projectPath, frameworkPath).filter(
    (dir) => !tempDirsToStrip.has(dir),
  );
}

/**
 * Absolute paths that Phase 1 analyzer agents must be able to read, even
 * though they live under a provider-temp directory that is otherwise on the
 * deny list. Returns one entry per file × provider so a single project tree
 * works under both Claude and Codex without re-spawning the agent.
 *
 * Used by the agent factory to render `permissions.allow` overrides and by
 * the `restrict-agent-paths` PreToolUse hook to short-circuit the
 * excluded-segment check.
 */
export function analyzerReadableTempPaths(projectPath: string): string[] {
  const paths: string[] = [];
  for (const tempDir of getAllProviderTempDirs()) {
    for (const filename of ANALYZER_TEMP_ALLOW_FILENAMES) {
      paths.push(join(projectPath, tempDir, 'initialize-project', filename));
    }
  }
  return paths;
}

/**
 * Build the canonical list of `Read(...)` allow rules from a set of absolute
 * file paths. Each path becomes a single `Read(<abs-path>)` entry; the
 * Claude permissions resolver treats `allow` as overriding `deny` so this is
 * the surgical opt-in mechanism for "read this one file even though its
 * directory is denied."
 *
 * No globs — only exact absolute file paths. If a caller passes a glob it
 * widens the trust boundary in ways the deny list cannot revoke; refuse it.
 */
export function buildClaudeAllowReadRules(allowReadPaths: ReadonlyArray<string>): string[] {
  const rules: string[] = [];
  for (const p of allowReadPaths) {
    if (!p || typeof p !== 'string') continue;
    if (p.includes('*') || p.includes('?')) {
      throw new Error(
        `buildClaudeAllowReadRules: glob characters are not permitted in allow paths (got "${p}"). Pass an exact absolute file path instead.`,
      );
    }
    rules.push(`Read(${p})`);
  }
  return rules;
}

/**
 * The literal placeholder token settings.json files use to opt into
 * allow-rules substitution. Mirrors `FRAMEWORK_EXCLUDED_DENY_RULES_PLACEHOLDER`.
 *
 * Substitution pattern (used by `cli-agent-impl.ts`):
 *   replace  `"${FRAMEWORK_AGENT_READ_ALLOW}"`  (the full quoted token)
 *   with     `"Read(/abs/path/to/project-inspection.json)", "Read(/abs/path/to/graph-prefetch.json)"`
 */
export const FRAMEWORK_AGENT_READ_ALLOW_PLACEHOLDER = '"${FRAMEWORK_AGENT_READ_ALLOW}"';
