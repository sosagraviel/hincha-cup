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
 * Code Patterns & Testing Analyzer Node
 *
 * Analyzes:
 * - Code patterns and conventions
 * - Testing frameworks and coverage
 * - Code quality tools (linters, formatters)
 * - Build and CI/CD configurations
 */
export async function codePatternsTestingAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'code-patterns-testing-analyzer';
  const agentFile = '03-code-patterns-testing.md';

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
          'orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/settings.json',
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
      return validateAndParseAgentOutput(output, agentName, tempDir);
    };

    const outputPath = join(tempDir, 'phase1-outputs', '03-code-patterns-testing.json');

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

    if (err.message.includes('RATE_LIMIT')) {
      logger.blank();
      logger.warn('This is a RATE LIMIT error - retrying will not help until limit resets.');
      logger.warn('Please follow the instructions above to switch to API key mode or wait.');
      logger.blank();
    }

    logger.error('Analysis failed', err);

    return {
      errors: [`${agentName}: ${err.message}`],
      current_phase: 'failed',
    };
  }
}
