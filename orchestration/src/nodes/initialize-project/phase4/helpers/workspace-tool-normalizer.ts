/**
 * Stack-agnostic normalisers for the `stack_profile.workspace_tool` and
 * `stack_profile.package_manager` fields.
 *
 * Plan §C 1.2 (gira-exhaustive followup, 2026-05-05). The 2026-05-04
 * gira run produced `framework-config.json` with:
 *
 *   "workspace_tool": "pnpm@10.2.1",
 *   "package_manager": null
 *
 * Both wrong:
 *
 *   - `workspace_tool` is meant to be a workspace-tool identifier
 *     (`"pnpm workspaces"`, `"Maven multi-module"`, `"go workspaces"`,
 *     `"Nx"`, `"Cargo workspaces"`, etc.), not a Corepack version pin.
 *   - `package_manager` is meant to be the bare manager name
 *     (`"pnpm"`, `"poetry"`, `"go modules"`, `"cargo"`, `"maven"`,
 *     `"gradle"`, `"bundler"`, `"composer"`, `"dotnet"`, `"sbt"`,
 *     `"mix"`, …).
 *
 * The Phase 1 tech-stack analyzer reads the `packageManager` Corepack
 * field from `package.json` (a value of the form `<tool>@<version>`)
 * and puts it into `monorepo.workspace_manager`. Phase 4 then copied
 * that string verbatim into both fields. These two helpers fix the
 * data shape regardless of the language family the project ships in.
 *
 * Stack-agnostic by construction: the mapping table covers every
 * workspace tool the framework's supported language families use
 * (JS/TS, Python, Ruby, PHP, Java, Kotlin, Go, Rust, .NET, Scala,
 * Elixir, plus polyglot tools — Bazel, Pants, Please).
 */

/**
 * Normalise an arbitrary workspace-tool identifier to the canonical
 * name for its language family. Returns `undefined` for unrecognised
 * inputs so we never propagate malformed values into the stack
 * profile.
 *
 * The accepted raw inputs cover the most common ways the upstream
 * Phase 1 tech-stack analyzer surfaces the tool:
 *
 *   - Bare manager names (`"pnpm"`, `"yarn"`, `"poetry"`, `"go"`, …)
 *   - Corepack-style version pins (`"pnpm@10.2.1"`, `"yarn@4.0.0"`)
 *   - Tool family names with the word "workspaces" (or
 *     "multi-module" for Maven, "composite" for Gradle)
 *   - Full canonical names (idempotent — pass-through)
 *   - Common typos / case variants
 *
 * @returns canonical name OR undefined when the input doesn't match
 *   any recognised tool.
 */
