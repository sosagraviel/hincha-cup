import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import {
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
  buildErrorFeedback,
  sleep
} from '../../utils/retry.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Phase 3: Opus Synthesis Node
 *
 * This node runs the architect-synthesizer agent (Opus model) which:
 * - Takes consolidated findings from Phase 2
 * - Generates comprehensive project analysis
 * - Creates CLAUDE.md and project-context markdown content
 * - Provides high-level architectural insights
 *
 * Features:
 * - Uses Opus model for deep reasoning
 * - Retry logic with exponential backoff (up to 10 attempts)
 * - Error feedback for self-correction
 * - Longer timeout (10 minutes)
 *
 * @param state - Current workflow state
 * @returns Updated state with synthesis output
 */
export async function synthesisNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'architect-synthesizer';
  const agentFile = '05-architect-synthesizer.md';

  console.log('\n[Phase 3: Synthesis] Starting Opus synthesis...');

  // Verify Phase 2 completed
  if (!state.phase2_consolidation) {
    throw new Error('Phase 2 consolidation not found in state');
  }

  // Initialize retry state with 10 attempts (more than Phase 1)
  let retryState = state.phase3_retry || initRetryState(10);

  const tempDir = state.temp_dir!;
  let additionalContext = '';

  // Retry loop
  while (shouldRetry(retryState)) {
    try {
      console.log(`[Phase 3: Synthesis] Attempt ${retryState.attempt + 1}/${retryState.max_attempts}`);

      // Build error feedback from previous attempts
      additionalContext = buildErrorFeedback(retryState);

      // Add consolidated findings to context
      const consolidatedContext = `
=== CONSOLIDATED ANALYSIS FROM PHASE 2 ===

${JSON.stringify(state.phase2_consolidation, null, 2)}

${additionalContext}
`;

      // Create Opus agent
      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: consolidatedContext,
        timeout: 600000 // 10 minutes (longer for Opus)
      });

      // Invoke synthesis agent
      const result = await agent.invoke({
        input: `Synthesize comprehensive analysis for: ${state.project_path}`
      });

      // Extract synthesis content
      const synthesisContent = result.output || result.content || String(result);

      // Basic validation: should contain markdown content
      if (!synthesisContent || synthesisContent.length < 500) {
        throw new Error('Synthesis output too short or empty');
      }

      // Save raw synthesis
      const synthesisPath = join(tempDir, 'synthesis-raw.md');
      writeFileSync(synthesisPath, synthesisContent);

      console.log('[Phase 3: Synthesis] ✓ Synthesis complete');
      console.log(`  - Output length: ${synthesisContent.length} characters`);

      retryState = completeRetryState(retryState);

      return {
        phase3_synthesis: {
          synthesis_content: synthesisContent,
          timestamp: new Date().toISOString(),
          validation_passed: true
        },
        phase3_retry: retryState,
        current_phase: 'phase3_synthesis'
      };

    } catch (error) {
      const errorMessage = `Synthesis failed: ${(error as Error).message}`;
      retryState = updateRetryState(retryState, errorMessage);

      console.error(`[Phase 3: Synthesis] Error:`, errorMessage);

      if (shouldRetry(retryState) && retryState.next_delay_ms) {
        console.log(`[Phase 3: Synthesis] Retrying in ${retryState.next_delay_ms}ms...`);
        await sleep(retryState.next_delay_ms);
      }
    }
  }

  // Max retries exceeded
  const finalError = `Synthesis failed after ${retryState.max_attempts} attempts. Last error: ${retryState.last_error}`;

  console.error(`[Phase 3: Synthesis] ✗ ${finalError}`);

  return {
    phase3_retry: retryState,
    errors: [...state.errors, finalError],
    current_phase: 'failed'
  };
}
