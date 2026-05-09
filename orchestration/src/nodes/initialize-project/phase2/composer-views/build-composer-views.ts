/**
 * Plan v4 Phase E — build the four composer views from Phase 1 outputs +
 * Phase 1.5 per-service slices.
 *
 * The synthesizer (Phase 3) reads ONE view per output section. By
 * pre-flattening here we eliminate the synthesizer's investigation
 * surface — it composes deterministically over already-merged data.
 *
 * Stack-agnostic by construction: every leaf string flows through
 * verbatim. The merge logic uses universal structural categorisation
 * (the structure analyzer's `service.type` enum), never matches on
 * service names, framework strings, or language tokens.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  ArchitectureNarrativeViewSchema,
  CodeConventionsViewSchema,
  COMPOSER_VIEWS_SCHEMA_VERSION,
  ComposerViewsBundleSchema,
  MultiFileWorkflowsViewSchema,
  TestingConventionsViewSchema,
  type ArchitectureNarrativeView,
  type CodeConventionsView,
  type ComposerServiceRef,
  type ComposerViewsBundle,
  type MultiFileWorkflowsView,
  type TestingConventionsView,
} from '../../../../schemas/composer-views.schema.js';
import {
  ServiceDetailIndexSchema,
  ServiceDetailSliceSchema,
  type ServiceDetailSlice,
} from '../../../../schemas/service-detail-slice.schema.js';
import type {
  CodeSnippet,
  NeedsVerificationEntry,
} from '../../../../schemas/phase1-base.schema.js';

/**
 * Phase 1 + Phase 1.5 inputs for the builder. The orchestrator reads
 * the four analyzer JSONs from disk and the per-service slices via the
 * `_index.json` manifest; this function takes the parsed shape so unit
 * tests can drive it without filesystem I/O.
 */
export interface BuildComposerViewsInput {
  structure: AnalyzerOutputLike;
  techStack: AnalyzerOutputLike;
  codePatterns: AnalyzerOutputLike;
  dataFlows: AnalyzerOutputLike;
  /** Per-service slices keyed by canonical service id. Empty when none. */
  serviceSlices: Record<string, ServiceDetailSlice>;
  /** Provided by the caller for deterministic snapshots. */
  generatedAt: string;
}

/**
 * Loose shape — every analyzer's output flows through here as parsed
 * JSON. The builder reads only the fields it knows about; unknown
 * fields pass through untouched.
 */
export type AnalyzerOutputLike = Record<string, unknown> | undefined;

export function buildComposerViews(input: BuildComposerViewsInput): ComposerViewsBundle {
  const services = extractServiceRefs(input.structure);
  const generatedAt = input.generatedAt;

  const codeConventions = buildCodeConventionsView(input, services, generatedAt);
  const multiFileWorkflows = buildMultiFileWorkflowsView(input, services, generatedAt);
  const testingConventions = buildTestingConventionsView(input, services, generatedAt);
  const architectureNarrative = buildArchitectureNarrativeView(input, services, generatedAt);
  const needsVerification = collectNeedsVerification(input);

  const bundle = {
    schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
    generated_at: generatedAt,
    code_conventions: codeConventions,
    multi_file_workflows: multiFileWorkflows,
    testing_conventions: testingConventions,
    architecture_narrative: architectureNarrative,
    needs_verification: needsVerification,
  };

  // Validate before returning so a builder bug surfaces here, not in
  // the synthesizer's Read.
  return ComposerViewsBundleSchema.parse(bundle);
}

/**
 * Disk-first wrapper: reads phase1 outputs + service-details index +
 * each slice, then calls the pure builder. Returns the bundle so the
 * caller can persist it.
 *
 * On a missing input file the function throws — Phase 2 cannot run
 * without Phase 1 output, and a missing service slice means Phase 1.5
 * was never run (or was reset). The caller surfaces this as an
 * actionable error.
 *
 * Missing PER-SERVICE slices (i.e. some services have detail-extractor
 * output and some don't) are tolerated — the builder fills the empty
 * service entries with empty arrays + `present.*: false` so the
 * synthesizer simply skips those sections.
 */
