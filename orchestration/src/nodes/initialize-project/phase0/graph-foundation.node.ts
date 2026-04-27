import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { buildCodeGraph } from '../../../services/graph-wiki/code-graph.service.js';
import { fetchCodeGraphToolCatalog } from '../../../services/framework/code-graph/tool-catalog.service.js';
import { upsertCodeGraphMcpConfig } from '../../../services/framework/mcp-config.service.js';
import { getActiveProvider } from '../../../utils/provider-paths.js';
import { Provider } from '../../../providers/types.js';
import { logger } from '../../../utils/logger.js';

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

    // Codex MCP parity: write <project>/.codex/config.toml (or .mcp.json for
    // Claude) NOW so Phase 1 analyzers spawned via Codex CLI find the
    // `code_graph` MCP server in their auto-discovered project config. The
    // Claude codepath also benefits — it has per-node mcp.json passed via
    // --mcp-config, but downstream phases (e.g. wiki generation) still rely
    // on the project-level .mcp.json. Phase 5/resources also calls this; we
    // pre-create here so analyzers in either provider have what they need.
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
    } catch (mcpErr) {
      phaseLogger.warn(
        `  MCP config upsert failed (non-fatal): ${mcpErr instanceof Error ? mcpErr.message : String(mcpErr)}`,
      );
    }

    // Fetch the live MCP tool catalog so analyzer prompts template the real
    // tool names (and not hand-written ones that drift on every server release).
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
