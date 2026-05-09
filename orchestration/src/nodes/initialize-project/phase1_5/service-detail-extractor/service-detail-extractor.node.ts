/**
 * Plan v4 Phase D — Service Detail Extractor (orchestrator).
 *
 * Sits between the Phase 1 parallel analyzer tail and the Phase 2
 * consolidation step. Spawns N parallel sub-agents — one per service in
 * the structure-analyzer's authoritative list — each scoped to ONE
 * service path. Each sub-agent emits a `ServiceDetailSlice` JSON file.
 * The orchestrator merges the slices into a manifest and writes
 * `<tempDir>/service-details/_index.json` for downstream phases.
 *
 * Why this exists: v3's monolithic §B.3 contract asked the single
 * code-patterns analyzer to emit per-service `code_patterns[]` for every
 * service in one pass. On gira (six services) the output grew 13× and
 * wall-clock 7× (155 s → 1091 s). v4 splits the work N-ways:
 * MAX_PARALLEL_FANOUT=8 in flight, wall-clock = max(per-service) ≈ 100 s.
 *
 * Stack-agnostic by construction: every field passed to the sub-agent
 * (`id`, `path`, `type`, `language`) is descriptive — never a framework
 * or naming-convention assumption. Works on a 2011 PHP monolith the same
 * way it works on a 2026 Bun + TypeScript serverless project.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import { resolveTempPath, getActiveProvider } from '../../../../utils/provider-paths.js';
import { Provider } from '../../../../providers/types.js';
import { AgentFactory } from '../../../../utils/shared/agent-factory/index.js';
import {
  getInitializeProjectPhase,
  tryActiveDebugStore,
} from '../../../../services/framework/debug-store/index.js';
import { reasoningPrefix } from '../../../../utils/shared/context-tags.js';
import { getFrameworkAgentPath } from '../../shared/index.js';
import {
  loadAuthoritativeServices,
  type AuthoritativeService,
} from '../../phase1/shared/authoritative-services.js';
import {
  ServiceDetailSliceSchema,
  ServiceDetailIndexSchema,
  type ServiceDetailSlice,
  type ServiceDetailIndex,
} from '../../../../schemas/service-detail-slice.schema.js';
import { extractJSON } from '../../../../utils/validator.js';
import {
  applyGraphToolUsageFromSidecar,
  getSidecarLoaderForProvider,
} from '../../phase1/shared/graph-tool-usage.js';
import { buildPhase1AnalyzerPrompt } from '../../phase1/shared/prompt-builder.js';

/**
 * Maximum number of sub-agents in flight at once. Picked so the
 * average dev box doesn't run out of file handles or LLM-API budget
 * even on a wide monorepo. Override with the `SERVICE_DETAIL_FANOUT`
 * env var when running on beefier infra.
 */
const DEFAULT_MAX_PARALLEL_FANOUT = 8;

/**
 * Per-sub-agent timeout. Generous because the agent does up to 6 graph
 * calls + 8 reads of source files + a structured-output JSON emission.
 * Slower than the typical ~100s but bounded so a stuck sub-agent
 * doesn't block the whole fan-out.
 */
const PER_SERVICE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

const SUB_AGENT_NAME = 'service-detail-extractor';
const AGENT_FILE = '08-service-detail-extractor.md';

interface SliceOutcome {
  serviceId: string;
  status: 'completed' | 'failed' | 'timed_out';
  slicePath?: string; // relative to tempDir when completed
  error?: string;
  durationMs: number;
}

