/**
 * Plan 15 — Deterministic command-catalog builder.
 *
 * Pure function. Given the discovered automation surface (Tier 1),
 * README "Getting Started" extracts (Tier 2), per-service package-
 * manager scripts (Tier 3), and CI hints (Tier 4), produce a
 * `CommandCatalog`: a map from operation name → ordered list of
 * candidate commands.
 *
 * The closed-book Phase 3 synthesizer + wiki generator + skills
 * read the catalog directly and render it verbatim. They never
 * decide tier ordering — that responsibility lives here, in
 * deterministic TypeScript.
 *
 * Stack-agnostic. Operates on typed structured inputs only; no
 * file I/O, no LLM, no language-specific assumptions beyond the
 * shared `CommandCatalogOperation` enum.
 */

import type {
  Automation,
  AutomationCiHint,
  AutomationFile,
  AutomationShellScript,
  AutomationTarget,
  CommandCatalog,
  CommandCatalogEntry,
  CommandCatalogOperation,
  CommandCatalogTier,
  ReadmeRunSectionEntry,
} from '../../../schemas/stack-profile.schema.js';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Per-service package-manager command — pre-assembled by the caller
 * (which has access to root vs per-service package manager info).
 *
 * Example: `{ service_id: 'backend', script_name: 'test:e2e',
 * command: 'pnpm --filter backend test:e2e',
 * source: 'services/backend/package.json' }`.
 */
export interface PackageManagerCandidate {
  service_id: string;
  script_name: string;
  command: string;
  source: string;
  description?: string;
}

export interface CommandCatalogBuilderInput {
  automation?: Automation;
  readme_run_sections?: ReadmeRunSectionEntry[];
  package_manager_commands?: PackageManagerCandidate[];
}

// ---------------------------------------------------------------------------
// Operation classifier
// ---------------------------------------------------------------------------

/**
 * Classify a target / script / command name into a
 * `CommandCatalogOperation`. Returns `undefined` when no operation
 * matches (the caller routes the candidate to a default like
 * `setup` or skips it).
 *
 * The classifier is intentionally generous: it matches across
 * Make-style (`setup`, `test-e2e`), npm-style (`test:e2e`), and
 * snake/camel variants. Order of patterns matters — more specific
 * first.
 */
export function classifyOperation(name: string): CommandCatalogOperation | undefined {
  const lower = name.trim().toLowerCase();
  if (lower.length === 0) return undefined;

  // Migration ops — must match before plain `migrate`/`generate`
  if (/(migration[:_-]?generate|generate[:_-]?migration|makemigration)/.test(lower)) {
    return 'generate_migration';
  }
  if (/(migration[:_-]?revert|revert[:_-]?migration|migrate[:_-]?down|rollback)/.test(lower)) {
    return 'revert_migration';
  }
  if (
    /(migration[:_-]?run|migrate(?:[:_-]?up)?$|migrate$|migrations?$|db[:_-]?migrate)/.test(lower)
  ) {
    return 'run_migrations';
  }

  // Test ops — most specific first
  if (/(test[:_-]?e2e|cypress|playwright|test[:_-]?end[:_-]?to[:_-]?end)/.test(lower)) {
    return 'run_e2e';
  }
  if (/(test[:_-]?int|integration[:_-]?test|test[:_-]?integration)/.test(lower)) {
    return 'run_integration_tests';
  }
  if (/(test[:_-]?unit|unit[:_-]?test|test[:_-]?spec)/.test(lower)) {
    return 'run_unit_tests';
  }
  if (/^tests?$|^test:?$|^check$|^run[:_-]?tests?$/.test(lower)) {
    return 'run_tests';
  }

  // Lint / format / typecheck
  if (/^(lint|eslint|ruff|flake8|rubocop|clippy|golangci|stylelint)/.test(lower)) {
    return 'run_lint';
  }
  if (/^(format|fmt|prettier|black|isort|gofmt|rustfmt)/.test(lower)) {
    return 'run_format';
  }
  if (/(typecheck|type[:_-]?check|tsc|mypy|pyright|pyre)/.test(lower)) {
    return 'run_typecheck';
  }

  // Build
  if (/^(build|compile|package|dist|webpack|vite[:_-]?build|tsc[:_-]?build)/.test(lower)) {
    return 'run_build';
  }

  // Seed / reset
  if (/^seed/.test(lower)) {
    return 'seed';
  }
  if (/(launch$|^reset$|^reseed$|down[:_-]?volumes|fresh|nuke|clean[:_-]?all)/.test(lower)) {
    return 'reset';
  }

  // Setup / bootstrap / install
  if (/^(setup|bootstrap|init|install|install[:_-]?all|init[:_-]?dev)$/.test(lower)) {
    return 'setup';
  }

  // Dev / start / run / up — match late so it doesn't shadow the others
  if (/^(start|run|dev|serve|up|launch[:_-]?dev|start[:_-]?dev|runserver)/.test(lower)) {
    return 'start_dev';
  }

  return undefined;
}

