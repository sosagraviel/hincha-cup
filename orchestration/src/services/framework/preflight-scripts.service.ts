/**
 * Copies the preflight scripts and their dependencies into a project's
 * provider config directory so that engineers can run `ensure-context.sh`
 * without a `qubika-agentic-framework/` checkout present in their project.
 *
 * Skills like `/implement-ticket`, `/create-sdd-ticket`, `/wiki-refresh`, and
 * `/apply-pr-feedback` call `bash {{CONFIG_DIR}}/scripts/ensure-context.sh` as
 * their literal first phase; the script transitively invokes `setup-code-graph.sh`
 * and writes a `.mcp.json` (or `.codex/config.toml`) that points at the shipped
 * `code-review-graph-mcp.sh`. All of those live inside `<configDir>/scripts/`
 * after this service runs, so no `$FRAMEWORK_PATH` lookup is needed at runtime.
 *
 * Idempotent: re-running with no source changes is a no-op (no rewrite, no
 * touch of file mtime).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, chmodSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { Provider } from '../../providers/types.js';
import { getActiveProvider, getProviderPaths } from '../../utils/provider-paths.js';

export interface PreflightScriptsResult {
  configDir: string;
  scriptsDir: string;
  changed: boolean;
  files: string[];
}

interface PreflightScriptSpec {
  /** Path inside the framework repo, relative to `frameworkPath`. */
  source: string;
  /** Path inside the project config dir, relative to `<configDir>/scripts/`. */
  dest: string;
  /** Whether the destination file should be executable. */
  executable: boolean;
}

const PREFLIGHT_SCRIPTS: PreflightScriptSpec[] = [
  {
    source: 'scripts/ensure-context.sh',
    dest: 'ensure-context.sh',
    executable: true,
  },
  {
    source: 'scripts/setup-code-graph.sh',
    dest: 'setup-code-graph.sh',
    executable: true,
  },
  {
    source: 'scripts/code-review-graph-mcp.sh',
    dest: 'code-review-graph-mcp.sh',
    executable: true,
  },
  {
    source: 'scripts/lib/resolve-paths.shim.sh',
    dest: 'lib/resolve-paths.sh',
    executable: false,
  },
  {
    source: 'scripts/lib/bootstrap-uv.sh',
    dest: 'lib/bootstrap-uv.sh',
    executable: false,
  },
  {
    source: 'scripts/lib/register-submodules.sh',
    dest: 'lib/register-submodules.sh',
    executable: false,
  },
  {
    source: 'scripts/lib/patch-code-review-graph.py',
    dest: 'lib/patch-code-review-graph.py',
    executable: false,
  },
  {
    source: 'templates/code-review-graphignore',
    dest: 'templates/code-review-graphignore',
    executable: false,
  },
  {
    source: 'templates/code-review-graph-gitignore',
    dest: 'templates/code-review-graph-gitignore',
    executable: false,
  },
];

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function ensureExecutable(filePath: string): void {
  const mode = statSync(filePath).mode;
  if ((mode & 0o111) !== 0o111) {
    chmodSync(filePath, mode | 0o755);
  }
}

/**
 * Copy preflight shim scripts into `<projectPath>/<configDir>/scripts/`.
 *
 * @throws Error if any source script is missing from the framework checkout.
 */
export function copyPreflightScripts(params: {
  projectPath: string;
  frameworkPath: string;
  provider?: Provider;
}): PreflightScriptsResult {
  const { projectPath, frameworkPath, provider = getActiveProvider() } = params;
  const { configDir } = getProviderPaths(provider);
  const scriptsDir = join(projectPath, configDir, 'scripts');

  const filesWritten: string[] = [];
  let changed = false;

  for (const spec of PREFLIGHT_SCRIPTS) {
    const sourcePath = join(frameworkPath, spec.source);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Preflight source script missing in framework: ${sourcePath}. ` +
          `The framework checkout at ${frameworkPath} appears to be incomplete.`,
      );
    }

    const destPath = join(scriptsDir, spec.dest);
    mkdirSync(dirname(destPath), { recursive: true });

    const shouldCopy = !existsSync(destPath) || sha256(sourcePath) !== sha256(destPath);
    if (shouldCopy) {
      copyFileSync(sourcePath, destPath);
      changed = true;
    }

    if (spec.executable) {
      ensureExecutable(destPath);
    }

    filesWritten.push(destPath);
  }

  return { configDir, scriptsDir, changed, files: filesWritten };
}
