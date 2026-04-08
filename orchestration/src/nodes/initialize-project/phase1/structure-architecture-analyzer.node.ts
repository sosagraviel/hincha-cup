import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { createAgentFromMarkdown } from "../../../utils/agent-factory.js";
import {
  validateAndParseAgentOutput,
  type ValidationResult,
} from "../../../utils/validator.js";
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from "../../../utils/enhanced-retry.js";
import { logger } from "../../../utils/logger.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

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
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = "structure-architecture-analyzer";
  const agentFile = "01-structure-architecture.md";

  // Ensure temp directory exists
  const tempDir =
    state.temp_dir ||
    join(state.project_path, ".claude-temp/initialize-project");
  mkdirSync(join(tempDir, "phase1-outputs"), { recursive: true });

  try {
    const agentInvoke = async (feedbackPrompt: string): Promise<string> => {
      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: feedbackPrompt,
        timeout: 600000, // 10 minutes
        useUltrathink: true, // Enable maximum thinking for thorough analysis
      });

      const result = await agent.invoke({
        input: `Analyze the project structure and architecture at: ${state.project_path}`,
      });

      return result.output || result.content || JSON.stringify(result);
    };

    const validator = (output: string): ValidationResult => {
      return validateAndParseAgentOutput(output, agentName);
    };

    const validatedData = await retryWithEnhancedFeedback(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG,
    );

    const outputPath = join(
      tempDir,
      "phase1-outputs",
      "01-structure-architecture.json",
    );
    writeFileSync(outputPath, JSON.stringify(validatedData, null, 2));

    return {
      temp_dir: tempDir,
    };
  } catch (error) {
    const err = error as Error;

    if (
      err.message.includes("SIGINT") ||
      err.message.includes("interrupted by user")
    ) {
      throw error; // Re-throw to propagate up to graph.invoke()
    }

    return {
      errors: [...state.errors, `${agentName}: ${err.message}`],
      current_phase: "failed",
    };
  }
}
