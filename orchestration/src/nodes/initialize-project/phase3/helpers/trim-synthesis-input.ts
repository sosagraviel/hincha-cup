/**
 * Trim the Phase 2 consolidation blob to the synthesizer-relevant subset.
 *
 * Keeps `consolidated_gaps`, `consolidation_metadata`, and a curated
 * `summary` block (services, languages, runtimes, build_tools, etc.).
 * Drops raw per-analyzer outputs, per-service dependency lists, and
 * file_placement tables — the synthesizer can Read on demand if needed.
 *
 * Stack-agnostic: every kept field is a top-level shape; no
 * language-specific values are filtered or rewritten.
 */

import { basename } from 'path';
import { buildCatalogFromConsolidation } from './build-catalog-from-consolidation.js';
import { renderEssentialCommandsMarkdown } from '../../../../services/framework/command-catalog/render-essential-commands.js';
import { renderTechStackMarkdown } from '../../../../services/framework/synth-renderers/render-tech-stack.js';
import { renderServicesAndPortsMarkdown } from '../../../../services/framework/synth-renderers/render-services-and-ports.js';
import { renderDirectoryStructureMarkdown } from '../../../../services/framework/synth-renderers/render-directory-structure.js';
import type {
  Automation,
  CommandCatalog,
  ReadmeRunSectionEntry,
} from '../../../../schemas/stack-profile.schema.js';

interface CuratedSynthesisInput {
  consolidated_gaps: unknown;
  consolidation_metadata: unknown;
  summary: {
    services: Array<{
      id: string;
      type?: string;
      language?: string;
      framework_main?: string;
      path?: string;
      port?: number;
      port_applies?: boolean;
      port_applies_reason?: string;
    }>;
    infrastructure_services?: Array<{
      id: string;
      type?: string;
      name?: string;
      role?: string;
      port?: number;
      port_applies?: boolean;
      port_applies_reason?: string;
    }>;
    languages?: unknown;
    repository_type?: unknown;
    monorepo?: unknown;
    runtimes?: unknown;
    build_tools?: unknown;
    architecture_pattern?: unknown;
  };
  command_catalog: CommandCatalog;
  /** Pre-rendered `## Essential Commands` markdown. The synthesizer copies this verbatim. */
  essential_commands_markdown: string;
  tech_stack_markdown: string;
  services_and_ports_markdown: string;
  directory_structure_markdown: string;
  automation?: Automation;
  readme_run_sections?: ReadmeRunSectionEntry[];
}

/**
 * Trim the consolidation blob to the synthesizer-relevant subset.
 * Pure function — no side effects. Returns a new object; the input
 * is not mutated.
 */
