import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { buildCodeGraph } from '../../../services/graph-wiki/code-graph.service.js';
import { logger } from '../../../utils/logger.js';

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

    return {
      ...result,
      current_phase: 'phase0_graph',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    phaseLogger.error(`Code graph setup failed: ${message}`);

    return {
      code_graph_available: false,
      code_graph_error: message,
      current_phase: 'failed',
      errors: [...state.errors, `graph_foundation: ${message}`],
    };
  }
}
