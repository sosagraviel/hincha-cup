import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Result of attempting to load `~/.claude/settings.json`'s `env` block into `process.env`.
 */
export interface ClaudeSettingsLoadResult {
  /** Path that was checked (always returned, even when the file is missing) */
  settingsPath: string;
  /** True if the file existed and was readable */
  fileFound: boolean;
  /** Env keys actually written into process.env (existing values are never overwritten) */
  appliedKeys: string[];
  /** Env keys present in settings.json but skipped because process.env already had them */
  skippedKeys: string[];
  /** Non-fatal warning, if any (malformed JSON, unexpected shape, etc.) */
  warning?: string;
}

/**
 * Resolve the path to the user's Claude CLI settings file.
 *
 * The Claude CLI uses `~/.claude/settings.json` on every platform. `os.homedir()` returns
 * the appropriate path on macOS / Linux / Windows, so this works cross-platform.
 */
export function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/**
 * Load the `env` block from `~/.claude/settings.json` into `process.env`.
 *
 * Why this exists:
 * - The Claude CLI itself reads its own settings.json and applies the `env` block when it
 *   starts. But the framework's parent Node.js process (this orchestrator) runs `auth-detector`
 *   BEFORE spawning the CLI, and that detector reads `process.env` directly. So users who
 *   configure things like `CLAUDE_CODE_USE_FOUNDRY` only in settings.json hit auth errors at
 *   the framework layer, even though the CLI itself would have routed correctly.
 * - This helper makes settings.json the single source of truth for Claude config: configure it
 *   once, both the framework and the CLI behave consistently.
 *
 * Precedence: explicit shell exports always win over settings.json. We never overwrite an
 * existing `process.env[key]`. This matches how the Claude CLI itself treats its settings.json
 * env block (shell environment > settings).
 *
 * Failure modes are intentionally non-fatal: a missing file, malformed JSON, or unexpected
 * shape returns a result with `appliedKeys: []` and a `warning` rather than throwing. Auth
 * detection downstream will still fail loudly with a clear message if no auth is available.
 */
export function loadClaudeSettingsEnv(): ClaudeSettingsLoadResult {
  const settingsPath = getClaudeSettingsPath();

  if (!existsSync(settingsPath)) {
    return { settingsPath, fileFound: false, appliedKeys: [], skippedKeys: [] };
  }

  let raw: string;
  try {
    raw = readFileSync(settingsPath, 'utf-8');
  } catch (err) {
    return {
      settingsPath,
      fileFound: true,
      appliedKeys: [],
      skippedKeys: [],
      warning: `Could not read ${settingsPath}: ${(err as Error).message}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      settingsPath,
      fileFound: true,
      appliedKeys: [],
      skippedKeys: [],
      warning: `Malformed JSON in ${settingsPath}: ${(err as Error).message}`,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      settingsPath,
      fileFound: true,
      appliedKeys: [],
      skippedKeys: [],
      warning: `Expected an object at the top level of ${settingsPath}`,
    };
  }

  const envBlock = (parsed as Record<string, unknown>).env;
  if (envBlock === undefined) {
    return { settingsPath, fileFound: true, appliedKeys: [], skippedKeys: [] };
  }
  if (!envBlock || typeof envBlock !== 'object' || Array.isArray(envBlock)) {
    return {
      settingsPath,
      fileFound: true,
      appliedKeys: [],
      skippedKeys: [],
      warning: `Expected "env" to be an object in ${settingsPath}`,
    };
  }

  const appliedKeys: string[] = [];
  const skippedKeys: string[] = [];

  for (const [key, value] of Object.entries(envBlock as Record<string, unknown>)) {
    // Only string values are valid env vars; silently skip anything else (matches CLI behavior).
    if (typeof value !== 'string') continue;

    if (process.env[key] !== undefined) {
      skippedKeys.push(key);
      continue;
    }

    process.env[key] = value;
    appliedKeys.push(key);
  }

  return { settingsPath, fileFound: true, appliedKeys, skippedKeys };
}
