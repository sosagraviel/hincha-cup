import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { buildCodeGraph } from '../../../services/graph-wiki/code-graph.service.js';
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
      errors: [...state.errors, `graph_foundation: ${message}`],
    };
  }
}
