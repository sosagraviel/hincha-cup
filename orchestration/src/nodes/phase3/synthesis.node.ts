import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig
} from '../../utils/enhanced-retry.js';
import type { ValidationResult } from '../../utils/validator.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
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

  // Read Phase 2 consolidation from disk (not from state)
  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  const consolidationPath = join(tempDir, 'phase2-consolidation.json');

  if (!existsSync(consolidationPath)) {
    throw new Error(`Phase 2 consolidation file not found: ${consolidationPath}`);
  }

  console.log('[Phase 3: Synthesis] Loading Phase 2 consolidation from disk...');
  const phase2Consolidation = JSON.parse(readFileSync(consolidationPath, 'utf-8'));
  console.log('[Phase 3: Synthesis] ✓ Phase 2 consolidation loaded from disk');

  try {
    // Define agent invocation function with feedback support
    const agentInvoke = async (feedbackPrompt: string): Promise<string> => {
      // Add consolidated findings to context
      const consolidatedContext = `
=== CONSOLIDATED ANALYSIS FROM PHASE 2 ===

${JSON.stringify(phase2Consolidation, null, 2)}

${feedbackPrompt}
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

      return result.output || result.content || String(result);
    };

    // Define validator function
    const validator = (output: string): ValidationResult => {
      // Basic validation: should contain markdown content
      if (!output || output.length < 500) {
        return {
          valid: false,
          errors: ['Synthesis output too short or empty (minimum 500 characters)'],
          data: null
        };
      }

      return {
        valid: true,
        errors: [],
        data: output
      };
    };

    // Use enhanced retry with progressive feedback (10 attempts for Opus)
    const synthesisContent = await retryWithEnhancedFeedback<string>(
      agentInvoke,
      validator,
      { ...DEFAULT_RETRY_CONFIG, maxAttempts: 10 }
    );

    // Save raw synthesis
    const synthesisPath = join(tempDir, 'synthesis-raw.md');
    writeFileSync(synthesisPath, synthesisContent);

    console.log('[Phase 3: Synthesis] ✓ Synthesis complete');
    console.log(`  - Output length: ${synthesisContent.length} characters`);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true
      },
      current_phase: 'phase3_synthesis'
    };

  } catch (error) {
    const errorMessage = `Synthesis failed: ${(error as Error).message}`;
    console.error(`[Phase 3: Synthesis] ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}