export function buildComposerViewsFromDisk(
  tempDir: string,
  generatedAt: string,
): ComposerViewsBundle {
  const phase1Dir = join(tempDir, 'phase1-outputs');
  const structure = readJsonOrThrow(join(phase1Dir, '01-structure-architecture.json'));
  const techStack = readJsonOrThrow(join(phase1Dir, '02-tech-stack-dependencies.json'));
  const codePatterns = readJsonOrThrow(join(phase1Dir, '03-code-patterns-testing.json'));
  const dataFlows = readJsonOrThrow(join(phase1Dir, '04-data-flows-integrations.json'));

  const sliceDir = join(tempDir, 'service-details');
  const serviceSlices = readServiceSlices(sliceDir);

  return buildComposerViews({
    structure,
    techStack,
    codePatterns,
    dataFlows,
    serviceSlices,
    generatedAt,
  });
}

/* --------------------------------------------------------------------- */
/* Service-ref extraction (used by every view)                           */
/* --------------------------------------------------------------------- */

function extractServiceRefs(structure: AnalyzerOutputLike): ComposerServiceRef[] {
  const findings = getRecord(structure, 'findings');
  const raw = getArray(findings, 'services');
  const refs: ComposerServiceRef[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = stringOrEmpty(entry.id);
    if (!id) continue;
    refs.push({
      id,
      path: stringOrEmpty(entry.path),
      type: optionalString(entry.type),
      language: optionalString(entry.language),
    });
  }
  return refs;
}

/* --------------------------------------------------------------------- */
/* code-conventions view                                                  */
/* --------------------------------------------------------------------- */

function buildCodeConventionsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): CodeConventionsView {
  const codePatterns = getRecord(input.codePatterns, 'findings');
  const enforcementSummary = optionalString(
    getRecord(codePatterns, 'quality_tools')?.enforcement_summary,
  );

  const byService: CodeConventionsView['by_service'] = {};
  let anyServicePatterns = false;
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    if (!slice) continue;
    const patterns = slice.findings.code_patterns ?? [];
    const notable = slice.findings.notable ?? [];
    if (patterns.length === 0 && notable.length === 0) continue;
    byService[svc.id] = {
      code_patterns: patterns as CodeSnippet[],
      notable: [...notable],
    };
    if (patterns.length > 0) anyServicePatterns = true;
  }

  return CodeConventionsViewSchema.parse({
    schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
    generated_at: generatedAt,
    services,
    by_service: byService,
    enforcement_summary: enforcementSummary,
    present: {
      any_service_patterns: anyServicePatterns,
      enforcement_summary: !!enforcementSummary,
    },
  });
}

/* --------------------------------------------------------------------- */
/* multi-file-workflows view                                              */
/* --------------------------------------------------------------------- */

function buildMultiFileWorkflowsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): MultiFileWorkflowsView {
  const dataFlows = getRecord(input.dataFlows, 'findings');
  const eventPipeline = parseFlow(dataFlows?.event_pipeline);
  const authFlow = parseFlow(dataFlows?.auth_flow);

  const byService: MultiFileWorkflowsView['by_service'] = {};
  let anyRequestLifecycle = false;
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    if (!slice) continue;
    const lifecycle = slice.findings.request_lifecycle ?? [];
    if (lifecycle.length === 0) continue;
    byService[svc.id] = { request_lifecycle: [...lifecycle] };
    anyRequestLifecycle = true;
  }

  return MultiFileWorkflowsViewSchema.parse({
    schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
    generated_at: generatedAt,
    services,
    by_service: byService,
    event_pipeline: eventPipeline,
    auth_flow: authFlow,
    present: {
      any_request_lifecycle: anyRequestLifecycle,
      event_pipeline: !!eventPipeline,
      auth_flow: !!authFlow,
    },
  });
}

