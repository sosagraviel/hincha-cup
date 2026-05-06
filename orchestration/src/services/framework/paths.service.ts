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
 * self-symlink (checked into git) so that running
 * `./qubika-agentic-framework/scripts/...` from inside the framework treats the
 * framework itself as a target project. The symlink ALWAYS exists after a normal
 * clone, so its presence alone is not a valid signal. Real dogfooding requires the
 * user to have actually invoked the framework *through* the symlink — i.e., the
 * entry script path or working directory contains `<framework>/qubika-agentic-framework/`
 * as a logical (un-resolved) segment. This mirrors the bash helper at
 * scripts/lib/resolve-paths.sh, which detects dogfooding by comparing the
 * framework's logical path against its physical path.
 */
import { dirname, join, resolve, sep } from 'node:path';
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
 * Detects dogfooding by checking that (a) the framework root has the
 * `qubika-agentic-framework -> .` self-symlink AND (b) the user actually invoked
 * the framework through it. In that case the framework IS the project; otherwise
 * the project is the framework's parent directory.
 */
export function getProjectPath(): string {
  if (cachedProjectPath) return cachedProjectPath;
  const fw = getFrameworkPath();
  cachedProjectPath = isDogfoodingFramework(fw) ? fw : dirname(fw);
  return cachedProjectPath;
}

/**
 * True iff the framework is dogfooding itself.
 *
 * Two conditions must hold:
 *   1. `<framework>/qubika-agentic-framework` exists as a symlink to `.`. This is
 *      always true after a normal clone (the symlink is checked into git), so it
 *      is a necessary but not sufficient signal.
 *   2. The user actually invoked the framework *through* that self-symlink — i.e.,
 *      the entry script path (`process.argv[1]`), `$PWD`, or `process.cwd()`
 *      contains `<framework>/qubika-agentic-framework/` as a literal segment. In
 *      a normal install (`<project>/qubika-agentic-framework/`), no caller path
 *      ever traverses `<framework>/qubika-agentic-framework/` because that would
 *      require a doubled path segment.
 */
function isDogfoodingFramework(framework: string): boolean {
  const candidate = join(framework, 'qubika-agentic-framework');
  try {
    const stat = lstatSync(candidate);
    if (!stat.isSymbolicLink()) return false;
    const target = readlinkSync(candidate);
    // Accept both `.` and `./` (some shells / `ln` invocations write the trailing slash).
    if (target !== '.' && target !== './') return false;
  } catch {
    return false;
  }

  // The framework physical path is `<fw>`; the self-symlink at
  // `<fw>/qubika-agentic-framework` resolves back to `<fw>`. A caller path that
  // traversed the symlink will literally contain `<fw>/qubika-agentic-framework/`
  // as a prefix — something that never happens in a normal install, where the
  // framework lives at `<project>/qubika-agentic-framework` (only one level).
  const symlinkPrefix = candidate + sep;
  const callerPaths = [process.argv[1], process.env.PWD, process.cwd()];
  return callerPaths.some(
    (p): p is string => typeof p === 'string' && p.startsWith(symlinkPrefix),
  );
}

/** Test-only: resets the per-process memoization. */
export function __resetPathsCacheForTesting(): void {
  cachedFrameworkPath = undefined;
  cachedProjectPath = undefined;
}
