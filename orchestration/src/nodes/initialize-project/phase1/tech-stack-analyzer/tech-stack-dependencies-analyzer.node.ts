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
import { getFrameworkAgentPath } from '../../shared/index.js';

/**
 * Analyzes tech stack, programming languages, dependencies, and build tools
 */
export async function techStackDependenciesAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'tech-stack-dependencies-analyzer';
  const agentFile = '02-tech-stack-dependencies.md';

  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  try {
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
    ): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildPhase1AnalyzerPrompt(
        state.project_path,
        state.framework_path,
        agentName,
        feedbackPrompt, // Feedback for retry
      );

      // Add ultrathink and task instruction to input prompt
      const inputPrompt = `ultrathink\n\n${contextPrompt}\n\nAnalyze the tech stack and dependencies at: ${state.project_path}`;

      // Create agent using new interface
      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 600000, // 10 minutes
        resumeSessionId, // Pass session ID for context-preserving retry
        settingsPath: join(
          state.framework_path,
          'orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/settings.json',
        ),
      });

      const result = await agent.invoke({ inputPrompt }); // Pass inputPrompt to invoke()

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const validator = (output: string): ValidationResult => {
      return validateAndParseAgentOutput(output, agentName);
    };

    // Define output path for saving both successful and failed attempts
    const outputPath = join(tempDir, 'phase1-outputs', '02-tech-stack-dependencies.json');

    const validatedData = await retryWithEnhancedFeedback(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG,
      outputPath, // Pass output path for attempt logging
    );

    writeFileSync(outputPath, JSON.stringify(validatedData, null, 2));

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
