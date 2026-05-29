/**
 * Stack-agnostic normalisers for the `stack_profile.workspace_tool` and
 * `stack_profile.package_manager` fields.
 *
 * Normalises Corepack-style version pins (`"pnpm@10.2.1"`) to canonical
 * workspace-tool identifiers (`"pnpm workspaces"`) and bare manager names
 * (`"pnpm"`). Covers JS/TS, Python, Ruby, PHP, Java, Kotlin, Go, Rust,
 * .NET, Scala, Elixir, and polyglot tools (Bazel, Pants, Please).
 */

/**
 * Normalise an arbitrary workspace-tool identifier to the canonical name for
 * its language family. Returns `undefined` for unrecognised inputs.
 *
 * Accepts bare manager names, Corepack-style version pins, tool family names
 * with "workspaces", full canonical names (idempotent), and common variants.
 *
 * @returns canonical name OR undefined when the input doesn't match any
 *   recognised tool.
 */
export function normaliseWorkspaceTool(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const noVersion = trimmed.split('@')[0].trim();
  const lower = noVersion.toLowerCase();

  if (lower === 'pnpm' || /pnpm[ -]?workspaces?/.test(lower)) return 'pnpm workspaces';
  if (lower === 'yarn' || /yarn[ -]?workspaces?/.test(lower)) return 'yarn workspaces';
  if (lower === 'npm' || /npm[ -]?workspaces?/.test(lower)) return 'npm workspaces';
  if (lower === 'bun' || /bun[ -]?workspaces?/.test(lower)) return 'bun workspaces';

  if (/^nx([ -]workspace)?$/.test(lower)) return 'Nx';
  if (/^turbo(repo)?$/.test(lower)) return 'Turborepo';
  if (/^lerna$/.test(lower)) return 'Lerna';
  if (/^rush(stack)?$/.test(lower)) return 'Rush';

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

  if (/^sbt([ -](multi[ -]?project|subprojects?))?$/.test(lower)) return 'sbt multi-project';
  if (/^mill$/.test(lower)) return 'Mill';

  if (lower === 'mix' || lower === 'umbrella' || /umbrella[ -]?project/.test(lower)) {
    return 'Elixir umbrella';
  }

  if (/^bazel$/.test(lower)) return 'Bazel';
  if (/^pants(\.build)?$/.test(lower)) return 'Pants';
  if (/^please(\.build)?$/.test(lower)) return 'Please';
  if (/^buck(2)?$/.test(lower)) return 'Buck';

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
 * identifier and lowercase the result. Stack-agnostic.
 *
 * Returns `undefined` when the input is empty or yields a known non-manager
 * identifier (`workspaces`, `monorepo`, etc.).
 */
export function normalisePackageManager(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const noVersion = trimmed.split('@')[0].trim();
  const lower = noVersion.toLowerCase();

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

  if (
    /workspaces?|monorepo|composite|engines?|multi-project|multi-module|sln|umbrella/i.test(lower)
  ) {
    return undefined;
  }

  return undefined;
}
