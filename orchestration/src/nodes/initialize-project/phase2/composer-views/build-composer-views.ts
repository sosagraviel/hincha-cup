/**
 * Build the four composer views from Phase 1 outputs + Phase 1.5 per-service
 * slices. The synthesizer (Phase 3) reads one view per output section; by
 * pre-flattening here the synthesizer composes deterministically over
 * already-merged data.
 *
 * Stack-agnostic: every leaf string flows through verbatim. Merge logic uses
 * structural categorisation (the structure analyzer's `service.type` enum) —
 * never matches on service names, framework strings, or language tokens.
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
  CodeSnippetWithCitation,
  NeedsVerificationEntry,
} from '../../../../schemas/phase1-base.schema.js';
import type { ProjectInspection } from '../../../../schemas/project-inspection.schema.js';
import {
  deriveAuthFlow,
  deriveEnforcementSummary,
  deriveEventPipeline,
  deriveExternalServices,
  deriveQualityTools,
  deriveRepositoryShapeSummary,
  deriveTestingFrameworksByService,
  deriveTestingProjectSummary,
  deriveTestingRunners,
} from '../../../../services/framework/composer-derivation/index.js';

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
  /**
   * Phase 0 project-inspection JSON. When provided, the composer's
   * deterministic-derivation layer fills sub-sections that the slice +
   * analyzer paths left empty. Stack-agnostic: derivation flows through
   * the language-config registry.
   */
  inspection?: ProjectInspection;
  /**
   * Absolute project path. Only used by the derivation layer to
   * file-presence-check pre-commit signals (`.husky/`,
   * `.pre-commit-config.yaml`). When absent, pre-commit detection falls
   * back to dep-token signals.
   */
  projectPath?: string;
  /**
   * Phase 4 file-count summary. Enables per-language stats in
   * `repository_shape_summary`.
   */
  fileCounts?: ReadonlyArray<{ language: string; count: number }>;
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
  options: {
    projectPath?: string;
    fileCounts?: ReadonlyArray<{ language: string; count: number }>;
  } = {},
): ComposerViewsBundle {
  const phase1Dir = join(tempDir, 'phase1-outputs');
  const structure = readJsonOrThrow(join(phase1Dir, '01-structure-architecture.json'));
  const techStack = readJsonOrThrow(join(phase1Dir, '02-tech-stack-dependencies.json'));
  const codePatterns = readJsonOrThrow(join(phase1Dir, '03-code-patterns-testing.json'));
  const dataFlows = readJsonOrThrow(join(phase1Dir, '04-data-flows-integrations.json'));

  const sliceDir = join(tempDir, 'service-details');
  const serviceSlices = readServiceSlices(sliceDir);

  const inspectionPath = join(tempDir, 'project-inspection.json');
  let inspection: ProjectInspection | undefined;
  if (existsSync(inspectionPath)) {
    try {
      const raw = JSON.parse(readFileSync(inspectionPath, 'utf-8'));
      inspection = raw as ProjectInspection;
    } catch {
      inspection = undefined;
    }
  }

  return buildComposerViews({
    structure,
    techStack,
    codePatterns,
    dataFlows,
    serviceSlices,
    generatedAt,
    inspection,
    projectPath: options.projectPath,
    fileCounts: options.fileCounts,
  });
}

function extractServiceRefs(structure: AnalyzerOutputLike): ComposerServiceRef[] {
  const findings = getRecord(structure, 'findings');
  const raw = getArray(findings, 'services');
  const refs: ComposerServiceRef[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = stringOrEmpty(entry.id);
    if (!id) continue;
    // Skip services the structure analyzer explicitly flagged as non-real
    // (workspace-yaml-derived dirs that hold only migrations, fixtures, etc.).
    // Omitted flag = real; only an explicit `false` filters the entry out.
    if (entry.service_is_real === false) continue;
    refs.push({
      id,
      path: stringOrEmpty(entry.path),
      type: optionalString(entry.type),
      language: optionalString(entry.language),
    });
  }
  return refs;
}

function buildCodeConventionsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): CodeConventionsView {
  const codePatterns = getRecord(input.codePatterns, 'findings');
  let enforcementSummary = optionalString(
    getRecord(codePatterns, 'quality_tools')?.enforcement_summary,
  );
  let enforcementSource: 'analyzer' | 'deterministic' | 'absent' = enforcementSummary
    ? 'analyzer'
    : 'absent';
  if (!enforcementSummary && input.inspection) {
    const qualityTools = deriveQualityTools(
      { inspection: input.inspection, services },
      input.projectPath ?? '.',
    );
    if (Object.keys(qualityTools).length > 0) {
      const ciProvider = input.inspection.ci_cd?.provider;
      enforcementSummary = deriveEnforcementSummary(
        { inspection: input.inspection, services },
        qualityTools,
        ciProvider,
      );
      enforcementSource = 'deterministic';
    }
  }

  const analyzerCodePatterns = getRecord(codePatterns, 'code_patterns');
  const byService: CodeConventionsView['by_service'] = {};
  let anyServicePatterns = false;
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    const sliceSource = slice
      ? {
          patterns: slice.findings.code_patterns ?? [],
          notable: slice.findings.notable ?? [],
        }
      : null;
    const analyzerEntry = isRecord(analyzerCodePatterns?.[svc.id])
      ? (analyzerCodePatterns![svc.id] as Record<string, unknown>)
      : null;
    const analyzerSource = analyzerEntry
      ? {
          patterns: getArray(analyzerEntry, 'patterns')
            .filter(isRecord)
            .map((s) => parseSnippet(s))
            .filter((s): s is CodeSnippet => s !== null),
          notable: getArray(analyzerEntry, 'notable').filter(
            (n): n is string => typeof n === 'string' && n.length > 0,
          ),
        }
      : null;
    const source = sliceSource ?? analyzerSource;
    if (!source) continue;
    const patterns = source.patterns;
    const notable = source.notable;
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
      any_service_patterns_source: anyServicePatterns
        ? Object.values(byService).every((_) => true)
          ? sourceForCodeConventions(input, byService)
          : 'absent'
        : 'absent',
      enforcement_summary_source: enforcementSource,
    },
  });
}

function sourceForCodeConventions(
  input: BuildComposerViewsInput,
  byService: CodeConventionsView['by_service'],
): 'slice' | 'analyzer' {
  const ids = Object.keys(byService);
  for (const id of ids) {
    if (input.serviceSlices[id]) return 'slice';
  }
  return 'analyzer';
}

function buildMultiFileWorkflowsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): MultiFileWorkflowsView {
  const dataFlows = getRecord(input.dataFlows, 'findings');
  let eventPipeline = parseFlow(dataFlows?.event_pipeline);
  let authFlow = parseFlow(dataFlows?.auth_flow);
  let eventSource: 'analyzer' | 'deterministic' | 'absent' = eventPipeline ? 'analyzer' : 'absent';
  let authSource: 'analyzer' | 'deterministic' | 'absent' = authFlow ? 'analyzer' : 'absent';

  if (input.inspection) {
    if (!eventPipeline) {
      const derived = deriveEventPipeline({ inspection: input.inspection, services });
      if (derived) {
        eventPipeline = {
          summary: `${derived.pattern} via ${derived.technology}.`,
          examples: [],
        };
        eventSource = 'deterministic';
      }
    }
    if (!authFlow) {
      const derived = deriveAuthFlow({ inspection: input.inspection, services });
      if (derived) {
        authFlow = { summary: derived.summary, examples: [] };
        authSource = 'deterministic';
      }
    }
  }

  const analyzerLifecycles = getRecord(dataFlows, 'request_lifecycle');
  const byService: MultiFileWorkflowsView['by_service'] = {};
  let anyRequestLifecycle = false;
  let lifecycleSource: 'slice' | 'analyzer' | 'absent' = 'absent';
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    const sliceLifecycle = slice?.findings.request_lifecycle ?? [];
    const analyzerLifecycleRaw = analyzerLifecycles?.[svc.id];
    const analyzerLifecycle = Array.isArray(analyzerLifecycleRaw)
      ? (analyzerLifecycleRaw.filter(isRecord) as Record<string, unknown>[])
          .map((s) => parseLifecycleStep(s))
          .filter((s): s is { step: string; where: string; note?: string } => s !== null)
      : [];
    const lifecycle = sliceLifecycle.length > 0 ? sliceLifecycle : analyzerLifecycle;
    if (lifecycle.length === 0) continue;
    byService[svc.id] = { request_lifecycle: [...lifecycle] };
    anyRequestLifecycle = true;
    if (sliceLifecycle.length > 0) lifecycleSource = 'slice';
    else if (lifecycleSource === 'absent') lifecycleSource = 'analyzer';
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
      any_request_lifecycle_source: lifecycleSource,
      event_pipeline_source: eventSource,
      auth_flow_source: authSource,
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

function parseLifecycleStep(
  raw: Record<string, unknown>,
): { step: string; where: string; note?: string } | null {
  const step = stringOrEmpty(raw.step);
  const where = stringOrEmpty(raw.where);
  if (!step || !where) return null;
  const out: { step: string; where: string; note?: string } = { step, where };
  const note = optionalString(raw.note);
  if (note) out.note = note;
  return out;
}

function parseTestingExample(
  raw: Record<string, unknown>,
): { file: string; name?: string; snippet: CodeSnippetWithCitation } | null {
  const file = stringOrEmpty(raw.file);
  if (!file) return null;
  const snippetRaw = isRecord(raw.snippet) ? raw.snippet : null;
  if (!snippetRaw) return null;
  const snippet = parseSnippet(snippetRaw);
  if (!snippet) return null;
  if (!snippet.source_file || typeof snippet.source_line !== 'number') return null;
  const citedSnippet: CodeSnippetWithCitation = {
    ...snippet,
    source_file: snippet.source_file,
    source_line: snippet.source_line,
  };
  const out: { file: string; name?: string; snippet: CodeSnippetWithCitation } = {
    file,
    snippet: citedSnippet,
  };
  const name = optionalString(raw.name);
  if (name) out.name = name;
  return out;
}

function buildTestingConventionsView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): TestingConventionsView {
  const codePatterns = getRecord(input.codePatterns, 'findings');
  const testing = getRecord(codePatterns, 'testing');
  let projectSummary = optionalString(testing?.summary ?? testing?.notes);
  let summarySource: 'analyzer' | 'deterministic' | 'absent' = projectSummary
    ? 'analyzer'
    : 'absent';
  let runners = getArray(testing, 'runners')
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .map(String);

  if (input.inspection) {
    if (runners.length === 0) {
      runners = deriveTestingRunners({ inspection: input.inspection, services }).map((r) => r);
    }
    if (!projectSummary && runners.length > 0) {
      projectSummary = deriveTestingProjectSummary(
        { inspection: input.inspection, services },
        runners,
      );
      summarySource = 'deterministic';
    }
  }

  const analyzerTesting = getRecord(codePatterns, 'testing');
  const byService: TestingConventionsView['by_service'] = {};
  let anyServiceTests = false;
  let testsSource: 'slice' | 'analyzer' | 'deterministic' | 'absent' = 'absent';
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    const sliceTesting = slice?.findings.testing;
    const analyzerEntry = isRecord(analyzerTesting?.[svc.id])
      ? (analyzerTesting![svc.id] as Record<string, unknown>)
      : null;
    const analyzerExamples = analyzerEntry
      ? getArray(analyzerEntry, 'representative_examples')
          .filter(isRecord)
          .map((s) => parseTestingExample(s))
          .filter(
            (s): s is { file: string; name?: string; snippet: CodeSnippetWithCitation } =>
              s !== null,
          )
      : [];
    const analyzerNotes = analyzerEntry ? optionalString(analyzerEntry.notes) : undefined;
    const examples = sliceTesting?.representative_examples ?? analyzerExamples;
    const notes = sliceTesting?.notes ?? analyzerNotes;
    if (examples.length === 0 && !notes) continue;
    byService[svc.id] = {
      representative_examples: [...examples],
      notes,
    };
    if (examples.length > 0) {
      anyServiceTests = true;
      if (sliceTesting?.representative_examples?.length) testsSource = 'slice';
      else if (testsSource === 'absent') testsSource = 'analyzer';
    }
  }

  if (!anyServiceTests && input.inspection) {
    const frameworksByService = deriveTestingFrameworksByService({
      inspection: input.inspection,
      services,
    });
    for (const [svcId, frameworks] of Object.entries(frameworksByService)) {
      if (!frameworks.unit && !frameworks.integration && !frameworks.e2e) continue;
      const tokens = [frameworks.unit, frameworks.integration, frameworks.e2e].filter(
        (t): t is string => !!t,
      );
      const notesParts: string[] = [];
      if (frameworks.unit) notesParts.push(`unit tests use ${frameworks.unit}`);
      if (frameworks.integration)
        notesParts.push(`integration tests use ${frameworks.integration}`);
      if (frameworks.e2e) notesParts.push(`e2e tests use ${frameworks.e2e}`);
      byService[svcId] = {
        representative_examples: [],
        notes: `Detected from ${svcId} manifest: ${notesParts.join('; ')}.`,
      };
      anyServiceTests = true;
      testsSource = 'deterministic';
      void tokens;
    }
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
      any_service_tests_source: testsSource,
      project_summary_source: summarySource,
    },
  });
}

