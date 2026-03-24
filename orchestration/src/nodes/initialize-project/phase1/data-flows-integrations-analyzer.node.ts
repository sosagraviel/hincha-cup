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
 * Data Flows & Integrations Analyzer Node
 *
 * Analyzes:
 * - Data flow patterns
 * - API integrations and endpoints
 * - Database schemas and ORMs
 * - External service integrations
 */
export async function dataFlowsIntegrationsAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = "data-flows-integrations-analyzer";
  const agentFile = "04-data-flows-integrations.md";

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
      });

      const result = await agent.invoke({
        input: `Analyze the data flows and integrations at: ${state.project_path}`,
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
      "04-data-flows-integrations.json",
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
      throw error;
    }

    return {
      errors: [...state.errors, `${agentName}: ${err.message}`],
      current_phase: "failed",
    };
  }
}
