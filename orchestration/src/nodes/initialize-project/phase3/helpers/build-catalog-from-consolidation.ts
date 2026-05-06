/**
 * Plan 15 §D.4 — assemble the deterministic `CommandCatalog` from
 * the Phase 2 consolidation blob, in the small window between
 * Phase 2 and Phase 3.
 *
 * The catalog is built BEFORE the closed-book synthesizer sees the
 * data. The synthesizer renders the catalog verbatim — it never
 * decides tier ordering itself. That responsibility lives here, in
 * deterministic TypeScript.
 *
 * Inputs the helper extracts from `consolidated_findings`:
 *   - `automation` — populated by the structure-architecture
 *     analyzer (Tier 1 wrapper entry points).
 *   - `readme_run_sections` — populated by the same analyzer
 *     (Tier 2 verbatim README extracts).
 *   - `build_tools.<service_id>` — populated by the tech-stack
 *     analyzer (per-service lint/format/test/build commands; the
 *     Tier 3 package-manager surface).
 *   - `documented_commands.by_task` — cross-service top-level
 *     commands documented anywhere; treated as Tier 3 candidates
 *     without `per_service`.
 *   - `databases[].migration_commands` — Tier 3 migration
 *     candidates.
 *
 * Stack-agnostic. The shapes consumed are the analyzer schemas; no
 * language-specific tokens are filtered or rewritten.
 */

import {
  buildCommandCatalog,
  type PackageManagerCandidate,
} from '../../../../services/framework/command-catalog/command-catalog-builder.js';
import type {
  Automation,
  CommandCatalog,
  ReadmeRunSectionEntry,
} from '../../../../schemas/stack-profile.schema.js';

export interface BuiltCatalogBundle {
  automation?: Automation;
  readme_run_sections?: ReadmeRunSectionEntry[];
  command_catalog: CommandCatalog;
}

/**
 * Assemble the Plan-15 catalog bundle from a Phase 2 consolidation
 * blob. Defensive against schema variation: every input is read
 * with `isObject` / `Array.isArray` guards.
 */