function parseFlow(raw: unknown): { summary: string; examples: CodeSnippet[] } | undefined {
  if (!isRecord(raw)) return undefined;
  const summary = stringOrEmpty(raw.summary);
  if (!summary) return undefined;
  const examples = getArray(raw, 'examples')
    .filter(isRecord)
    .map((s) => parseSnippet(s))
    .filter((s): s is CodeSnippet => s !== null);
  return { summary, examples };
}

function parseSnippet(raw: Record<string, unknown>): CodeSnippet | null {
  const kind = stringOrEmpty(raw.kind);
  const language = stringOrEmpty(raw.language);
  const code = stringOrEmpty(raw.code);
  if (!kind || !language || !code) return null;
  const snippet: CodeSnippet = { kind, language, code };
  const sourceFile = optionalString(raw.source_file);
  if (sourceFile) snippet.source_file = sourceFile;
  const sourceLine = typeof raw.source_line === 'number' ? raw.source_line : undefined;
  if (typeof sourceLine === 'number' && sourceLine > 0 && Number.isInteger(sourceLine)) {
    snippet.source_line = sourceLine;
  }
  const note = optionalString(raw.note);
  if (note) snippet.note = note;
  return snippet;
}

/* --------------------------------------------------------------------- */
/* testing-conventions view                                              */
/* --------------------------------------------------------------------- */

function buildTestingConventionsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): TestingConventionsView {
  const codePatterns = getRecord(input.codePatterns, 'findings');
  const testing = getRecord(codePatterns, 'testing');
  const projectSummary = optionalString(testing?.summary ?? testing?.notes);
  const runners = getArray(testing, 'runners')
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .map(String);

  const byService: TestingConventionsView['by_service'] = {};
  let anyServiceTests = false;
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    if (!slice?.findings.testing) continue;
    const examples = slice.findings.testing.representative_examples ?? [];
    const notes = slice.findings.testing.notes;
    if (examples.length === 0 && !notes) continue;
    byService[svc.id] = {
      representative_examples: [...examples],
      notes,
    };
    if (examples.length > 0) anyServiceTests = true;
  }

  const projectLevel =
    projectSummary || runners.length > 0 ? { summary: projectSummary, runners } : undefined;

  return TestingConventionsViewSchema.parse({
    schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
    generated_at: generatedAt,
    services,
    by_service: byService,
    project_level: projectLevel,
    present: {
      any_service_tests: anyServiceTests,
      project_summary: !!projectSummary,
    },
  });
}

/* --------------------------------------------------------------------- */
/* architecture-narrative view                                           */
/* --------------------------------------------------------------------- */

