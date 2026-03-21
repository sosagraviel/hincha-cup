import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import { validateAndParseAgentOutput, buildValidationErrorFeedback } from '../../utils/validator.js';
import {
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
  buildErrorFeedback,
  sleep
} from '../../utils/retry.js';
import { logger } from '../../utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Data Flows & Integrations Analyzer Node
 *
 * Analyzes:
 * - Data flow patterns
 * - API integrations and endpoints
 * - Database schemas and ORMs
 * - External service integrations
 */
export async function dataFlowsIntegrationsAnalyzerNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'data-flows-integrations-analyzer';
  const agentFile = '04-data-flows-integrations.md';

  const agentLogger = logger.child(agentName);
  agentLogger.blank();
  agentLogger.info('Starting analysis...');

  let retryState = state.phase1_retry_tracking?.data_flows_integrations || initRetryState();

  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  let additionalContext = '';

  while (shouldRetry(retryState)) {
    try {
      agentLogger.info(`Attempt ${retryState.attempt + 1}/${retryState.max_attempts}`);

      additionalContext = buildErrorFeedback(retryState);

      // Create agent - model is determined by tier configuration
      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext,
        timeout: 600000 // 10 minutes
      });

      const result = await agent.invoke({
        input: `Analyze data flows and integrations at: ${state.project_path}`
      });

      const rawOutput = result.output || result.content || JSON.stringify(result);

      // Save raw output for debugging
      const rawOutputPath = join(tempDir, 'phase1-outputs', `${agentName}-attempt${retryState.attempt}.raw`);
      writeFileSync(rawOutputPath, rawOutput);

      const validation = validateAndParseAgentOutput(rawOutput, agentName);

      if (!validation.valid) {
        const errorMessage = buildValidationErrorFeedback(validation);
        retryState = updateRetryState(retryState, errorMessage);

        agentLogger.warn('Validation failed');
        agentLogger.increaseIndent();
        validation.errors?.forEach(err => agentLogger.warn(err));
        agentLogger.decreaseIndent();

        if (shouldRetry(retryState) && retryState.next_delay_ms) {
          agentLogger.info(`Retrying in ${Math.round(retryState.next_delay_ms / 1000)}s...`);
          await sleep(retryState.next_delay_ms);
        }
        continue;
      }

      const outputPath = join(tempDir, 'phase1-outputs', '04-data-flows-integrations.json');
      writeFileSync(outputPath, JSON.stringify(validation.data, null, 2));

      agentLogger.success('Analysis complete');
      retryState = completeRetryState(retryState);

      // Don't return phase1_analysis - Phase 2 will read from disk files
      return {
        phase1_retry_tracking: {
          ...state.phase1_retry_tracking,
          data_flows_integrations: retryState
        },
        temp_dir: tempDir
      };

    } catch (error) {
      const err = error as Error;

      // Check if this is a SIGINT abort - throw immediately without retrying
      if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
        throw error; // Re-throw to propagate up to graph.invoke()
      }

      // Save error to file for debugging
      const errorFilePath = join(tempDir, 'phase1-outputs', `${agentName}-attempt${retryState.attempt}.err`);
      writeFileSync(errorFilePath, `${err.message}\n\n${err.stack || ''}`);

      const errorMessage = `Agent execution failed: ${err.message}`;
      retryState = updateRetryState(retryState, errorMessage);

      agentLogger.blank();
      agentLogger.error('Agent execution failed', err);

      if (err.message.includes('RATE_LIMIT')) {
        agentLogger.blank();
        agentLogger.warn('This is a RATE LIMIT error - retrying will not help until limit resets.');
        agentLogger.warn('Please follow the instructions above to switch to API key mode or wait.');
        agentLogger.blank();

        // Don't return phase1_analysis - Phase 2 will read from disk files
        return {
          phase1_retry_tracking: {
            ...state.phase1_retry_tracking,
            data_flows_integrations: retryState
          },
          temp_dir: tempDir,
          errors: [
            ...state.errors,
            `${agentName}: ${err.message}`
          ],
          current_phase: 'failed'
        };
      }

      if (shouldRetry(retryState) && retryState.next_delay_ms) {
        agentLogger.info(`Retrying in ${Math.round(retryState.next_delay_ms / 1000)}s...`);
        await sleep(retryState.next_delay_ms);
      }
    }
  }

  const finalError = `Failed after ${retryState.max_attempts} attempts. Last error: ${retryState.last_error}`;
  agentLogger.error(finalError);

  // Don't return phase1_analysis - Phase 2 will read from disk files
  return {
    phase1_retry_tracking: {
      ...state.phase1_retry_tracking,
      data_flows_integrations: retryState
    },
    temp_dir: tempDir,
    errors: [...state.errors, `${agentName}: ${finalError}`],
    current_phase: 'failed'
  };
}
