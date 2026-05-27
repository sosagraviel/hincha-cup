/**
 * Copies the Phase 0 preflight shim into a project's provider config directory.
 *
 * Skills like `/implement-ticket`, `/create-sdd-ticket`, `/wiki-refresh`, and
 * `/apply-pr-feedback` call `bash {{CONFIG_DIR}}/scripts/ensure-context.sh` as
 * their first phase. The shim files copied here let those skills locate the
 * real framework checkout without the engineer having to export
 * `FRAMEWORK_PATH` in their shell — `scripts/lib/resolve-paths.sh` runs in
 * dual mode and walks a fallback chain when it detects it is the shim copy.
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
    source: 'scripts/lib/resolve-paths.sh',
    dest: 'lib/resolve-paths.sh',
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
