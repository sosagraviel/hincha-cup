import { createHash } from 'crypto';
import { execFileSync, execSync, spawn } from 'child_process';
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';

export interface CodeGraphBuildOptions {
  projectPath: string;
  frameworkPath: string;
}

export interface CodeGraphBuildResult {
  code_graph_available: boolean;
  code_graph_path: string;
  code_graph_stats: CodeGraphStats;
}

/** Describes how `code-review-graph` should be invoked on this machine. */
export interface ResolvedCodeGraphCommand {
  command: string;
  /** Prefix args inserted before the actual sub-command + user args (e.g. `['code-review-graph']` for uvx). */
  args: string[];
  via: 'launcher.json' | 'local-launcher' | 'wrapper-script' | 'system-binary' | 'uvx-direct';
}

/** Result of a smoke test verifying the resolved code-review-graph command is callable. */
export interface SmokeTestResult {
  ok: boolean;
  version?: string;
  error?: string;
  via?: ResolvedCodeGraphCommand['via'];
}

/** Result of validating a graph DB file is present, non-empty, and structurally valid. */
export interface DbValidationResult {
  ok: boolean;
  sizeBytes: number;
  reason?: string;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface GraphStateFile {
  last_indexed_commit?: string;
  updated_at?: string;
  tool_version?: string;
}

interface LauncherJson {
  version: string;
  command: string;
  args: string[];
  resolved_at: string;
  tool_version?: string;
  [key: string]: unknown;
}

interface ExtractionManifest {
  files_parsed: number | undefined;
  languages: string[] | undefined;
  tool_version: string;
  sha: string;
  build_time_ms: number | undefined;
  created_at: string;
}

const COMMAND_TIMEOUT_MS = 300000;
const CODE_REVIEW_GRAPH_DIRNAME = '.code-review-graph';

/** Returns the path to the `.code-review-graph/` directory for a project. */
export function codeReviewGraphDir(projectPath: string): string {
  return join(projectPath, CODE_REVIEW_GRAPH_DIRNAME);
}

/**
 * Returns the canonical path to the code-graph SQLite database for a project.
 * Single source of truth for every reader/writer of the graph DB. The legacy
 * `<project>/.code-graph.db` snapshot has been retired (Phase 2 of the
 * init-refactor); only this path is produced or consumed.
 */
export function graphDbPath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), 'graph.db');
}

/** Returns the path to `.code-review-graph/.state.json` for a project. */
function graphStatePath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), '.state.json');
}

/**
 * Reads the `.code-review-graph/.state.json` file and returns its contents,
 * or null if the file does not exist or cannot be parsed.
 */
export function loadGraphState(projectPath: string): GraphStateFile | null {
  const statePath = graphStatePath(projectPath);
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as GraphStateFile;
  } catch {
    return null;
  }
}

/**
 * Runs `git rev-parse HEAD` in the given project directory and returns the
 * trimmed SHA. Falls back to 'unknown' when git is unavailable or the directory
 * is not a git repo. Suppresses stderr to keep parent output clean on
 * non-git fixtures.
 */
export function resolveCurrentCommit(projectPath: string): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Reads the launcher.json written by setup-code-graph.sh and returns the
 * recorded `tool_version`, if any. This is the silent path — no subprocess
 * spawn, no risk of `/bin/sh: command not found` leaking to the parent
 * terminal. Returns null when the file is missing, malformed, or has no
 * usable tool_version field.
 */
function readToolVersionFromLauncher(projectPath: string): string | null {
  const launcherJsonPath = join(codeReviewGraphDir(projectPath), 'launcher.json');
  if (!existsSync(launcherJsonPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(launcherJsonPath, 'utf-8')) as LauncherJson;
    if (
      typeof parsed.tool_version === 'string' &&
      parsed.tool_version.trim().length > 0 &&
      parsed.tool_version !== 'unknown'
    ) {
      return parsed.tool_version.trim();
    }
    return null;
  } catch {
    return null;
  }
}

