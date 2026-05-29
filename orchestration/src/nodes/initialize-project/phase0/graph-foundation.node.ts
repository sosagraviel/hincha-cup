import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { buildCodeGraph } from '../../../services/graph-wiki/code-graph.service.js';
import {
  hashGraphDb,
  runGraphPrefetch,
} from '../../../services/framework/code-graph/graph-prefetch.service.js';
import {
  hashExtraIgnorePaths,
  syncCodeReviewGraphIgnore,
} from '../../../services/framework/code-graph/code-review-graphignore.service.js';
import {
  upsertCodeGraphMcpConfig,
  upsertCodexPathRestrictionHookConfig,
} from '../../../services/framework/mcp-config.service.js';
import { getActiveProvider, resolveTempPath } from '../../../utils/provider-paths.js';
import { Provider } from '../../../providers/types.js';
import { logger } from '../../../utils/logger.js';
import {
  inspectProject,
  writeProjectInspection,
} from '../../../services/framework/project-inspection/index.js';
import {
  EXTRA_IGNORE_PATHS_FILENAME,
  getExcludedDirectories,
} from '../../../utils/shared/prompt-loader.js';

/** Formats a build duration as "2.4s" for durations under a minute, or "1m 12s" for longer. */
function formatBuildTime(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return '?';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export async function graphFoundationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child('Phase 0: Graph Foundation');
  phaseLogger.info('Building code graph...');

  const extraIgnorePaths = state.extra_ignore_paths ?? [];
  persistExtraIgnorePaths(state.project_path, extraIgnorePaths, phaseLogger);
  const extraIgnoreHash = syncGraphIgnoreFile(
    state.project_path,
    state.framework_path,
    extraIgnorePaths,
    phaseLogger,
  );

  try {
    const result = await buildCodeGraph({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      extraIgnoreHash,
    });

    phaseLogger.success(`Code graph ready: ${result.code_graph_path}`);
    const s = result.code_graph_stats;
    phaseLogger.info(
      `  Files: ${s.files ?? '?'} │ Functions: ${s.functions ?? '?'} │ ` +
        `Classes: ${s.classes ?? '?'} │ Languages: ${(s.languages ?? []).join(', ') || '?'} │ ` +
        `Build: ${formatBuildTime(s.build_time_ms)}`,
    );

    try {
      const provider = getActiveProvider();
      upsertCodeGraphMcpConfig({
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        provider,
      });
      phaseLogger.info(
        `  MCP config written for ${provider === Provider.CODEX ? '.codex/config.toml' : '.mcp.json'}`,
      );

      if (provider === Provider.CODEX) {
        upsertCodexPathRestrictionHookConfig({
          projectPath: state.project_path,
          frameworkPath: state.framework_path,
        });
        phaseLogger.info('  Codex PreToolUse path-restriction hook wired in .codex/config.toml');
      }
    } catch (mcpErr) {
      phaseLogger.warn(
        `  MCP / Codex hook config upsert failed (non-fatal): ${mcpErr instanceof Error ? mcpErr.message : String(mcpErr)}`,
      );
    }

    /*
     * Pre-run the four cheapest graph-orientation queries
     * (`get_minimal_context_tool` + `list_communities_tool` +
     * `get_hub_nodes_tool` + `get_bridge_nodes_tool`) ONCE here,
     * snapshot the results to `graph-prefetch.json`, and let Phase 1
     * analyzers read from the snapshot instead of re-issuing the same
     * queries four times each. Best-effort — failure does NOT fail
     * Phase 0; analyzers fall back to calling the tools themselves.
     */
    try {
      const graphSha = hashGraphDb(result.code_graph_path);
      const prefetch = await runGraphPrefetch({
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        graphSha,
      });
      if (prefetch.wrote) {
        phaseLogger.info(`  Graph prefetch: ${prefetch.reason}`);
      } else {
        phaseLogger.info(`  Graph prefetch skipped: ${prefetch.reason}`);
      }
    } catch (prefetchErr) {
      const msg = prefetchErr instanceof Error ? prefetchErr.message : String(prefetchErr);
      phaseLogger.warn(`  Graph prefetch failed (non-fatal): ${msg}`);
    }

    /*
     * Project-inspection: walks the filesystem and produces
     * deterministic, parsed data that Phase 1 analyzers consume
     * instead of re-deriving via LLM. Best-effort — any failure logs
     * at INFO and continues with no inspection file written;
     * analyzers fall through to LLM-based discovery.
     *
     * Stack-agnostic by construction: every language-specific
     * decision lives in a lookup table (lock-file table, manifest-
     * parser table, runtime-version table).
     */
    try {
      const tempDirForInspection = resolveTempPath(state.project_path, 'initialize-project');
      const inspectionResult = await inspectProject({
        projectPath: state.project_path,
        excludedDirs: getExcludedDirectories(state.project_path, state.framework_path),
      });
      writeProjectInspection(tempDirForInspection, inspectionResult.inspection);
      phaseLogger.info(
        `  Project inspection: ${inspectionResult.inspection.repository_type} / ` +
          `${inspectionResult.inspection.manifests.length} manifests / ` +
          `${inspectionResult.inspection.lock_files.length} lock files / ` +
          `${Object.keys(inspectionResult.inspection.runtime_versions).length} runtimes / ` +
          `${inspectionResult.inspection.infrastructure.length} infra tools ` +
          `(${(inspectionResult.durationMs / 1000).toFixed(1)}s)`,
      );
    } catch (inspectionErr) {
      const msg = inspectionErr instanceof Error ? inspectionErr.message : String(inspectionErr);
      phaseLogger.info(`  Project inspection skipped (non-fatal): ${msg}`);
    }

    return {
      ...result,
      current_phase: 'phase0_graph',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    phaseLogger.error(`Code graph build FAILED: ${message}`);
    phaseLogger.error(
      `  Phase 1 will be skipped. The code graph is required for analyzers to run.`,
    );
    phaseLogger.error(
      `  Remediation: bash ${state.framework_path}/scripts/setup-code-graph.sh ` +
        `(or install uv: https://docs.astral.sh/uv/getting-started/installation/)`,
    );

    return {
      code_graph_available: false,
      code_graph_error: message,
      current_phase: 'failed',
      errors: [`graph_foundation: ${message}`],
    };
  }
}

/**
 * Write the user-supplied `--ignore` paths to disk so child-process hooks
 * (the Claude/Codex stop hook, the PreToolUse path-restriction hook) — which
 * never see LangGraph state — can pick them up through
 * `getExcludedDirectories()`. Always writes (even when the list is empty) so
 * stale entries from a prior run don't leak into a flagless re-run.
 */
/**
 * Splice the user-supplied `--ignore` paths into the project's
 * `.code-review-graphignore` BEFORE the code graph builds, so the graph
 * never indexes the excluded subtrees. Returns the deterministic hash of
 * the user list so `buildCodeGraph` can detect drift across runs and force
 * a tier-3 rebuild when needed.
 *
 * Reads the framework's seed template (`templates/code-review-graphignore`)
 * when the file doesn't exist yet — keeps a single source of truth for the
 * default exclusion set.
 */
function syncGraphIgnoreFile(
  projectPath: string,
  frameworkPath: string,
  paths: ReadonlyArray<string>,
  log: ReturnType<typeof logger.child>,
): string {
  try {
    const templatePath = join(frameworkPath, 'templates', 'code-review-graphignore');
    let templateBody: string | undefined;
    if (existsSync(templatePath)) {
      try {
        templateBody = readFileSync(templatePath, 'utf-8');
      } catch {
        templateBody = undefined;
      }
    }
    const result = syncCodeReviewGraphIgnore(projectPath, paths, { templateBody });
    if (result.changed) {
      log.info(
        `  .code-review-graphignore managed block updated (${paths.length} user path${paths.length === 1 ? '' : 's'}) — graph will rebuild on drift`,
      );
    }
    return result.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  Failed to sync .code-review-graphignore (non-fatal): ${msg}`);
    return hashExtraIgnorePaths(paths);
  }
}

function persistExtraIgnorePaths(
  projectPath: string,
  paths: ReadonlyArray<string>,
  log: ReturnType<typeof logger.child>,
): void {
  try {
    const tempDir = resolveTempPath(projectPath, 'initialize-project');
    mkdirSync(tempDir, { recursive: true });
    const target = join(tempDir, EXTRA_IGNORE_PATHS_FILENAME);
    writeFileSync(target, JSON.stringify({ paths: [...paths] }), 'utf-8');
    if (paths.length > 0) {
      log.info(`  Extra ignore paths persisted: ${paths.join(', ')}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  Failed to persist extra ignore paths (non-fatal): ${msg}`);
  }
}