export async function serviceDetailExtractorNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child('Phase 1.5: service detail extraction');

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const sliceDir = join(tempDir, 'service-details');
  const indexPath = join(sliceDir, '_index.json');
  mkdirSync(sliceDir, { recursive: true });

  // Idempotency: if a complete `_index.json` already exists for the same
  // authoritative service set, skip. The downstream phases consume the
  // index, so if it's there and consistent, re-running buys us nothing.
  const { services, error: loadError } = loadAuthoritativeServices(tempDir);
  if (loadError) {
    phaseLogger.warn(`Skipping Phase 1.5 — ${loadError}`);
    writeIndex(indexPath, {
      timestamp: new Date().toISOString(),
      services_total: 0,
      services_completed: 0,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: ['authoritative_services_unavailable'],
      slices: {},
    });
    return { temp_dir: tempDir };
  }

  if (services.length === 0) {
    phaseLogger.info('Skipping Phase 1.5 — no services in the authoritative list');
    writeIndex(indexPath, {
      timestamp: new Date().toISOString(),
      services_total: 0,
      services_completed: 0,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {},
    });
    return { temp_dir: tempDir };
  }

  // Already-completed shortcut: if the index covers exactly this set of
  // service IDs and every referenced slice file exists on disk, we can
  // skip the LLM fan-out entirely.
  if (allSlicesAlreadyOnDisk(indexPath, sliceDir, services)) {
    phaseLogger.success(
      `Phase 1.5 already complete on disk — reusing ${services.length} service slices`,
    );
    return { temp_dir: tempDir };
  }

  // Cap parallelism. `SERVICE_DETAIL_FANOUT` override for beefier infra.
  const envCap = Number.parseInt(process.env.SERVICE_DETAIL_FANOUT ?? '', 10);
  const maxParallel = Math.max(
    1,
    Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_MAX_PARALLEL_FANOUT,
  );
  phaseLogger.info(`Spawning ${services.length} sub-agent(s) with concurrency cap ${maxParallel}`);

  const outcomes: SliceOutcome[] = new Array(services.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(maxParallel, services.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= services.length) return;
      outcomes[i] = await runSubAgent(state, services[i], sliceDir, phaseLogger);
    }
  });
  await Promise.all(workers);

  // Build index.
  const index: ServiceDetailIndex = {
    timestamp: new Date().toISOString(),
    services_total: services.length,
    services_completed: 0,
    services_failed: 0,
    services_timed_out: 0,
    soft_warning: [],
    slices: {},
  };
  for (const o of outcomes) {
    if (o.status === 'completed') {
      index.services_completed += 1;
      if (o.slicePath) index.slices[o.serviceId] = o.slicePath;
    } else if (o.status === 'timed_out') {
      index.services_timed_out += 1;
    } else {
      index.services_failed += 1;
    }
  }
  if (index.services_failed > 0) index.soft_warning.push('service_detail_slice_failures');
  if (index.services_timed_out > 0) index.soft_warning.push('service_detail_slice_timeout');
  if (index.services_completed === 0 && index.services_total > 0) {
    index.soft_warning.push('service_detail_extraction_complete_failure');
  }
  writeIndex(indexPath, index);

  if (index.services_completed === index.services_total) {
    phaseLogger.success(
      `✓ ${index.services_completed}/${index.services_total} service slices generated`,
    );
  } else {
    phaseLogger.warn(
      `Phase 1.5 partial — completed=${index.services_completed} failed=${index.services_failed} timed_out=${index.services_timed_out}`,
    );
  }

  return { temp_dir: tempDir };
}