/**
 * Tokens that are part of an invocation prefix and never carry the
 * operation hint. We skip them when scanning a command line.
 */
const COMMAND_INVOKER_TOKENS = new Set([
  'pnpm',
  'npm',
  'yarn',
  'bun',
  'npx',
  'pnpx',
  'bunx',
  'make',
  'just',
  'task',
  'mage',
  'invoke',
  'doit',
  'composer',
  'poetry',
  'uv',
  'pip',
  'pip3',
  'pipenv',
  'hatch',
  'pdm',
  'python',
  'python3',
  'node',
  'go',
  'cargo',
  'mvn',
  'mvnw',
  'gradle',
  'gradlew',
  'sbt',
  'mix',
  'stack',
  'cabal',
  'rake',
  'bundle',
  'dotnet',
  'docker',
  'docker-compose',
  'kubectl',
  'terraform',
  'pulumi',
  'ansible',
  'run',
  'exec',
  'do',
  '--',
  '-c',
]);

/**
 * Classify a free-form command line by scanning its tokens and
 * returning the first classifiable operation.
 *
 * Skips invoker tokens (`pnpm`, `npm`, `make`, ...) and `--flag value`
 * pairs (e.g. `--filter backend`). Useful for README fenced-block
 * lines and CI step commands where the operation hint lives further
 * down the line.
 *
 * Examples:
 *   `pnpm install` → 'setup'
 *   `pnpm dev` → 'start_dev'
 *   `pnpm --filter backend test:e2e` → 'run_e2e'
 *   `npx playwright test` → 'run_e2e'
 *   `make tests` → 'run_tests'
 */
export function classifyCommandLine(line: string): CommandCatalogOperation | undefined {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    // Skip invoker prefixes (pnpm, npm, make, ...).
    if (COMMAND_INVOKER_TOKENS.has(tok.toLowerCase())) continue;
    // Skip `--flag value` pairs entirely (e.g. `--filter backend`).
    if (tok.startsWith('--') || (tok.startsWith('-') && tok.length === 2)) {
      i += 1; // also skip the flag's value
      continue;
    }
    // Skip path-like operands that don't carry op hints
    // (`./scripts/test.sh` is handled at the script-walker layer, not
    // by classifying random README lines).
    if (tok.startsWith('./') || tok.startsWith('/')) continue;

    const op = classifyOperation(tok);
    if (op) return op;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tier-1 walkers — automation files
// ---------------------------------------------------------------------------

function entriesFromAutomationFile(
  file: AutomationFile,
  invoker: 'make' | 'just' | 'task',
): Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> {
  const out: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const target of file.targets) {
    const op = classifyTarget(target);
    if (!op) continue;
    out.push({
      op,
      entry: {
        tier: 'wrapper',
        command: `${invoker} ${target.name}`,
        description: target.description,
        source: file.path,
      },
    });
  }
  return out;
}

