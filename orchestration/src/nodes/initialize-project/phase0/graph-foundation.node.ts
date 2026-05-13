import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { buildCodeGraph } from '../../../services/graph-wiki/code-graph.service.js';
import { fetchCodeGraphToolCatalog } from '../../../services/framework/code-graph/tool-catalog.service.js';
import {
  hashGraphDb,
  runGraphPrefetch,
} from '../../../services/framework/code-graph/graph-prefetch.service.js';
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
import { getExcludedDirectories } from '../../../utils/shared/prompt-loader.js';

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

  try {
    const result = await buildCodeGraph({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
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

    let toolCatalog: { name: string; description: string }[] = [];
    try {
      toolCatalog = await fetchCodeGraphToolCatalog({
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
      });
      phaseLogger.info(`  MCP tools: ${toolCatalog.length} available`);
    } catch (catalogErr) {
      const msg = catalogErr instanceof Error ? catalogErr.message : String(catalogErr);
      phaseLogger.error(`  MCP tool catalog fetch FAILED: ${msg}`);
      phaseLogger.error(
        '  Analyzers cannot use the graph reliably without the catalog. The run will fail.',
      );
      return {
        code_graph_available: false,
        code_graph_error: `tool catalog: ${msg}`,
        current_phase: 'failed',
        errors: [...state.errors, `graph_foundation: tool catalog: ${msg}`],
      };
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
      code_graph_tool_catalog: toolCatalog,
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
      errors: [...state.errors, `graph_foundation: ${message}`],
    };
  }
}
