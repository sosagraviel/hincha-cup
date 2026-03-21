import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import { validateAndParseAgentOutput, buildValidationErrorFeedback } from '../../utils/validator.js';
import {
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
  buildErrorFeedback,
  sleep,
  DEFAULT_RETRY_CONFIG
} from '../../utils/retry.js';
import { logger } from '../../utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

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
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'structure-architecture-analyzer';
  const agentFile = '01-structure-architecture.md';

  // Create logger for this agent
  const agentLogger = logger.child(agentName);
  agentLogger.blank();
  agentLogger.info('Starting analysis...');

  // Initialize retry state if not exists
  let retryState = state.phase1_retry_tracking?.structure_architecture || initRetryState();

  // Ensure temp directory exists
  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  let additionalContext = '';

  // Retry loop with exponential backoff
  while (shouldRetry(retryState)) {
    try {
      agentLogger.info(`Attempt ${retryState.attempt + 1}/${retryState.max_attempts}`);

      // Build error feedback from previous attempts
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

      // Invoke agent
      const result = await agent.invoke({
        input: `Analyze the project structure and architecture at: ${state.project_path}`
      });

      // Extract output
      const rawOutput = result.output || result.content || JSON.stringify(result);

      // Save raw output for debugging (like bash scripts do)
      const rawOutputPath = join(tempDir, 'phase1-outputs', `${agentName}-attempt${retryState.attempt}.raw`);
      writeFileSync(rawOutputPath, rawOutput);

      // Validate output against Zod schema
      const validation = validateAndParseAgentOutput(rawOutput, agentName);

      if (!validation.valid) {
        // Validation failed - update retry state with feedback
        const errorMessage = buildValidationErrorFeedback(validation);
        retryState = updateRetryState(retryState, errorMessage);

        agentLogger.warn('Validation failed');
        agentLogger.increaseIndent();
        validation.errors?.forEach(err => agentLogger.warn(err));
        agentLogger.decreaseIndent();

        // Wait with exponential backoff before retry
        if (shouldRetry(retryState) && retryState.next_delay_ms) {
          agentLogger.info(`Retrying in ${Math.round(retryState.next_delay_ms / 1000)}s...`);
          await sleep(retryState.next_delay_ms);
        }

        continue; // Retry
      }

      // Success! Save output and update state
      const outputPath = join(tempDir, 'phase1-outputs', '01-structure-architecture.json');
      writeFileSync(outputPath, JSON.stringify(validation.data, null, 2));

      agentLogger.success('Analysis complete');

      retryState = completeRetryState(retryState);

      // Don't return phase1_analysis - Phase 2 will read from disk files
      return {
        phase1_retry_tracking: {
          ...state.phase1_retry_tracking,
          structure_architecture: retryState
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

      // Check if this is a rate limit error (non-retriable)
      if (err.message.includes('RATE_LIMIT')) {
        agentLogger.blank();
        agentLogger.warn('This is a RATE LIMIT error - retrying will not help until limit resets.');
        agentLogger.warn('Please follow the instructions above to switch to API key mode or wait.');
        agentLogger.blank();

        // Don't retry on rate limits - fail immediately
        return {
          phase1_retry_tracking: {
            ...state.phase1_retry_tracking,
            structure_architecture: retryState
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

  // Max retries exceeded
  const finalError = `Failed after ${retryState.max_attempts} attempts. Last error: ${retryState.last_error}`;

  agentLogger.error(finalError);

  return {
    phase1_retry_tracking: {
      ...state.phase1_retry_tracking,
      structure_architecture: retryState
    },
    errors: [
      ...state.errors,
      `${agentName}: ${finalError}`
    ],
    current_phase: 'failed'
  };
}