async function runSubAgent(
  state: InitializeProjectState,
  service: AuthoritativeService,
  sliceDir: string,
  phaseLogger: ReturnType<typeof logger.child>,
): Promise<SliceOutcome> {
  const start = Date.now();
  const slicePath = join(sliceDir, `${service.id}.json`);
  const sliceRelPath = relative(state.temp_dir ?? sliceDir, slicePath);

  // Idempotency at the per-service level: if the file is already there and
  // schema-valid, reuse it.
  if (existsSync(slicePath)) {
    try {
      const parsed = ServiceDetailSliceSchema.safeParse(
        JSON.parse(readFileSync(slicePath, 'utf-8')),
      );
      if (parsed.success && parsed.data.service_id === service.id) {
        phaseLogger.info(`✓ ${service.id} — reusing existing slice`);
        return {
          serviceId: service.id,
          status: 'completed',
          slicePath: sliceRelPath,
          durationMs: Date.now() - start,
        };
      }
    } catch {
      // Ignore parse failure; we'll regenerate below.
    }
  }

  try {
    const factory = await AgentFactory.create();
    const promptBody = buildPhase1AnalyzerPrompt(
      state.project_path,
      state.framework_path,
      SUB_AGENT_NAME,
      undefined,
      {
        available: state.code_graph_available ?? false,
        dbPath: state.code_graph_path,
        toolCatalog: state.code_graph_tool_catalog,
        stats: state.code_graph_stats,
      },
      // The sub-agent is scoped to ONE service. Pass just that entry as
      // its authoritative list so the prompt's <authoritative_service_list>
      // section pins the canonical id and path the agent must echo.
      [service],
    );
    const inputPrompt = `${reasoningPrefix(factory.getAuthConfig())}${promptBody}\n\n${buildServiceBlock(service)}`;

    const tempDir = state.temp_dir ?? resolveTempPath(state.project_path, 'initialize-project');
    const agent = await factory.createAgent({
      agentName: SUB_AGENT_NAME,
      agentFilePath: getFrameworkAgentPath(state.framework_path, AGENT_FILE),
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      timeout: PER_SERVICE_TIMEOUT_MS,
      phase: getInitializeProjectPhase('phase1_5'),
      // One tracker slot per service so the parallel-spinner UI doesn't
      // collapse all sub-agents onto a single shared row.
      trackerId: `${SUB_AGENT_NAME}:${service.id}`,
      trackerDisplayName: `service-detail (${service.id})`,
      settingsPath: join(
        state.framework_path,
        'orchestration/src/nodes/initialize-project/phase1_5/service-detail-extractor/settings.json',
      ),
      // Hooks key off these — the layered restrict-service-paths hook
      // rejects any path-tool argument that escapes the service tree,
      // and the Stop hook validates `service_id` echoes verbatim.
      extraEnv: {
        FRAMEWORK_SERVICE_ID: service.id,
        FRAMEWORK_SERVICE_PATH: service.path,
        FRAMEWORK_TEMP_DIR: tempDir,
      },
    });

    const result = await agent.invoke({ inputPrompt });

    // Validate + persist.
    const json = extractJSON(result.output);
    if (!json) {
      throw new Error('sub-agent emitted no parseable JSON');
    }
    const parsed = ServiceDetailSliceSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `ServiceDetailSliceSchema validation failed: ${parsed.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join(' | ')}`,
      );
    }
    const data: ServiceDetailSlice = parsed.data;
    if (data.service_id !== service.id) {
      throw new Error(`service_id mismatch — expected '${service.id}', got '${data.service_id}'`);
    }

    // Overwrite agent-supplied graph_queries_used with the canonical
    // sorted list from the per-provider sidecar (same pattern as the
    // four Phase 1 analyzer nodes). Best-effort: missing sidecar → keep
    // whatever the agent wrote (the schema permits an empty array).
    const provider = getActiveProvider() === Provider.CODEX ? 'codex' : 'claude';
    const persisted = applyGraphToolUsageFromSidecar(
      data,
      state.project_path,
      result.sessionId,
      SUB_AGENT_NAME,
      getSidecarLoaderForProvider(provider),
    );

    writeFileSync(slicePath, JSON.stringify(persisted, null, 2));

    // Overlay the post-sidecar persisted view onto the debug bucket so
    // anyone reading debug/runs/.../output.json sees the same telemetry
    // the persisted slice file carries.
    const activeStore = tryActiveDebugStore();
    if (activeStore && result.sessionId) {
      await activeStore.overlaySessionOutput(SUB_AGENT_NAME, result.sessionId, persisted);
    }

    phaseLogger.success(`✓ ${service.id} — slice written (${Date.now() - start}ms)`);
    return {
      serviceId: service.id,
      status: 'completed',
      slicePath: sliceRelPath,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const e = err as Error;
    if (e.message.includes('SIGINT') || e.message.includes('interrupted by user')) {
      throw err;
    }
    const isTimeout = e.message.toLowerCase().includes('timeout');
    phaseLogger.warn(`✗ ${service.id} — ${isTimeout ? 'timed out' : 'failed'}: ${e.message}`);
    return {
      serviceId: service.id,
      status: isTimeout ? 'timed_out' : 'failed',
      error: e.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Render the per-service `<service>` block the sub-agent's prompt expects.
 * Stack-agnostic — only descriptive fields.
 */
export function buildServiceBlock(service: AuthoritativeService): string {
  return [
    '<service>',
    `  <id>${service.id}</id>`,
    `  <path>${service.path}</path>`,
    service.type ? `  <type>${service.type}</type>` : '',
    service.language ? `  <language>${service.language}</language>` : '',
    service.name ? `  <name>${service.name}</name>` : '',
    '</service>',
    '',
    'You are extracting per-service detail for the SINGLE service above. Stay inside its',
    `path tree (${service.path}/...). The framework PreToolUse hook hard-rejects any path`,
    'argument that escapes this tree.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function writeIndex(indexPath: string, index: ServiceDetailIndex): void {
  const parsed = ServiceDetailIndexSchema.parse(index);
  writeFileSync(indexPath, JSON.stringify(parsed, null, 2));
}

export function allSlicesAlreadyOnDisk(
  indexPath: string,
  sliceDir: string,
  services: AuthoritativeService[],
): boolean {
  if (!existsSync(indexPath)) return false;
  try {
    const parsed = ServiceDetailIndexSchema.safeParse(JSON.parse(readFileSync(indexPath, 'utf-8')));
    if (!parsed.success) return false;
    const idx = parsed.data;
    if (idx.services_completed !== services.length) return false;
    if (idx.services_total !== services.length) return false;
    for (const svc of services) {
      const rel = idx.slices[svc.id];
      if (!rel) return false;
      const abs = join(sliceDir, `${svc.id}.json`);
      if (!existsSync(abs)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