export function normaliseWorkspaceTool(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Strip Corepack version suffix `<tool>@<version>`.
  const noVersion = trimmed.split('@')[0].trim();
  const lower = noVersion.toLowerCase();

  // JS/TS package-manager workspaces
  if (lower === 'pnpm' || /pnpm[ -]?workspaces?/.test(lower)) return 'pnpm workspaces';
  if (lower === 'yarn' || /yarn[ -]?workspaces?/.test(lower)) return 'yarn workspaces';
  if (lower === 'npm' || /npm[ -]?workspaces?/.test(lower)) return 'npm workspaces';
  if (lower === 'bun' || /bun[ -]?workspaces?/.test(lower)) return 'bun workspaces';

  // JS/TS workspace orchestrators
  if (/^nx([ -]workspace)?$/.test(lower)) return 'Nx';
  if (/^turbo(repo)?$/.test(lower)) return 'Turborepo';
  if (/^lerna$/.test(lower)) return 'Lerna';
  if (/^rush(stack)?$/.test(lower)) return 'Rush';

  // Python
  if (/^uv[ -]workspaces?$/.test(lower) || /\[tool\.uv\.workspace\]/.test(trimmed)) {
    return 'uv workspaces';
  }
  if (
    /^poetry[ -]?(monorepo|workspaces?)$/.test(lower) ||
    lower === 'poetry workspaces' ||
    lower === 'poetry monorepo'
  ) {
    return 'Poetry monorepo';
  }
  if (/^pdm[ -]?workspaces?$/.test(lower) || lower === 'pdm') return 'PDM workspaces';
  if (/^hatch[ -]?workspaces?$/.test(lower)) return 'Hatch workspaces';

  // Ruby / PHP / Java / Kotlin
  if (/bundler[ -]?(engines|workspaces?)?/.test(lower)) return 'Bundler engines';
  if (/composer[ -]?(path[ -]?repos|workspaces?|monorepo)/.test(lower)) {
    return 'composer path repos';
  }
  if (
    /^maven([ -](multi[ -]?module|modules))?$/.test(lower) ||
    /<modules>/.test(trimmed) ||
    lower === 'maven multi-module'
  ) {
    return 'Maven multi-module';
  }
  if (
    /^gradle([ -](composite|workspaces?))?$/.test(lower) ||
    /settings\.gradle/.test(lower) ||
    lower === 'gradle composite'
  ) {
    return 'Gradle composite';
  }

  // Go / Rust / .NET
  if (
    /^go([ -](work|workspaces?))?$/.test(lower) ||
    lower === 'go.work' ||
    lower === 'go workspaces'
  ) {
    return 'go workspaces';
  }
  if (
    /^cargo([ -]workspaces?)?$/.test(lower) ||
    lower === '[workspace]' ||
    lower === 'cargo workspaces'
  ) {
    return 'Cargo workspaces';
  }
  if (/^(dotnet|solution)([ -]?sln)?$/.test(lower) || lower === '*.sln' || lower === 'dotnet sln') {
    return 'dotnet sln';
  }

  // Scala / Mill
  if (/^sbt([ -](multi[ -]?project|subprojects?))?$/.test(lower)) return 'sbt multi-project';
  if (/^mill$/.test(lower)) return 'Mill';

  // Elixir
  if (lower === 'mix' || lower === 'umbrella' || /umbrella[ -]?project/.test(lower)) {
    return 'Elixir umbrella';
  }

  // Polyglot
  if (/^bazel$/.test(lower)) return 'Bazel';
  if (/^pants(\.build)?$/.test(lower)) return 'Pants';
  if (/^please(\.build)?$/.test(lower)) return 'Please';
  if (/^buck(2)?$/.test(lower)) return 'Buck';

  // Pass through canonical-shape inputs (idempotent on already-normalised values)
  // so callers can call this twice without losing data.
  if (
    /^([A-Z][a-z]+ )?(workspaces?|monorepo|composite|engines?|multi-project|multi-module|sln|umbrella)/i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  return undefined;
}

/**
 * Strip a Corepack-style `@<version>` suffix from a package-manager
 * identifier and lowercase the result. Stack-agnostic: works for
 * any tool name that may have been emitted with a version tag (the
 * gira run had `pnpm@10.2.1`; the same shape can come from
 * `poetry@1.8`, `yarn@4.0`, etc.).
 *
 * Returns `undefined` when the input is empty or yields a known
 * non-manager identifier (`workspaces`, `monorepo`, …) — those mean
 * the caller passed a workspace-tool string instead of a manager
 * name.
 */
export function normalisePackageManager(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const noVersion = trimmed.split('@')[0].trim();
  const lower = noVersion.toLowerCase();

  // Recognised bare manager names — return canonical form.
  const canonical: Record<string, string> = {
    npm: 'npm',
    pnpm: 'pnpm',
    yarn: 'yarn',
    bun: 'bun',
    pip: 'pip',
    poetry: 'poetry',
    uv: 'uv',
    pipenv: 'pipenv',
    hatch: 'hatch',
    pdm: 'pdm',
    bundler: 'bundler',
    bundle: 'bundler',
    composer: 'composer',
    maven: 'maven',
    mvn: 'maven',
    gradle: 'gradle',
    cargo: 'cargo',
    go: 'go modules',
    'go modules': 'go modules',
    dotnet: 'dotnet',
    sbt: 'sbt',
    mill: 'mill',
    mix: 'mix',
    rebar3: 'rebar3',
  };

  if (canonical[lower]) return canonical[lower];

  // Reject workspace-tool strings (caller passed the wrong field).
  if (
    /workspaces?|monorepo|composite|engines?|multi-project|multi-module|sln|umbrella/i.test(lower)
  ) {
    return undefined;
  }

  return undefined;
}
