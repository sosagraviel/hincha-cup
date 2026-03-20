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
 * Code Patterns & Testing Analyzer Node
 *
 * Analyzes:
 * - Code patterns and conventions
 * - Testing frameworks and coverage
 * - Code quality tools (linters, formatters)
 * - Build and CI/CD configurations
 */
export async function codePatternsTestingAnalyzerNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'code-patterns-testing-analyzer';
  const agentFile = '03-code-patterns-testing.md';

  const agentLogger = logger.child(agentName);
  agentLogger.blank();
  agentLogger.info('Starting analysis...');

  let retryState = state.phase1_retry_tracking?.code_patterns_testing || initRetryState();

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
        timeout: 300000
      });

      const result = await agent.invoke({
        input: `Analyze code patterns and testing at: ${state.project_path}`
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

      const outputPath = join(tempDir, 'phase1-outputs', '03-code-patterns-testing.json');
      writeFileSync(outputPath, JSON.stringify(validation.data, null, 2));

      agentLogger.success('Analysis complete');
      retryState = completeRetryState(retryState);

      return {
        phase1_analysis: {
          ...state.phase1_analysis,
          code_patterns_testing: validation.data,
          all_completed: false
        },
        phase1_retry_tracking: {
          ...state.phase1_retry_tracking,
          code_patterns_testing: retryState
        },
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

        return {
          phase1_retry_tracking: {
            ...state.phase1_retry_tracking,
            code_patterns_testing: retryState
          },
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

  return {
    phase1_retry_tracking: {
      ...state.phase1_retry_tracking,
      code_patterns_testing: retryState
    },
    errors: [...state.errors, `${agentName}: ${finalError}`],
    current_phase: 'failed'
  };
}
