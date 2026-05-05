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
import { buildConsolidationPrompt } from '../prompt-builder.js';
import { getFrameworkAgentPath } from '../../../shared/index.js';
import { reasoningPrefix } from '../../../../../utils/shared/context-tags.js';
import { getInitializeProjectPhase } from '../../../../../services/framework/debug-store/index.js';
import { validateConsolidationOutput } from './validate-consolidation-output.js';

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
    const consolidationInstructions = loadConsolidationInstructions();

    // Define agent invocation function with feedback support and session resumption
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildConsolidationPrompt(gaps, feedbackPrompt);

      // Create agent using new interface
      const factory = await AgentFactory.create();

      // Provider-aware reasoning prefix (ultrathink for Claude, empty for Codex)
      const inputPrompt = `${reasoningPrefix(factory.getAuthConfig())}${contextPrompt}

${consolidationInstructions}`;

      const agent = await factory.createAgent({
        agentName: 'question-consolidator',
        agentFilePath: getFrameworkAgentPath(frameworkPath, '06-question-consolidator.md'),
        projectPath,
        frameworkPath,
        timeout: 600000, // 10 minutes
        resumeSessionId, // Pass session ID for context-preserving retry
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

    // Strict validator — single source of truth for the agent contract.
    // Rejects any divergence from the canonical 2-key shape so prompt
    // regressions surface as retry feedback instead of being silently
    // papered over.
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