function classifyTarget(target: AutomationTarget): CommandCatalogOperation | undefined {
  // The group annotation (e.g. `@setup`, `@test`, `@docker`) is a
  // strong hint when the target name is generic.
  const byName = classifyOperation(target.name);
  if (byName) return byName;

  if (target.group) {
    const byGroup = classifyOperation(target.group);
    if (byGroup) return byGroup;
  }
  return undefined;
}

function entriesFromShellScripts(
  scripts: AutomationShellScript[],
): Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> {
  const out: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const script of scripts) {
    const op = shellScriptOperation(script);
    if (!op) continue;
    out.push({
      op,
      entry: {
        tier: 'wrapper',
        command: invokeShellScript(script.path),
        description: shellScriptDescription(script),
        source: script.path,
      },
    });
  }
  return out;
}

function shellScriptOperation(script: AutomationShellScript): CommandCatalogOperation | undefined {
  // Trust an explicit purpose first.
  switch (script.purpose) {
    case 'setup':
    case 'bootstrap':
      return 'setup';
    case 'dev':
      return 'start_dev';
    case 'test':
      return 'run_tests';
    case 'reset':
      return 'reset';
    case 'unknown':
    default: {
      // Fall back to filename classification.
      const base = (script.path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
      return classifyOperation(base);
    }
  }
}

function shellScriptDescription(script: AutomationShellScript): string | undefined {
  switch (script.purpose) {
    case 'setup':
      return 'Setup script (full local-environment bootstrap).';
    case 'bootstrap':
      return 'Bootstrap script.';
    case 'dev':
      return 'Dev-server launcher.';
    case 'test':
      return 'Test runner.';
    case 'reset':
      return 'Environment reset.';
    case 'unknown':
    default:
      return undefined;
  }
}

function invokeShellScript(path: string): string {
  // POSIX-style invocation. If the path is already './…' keep as-is,
  // otherwise prefix with `./` so it's unambiguously executable.
  if (path.startsWith('./') || path.startsWith('/')) return path;
  return `./${path}`;
}

// ---------------------------------------------------------------------------
// Tier-2 walker — README run sections
// ---------------------------------------------------------------------------

const README_COMMAND_PREFIX_RE =
  /^\s*(make|just|task|mage|invoke|doit|npm|pnpm|yarn|bun|composer|poetry|uv|pip|pipenv|hatch|pdm|python|python3|node|npx|go|cargo|mvn|mvnw|gradle|gradlew|sbt|mix|stack|cabal|rake|bundle|bin\/[\w-]+|scripts\/[\w-]+|\.\/[\w./-]+|dotnet|docker|docker-compose|kubectl|terraform|pulumi|ansible)\b/i;

function entriesFromReadme(
  sections: ReadmeRunSectionEntry[],
): Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> {
  const out: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const section of sections) {
    for (const block of section.fenced_blocks) {
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        if (line.startsWith('#') || line.startsWith('//')) continue; // comment lines
        if (!README_COMMAND_PREFIX_RE.test(line)) continue;
        const op = classifyCommandLine(line) ?? 'setup';
        out.push({
          op,
          entry: {
            tier: 'readme',
            command: line,
            description: `From ${section.path} § ${section.heading}`,
            source: `${section.path}#${slug(section.heading)}`,
          },
        });
      }
    }
  }
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Tier-3 walker — per-service package-manager candidates
// ---------------------------------------------------------------------------

