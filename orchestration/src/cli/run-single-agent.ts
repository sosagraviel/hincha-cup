#!/usr/bin/env node
/**
 * Run a single agent in isolation against a fixture.
 *
 * The companion to `scripts/run-agent.sh`. Invokes ONE agent's
 * orchestration-node function directly (no LangGraph, no upstream
 * spawning). Upstream artefacts (project-inspection.json, phase1-outputs,
 * etc.) are expected to already be staged on disk by
 * `scripts/stage-upstream.sh` before this CLI runs.
 *
 * Supported agents:
 *   - `structure-architecture-analyzer` (Phase 1)
 *   - `tech-stack-dependencies-analyzer` (Phase 1)
 *   - `code-patterns-testing-analyzer` (Phase 1)
 *   - `data-flows-integrations-analyzer` (Phase 1)
 *   - `architect-synthesizer` (Phase 3)
 *
 * Outputs go to the canonical paths the node writes to, so subsequent
 * `stage-upstream.sh` calls pick them up. Debug artefacts land under
 * `<project>/.claude-temp/initialize-project/debug/runs/latest/`.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Provider } from '../providers/types.js';
import { resetLLMFactory } from '../llm/llm-factory.js';
import { setActiveProvider, resolveTempPath } from '../utils/provider-paths.js';
import { logger } from '../utils/logger.js';
import {
  DebugStore,
  setActiveDebugStore,
  getInitializeProjectPhase,
} from '../services/framework/debug-store/index.js';
import { getLLMFactory } from '../llm/llm-factory.js';
import { runPreflightChecks } from '../utils/preflight-checks.js';
import type { InitializeProjectState } from '../state/schemas/initialize-project.schema.js';

import { graphFoundationNode } from '../nodes/initialize-project/phase0/graph-foundation.node.js';
import { structureArchitectureAnalyzerNode } from '../nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.js';
import { techStackDependenciesAnalyzerNode } from '../nodes/initialize-project/phase1/tech-stack-analyzer/tech-stack-dependencies-analyzer.node.js';
import { codePatternsTestingAnalyzerNode } from '../nodes/initialize-project/phase1/code-patterns-analyzer/code-patterns-testing-analyzer.node.js';
import { dataFlowsIntegrationsAnalyzerNode } from '../nodes/initialize-project/phase1/data-flows-analyzer/data-flows-integrations-analyzer.node.js';
import { synthesisNode } from '../nodes/initialize-project/phase3/synthesis.node.js';

const SUPPORTED_AGENTS = [
  'structure-architecture-analyzer',
  'tech-stack-dependencies-analyzer',
  'code-patterns-testing-analyzer',
  'data-flows-integrations-analyzer',
  'architect-synthesizer',
] as const;

type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

interface CliOptions {
  projectPath: string;
  frameworkPath: string;
  agentName: string;
  serviceId?: string;
  modelTier?: string;
  provider?: string;
  keepRuns?: string;
}

const program = new Command();

program
  .name('run-single-agent')
  .description(
    'Spawn a single initialize-project agent in isolation against a fixture. ' +
      'Upstream artefacts must be pre-staged via scripts/stage-upstream.sh.',
  )
  .version('1.0.0')
  .requiredOption('-p, --project-path <path>', 'absolute path to the fixture project')
  .requiredOption('-f, --framework-path <path>', 'absolute path to the framework root')
  .requiredOption('-a, --agent-name <name>', `one of: ${SUPPORTED_AGENTS.join(' | ')}`)
  .option('--service-id <id>', 'kept for backward compatibility; no longer used')
  .option(
    '--model-tier <tier>',
    'override MODEL_TIER (default: read from env; fixtures should use fast = haiku-latest)',
  )
  .option('--provider <provider>', 'target provider: claude or codex (default: claude)')
  .option('--keep-runs <n>', 'how many debug runs to keep')
  .action(async (options: CliOptions) => {
    try {
      await runSingleAgent(options);
    } catch (err) {
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      logger.error(`run-single-agent failed: ${msg}`);
      process.exit(1);
    }
  });

program.parse();

async function runSingleAgent(options: CliOptions): Promise<void> {
  validateAgentName(options.agentName);
  const agentName = options.agentName as SupportedAgent;

  if (options.modelTier) {
    process.env.MODEL_TIER = options.modelTier;
  } else if (!process.env.MODEL_TIER) {
    process.env.MODEL_TIER = 'fast';
  }
  const provider = (options.provider ?? 'claude').toLowerCase();
  if (provider === 'codex' || provider === 'openai') {
    setActiveProvider(Provider.CODEX);
    process.env.PROVIDER = 'codex';
  } else {
    setActiveProvider(Provider.CLAUDE);
    process.env.PROVIDER = 'claude';
  }
  resetLLMFactory();

  const projectPath = options.projectPath;
  const frameworkPath = options.frameworkPath;
  if (!existsSync(projectPath)) {
    throw new Error(`project path does not exist: ${projectPath}`);
  }
  if (!existsSync(frameworkPath)) {
    throw new Error(`framework path does not exist: ${frameworkPath}`);
  }
  const symlinkPath = join(projectPath, 'qubika-agentic-framework');
  if (!existsSync(symlinkPath)) {
    logger.warn(
      `no qubika-agentic-framework symlink at ${symlinkPath} — some framework code paths assume it exists.`,
    );
  }

  const tempDir = resolveTempPath(projectPath, 'initialize-project');
  mkdirSync(tempDir, { recursive: true });

  const keepRuns = options.keepRuns ? Math.max(0, Number(options.keepRuns)) : 10;
  const runStartedAt = new Date();
  const debugStore = await DebugStore.create({
    projectPath,
    workflow: 'initialize-project',
    startedAt: runStartedAt,
  });
  setActiveDebugStore(debugStore);

  const llmFactory = getLLMFactory();
  await debugStore.updateRunManifest({
    runId: debugStore.getRunContext().runId,
    workflow: 'initialize-project',
    projectPath,
    frameworkPath,
    provider: debugStore.getRunContext().provider,
    model: llmFactory.getModelInfo(options.agentName).alias,
    modelTier: llmFactory.getCurrentTier(),
    debug: process.env.FRAMEWORK_DEBUG === '1',
    startedAt: runStartedAt.toISOString(),
  });

  DebugStore.pruneRuns(projectPath, 'initialize-project', keepRuns).catch(() => undefined);

  logger.section('Preflight Checks');
  const preflight = await runPreflightChecks(projectPath, frameworkPath);
  if (preflight.warnings.length > 0) {
    preflight.warnings.forEach((w) => logger.warn(w));
  }
  if (!preflight.success) {
    preflight.errors.forEach((e) => logger.error(e));
    throw new Error('preflight checks failed; see errors above');
  }

  const stagedInspection = join(tempDir, 'project-inspection.json');
  const stagedPrefetch = join(tempDir, 'graph-prefetch.json');
  const phase0Staged = existsSync(stagedInspection) && existsSync(stagedPrefetch);

  if (!phase0Staged) {
    logger.section('Phase 0 — graph foundation');
    const phase0State: InitializeProjectState = {
      project_path: projectPath,
      framework_path: frameworkPath,
      current_phase: 'init',
      temp_dir: tempDir,
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };
    const phase0Result = await graphFoundationNode(phase0State);
    if (phase0Result.current_phase === 'failed') {
      throw new Error(`Phase 0 failed: ${(phase0Result.errors ?? []).join(' | ') || 'unknown'}`);
    }
    if (!existsSync(stagedPrefetch)) {
      try {
        const { writeFileSync } = await import('fs');
        writeFileSync(
          stagedPrefetch,
          JSON.stringify(
            {
              stats: phase0Result.code_graph_stats ?? null,
              codeGraphPath: phase0Result.code_graph_path,
              codeGraphAvailable: phase0Result.code_graph_available,
            },
            null,
            2,
          ),
        );
      } catch (err) {
        logger.warn(
          `failed to persist graph-prefetch.json: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } else {
    logger.info('Phase 0 — staged artefacts present (skipping graph build)');
  }

  const state = buildStateFromDisk(projectPath, frameworkPath, tempDir);

  logger.section(`run-single-agent → ${agentName}`);
  logger.keyValue('project', projectPath);
  logger.keyValue('framework', frameworkPath);
  logger.keyValue('tier', process.env.MODEL_TIER ?? '(unset)');
  logger.keyValue('provider', process.env.PROVIDER ?? '(unset)');
  if (options.serviceId) logger.keyValue('service-id', options.serviceId);
  logger.blank();

  const start = Date.now();
  let outcome: 'success' | 'failed' = 'success';
  let failureReason: string | undefined;

  try {
    let result: Partial<InitializeProjectState> | undefined;
    switch (agentName) {
      case 'structure-architecture-analyzer':
        result = await structureArchitectureAnalyzerNode(state);
        break;
      case 'tech-stack-dependencies-analyzer':
        result = await techStackDependenciesAnalyzerNode(state);
        break;
      case 'code-patterns-testing-analyzer':
        result = await codePatternsTestingAnalyzerNode(state);
        break;
      case 'data-flows-integrations-analyzer':
        result = await dataFlowsIntegrationsAnalyzerNode(state);
        break;
      case 'architect-synthesizer':
        result = await synthesisNode(state);
        break;
      default: {
        const _exhaustive: never = agentName;
        throw new Error(`unreachable: ${_exhaustive as string}`);
      }
    }

    if (result?.current_phase === 'failed') {
      outcome = 'failed';
      failureReason =
        result.errors && result.errors.length > 0
          ? result.errors.join(' | ')
          : 'agent reported current_phase=failed';
    }
  } catch (err) {
    outcome = 'failed';
    failureReason = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - start;
    logger.blank();
    logger.keyValue('outcome', outcome);
    logger.keyValue('duration_ms', String(durationMs));
    logger.keyValue('debug-bucket', join(tempDir, 'debug', 'runs', 'latest'));
    if (failureReason) {
      logger.keyValue('failure-reason', failureReason);
    }
    await debugStore
      .updateRunManifest({
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - runStartedAt.getTime(),
      })
      .catch(() => undefined);
    await debugStore.updateLatestPointer().catch(() => undefined);
  }

  if (outcome === 'failed') {
    throw new Error(`agent '${agentName}' failed: ${failureReason ?? 'unknown'}`);
  }
}

function validateAgentName(name: string): void {
  if (!(SUPPORTED_AGENTS as ReadonlyArray<string>).includes(name)) {
    throw new Error(`unsupported agent '${name}'. supported: ${SUPPORTED_AGENTS.join(', ')}`);
  }
}

/**
 * Build a minimal `InitializeProjectState` that the orchestration-node
 * functions accept. Reads staged Phase 0 artefacts (graph foundation +
 * project-inspection) from disk when present so downstream agents see
 * the same shape they would in a full run.
 */
function buildStateFromDisk(
  projectPath: string,
  frameworkPath: string,
  tempDir: string,
): InitializeProjectState {
  const graphPrefetchPath = join(tempDir, 'graph-prefetch.json');
  const codeGraphPath = join(projectPath, '.code-review-graph', 'graph.db');

  let codeGraphStats: InitializeProjectState['code_graph_stats'];
  if (existsSync(graphPrefetchPath)) {
    try {
      const parsed = JSON.parse(readFileSync(graphPrefetchPath, 'utf-8'));
      if (parsed.stats) codeGraphStats = parsed.stats;
    } catch {}
  }

  return {
    project_path: projectPath,
    framework_path: frameworkPath,
    current_phase: 'phase1_analysis',
    temp_dir: tempDir,
    code_graph_available: existsSync(codeGraphPath),
    code_graph_path: existsSync(codeGraphPath) ? codeGraphPath : undefined,
    code_graph_stats: codeGraphStats,
    phase1_analysis: { all_completed: false },
    phase1_retry_tracking: {},
    errors: [],
    warnings: [],
  };
}