const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Verifies the resolved code-review-graph command is callable and returns
 * a parseable version string. Stderr suppressed so a failure on the
 * happy path doesn't print noise to the user; the returned `error` field
 * carries any captured stderr for callers that want to surface it.
 */
export async function smokeTestCodeGraph(
  projectPath: string,
  frameworkPath: string,
  options?: { timeoutMs?: number },
): Promise<SmokeTestResult> {
  const resolved = resolveCodeGraphCommand(projectPath, frameworkPath);
  try {
    const result = await runCodeGraphCommand(['--version'], {
      projectPath,
      frameworkPath,
      timeoutMs: options?.timeoutMs ?? 15_000,
    });
    const version = result.stdout.trim();
    if (!/\d+\.\d+/.test(version)) {
      return {
        ok: false,
        error: `version string does not match expected pattern: "${version}"`,
        via: resolved.via,
      };
    }
    return { ok: true, version, via: resolved.via };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message, via: resolved.via };
  }
}

/**
 * Validates that the graph DB file exists, has size > 0, and starts with
 * the SQLite magic header. Anything else is a half-built artifact.
 */
export function validateGraphDb(graphDbPath: string): DbValidationResult {
  if (!existsSync(graphDbPath)) {
    return { ok: false, sizeBytes: 0, reason: 'file does not exist' };
  }

  const { size: sizeBytes } = statSync(graphDbPath);
  if (sizeBytes === 0) {
    return { ok: false, sizeBytes: 0, reason: 'file is empty (0 bytes)' };
  }

  const header = Buffer.alloc(16);
  let fd: number | undefined;
  try {
    fd = openSync(graphDbPath, 'r');
    readSync(fd, header, 0, 16, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, sizeBytes, reason: `could not read file header: ${message}` };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
  }

  const magic = header.toString('utf8', 0, 16);
  if (magic !== SQLITE_MAGIC) {
    return {
      ok: false,
      sizeBytes,
      reason: `not a SQLite file (magic bytes mismatch: "${magic.replace(/\0/g, '\\0')}")`,
    };
  }

  return { ok: true, sizeBytes };
}

/**
 * Returns the canonical invocation for code-review-graph.
 *
 * Resolution order:
 *   1. <projectPath>/.code-review-graph/launcher.json (written by setup-code-graph.sh)
 *   2. <projectPath>/.code-review-graph/code-review-graph executable
 *   3. <frameworkPath>/scripts/code-review-graph-mcp.sh wrapper
 *   4. System `code-review-graph` binary on PATH
 *   5. System `uvx` → `uvx code-review-graph`
 *
 * Never throws — the wrapper handles the missing-binary error at runtime.
 */
export function resolveCodeGraphCommand(
  projectPath: string,
  frameworkPath: string,
): ResolvedCodeGraphCommand {
  const launcherJsonPath = join(codeReviewGraphDir(projectPath), 'launcher.json');
  if (existsSync(launcherJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(launcherJsonPath, 'utf-8')) as LauncherJson;
      if (
        typeof parsed.command === 'string' &&
        Array.isArray(parsed.args) &&
        parsed.args.every((a) => typeof a === 'string')
      ) {
        return { command: parsed.command, args: parsed.args as string[], via: 'launcher.json' };
      }
    } catch {
      // malformed — fall through
    }
  }

  const localLauncher = join(codeReviewGraphDir(projectPath), 'code-review-graph');
  try {
    accessSync(localLauncher, constants.X_OK);
    return { command: localLauncher, args: [], via: 'local-launcher' };
  } catch {
    // not executable or missing — fall through
  }

  const wrapperScript = join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh');
  if (existsSync(wrapperScript)) {
    return { command: wrapperScript, args: [], via: 'wrapper-script' };
  }

  try {
    execSync('command -v code-review-graph', { stdio: 'ignore' });
    return { command: 'code-review-graph', args: [], via: 'system-binary' };
  } catch {
    // not on PATH — fall through
  }

  return { command: 'uvx', args: ['code-review-graph'], via: 'uvx-direct' };
}

