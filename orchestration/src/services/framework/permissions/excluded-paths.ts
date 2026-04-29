/**
 * Single source of truth for translating the framework's excluded-directories
 * list into Claude Code `permissions.deny` rules.
 *
 * Why this exists: the gira-init-run audit (.claude-temp/plans/2026-04-29-glob-node-modules-leak-fix.md)
 * showed that prompt-level guidance + the PreToolUse path-restriction hook
 * are not sufficient to stop Claude's `Glob` tool from returning thousands
 * of `node_modules/**` matches when the agent calls
 * `Glob({ pattern: "package.json", path: "<repo>" })`. The agent's input is
 * benign (no forbidden tokens); the leak happens entirely inside Claude
 * CLI's recursive Glob expansion.
 *
 * Anthropic's official mechanism for filtering Glob/Grep output is
 * `permissions.deny` rules in `settings.json`. From the official settings
 * docs (https://code.claude.com/docs/en/settings, "Excluding sensitive
 * files"):
 *
 *   "Files matching these patterns are excluded from file discovery and
 *    search results, and read operations on these files are denied."
 *
 * Rule format: `Read(<gitignore-pattern>)`. The Read prefix applies
 * "best-effort" to all built-in file-reading tools (Read, Glob, Grep) per
 * the official permissions docs (https://code.claude.com/docs/en/permissions).
 *
 * Stack-agnostic: only directory NAMES (no language-specific extensions, no
 * framework-specific path roots). Works on PHP monoliths, .NET solutions,
 * Python services, Go binaries, Rust crates, COBOL bridges — every project
 * shape the same way.
 */
import { getExcludedDirectories } from '../../../utils/shared/prompt-loader.js';

/**
 * Build the canonical list of `Read(...)` deny rules for a project.
 *
 * For each directory in `getExcludedDirectories(projectPath, frameworkPath)`
 * we emit two rules:
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
 */
export function buildClaudeDenyRules(projectPath: string, frameworkPath?: string): string[] {
  const dirs = getExcludedDirectories(projectPath, frameworkPath);
  const rules: string[] = [];
  for (const dir of dirs) {
    if (!dir || typeof dir !== 'string') continue;
    // Trim accidental whitespace / slashes from the directory name. The
    // source list is curated and shouldn't contain those, but defensive.
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
