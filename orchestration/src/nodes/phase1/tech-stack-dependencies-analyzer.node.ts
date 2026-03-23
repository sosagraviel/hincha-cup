import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import { validateAndParseAgentOutput, type ValidationResult } from '../../utils/validator.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG
} from '../../utils/enhanced-retry.js';
import { logger } from '../../utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Analyzes tech stack, programming languages, dependencies, and build tools
 */
export async function techStackDependenciesAnalyzerNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'tech-stack-dependencies-analyzer';
  const agentFile = '02-tech-stack-dependencies.md';


  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  try {
    // Define agent invocation function with feedback support
    const agentInvoke = async (feedbackPrompt: string): Promise<string> => {
      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: feedbackPrompt,
        timeout: 600000 // 10 minutes
      });

      const result = await agent.invoke({
        input: `Analyze the tech stack and dependencies at: ${state.project_path}`
      });

      return result.output || result.content || JSON.stringify(result);
    };

    // Define validator function
    const validator = (output: string): ValidationResult => {
      return validateAndParseAgentOutput(output, agentName);
    };

    // Use enhanced retry with progressive feedback
    const validatedData = await retryWithEnhancedFeedback(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG
    );

    // Success! Save output
    const outputPath = join(tempDir, 'phase1-outputs', '02-tech-stack-dependencies.json');
    writeFileSync(outputPath, JSON.stringify(validatedData, null, 2));


    return {
      temp_dir: tempDir
    };

  } catch (error) {
    const err = error as Error;

    // Check if this is a SIGINT abort
    if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
      throw error;
    }

    // Check if this is a rate limit error
    if (err.message.includes('RATE_LIMIT')) {
    }


    return {
      errors: [
        ...state.errors,
        `${agentName}: ${err.message}`
      ],
      current_phase: 'failed'
    };
  }
}
