/**
 * Single source of truth for framework + project path resolution in TypeScript.
 *
 * Both paths are resolved deterministically from this module's own location at
 *   <framework>/orchestration/src/services/framework/paths.service.ts
 *   (post-build: <framework>/orchestration/dist/services/framework/paths.service.js)
 *
 * Callers MUST NOT read process.env.PROJECT_PATH or process.env.FRAMEWORK_PATH.
 * The single allowed env-injection site is the agent-factory spawning a Claude or
 * Codex CLI subprocess (the bash MCP launcher inside that subprocess uses
 * `${FRAMEWORK_PATH}` substitution); both `cli-agent-impl.ts` and
 * `codex-cli-agent-impl.ts` mark that injection explicitly.
 *
 * Dogfooding: the framework repo carries a `<framework>/qubika-agentic-framework -> .`
 * self-symlink so that running `./qubika-agentic-framework/scripts/...` from inside
 * the framework treats the framework itself as a target project. We detect that by
 * checking for the self-symlink rather than by `realpath` comparison, because the
 * TypeScript module's own path (via `import.meta.url`) is always the physical path —
 * unlike bash, which sees the symlinked logical path when invoked through it.
 */
import { dirname, join, resolve } from 'node:path';
import { lstatSync, readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let cachedFrameworkPath: string | undefined;
let cachedProjectPath: string | undefined;

/**
 * Returns the absolute path to the framework root.
 * Always resolves to the physical path via `import.meta.url`.
 */
export function getFrameworkPath(): string {
  if (cachedFrameworkPath) return cachedFrameworkPath;
  const here = dirname(fileURLToPath(import.meta.url));
  // <framework>/orchestration/{src,dist}/services/framework/paths.service.{ts,js}
  // → up 4 levels for the framework root.
  cachedFrameworkPath = resolve(here, '..', '..', '..', '..');
  return cachedFrameworkPath;
}

/**
 * Returns the absolute path to the target project root.
 * Detects dogfooding by checking the framework root for a `qubika-agentic-framework`
 * self-symlink whose target is `.`; in that case the framework IS the project.
 */
export function getProjectPath(): string {
  if (cachedProjectPath) return cachedProjectPath;
  const fw = getFrameworkPath();
  cachedProjectPath = isDogfoodingFramework(fw) ? fw : dirname(fw);
  return cachedProjectPath;
}

/**
 * True iff the framework is dogfooding itself — `<framework>/qubika-agentic-framework`
 * exists as a symlink whose target is `.` (meaning the framework was invoked through
 * its own self-symlink).
 */
function isDogfoodingFramework(framework: string): boolean {
  const candidate = join(framework, 'qubika-agentic-framework');
  try {
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink()) return false;
    const target = readlinkSync(candidate);
    // Accept both `.` and `./` (some shells / `ln` invocations write the trailing slash).
    return target === '.' || target === './';
  } catch {
    return false;
  }
}

/** Test-only: resets the per-process memoization. */
export function __resetPathsCacheForTesting(): void {
  cachedFrameworkPath = undefined;
  cachedProjectPath = undefined;
}