export function buildCatalogFromConsolidation(consolidation: unknown): BuiltCatalogBundle {
  const root = isObject(consolidation) ? consolidation : {};
  const findings = isObject(root.consolidated_findings)
    ? root.consolidated_findings
    : isObject(root.findings)
      ? root.findings
      : {};

  const automation = pickAutomation(findings, root);
  const readmeRunSections = pickReadmeRunSections(findings, root);
  const packageManagerCommands = collectPackageManagerCandidates(findings, root);

  const catalog = buildCommandCatalog({
    automation,
    readme_run_sections: readmeRunSections,
    package_manager_commands: packageManagerCommands,
  });

  const bundle: BuiltCatalogBundle = { command_catalog: catalog };
  if (automation) bundle.automation = automation;
  if (readmeRunSections && readmeRunSections.length > 0) {
    bundle.readme_run_sections = readmeRunSections;
  }
  return bundle;
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

function pickAutomation(...sources: Record<string, unknown>[]): Automation | undefined {
  for (const src of sources) {
    const a = src.automation;
    if (!isObject(a)) continue;
    return {
      makefiles: cleanFileArray(a.makefiles),
      justfiles: cleanFileArray(a.justfiles),
      taskfiles: cleanFileArray(a.taskfiles),
      shell_scripts: cleanShellScripts(a.shell_scripts),
      devcontainer: cleanDevcontainer(a.devcontainer),
      ci_hints: cleanCiHints(a.ci_hints),
    };
  }
  return undefined;
}

function cleanFileArray(v: unknown): Automation['makefiles'] {
  if (!Array.isArray(v)) return [];
  const out: Automation['makefiles'] = [];
  for (const f of v) {
    if (!isObject(f)) continue;
    if (typeof f.path !== 'string' || f.path.length === 0) continue;
    if (!Array.isArray(f.targets)) continue;
    const targets: NonNullable<Automation['makefiles']>[number]['targets'] = [];
    for (const t of f.targets) {
      if (!isObject(t)) continue;
      if (typeof t.name !== 'string' || t.name.length === 0) continue;
      const target: (typeof targets)[number] = { name: t.name };
      if (typeof t.group === 'string') target.group = t.group;
      if (typeof t.description === 'string') target.description = t.description;
      targets.push(target);
    }
    out.push({ path: f.path, targets });
  }
  return out;
}

function cleanShellScripts(v: unknown): Automation['shell_scripts'] {
  if (!Array.isArray(v)) return [];
  const validPurposes = ['setup', 'bootstrap', 'dev', 'test', 'reset', 'unknown'] as const;
  const out: Automation['shell_scripts'] = [];
  for (const s of v) {
    if (!isObject(s)) continue;
    if (typeof s.path !== 'string' || s.path.length === 0) continue;
    const rawPurpose =
      typeof s.purpose === 'string' && (validPurposes as readonly string[]).includes(s.purpose)
        ? (s.purpose as (typeof validPurposes)[number])
        : ('unknown' as const);
    const entry: NonNullable<Automation['shell_scripts']>[number] = {
      path: s.path,
      purpose: rawPurpose,
    };
    if (typeof s.shebang === 'string') entry.shebang = s.shebang;
    out.push(entry);
  }
  return out;
}

function cleanDevcontainer(v: unknown): Automation['devcontainer'] | undefined {
  if (!isObject(v)) return undefined;
  const out: NonNullable<Automation['devcontainer']> = {};
  if (typeof v.postCreateCommand === 'string') out.postCreateCommand = v.postCreateCommand;
  if (typeof v.postStartCommand === 'string') out.postStartCommand = v.postStartCommand;
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanCiHints(v: unknown): Automation['ci_hints'] {
  if (!Array.isArray(v)) return [];
  const out: Automation['ci_hints'] = [];
  for (const h of v) {
    if (!isObject(h)) continue;
    if (typeof h.file !== 'string' || h.file.length === 0) continue;
    if (!Array.isArray(h.commands)) continue;
    const commands = h.commands.filter(
      (c: unknown): c is string => typeof c === 'string' && c.length > 0,
    );
    if (commands.length === 0) continue;
    out.push({ file: h.file, commands });
  }
  return out;
}

// ---------------------------------------------------------------------------
// README run sections
// ---------------------------------------------------------------------------

function pickReadmeRunSections(
  ...sources: Record<string, unknown>[]
): ReadmeRunSectionEntry[] | undefined {
  for (const src of sources) {
    const r = src.readme_run_sections;
    if (!Array.isArray(r)) continue;
    const out: ReadmeRunSectionEntry[] = [];
    for (const s of r) {
      if (!isObject(s)) continue;
      if (typeof s.path !== 'string' || typeof s.heading !== 'string') continue;
      if (typeof s.body !== 'string') continue;
      const fenced = Array.isArray(s.fenced_blocks)
        ? s.fenced_blocks.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      out.push({ path: s.path, heading: s.heading, body: s.body, fenced_blocks: fenced });
    }
    if (out.length > 0) return out;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Package-manager candidates
// ---------------------------------------------------------------------------

const BUILD_TOOL_COMMAND_KEYS: Array<{ key: string; script_name: string }> = [
  { key: 'lint_command', script_name: 'lint' },
  { key: 'format_command', script_name: 'format' },
  { key: 'test_command', script_name: 'test' },
  { key: 'build_command', script_name: 'build' },
  { key: 'typecheck_command', script_name: 'typecheck' },
  { key: 'dev_command', script_name: 'dev' },
];

function collectPackageManagerCandidates(
  ...sources: Record<string, unknown>[]
): PackageManagerCandidate[] {
  const out: PackageManagerCandidate[] = [];

  for (const src of sources) {
    // build_tools.<service>.lint_command / format_command / test_command / build_command
    if (isObject(src.build_tools)) {
      for (const [serviceId, bt] of Object.entries(src.build_tools)) {
        if (!isObject(bt)) continue;
        const configFile = typeof bt.config_file === 'string' ? bt.config_file : `${serviceId}`;
        for (const { key, script_name } of BUILD_TOOL_COMMAND_KEYS) {
          const cmd = bt[key];
          if (typeof cmd !== 'string' || cmd.trim().length === 0) continue;
          out.push({
            service_id: serviceId,
            script_name,
            command: cmd.trim(),
            source: configFile,
          });
        }
      }
    }

    // documented_commands.by_task — root-level commands
    if (isObject(src.documented_commands) && isObject(src.documented_commands.by_task)) {
      for (const [task, cmd] of Object.entries(src.documented_commands.by_task)) {
        if (typeof cmd !== 'string' || cmd.trim().length === 0) continue;
        out.push({
          service_id: '_root',
          script_name: task,
          command: cmd.trim(),
          source:
            typeof src.documented_commands.source === 'string'
              ? `documented_commands(${src.documented_commands.source})`
              : 'documented_commands',
        });
      }
    }

    // databases[].migration_commands — `run_migrations`-class candidates
    if (Array.isArray(src.databases)) {
      for (const db of src.databases) {
        if (!isObject(db)) continue;
        if (!Array.isArray(db.migration_commands)) continue;
        const migrationTool =
          typeof db.migration_tool === 'string' ? db.migration_tool : 'migrations';
        for (const cmd of db.migration_commands) {
          if (typeof cmd !== 'string' || cmd.trim().length === 0) continue;
          out.push({
            service_id: '_database',
            script_name: 'migrate',
            command: cmd.trim(),
            source: migrationTool,
          });
        }
      }
    }

    // monorepo.build_all_command / test_all_command — cross-service
    if (isObject(src.monorepo)) {
      const configHint =
        typeof src.monorepo.workspace_config === 'string'
          ? src.monorepo.workspace_config
          : 'monorepo';
      const buildAll = src.monorepo.build_all_command;
      if (typeof buildAll === 'string' && buildAll.trim().length > 0) {
        out.push({
          service_id: '_monorepo',
          script_name: 'build',
          command: buildAll.trim(),
          source: configHint,
        });
      }
      const testAll = src.monorepo.test_all_command;
      if (typeof testAll === 'string' && testAll.trim().length > 0) {
        out.push({
          service_id: '_monorepo',
          script_name: 'test',
          command: testAll.trim(),
          source: configHint,
        });
      }
    }

    // ci_cd.test_commands / build_commands / deploy_commands — Tier 4 (CI)
    // NOTE: these are handled as Tier-1 ci_hints would be, but the analyzer
    // emits them on a different shape. We don't add them as Tier-3 here —
    // doing so would inflate the package_manager rows with CI-only commands.
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
