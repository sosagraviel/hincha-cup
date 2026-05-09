/**
 * Plan v3 §A — lock-file → manager mapping.
 *
 * Stack-agnostic by enumeration: every entry is a canonical filename
 * recognised in some language ecosystem. Adding a new language family
 * is a one-line addition here. An unmapped lock file is silently
 * skipped — the inspector simply doesn't surface it, and analyzers
 * fall through to LLM-based discovery for that service.
 *
 * The `manager` value is a free-form lowercase identifier the rest
 * of the framework treats as opaque — no closed enum.
 */

export interface LockFileMapping {
  /** Exact filename (no glob expansion needed for the canonical cases). */
  readonly filename: string;
  /** Free-form lowercase identifier of the package manager / build tool. */
  readonly manager: string;
}

/**
 * Initial table — non-exhaustive by design. Order is alphabetical by
 * filename for stability. Add a new entry by appending alphabetically;
 * test coverage in `services/framework/project-inspection/__tests__/
 * lock-file-table.test.ts` enforces no duplicate filenames and no
 * empty manager strings.
 */
export const LOCK_FILE_TABLE: ReadonlyArray<LockFileMapping> = [
  { filename: 'Berksfile.lock', manager: 'berkshelf' },
  { filename: 'Cargo.lock', manager: 'cargo' },
  { filename: 'Gemfile.lock', manager: 'bundler' },
  { filename: 'Pipfile.lock', manager: 'pipenv' },
  { filename: 'bun.lockb', manager: 'bun' },
  { filename: 'cabal.project.freeze', manager: 'cabal' },
  { filename: 'composer.lock', manager: 'composer' },
  { filename: 'deno.lock', manager: 'deno' },
  { filename: 'dune.lock', manager: 'opam' },
  { filename: 'gleam.lock', manager: 'gleam' },
  { filename: 'go.sum', manager: 'go-modules' },
  { filename: 'mix.lock', manager: 'mix' },
  { filename: 'package-lock.json', manager: 'npm' },
  { filename: 'packages.lock.json', manager: 'nuget' },
  { filename: 'pnpm-lock.yaml', manager: 'pnpm' },
  { filename: 'poetry.lock', manager: 'poetry' },
  { filename: 'pubspec.lock', manager: 'pub' },
  { filename: 'shard.lock', manager: 'shards' },
  { filename: 'stack.yaml.lock', manager: 'stack' },
  { filename: 'uv.lock', manager: 'uv' },
  { filename: 'yarn.lock', manager: 'yarn' },
] as const;

/**
 * Resolve the manager identifier for a given filename. Returns null
 * when the filename is not in the table — caller treats null as
 * "ignore this file, analyzers will figure it out".
 */
export function resolveLockFileManager(filename: string): string | null {
  for (const entry of LOCK_FILE_TABLE) {
    if (entry.filename === filename) return entry.manager;
  }
  return null;
}

/** All canonical lock-file basenames the inspector recognises. */
export function knownLockFileBasenames(): ReadonlyArray<string> {
  return LOCK_FILE_TABLE.map((e) => e.filename);
}