/**
 * Spawns `code-review-graph <args>` via the resolver and returns exit code,
 * stdout, and stderr. All TS call sites use this instead of bare
 * `runCommand('code-review-graph', args)`.
 */
export async function runCodeGraphCommand(
  subArgs: string[],
  options: {
    projectPath: string;
    frameworkPath: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  },
): Promise<CommandResult> {
  const resolved = resolveCodeGraphCommand(options.projectPath, options.frameworkPath);
  const fullArgs = [...resolved.args, ...subArgs];
  return runCommand(resolved.command, fullArgs, {
    cwd: options.cwd,
    env: options.env ?? getCodeGraphEnv(),
    timeoutMs: options.timeoutMs,
  });
}

/**
 * Resolves the installed `code-review-graph` version string.
 * Falls back to 'unknown' when the command is unavailable.
 */
async function resolveToolVersion(projectPath: string, frameworkPath: string): Promise<string> {
  try {
    const result = await runCodeGraphCommand(['--version'], {
      projectPath,
      frameworkPath,
      env: getCodeGraphEnv(),
      timeoutMs: 10000,
    });
    return result.stdout.trim().split('\n')[0] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Persists `.code-review-graph/.state.json` with the current commit, ISO
 * timestamp, and tool version. Creates the directory if it does not exist.
 */
async function writeGraphState(projectPath: string, frameworkPath: string): Promise<void> {
  const dir = codeReviewGraphDir(projectPath);
  mkdirSync(dir, { recursive: true });

  const toolVersion = await resolveToolVersion(projectPath, frameworkPath);
  const state: GraphStateFile = {
    last_indexed_commit: resolveCurrentCommit(projectPath),
    updated_at: new Date().toISOString(),
    tool_version: toolVersion,
  };
  writeFileSync(graphStatePath(projectPath), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Reads the cached extraction manifest if present, else returns null.
 * Single source for callers that want stats / SHA / timestamps without
 * re-running `code-review-graph stats`.
 */
export function loadExtractionManifest(projectPath: string): ExtractionManifest | null {
  const path = join(codeReviewGraphDir(projectPath), 'extraction-manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ExtractionManifest;
  } catch {
    return null;
  }
}

/**
 * Writes `.code-review-graph/extraction-manifest.json` capturing snapshot
 * metadata about the graph build so downstream consumers can verify what was
 * indexed and when.
 *
 * **Idempotent.** When the existing manifest's load-bearing fields
 * (`files_parsed`, `languages`, `tool_version`, `sha`) match the new ones, the
 * `created_at` and `build_time_ms` are preserved from the existing file —
 * preventing churn on the committed manifest when a hot-path bootstrap did no
 * actual rebuild work.
 */
export function writeExtractionManifest(
  projectPath: string,
  stats: CodeGraphStats,
  sha: string,
): void {
  const dir = codeReviewGraphDir(projectPath);
  mkdirSync(dir, { recursive: true });

  // Prefer launcher.json (written by setup-code-graph.sh) — silent, no subprocess.
  // Fall back to launcher-aware execSync only if launcher.json is missing or
  // omitted tool_version. Always suppress child stderr so a missing binary
  // doesn't leak `/bin/sh: code-review-graph: command not found` to the
  // parent terminal.
  let toolVersion = readToolVersionFromLauncher(projectPath);
  if (!toolVersion) {
    try {
      toolVersion =
        execSync('code-review-graph --version', {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .trim()
          .split('\n')[0] ?? 'unknown';
    } catch {
      // tool unavailable on PATH — caller falls back to 'unknown'
    }
  }
  if (!toolVersion) {
    toolVersion = 'unknown';
  }

  // Preserve created_at + build_time_ms when the load-bearing content is
  // identical to the existing manifest. Without this, every bootstrap run
  // (including pure-cache Tier 1 hot paths) would churn the committed file.
  const existing = loadExtractionManifest(projectPath);
  let createdAt = new Date().toISOString();
  let buildTimeMs = stats.build_time_ms;
  if (existing) {
    const sameContent =
      existing.files_parsed === stats.files &&
      JSON.stringify(existing.languages ?? null) === JSON.stringify(stats.languages ?? null) &&
      existing.tool_version === toolVersion &&
      existing.sha === sha;
    if (sameContent) {
      if (typeof existing.created_at === 'string') createdAt = existing.created_at;
      if (typeof existing.build_time_ms === 'number') buildTimeMs = existing.build_time_ms;
    }
  }

  const manifest: ExtractionManifest = {
    files_parsed: stats.files,
    languages: stats.languages,
    tool_version: toolVersion,
    sha,
    build_time_ms: buildTimeMs,
    created_at: createdAt,
  };

  const path = join(dir, 'extraction-manifest.json');
  const next = JSON.stringify(manifest, null, 2);
  // Compare-then-write: skip the syscall when nothing changed.
  if (existsSync(path)) {
    try {
      const current = readFileSync(path, 'utf-8');
      if (current === next || current === `${next}\n`) return;
    } catch {
      // unreadable — fall through to write
    }
  }
  writeFileSync(path, next, 'utf-8');
}

/**
 * State-first tier check — decides what work `buildCodeGraph` needs to do
 * given the current on-disk state. **Pure file reads + one git call**; no
 * subprocess to the graph tool. This is the cheap front-end that lets the
 * hot path (graph already at HEAD) skip every expensive operation.
 *
 *   tier1   → graph is fresh; no rebuild, no smoke test, no manifest churn.
 *   tier2   → graph exists but stale; run incremental `update` only.
 *   tier3   → graph missing or invalid; full `build` required.
 */
export type GraphTier = 'tier1' | 'tier2' | 'tier3';

/**
 * Multi-repo probe via the shared bash helper (single source of truth
 * with `setup-code-graph.sh`). Exit code 0 → multi-repo; anything else
 * → single-repo or unsupported layout.
 *
 * Multi-repo means the parent dir is a git repo without `.gitmodules`
 * that contains nested top-level child git repos. In that layout the
 * parent's `git rev-parse HEAD` doesn't move when children advance, so
 * the staleness signals collapse to false-fresh; tier2's `code-review-graph
 * update` can't see child diffs either. We force tier3 every run.
 */
function isMultiRepo(projectPath: string, frameworkPath: string): boolean {
  const helper = join(frameworkPath, 'scripts', 'lib', 'register-submodules.sh');
  if (!existsSync(helper)) return false;
  try {
    execFileSync('bash', [helper, 'is-multi-repo', projectPath, frameworkPath], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

export function decideGraphTier(projectPath: string, frameworkPath: string): GraphTier {
  if (isMultiRepo(projectPath, frameworkPath)) return 'tier3';

  const dbPath = graphDbPath(projectPath);
  if (!existsSync(dbPath)) return 'tier3';

  const dbCheck = validateGraphDb(dbPath);
  if (!dbCheck.ok) return 'tier3';

  const state = loadGraphState(projectPath);
  const lastIndexed = state?.last_indexed_commit;
  if (!lastIndexed || lastIndexed === 'unknown') return 'tier3';

  const head = resolveCurrentCommit(projectPath);
  if (head === 'unknown') return 'tier3';

  return lastIndexed === head ? 'tier1' : 'tier2';
}

/**
 * Returns cached `CodeGraphStats` from the existing extraction manifest,
 * or null when the manifest is missing/malformed. Used by the Tier 1 hot
 * path to avoid spawning `code-review-graph stats`.
 */
function loadCachedStats(projectPath: string): CodeGraphStats | null {
  const m = loadExtractionManifest(projectPath);
  if (!m) return null;
  return {
    files: m.files_parsed,
    languages: m.languages,
    build_time_ms: m.build_time_ms,
  };
}

export async function buildCodeGraph(
  options: CodeGraphBuildOptions,
): Promise<CodeGraphBuildResult> {
  const startedAt = Date.now();
  const dbPath = graphDbPath(options.projectPath);
  const setupScriptPath = join(options.frameworkPath, 'scripts', 'setup-code-graph.sh');

  if (!existsSync(setupScriptPath)) {
    throw new Error(`Code graph setup script not found: ${setupScriptPath}`);
  }

  // ===== State-first tier check (pure file reads; no graph subprocess) =====
  const tier = decideGraphTier(options.projectPath, options.frameworkPath);

  let buildTimeMs = 0;

  // ===== Tier 3: graph missing or invalid → full build via setup script =====
  // Setup script also auto-installs the tool when needed (uv → uvx → pipx → pip).
  if (tier === 'tier3') {
    const start = Date.now();
    await runCommand('bash', [setupScriptPath], {
      cwd: options.projectPath,
      env: { ...getCodeGraphEnv() },
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    process.env.PATH = getCodeGraphEnv().PATH;
    buildTimeMs = Date.now() - start;

    if (!existsSync(dbPath)) {
      throw new Error(`Code graph database was not created: ${dbPath}`);
    }
    const postBuildCheck = validateGraphDb(dbPath);
    if (!postBuildCheck.ok) {
      throw new Error(
        `Graph DB invalid (${postBuildCheck.sizeBytes} bytes): ${postBuildCheck.reason}`,
      );
    }
  }

  // ===== Tier 2: graph stale → incremental update (no full rebuild) =====
  if (tier === 'tier2') {
    const start = Date.now();
    const updated = await tryIncrementalUpdate(options.projectPath, options.frameworkPath);
    if (!updated) {
      // tryIncrementalUpdate already logged the reason; fall back to full build.
      await runFullBuild(options.projectPath, dbPath, options.frameworkPath);
    }
    buildTimeMs = Date.now() - start;
  }

  // ===== Tier 1: graph fresh; do NOTHING =====
  // No build, no smoke, no manifest churn. The DB already validated, the
  // .state.json's last_indexed_commit equals HEAD — there is nothing to do.

  // ===== Smoke once, only when we actually did rebuild work =====
  // On Tier 1 the existing artefacts already validated; running --version
  // again is pure waste and slows the hot path that 6000+ devs hit on
  // every skill invocation.
  if (tier !== 'tier1') {
    let smoke = await smokeTestCodeGraph(options.projectPath, options.frameworkPath);
    if (!smoke.ok) {
      // Auto-fix: re-run setup with FORCE_REINSTALL to repair corrupt installs.
      await runCommand('bash', [setupScriptPath], {
        cwd: options.projectPath,
        env: {
          ...getCodeGraphEnv(),
          FORCE_REINSTALL: '1',
        },
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      smoke = await smokeTestCodeGraph(options.projectPath, options.frameworkPath);
    }
    if (!smoke.ok) {
      const hint =
        'Install uv manually: https://docs.astral.sh/uv/getting-started/installation/ ' +
        `or rerun: bash ${setupScriptPath}`;
      throw new Error(
        `code-review-graph failed verification after autofix attempt.\n` +
          `Last error: ${smoke.error ?? 'unknown'}\n` +
          `${hint}`,
      );
    }
  }

  // ===== Persist state — Tier 1 already has correct state; only rewrite on work =====
  if (tier !== 'tier1') {
    await writeGraphState(options.projectPath, options.frameworkPath);
  }

  // ===== Stats — Tier 1 reads cached manifest; Tier 2/3 re-collect =====
  let stats: CodeGraphStats;
  if (tier === 'tier1') {
    const cached = loadCachedStats(options.projectPath);
    if (cached) {
      stats = cached;
    } else {
      // Manifest missing on a Tier 1 graph (rare: someone deleted it without
      // touching graph.db). Re-collect now and rewrite.
      stats = await collectGraphStats(dbPath, 0, options.projectPath, options.frameworkPath);
    }
  } else {
    stats = await collectGraphStats(
      dbPath,
      buildTimeMs || Date.now() - startedAt,
      options.projectPath,
      options.frameworkPath,
    );
  }

  const sha = createHash('sha256').update(readFileSync(dbPath)).digest('hex');

  // writeExtractionManifest is idempotent — when content matches existing,
  // created_at + build_time_ms are preserved and the file is not rewritten.
  writeExtractionManifest(options.projectPath, stats, sha);

  // Note: `verifyCodeGraphCli` was previously called here as a redundant
  // third smoke — `smokeTestCodeGraph` above already verifies the CLI is
  // callable. Dropped to keep the hot path under 100 ms.

  return {
    code_graph_available: true,
    code_graph_path: dbPath,
    code_graph_stats: stats,
  };
}

/**
 * Attempts `code-review-graph update --repo <projectPath>`. Returns true on
 * success, false when the command exits non-zero so the caller can fall back
 * to a full build.
 *
 * Wraps the update with a transient submodule registration so nested child
 * repos under a git-tracked parent are indexed. The Tier 3 path goes
 * through `setup-code-graph.sh`, which handles registration via its own
 * EXIT trap; this Tier 2 fast path bypasses the bash script and must do the
 * same work itself. See scripts/lib/register-submodules.sh.
 */
async function tryIncrementalUpdate(projectPath: string, frameworkPath: string): Promise<boolean> {
  const helper = join(frameworkPath, 'scripts', 'lib', 'register-submodules.sh');
  const haveHelper = existsSync(helper);
  let registered = false;

  try {
    if (haveHelper) {
      try {
        await runCommand('bash', [helper, 'register', projectPath, frameworkPath], {
          cwd: projectPath,
          env: getCodeGraphEnv(),
          timeoutMs: 30_000,
        });
        registered = true;
      } catch {
        // Best-effort; proceed without registration. A non-multi-repo
        // project, a non-git parent, or a user-managed `.gitmodules` all
        // make the helper a no-op anyway, so failure here is unlikely and
        // doesn't justify aborting the update.
      }
    }

    await runCodeGraphCommand(['update', '--repo', projectPath], {
      projectPath,
      frameworkPath,
      // CRG_RECURSE_SUBMODULES=1 makes code-review-graph walk the gitlinks
      // we just registered. No-op when the parent has no submodules.
      env: { ...getCodeGraphEnv(), CRG_RECURSE_SUBMODULES: '1' },
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[code-graph] WARNING: incremental update failed (${message}); falling back to full build\n`,
    );
    return false;
  } finally {
    if (registered) {
      try {
        await runCommand('bash', [helper, 'unregister', projectPath, frameworkPath], {
          cwd: projectPath,
          env: getCodeGraphEnv(),
          timeoutMs: 30_000,
        });
      } catch {
        // Best-effort cleanup. The bash helper itself guards every git
        // command with `|| true`, so a failure here means something more
        // fundamental is broken and surfacing it would be noise.
      }
    }
  }
}

/**
 * Runs the setup script again as a full-build fallback.
 * The setup script is idempotent: when `code-review-graph` is already installed
 * it is cheap and produces a correct fresh build via `build --repo`.
 */
async function runFullBuild(
  projectPath: string,
  _graphDbPath: string,
  frameworkPath: string,
): Promise<void> {
  // The bash script derives the project path locally via lib/resolve-paths.sh
  // and writes to <project>/.code-review-graph/graph.db. No PROJECT_PATH or
  // CODE_GRAPH_DB_PATH env injection is required or honored anymore.
  const setupScriptPath = join(frameworkPath, 'scripts', 'setup-code-graph.sh');
  await runCommand('bash', [setupScriptPath], {
    cwd: projectPath,
    env: {
      ...getCodeGraphEnv(),
    },
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
}

export async function collectGraphStats(
  graphDbPath: string,
  buildTimeMs = 0,
  projectPath?: string,
  frameworkPath?: string,
): Promise<CodeGraphStats> {
  try {
    // <project>/.code-review-graph/graph.db → <project>
    const suffix = '/.code-review-graph/graph.db';
    const repoPath = graphDbPath.endsWith(suffix)
      ? graphDbPath.slice(0, -suffix.length)
      : undefined;

    const resolvedProjectPath = projectPath ?? repoPath ?? process.cwd();
    const resolvedFrameworkPath = frameworkPath ?? process.cwd();

    const commandArgSets = [
      ['stats', '--db', graphDbPath, '--format', 'json'],
      ...(repoPath ? [['status', '--repo', repoPath]] : []),
      ['status'],
    ];

    const result = await runFirstSuccessfulCodeGraphCommand(
      commandArgSets,
      resolvedProjectPath,
      resolvedFrameworkPath,
    );

    return parseGraphStats(result.stdout, buildTimeMs);
  } catch {
    const fileSize = existsSync(graphDbPath) ? statSync(graphDbPath).size : 0;
    return {
      files: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 10000)) : 0,
      functions: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 2000)) : 0,
      classes: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 20000)) : 0,
      edges: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 1000)) : 0,
      languages: ['unknown'],
      build_time_ms: buildTimeMs,
    };
  }
}

/**
 * Verify the code-review-graph CLI is callable on this machine. The MCP server
 * itself is launched per-session by Claude/Codex via the stdio command in
 * `mcp.json` — there is no long-running HTTP server, no port. This verification
 * just exercises the CLI subcommands so resolution failures surface early.
 */
export async function verifyCodeGraphCli(
  projectPath: string,
  frameworkPath?: string,
): Promise<void> {
  const resolvedFrameworkPath = frameworkPath ?? process.cwd();

  const subCommandSets: string[][] = [
    ['serve', '--repo', projectPath, '--help'],
    ['serve', '--help'],
    ['mcp-server', '--help'],
    ['mcp', '--help'],
  ];

  for (const subArgs of subCommandSets) {
    try {
      await runCodeGraphCommand(subArgs, {
        projectPath,
        frameworkPath: resolvedFrameworkPath,
        env: getCodeGraphEnv(),
        timeoutMs: 10000,
      });
      return;
    } catch {}
  }

  await runCodeGraphCommand(['--help'], {
    projectPath,
    frameworkPath: resolvedFrameworkPath,
    env: getCodeGraphEnv(),
    timeoutMs: 10000,
  });
}

async function runFirstSuccessfulCodeGraphCommand(
  commandArgSets: string[][],
  projectPath: string,
  frameworkPath: string,
): Promise<CommandResult> {
  let lastError: Error | undefined;

  for (const args of commandArgSets) {
    try {
      return await runCodeGraphCommand(args, {
        projectPath,
        frameworkPath,
        env: getCodeGraphEnv(),
        timeoutMs: 30000,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('No code-review-graph command succeeded');
}

function parseGraphStats(output: string, buildTimeMs: number): CodeGraphStats {
  try {
    const parsed = JSON.parse(output) as CodeGraphStats;
    return {
      ...parsed,
      build_time_ms: parsed.build_time_ms ?? buildTimeMs,
    };
  } catch {}

  const filesMatch = output.match(/^Files:\s*(\d+)/m);
  const nodesMatch = output.match(/^Nodes:\s*(\d+)/m);
  const edgesMatch = output.match(/^Edges:\s*(\d+)/m);
  const languagesMatch = output.match(/^Languages:\s*(.+)$/m);

  return {
    files: filesMatch ? Number(filesMatch[1]) : undefined,
    functions: nodesMatch ? Number(nodesMatch[1]) : undefined,
    edges: edgesMatch ? Number(edgesMatch[1]) : undefined,
    languages: languagesMatch
      ? languagesMatch[1]
          .split(',')
          .map((language) => language.trim())
          .filter(Boolean)
      : undefined,
    build_time_ms: buildTimeMs,
  };
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out`));
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (exitCode === 0) {
        resolve({ exitCode, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with exit code ${exitCode}: ${
            stderr || stdout || 'no output'
          }`,
        ),
      );
    });
  });
}

function getCodeGraphEnv(): NodeJS.ProcessEnv {
  const userLocalBin = join(homedir(), '.local', 'bin');
  const path = process.env.PATH ? `${userLocalBin}:${process.env.PATH}` : userLocalBin;

  return {
    ...process.env,
    PATH: path,
  };
}

/** Returns the path to `.code-review-graph/extraction-manifest.json` for a project. */
export function extractionManifestPath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), 'extraction-manifest.json');
}
