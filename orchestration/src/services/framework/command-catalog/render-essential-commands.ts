/**
 * Pre-render the `## Essential Commands` markdown block so the synthesizer
 * copies a string instead of doing tier-ordering arithmetic.
 *
 * Stack-agnostic by construction — every input field is structural.
 */

import type {
  CommandCatalog,
  CommandCatalogEntry,
  CommandCatalogOperation,
} from '../../../schemas/stack-profile.schema.js';

/**
 * Human-readable action labels for the `Essential Commands` table.
 * Used as the Description fallback when a command carries no source
 * comment, and as the per-service subtable's operation column headers.
 * Keys mirror `CommandCatalogOperation` exactly; unknown operations
 * fall through to a title-cased rendering of the key.
 */
const ACTION_LABELS: Record<CommandCatalogOperation, string> = {
  setup: 'Setup',
  start_dev: 'Start dev environment',
  run_tests: 'Run tests',
  run_unit_tests: 'Run unit tests',
  run_integration_tests: 'Run integration tests',
  run_e2e: 'Run e2e tests',
  run_lint: 'Run linters',
  run_format: 'Format',
  run_typecheck: 'Run type-checker',
  run_build: 'Build',
  run_migrations: 'Run migrations',
  generate_migration: 'Generate migration',
  revert_migration: 'Revert migration',
  seed: 'Seed database',
  reset: 'Reset environment',
};

function labelFor(op: string): string {
  if (op in ACTION_LABELS) return ACTION_LABELS[op as CommandCatalogOperation];
  return op
    .split('_')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

/**
 * Render the `## Essential Commands` markdown block from a
 * `command_catalog`. Returns the empty string when the catalog is
 * empty and `fallbackPlaceholder` is `false`; otherwise emits a
 * placeholder row signalling "no commands discovered".
 *
 * Output shape — always wrapper rows first in the main table, then
 * an optional per-service subtable below for `package_manager`-tier
 * fallbacks. Operations whose ONLY available tier is `package_manager`
 * appear directly in the main table (with the per-service rendering
 * collapsed to one row per service).
 *
 * The block always starts with `## Essential Commands` and ends with
 * a trailing newline.
 */
export function renderEssentialCommandsMarkdown(
  catalog: CommandCatalog,
  options: { fallbackPlaceholder?: boolean } = {},
): string {
  const ops = Object.keys(catalog ?? {}) as CommandCatalogOperation[];
  const out: string[] = ['## Essential Commands', ''];

  if (ops.length === 0) {
    if (!options.fallbackPlaceholder) return '';
    pushNoCommandsPlaceholder(out);
    return out.join('\n');
  }

  type Grouped = {
    op: CommandCatalogOperation;
    wrapper: CommandCatalogEntry | undefined;
    readme: CommandCatalogEntry | undefined;
    packageManagerRows: CommandCatalogEntry[];
    ci: CommandCatalogEntry | undefined;
  };
  const grouped: Grouped[] = ops.map((op) => {
    const entries = catalog[op] ?? [];
    return {
      op,
      wrapper: entries.find((e) => e.tier === 'wrapper'),
      readme: entries.find((e) => e.tier === 'readme'),
      packageManagerRows: entries.filter((e) => e.tier === 'package_manager'),
      ci: entries.find((e) => e.tier === 'ci'),
    };
  });

  out.push('| Command | Description |');
  out.push('| ------- | ----------- |');
  let mainTableRows = 0;
  for (const g of grouped) {
    const top = g.wrapper ?? g.readme ?? g.ci;
    if (top) {
      out.push(`| \`${top.command}\` | ${describeCommand(top.description, g.op)} |`);
      mainTableRows += 1;
      continue;
    }
    for (const pm of g.packageManagerRows) {
      out.push(`| \`${pm.command}\` | ${describeCommand(pm.description, g.op, pm.per_service)} |`);
      mainTableRows += 1;
    }
  }

  if (mainTableRows === 0) {
    out.length = 2;
    if (!options.fallbackPlaceholder) return '';
    pushNoCommandsPlaceholder(out);
    return out.join('\n');
  }

  const subtableRows: Array<{ op: CommandCatalogOperation; entry: CommandCatalogEntry }> = [];
  for (const g of grouped) {
    if (!g.wrapper && !g.readme && !g.ci) continue;
    for (const pm of g.packageManagerRows) {
      subtableRows.push({ op: g.op, entry: pm });
    }
  }
  if (subtableRows.length > 0) {
    out.push('');
    out.push('### Per-service commands (low-level)');
    out.push('');
    out.push(
      '> Prefer the wrapper above when present; these run a single service in isolation and may not start dependent services.',
    );
    out.push('');
    const opsInSub = Array.from(new Set(subtableRows.map((r) => r.op)));
    const services = Array.from(new Set(subtableRows.map((r) => r.entry.per_service ?? '—')));
    out.push(`| Service | ${opsInSub.map(labelFor).join(' | ')} |`);
    out.push(`| ------- | ${opsInSub.map(() => '---').join(' | ')} |`);
    for (const svc of services) {
      const cells = opsInSub.map((op) => {
        const row = subtableRows.find((r) => r.op === op && (r.entry.per_service ?? '—') === svc);
        return row ? `\`${row.entry.command}\`` : '—';
      });
      out.push(`| ${svc} | ${cells.join(' | ')} |`);
    }
  }

  out.push('');
  return out.join('\n');
}

function cleanDescription(raw: string | undefined): string {
  if (!raw) return '—';
  return raw.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve the `Description` cell for a command row. Prefers the source
 * comment (Makefile / README / package-manager script text); when none
 * exists, falls back to the human action label so the row never renders
 * a bare `—`. A `per_service` marker is appended in parentheses to keep
 * single-service disambiguation that the dropped Action column carried.
 */
function describeCommand(
  raw: string | undefined,
  op: CommandCatalogOperation,
  perService?: string,
): string {
  const cleaned = cleanDescription(raw);
  const text = cleaned !== '—' ? cleaned : labelFor(op);
  return perService ? `${text} (${perService})` : text;
}

/**
 * Emit the 2-column "no commands discovered" placeholder block,
 * including its trailing blank line.
 */
function pushNoCommandsPlaceholder(out: string[]): void {
  out.push('| Command | Description |');
  out.push('| ------- | ----------- |');
  out.push('| (no commands discovered) | (run analyzers manually to verify) |');
  out.push('');
}
