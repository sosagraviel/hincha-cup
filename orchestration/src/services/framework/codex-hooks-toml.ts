/**
 * Codex CLI `[[hooks.PreToolUse]]` block management for the framework's
 * path-restriction hook. Mirrors `codex-mcp-toml.ts` for the MCP block but
 * targets the hooks portion of `.codex/config.toml`.
 *
 * Why this exists: Claude Code has `permissions.deny` rules in `settings.json`
 * to filter Glob/Grep results (per the official docs at
 * https://code.claude.com/docs/en/settings — "Excluding sensitive files"
 * — *"Files matching these patterns are excluded from file discovery and
 * search results, and read operations on these files are denied."*).
 *
 * Codex CLI has no `permissions.deny` equivalent. Codex's tool surface is
 * `Bash` + `apply_patch` + MCP — pattern walks happen via `find` / `grep`
 * inside Bash, so `node_modules` leaks come from Bash subprocesses.
 *
 * The official Codex hooks docs (https://developers.openai.com/codex/hooks)
 * document a `PreToolUse` event with `permissionDecision: "deny"` support
 * (NOT `updatedInput` — that "fails open" per the same docs). This means:
 *   - We can BLOCK a Bash invocation that would walk into excluded dirs.
 *   - We cannot rewrite the Bash command (e.g. inject `-prune` flags).
 *
 * The framework's `restrict-agent-paths.hook.ts` already implements the
 * blocking logic (returns exit-2 with feedback when the input targets an
 * excluded dir). This module just wires it into Codex's TOML config so
 * Codex sessions get the same block-on-violation guarantee Claude sessions
 * already have via `permissions.deny`.
 *
 * Stack-agnostic: only TOML key plumbing; no language or framework
 * assumptions inside.
 */

const MANAGED_BLOCK_START =
  '# === ai-agentic-framework: codex hooks (managed; do not edit by hand) ===';
const MANAGED_BLOCK_END = '# === end: ai-agentic-framework codex hooks ===';

export interface CodexPathRestrictionHook {
  /** Absolute path to the tsx interpreter to invoke. */
  tsxBin: string;
  /** Absolute path to the hook entry-point .ts file. */
  hookScript: string;
  /**
   * Tool matchers the hook should fire for. Codex's PreToolUse intercepts
   * `Bash`, `apply_patch`, and MCP tool calls; we cover Bash + apply_patch
   * (file edits) since the framework's Phase 1 analyzers don't write files.
   *
   * Matcher syntax: a regex per Codex's hooks docs. `"^Bash$|^apply_patch$"`
   * fires for both.
   */
  matcher?: string;
  /** Per-call timeout in seconds. */
  timeoutSeconds?: number;
}

const DEFAULT_MATCHER = '^Bash$|^apply_patch$';
const DEFAULT_TIMEOUT_SECONDS = 30;

/**
 * Render the TOML for the framework's managed hook block. Output is a
 * complete fragment including the sentinel comments — `upsertCodexHooksBlock`
 * uses those sentinels to identify the block on subsequent writes.
 */
export function renderCodexPathRestrictionHookBlock(hook: CodexPathRestrictionHook): string {
  const matcher = hook.matcher ?? DEFAULT_MATCHER;
  const timeout = hook.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const command = `${hook.tsxBin} ${hook.hookScript}`;
  return [
    MANAGED_BLOCK_START,
    '# This block is rewritten by the framework on every preflight. Edit',
    '# orchestration/src/services/framework/codex-hooks-toml.ts to change.',
    '',
    '# Codex hooks must be feature-flagged on; this dotted key works whether',
    '# or not the user has their own [features] table elsewhere in the file.',
    'features.codex_hooks = true',
    '',
    `[[hooks.PreToolUse]]`,
    `matcher = "${escapeTomlString(matcher)}"`,
    '',
    '[[hooks.PreToolUse.hooks]]',
    'type = "command"',
    `command = "${escapeTomlString(command)}"`,
    `timeout = ${timeout}`,
    'statusMessage = "Path restriction (ai-agentic-framework)"',
    MANAGED_BLOCK_END,
    '',
  ].join('\n');
}

/**
 * Idempotent upsert: replace the framework's managed hook block in the TOML
 * content (identified by sentinel comments), or append it when absent.
 *
 * Returns the new content. Stack-agnostic — operates on TOML strings, never
 * spawns the agent or reads project files.
 */
export function upsertCodexPathRestrictionHookBlock(
  content: string,
  hook: CodexPathRestrictionHook,
): string {
  const block = renderCodexPathRestrictionHookBlock(hook);
  const stripped = removeCodexPathRestrictionHookBlock(content);
  return appendBlock(stripped, block);
}

/**
 * Remove the framework's managed hook block from the TOML content. Returns
 * the original content unchanged when the block is absent. Surgical: only
 * touches lines between the sentinel comments inclusive — never disturbs
 * unrelated Codex tables (`[mcp_servers.*]`, `[features.*]` keys, user
 * sandbox/policy config).
 */
export function removeCodexPathRestrictionHookBlock(content: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === MANAGED_BLOCK_START);
  if (start === -1) return content;
  let end = lines.findIndex((line, idx) => idx > start && line.trim() === MANAGED_BLOCK_END);
  if (end === -1) {
    end = lines.length - 1;
  }
  let cutEnd = end + 1;
  if (cutEnd < lines.length && lines[cutEnd].trim() === '') cutEnd += 1;
  return [...lines.slice(0, start), ...lines.slice(cutEnd)].join('\n');
}

/**
 * Appends the managed block to the end of `content`, normalising surrounding
 * whitespace so repeated upserts don't accumulate blank-line drift.
 */
function appendBlock(content: string, block: string): string {
  const trimmedEnd = content.trimEnd();
  return trimmedEnd ? `${trimmedEnd}\n\n${block}` : block;
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
