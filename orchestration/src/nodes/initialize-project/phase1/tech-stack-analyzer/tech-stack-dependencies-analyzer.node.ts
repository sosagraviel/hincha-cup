import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { AgentFactory } from '../../../../utils/shared/agent-factory/index.js';
import { validateAndParseAgentOutput, type ValidationResult } from '../../../../utils/validator.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from '../../../../utils/enhanced-retry.js';
import { logger } from '../../../../utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildPhase1AnalyzerPrompt } from '../shared/prompt-builder.js';
import { loadAuthoritativeServices } from '../shared/authoritative-services.js';
import {
  applyGraphToolUsageFromSidecar,
  getSidecarLoaderForProvider,
} from '../shared/graph-tool-usage.js';
import { applyInspectionPostFill } from './helpers/apply-inspection-postfill.js';
import { getFrameworkAgentPath } from '../../shared/index.js';
import { resolveTempPath, getActiveProvider } from '../../../../utils/provider-paths.js';
import { Provider } from '../../../../providers/types.js';
import {
  getInitializeProjectPhase,
  tryActiveDebugStore,
} from '../../../../services/framework/debug-store/index.js';

/**
 * Analyzes tech stack, programming languages, dependencies, and build tools
 */
export async function techStackDependenciesAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'tech-stack-dependencies-analyzer';
  const agentFile = '02-tech-stack-dependencies.md';

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  const { services: authoritativeServices, error: servicesLoadError } =
    loadAuthoritativeServices(tempDir);
  if (servicesLoadError) {
    logger.warn(`${agentName}: ${servicesLoadError} — proceeding without injection`);
  }

  try {
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      const inputPrompt = buildPhase1AnalyzerPrompt(
        state.project_path,
        state.framework_path,
        agentName,
        feedbackPrompt,
        {
          available: state.code_graph_available ?? false,
          dbPath: state.code_graph_path,
          stats: state.code_graph_stats,
        },
        authoritativeServices,
      );

      const factory = await AgentFactory.create();

      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 1800000,
        resumeSessionId,
        phase: getInitializeProjectPhase('phase1'),
        settingsPath: join(
          state.framework_path,
          'orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/settings.json',
        ),
      });

      const result = await agent.invoke({ inputPrompt, attemptNumber });

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const validator = (output: string): ValidationResult => {
      return validateAndParseAgentOutput(output, agentName);
    };

    const outputPath = join(tempDir, 'phase1-outputs', '02-tech-stack-dependencies.json');

    const { data: validatedData, sessionId } = await retryWithEnhancedFeedback(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG,
      {
        projectPath: state.project_path,
        agentName,
        phase: getInitializeProjectPhase('phase1'),
      },
    );

    const withInspection = applyInspectionPostFill(validatedData, tempDir);

    const provider = getActiveProvider() === Provider.CODEX ? 'codex' : 'claude';
    const persisted = applyGraphToolUsageFromSidecar(
      withInspection,
      state.project_path,
      sessionId,
      agentName,
      getSidecarLoaderForProvider(provider),
    );

    writeFileSync(outputPath, JSON.stringify(persisted, null, 2));

    const activeStore = tryActiveDebugStore();
    if (activeStore && sessionId) {
      await activeStore.overlaySessionOutput(agentName, sessionId, persisted);
    }

    return {
      temp_dir: tempDir,
    };
  } catch (error) {
    const err = error as Error;

    if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
      throw error;
    }

    return {
      errors: [...state.errors, `${agentName}: ${err.message}`],
      current_phase: 'failed',
    };
  }
}