function buildArchitectureNarrativeView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): ArchitectureNarrativeView {
  const structureFindings = getRecord(input.structure, 'findings');
  const techStackFindings = getRecord(input.techStack, 'findings');

  const repoShape = optionalString(structureFindings?.repository_shape_summary);
  const decisions = getArray(structureFindings, 'architecture_decisions')
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .map(String);

  const runtimeVersionsRaw = getRecord(techStackFindings, 'runtime_versions');
  const runtimeVersions: Record<string, string> = {};
  if (runtimeVersionsRaw) {
    for (const [k, v] of Object.entries(runtimeVersionsRaw)) {
      if (typeof v === 'string' && v.length > 0) runtimeVersions[k] = v;
    }
  }

  const externalServicesRaw = getArray(techStackFindings, 'external_services').filter(isRecord);
  const externalServices = externalServicesRaw
    .map((entry) => {
      const name = stringOrEmpty(entry.name);
      if (!name) return null;
      const item: { name: string; kind?: string; sample_usage_quote?: string } = { name };
      const kind = optionalString(entry.kind);
      if (kind) item.kind = kind;
      const quote = optionalString(entry.sample_usage_quote);
      if (quote) item.sample_usage_quote = quote;
      return item;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const byService: ArchitectureNarrativeView['by_service'] = {};
  let anyServiceNotable = false;
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    const notable = slice?.findings.notable ?? [];
    if (notable.length === 0) continue;
    byService[svc.id] = { notable: [...notable] };
    anyServiceNotable = true;
  }

  return ArchitectureNarrativeViewSchema.parse({
    schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
    generated_at: generatedAt,
    services,
    repository_shape_summary: repoShape,
    architecture_decisions: decisions,
    runtime_versions: runtimeVersions,
    external_services: externalServices,
    by_service: byService,
    present: {
      repository_shape_summary: !!repoShape,
      architecture_decisions: decisions.length > 0,
      runtime_versions: Object.keys(runtimeVersions).length > 0,
      external_services: externalServices.length > 0,
      any_service_notable: anyServiceNotable,
    },
  });
}

/* --------------------------------------------------------------------- */
/* needs_verification roll-up                                            */
/* --------------------------------------------------------------------- */

function collectNeedsVerification(input: BuildComposerViewsInput): NeedsVerificationEntry[] {
  const items: NeedsVerificationEntry[] = [];
  const sources: AnalyzerOutputLike[] = [
    input.structure,
    input.techStack,
    input.codePatterns,
    input.dataFlows,
  ];
  for (const src of sources) {
    const arr = getArray(src, 'needs_verification');
    for (const entry of arr) {
      if (isNeedsVerification(entry)) items.push(entry);
    }
  }
  for (const slice of Object.values(input.serviceSlices)) {
    for (const entry of slice.needs_verification ?? []) {
      items.push(entry);
    }
  }
  return items;
}

function isNeedsVerification(value: unknown): value is NeedsVerificationEntry {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.question !== 'string') return false;
  if (typeof value.reason !== 'string') return false;
  if (!Array.isArray(value.attempted_resolution)) return false;
  if (typeof value.impact !== 'string') return false;
  return true;
}

/* --------------------------------------------------------------------- */
/* I/O helpers (file-system access in one place — easy to mock)          */
/* --------------------------------------------------------------------- */

function readJsonOrThrow(path: string): AnalyzerOutputLike {
  if (!existsSync(path)) {
    throw new Error(`composer-views: required Phase 1 output missing at ${path}`);
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch (err) {
    throw new Error(
      `composer-views: failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function readServiceSlices(sliceDir: string): Record<string, ServiceDetailSlice> {
  const indexPath = join(sliceDir, '_index.json');
  if (!existsSync(indexPath)) return {};

  let parsedIndex: ReturnType<typeof ServiceDetailIndexSchema.safeParse>;
  try {
    parsedIndex = ServiceDetailIndexSchema.safeParse(JSON.parse(readFileSync(indexPath, 'utf-8')));
  } catch {
    return {};
  }
  if (!parsedIndex.success) return {};

  const slices: Record<string, ServiceDetailSlice> = {};
  for (const [serviceId] of Object.entries(parsedIndex.data.slices)) {
    const filePath = join(sliceDir, `${serviceId}.json`);
    if (!existsSync(filePath)) continue;
    try {
      const sliceJson = JSON.parse(readFileSync(filePath, 'utf-8'));
      const sliceParsed = ServiceDetailSliceSchema.safeParse(sliceJson);
      if (!sliceParsed.success) continue;
      if (sliceParsed.data.service_id !== serviceId) continue;
      slices[serviceId] = sliceParsed.data;
    } catch {
      // best-effort: a malformed slice falls back to "no slice for this service"
    }
  }
  return slices;
}

/* --------------------------------------------------------------------- */
/* Tiny utility helpers                                                  */
/* --------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const v = value[key];
  return isRecord(v) ? v : undefined;
}

function getArray(value: unknown, key?: string): unknown[] {
  const target = key ? (isRecord(value) ? value[key] : undefined) : value;
  return Array.isArray(target) ? target : [];
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0) return undefined;
  return value;
}