export function trimSynthesisInput(consolidation: unknown): CuratedSynthesisInput {
  const root = isObject(consolidation) ? consolidation : {};
  const sources = collectFindingsSources(root);

  let servicesRaw: unknown[] | null = null;
  for (const src of sources) {
    servicesRaw = pickServices(src);
    if (servicesRaw && servicesRaw.length > 0) break;
  }
  servicesRaw = servicesRaw ?? [];
  const services: CuratedSynthesisInput['summary']['services'] = [];
  for (const s of servicesRaw) {
    if (!isObject(s)) continue;
    const id = typeof s.id === 'string' ? s.id : typeof s.name === 'string' ? s.name : null;
    if (!id) continue;
    const entry: CuratedSynthesisInput['summary']['services'][number] = { id };
    if (typeof s.type === 'string') entry.type = s.type;
    if (typeof s.language === 'string') entry.language = s.language;
    if (typeof s.path === 'string' && s.path.length > 0) entry.path = s.path;
    if (isObject(s.frameworks) && typeof s.frameworks.main === 'string') {
      entry.framework_main = s.frameworks.main;
    }
    if (isObject(s.environment)) {
      const env = s.environment;
      if (typeof env.port === 'number' && env.port > 0) entry.port = env.port;
      if (env.port_applies === false) entry.port_applies = false;
      if (typeof env.port_applies_reason === 'string')
        entry.port_applies_reason = env.port_applies_reason;
    }
    services.push(entry);
  }

  const infrastructureRaw = firstFromSources(sources, 'infrastructure_services');
  const infrastructureServices: NonNullable<
    CuratedSynthesisInput['summary']['infrastructure_services']
  > = [];
  if (Array.isArray(infrastructureRaw)) {
    for (const item of infrastructureRaw) {
      if (!isObject(item)) continue;
      if (typeof item.id !== 'string' || item.id.length === 0) continue;
      const entry: NonNullable<
        CuratedSynthesisInput['summary']['infrastructure_services']
      >[number] = { id: item.id };
      if (typeof item.type === 'string') entry.type = item.type;
      if (typeof item.name === 'string') entry.name = item.name;
      if (typeof item.role === 'string') entry.role = item.role;
      if (typeof item.port === 'number' && item.port > 0) entry.port = item.port;
      if (item.port_applies === false) entry.port_applies = false;
      if (typeof item.port_applies_reason === 'string') {
        entry.port_applies_reason = item.port_applies_reason;
      }
      infrastructureServices.push(entry);
    }
  }

  const bundle = buildCatalogFromConsolidation(consolidation);

  const summary = {
    services,
    ...(infrastructureServices.length > 0
      ? { infrastructure_services: infrastructureServices }
      : {}),
    languages: firstFromSources(sources, 'languages'),
    repository_type: firstFromSources(sources, 'repository_type'),
    monorepo: firstFromSources(sources, 'monorepo', 'monorepo_layout'),
    runtimes: firstFromSources(sources, 'runtimes'),
    build_tools: firstFromSources(sources, 'build_tools'),
    architecture_pattern: firstFromSources(sources, 'architecture_pattern'),
  } as CuratedSynthesisInput['summary'];

  const meta = pickConsolidationMetadata(root);
  const projectName = deriveProjectName(meta) ?? 'project';

  const result: CuratedSynthesisInput = {
    consolidated_gaps: pickConsolidatedGaps(root),
    consolidation_metadata: meta,
    summary,
    command_catalog: bundle.command_catalog,
    essential_commands_markdown: renderEssentialCommandsMarkdown(bundle.command_catalog, {
      fallbackPlaceholder: true,
    }),
    tech_stack_markdown: renderTechStackMarkdown({
      languages: summary.languages,
      runtimes: summary.runtimes,
      services: summary.services,
      build_tools: summary.build_tools,
      monorepo: summary.monorepo,
    }),
    services_and_ports_markdown: renderServicesAndPortsMarkdown({
      services: summary.services,
      infrastructure_services: summary.infrastructure_services,
    }),
    directory_structure_markdown: renderDirectoryStructureMarkdown({
      projectName,
      services: summary.services,
    }),
  };
  if (bundle.automation) result.automation = bundle.automation;
  if (bundle.readme_run_sections) result.readme_run_sections = bundle.readme_run_sections;
  return result;
}

/**
 * Collect ordered findings-shape sources from a Phase 2 consolidation
 * blob. Mirrors the helper in `build-catalog-from-consolidation.ts`
 * to keep the navigation contract consistent across both consumers.
 */
function collectFindingsSources(root: Record<string, unknown>): Record<string, unknown>[] {
  const sources: Record<string, unknown>[] = [];
  if (isObject(root.consolidated_findings)) {
    for (const value of Object.values(root.consolidated_findings)) {
      if (!isObject(value)) continue;
      if (isObject(value.findings)) sources.push(value.findings);
      sources.push(value);
    }
    sources.push(root.consolidated_findings);
  }
  if (isObject(root.findings)) sources.push(root.findings);
  sources.push(root);
  return sources;
}

function firstFromSources(sources: Record<string, unknown>[], ...keys: string[]): unknown {
  for (const src of sources) {
    for (const key of keys) {
      const v = src[key];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

function deriveProjectName(meta: unknown): string | undefined {
  if (!isObject(meta)) return undefined;
  const pp = meta.project_path;
  if (typeof pp === 'string' && pp.length > 0) {
    const slash = pp.lastIndexOf('/');
    return slash >= 0 ? pp.slice(slash + 1) : pp;
  }
  if (typeof meta.project_name === 'string') return meta.project_name;
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pickServices(obj: Record<string, unknown> | undefined): unknown[] | null {
  if (!obj) return null;
  const candidates = [obj.services, obj.consolidated_findings];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (isObject(c)) {
      const nested = (c as Record<string, unknown>).services;
      if (Array.isArray(nested)) return nested;
    }
  }
  return null;
}

function pickConsolidatedGaps(root: Record<string, unknown>): unknown {
  if (Array.isArray(root.consolidated_gaps)) return root.consolidated_gaps;
  if (Array.isArray(root.gaps)) return root.gaps;
  return [];
}

function pickConsolidationMetadata(root: Record<string, unknown>): unknown {
  if (isObject(root.consolidation_metadata)) return root.consolidation_metadata;
  if (isObject(root.question_consolidation)) return root.question_consolidation;
  return {};
}

function pickFirst(...candidates: unknown[]): unknown {
  for (const c of candidates) {
    if (c !== undefined && c !== null) return c;
  }
  return undefined;
}
