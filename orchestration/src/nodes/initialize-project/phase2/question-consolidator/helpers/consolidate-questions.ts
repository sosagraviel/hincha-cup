import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Gap, QuestionConsolidationOutput } from '../types.js';
import { AgentFactory } from '../../../../../utils/shared/agent-factory/index.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from '../../../../../utils/enhanced-retry.js';
import { logger } from '../../../../../utils/logger.js';
import { getFrameworkAgentPath } from '../../../shared/index.js';
import { getInitializeProjectPhase } from '../../../../../services/framework/debug-store/index.js';
import { validateConsolidationOutput } from './validate-consolidation-output.js';
import { buildConsolidationPrompt } from '../prompt-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load consolidation instructions from markdown file
 */
function loadConsolidationInstructions(): string {
  const instructionsPath = join(__dirname, '../prompts/consolidation-instructions.md');
  return readFileSync(instructionsPath, 'utf-8');
}

/**
 * Consolidate similar questions using question-consolidator agent
 */
export async function consolidateQuestions(
  gaps: Gap[],
  projectPath: string,
  frameworkPath: string,
  tempDir: string,
  consolidatedPath: string,
): Promise<{
  success: boolean;
  consolidated?: QuestionConsolidationOutput;
  error?: string;
}> {
  const consolidationLogger = logger.child('Phase 2: Consolidation');

  try {
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      const factory = await AgentFactory.create();

      // Compose the agent input: static instructions first, then the
      // dynamic input-gaps payload (+ retry feedback when present). The
      // builder was previously orphaned — the agent received only the
      // instructions and reported "No gap data was provided", inventing
      // metadata fields that failed validation. Always pass the gaps so
      // the agent has actual data to consolidate.
      const instructions = loadConsolidationInstructions();
      const dynamicInput = buildConsolidationPrompt(gaps, feedbackPrompt);
      const inputPrompt = `${instructions}\n\n${dynamicInput}`;

      const agent = await factory.createAgent({
        agentName: 'question-consolidator',
        agentFilePath: getFrameworkAgentPath(frameworkPath, '06-question-consolidator.md'),
        projectPath,
        frameworkPath,
        timeout: 600000,
        resumeSessionId,
        phase: getInitializeProjectPhase('phase2'),
        settingsPath: join(
          frameworkPath,
          'orchestration/src/nodes/initialize-project/phase2/question-consolidator/settings.json',
        ),
      });

      const result = await agent.invoke({ inputPrompt, attemptNumber });

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const { data: parsed } = await retryWithEnhancedFeedback<QuestionConsolidationOutput>(
      agentInvoke,
      validateConsolidationOutput,
      DEFAULT_RETRY_CONFIG,
      {
        projectPath,
        agentName: 'question-consolidator',
        phase: getInitializeProjectPhase('phase2'),
      },
    );

    consolidationLogger.info('  ✓ Consolidation successful and validated');
    return { success: true, consolidated: parsed };
  } catch (error) {
    const errMsg = (error as Error).message;
    consolidationLogger.error(`  ✗ Consolidation failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}