function buildArchitectureNarrativeView(
  input: BuildComposerViewsInput,
  services: ComposerServiceRef[],
  generatedAt: string,
): ArchitectureNarrativeView {
  const structureFindings = getRecord(input.structure, 'findings');
  const techStackFindings = getRecord(input.techStack, 'findings');

  let repoShape = optionalString(structureFindings?.repository_shape_summary);
  let repoShapeSource: 'analyzer' | 'deterministic' | 'absent' = repoShape ? 'analyzer' : 'absent';
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
  let runtimeVersionsSource: 'analyzer' | 'deterministic' | 'absent' =
    Object.keys(runtimeVersions).length > 0 ? 'analyzer' : 'absent';
  if (Object.keys(runtimeVersions).length === 0 && input.inspection) {
    const insp = input.inspection.runtime_versions ?? {};
    for (const [k, v] of Object.entries(insp)) {
      if (typeof v === 'string' && v.length > 0 && k !== 'tool-versions-raw')
        runtimeVersions[k] = v;
    }
    if (Object.keys(runtimeVersions).length > 0) runtimeVersionsSource = 'deterministic';
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
  let externalServicesSource: 'analyzer' | 'deterministic' | 'absent' =
    externalServices.length > 0 ? 'analyzer' : 'absent';
  if (externalServices.length === 0 && input.inspection) {
    const derived = deriveExternalServices({ inspection: input.inspection, services });
    for (const d of derived) {
      externalServices.push({ name: d.name, kind: d.purpose });
    }
    if (externalServices.length > 0) externalServicesSource = 'deterministic';
  }

  const byService: ArchitectureNarrativeView['by_service'] = {};
  let anyServiceNotable = false;
  let notableSource: 'slice' | 'absent' = 'absent';
  for (const svc of services) {
    const slice = input.serviceSlices[svc.id];
    const notable = slice?.findings.notable ?? [];
    if (notable.length === 0) continue;
    byService[svc.id] = { notable: [...notable] };
    anyServiceNotable = true;
    notableSource = 'slice';
  }

  if (!repoShape && input.inspection) {
    repoShape = deriveRepositoryShapeSummary({
      inspection: input.inspection,
      services,
      fileCounts: input.fileCounts ?? [],
    });
    if (repoShape) repoShapeSource = 'deterministic';
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
      repository_shape_summary_source: repoShapeSource,
      architecture_decisions_source: decisions.length > 0 ? 'analyzer' : 'absent',
      runtime_versions_source: runtimeVersionsSource,
      external_services_source: externalServicesSource,
      any_service_notable_source: notableSource,
    },
  });
}

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
      continue;
    }
  }
  return slices;
}

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
