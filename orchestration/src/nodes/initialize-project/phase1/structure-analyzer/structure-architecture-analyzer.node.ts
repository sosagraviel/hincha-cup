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
import {
  applyGraphToolUsageFromSidecar,
  getSidecarLoaderForProvider,
} from '../shared/graph-tool-usage.js';
import { getFrameworkAgentPath } from '../../shared/index.js';
import {
  analyzerExcludedDirsOverride,
  analyzerReadableTempPaths,
} from '../../../../services/framework/permissions/excluded-paths.js';
import { resolveTempPath, getActiveProvider } from '../../../../utils/provider-paths.js';
import { Provider } from '../../../../providers/types.js';
import {
  getInitializeProjectPhase,
  tryActiveDebugStore,
} from '../../../../services/framework/debug-store/index.js';

/**
 * Structure & Architecture Analyzer Node
 *
 * This node runs the structure-architecture-analyzer agent which analyzes:
 * - Project structure and organization
 * - Framework detection and configuration
 * - Architecture patterns (MVC, microservices, etc.)
 * - Monorepo/multi-workspace detection
 *
 * Features:
 * - Retry logic with exponential backoff (up to 5 attempts)
 * - Error feedback to agent for self-correction
 * - Zod validation of output
 * - Provider-agnostic via LLM factory
 *
 * @param state - Current workflow state
 * @returns Updated state with analyzer output
 */
export async function structureArchitectureAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'structure-architecture-analyzer';
  const agentFile = '01-structure-architecture.md';

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

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
          'orchestration/src/nodes/initialize-project/phase1/structure-analyzer/settings.json',
        ),
        allowReadPaths: analyzerReadableTempPaths(state.project_path),
        excludedDirsOverride: analyzerExcludedDirsOverride(
          state.project_path,
          state.framework_path,
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

    const outputPath = join(tempDir, 'phase1-outputs', '01-structure-architecture.json');

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

    const provider = getActiveProvider() === Provider.CODEX ? 'codex' : 'claude';
    const persisted = applyGraphToolUsageFromSidecar(
      validatedData,
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
      errors: [`${agentName}: ${err.message}`],
      current_phase: 'failed',
    };
  }
}