function entriesFromPackageManagerCandidates(
  candidates: PackageManagerCandidate[],
): Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> {
  const out: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const c of candidates) {
    const op = classifyOperation(c.script_name);
    if (!op) continue;
    out.push({
      op,
      entry: {
        tier: 'package_manager',
        command: c.command,
        description: c.description,
        source: c.source,
        per_service: c.service_id,
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tier-4 walker — CI hints
// ---------------------------------------------------------------------------

function entriesFromCiHints(
  hints: AutomationCiHint[],
): Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> {
  const out: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const hint of hints) {
    for (const command of hint.commands) {
      const trimmed = command.trim();
      if (trimmed.length === 0) continue;
      const op = classifyCommandLine(trimmed);
      if (!op) continue;
      out.push({
        op,
        entry: {
          tier: 'ci',
          command: trimmed,
          source: hint.file,
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<CommandCatalogTier, number> = {
  wrapper: 0,
  readme: 1,
  package_manager: 2,
  ci: 3,
};

/**
 * Build the deterministic `CommandCatalog`.
 *
 * Output shape: operation → entries[], stable-sorted by:
 *   1. Tier order (wrapper < readme < package_manager < ci)
 *   2. Source path (lexicographic)
 *   3. Command text (lexicographic)
 *
 * Within each operation, duplicate entries (same command + same
 * source) are deduped — the catalog preserves the FIRST occurrence
 * after sorting.
 *
 * Operations with zero candidates are omitted from the output.
 */
export function buildCommandCatalog(input: CommandCatalogBuilderInput): CommandCatalog {
  const candidates: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];

  if (input.automation) {
    for (const f of input.automation.makefiles ?? []) {
      candidates.push(...entriesFromAutomationFile(f, 'make'));
    }
    for (const f of input.automation.justfiles ?? []) {
      candidates.push(...entriesFromAutomationFile(f, 'just'));
    }
    for (const f of input.automation.taskfiles ?? []) {
      candidates.push(...entriesFromAutomationFile(f, 'task'));
    }
    candidates.push(...entriesFromShellScripts(input.automation.shell_scripts ?? []));

    if (input.automation.devcontainer?.postCreateCommand) {
      candidates.push({
        op: 'setup',
        entry: {
          tier: 'wrapper',
          command: input.automation.devcontainer.postCreateCommand,
          description: 'Devcontainer postCreateCommand.',
          source: '.devcontainer/devcontainer.json',
        },
      });
    }
    if (input.automation.devcontainer?.postStartCommand) {
      candidates.push({
        op: 'start_dev',
        entry: {
          tier: 'wrapper',
          command: input.automation.devcontainer.postStartCommand,
          description: 'Devcontainer postStartCommand.',
          source: '.devcontainer/devcontainer.json',
        },
      });
    }
  }

  candidates.push(...entriesFromReadme(input.readme_run_sections ?? []));
  candidates.push(...entriesFromPackageManagerCandidates(input.package_manager_commands ?? []));
  candidates.push(...entriesFromCiHints(input.automation?.ci_hints ?? []));

  // Group by op
  const grouped = new Map<CommandCatalogOperation, CommandCatalogEntry[]>();
  for (const { op, entry } of candidates) {
    const list = grouped.get(op) ?? [];
    list.push(entry);
    grouped.set(op, list);
  }

  // Stable sort + dedupe per operation
  const catalog: Partial<Record<CommandCatalogOperation, CommandCatalogEntry[]>> = {};
  for (const [op, entries] of grouped) {
    const sorted = [...entries].sort(compareEntries);
    const deduped: CommandCatalogEntry[] = [];
    const seen = new Set<string>();
    for (const e of sorted) {
      const key = `${e.tier}::${e.command}::${e.source}::${e.per_service ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }
    if (deduped.length > 0) catalog[op] = deduped;
  }

  return catalog as CommandCatalog;
}

function compareEntries(a: CommandCatalogEntry, b: CommandCatalogEntry): number {
  const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
  if (tierDiff !== 0) return tierDiff;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  if (a.command !== b.command) return a.command < b.command ? -1 : 1;
  return 0;
}

/**
 * Return the preferred entry for an operation (the first entry of
 * the catalog's array for that op). Convenience helper for skills
 * and renderers that want the canonical command.
 */
export function preferredCommand(
  catalog: CommandCatalog,
  op: CommandCatalogOperation,
): CommandCatalogEntry | undefined {
  return catalog[op]?.[0];
}
