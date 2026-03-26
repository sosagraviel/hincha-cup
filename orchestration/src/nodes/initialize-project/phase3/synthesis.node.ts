import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { createAgentFromMarkdown } from "../../../utils/agent-factory.js";
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "../../../utils/enhanced-retry.js";
import type { ValidationResult } from "../../../utils/validator.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../../../utils/logger.js";

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
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child("Phase 3: Synthesis");

  const agentName = "architect-synthesizer";
  const agentFile = "05-architect-synthesizer.md";

  phaseLogger.info(" Starting Opus synthesis...");

  // Read Phase 2 consolidation from disk (not from state)
  const tempDir =
    state.temp_dir ||
    join(state.project_path, ".claude-temp/initialize-project");
  const consolidationPath = join(tempDir, "phase2-consolidation.json");

  if (!existsSync(consolidationPath)) {
    throw new Error(
      `Phase 2 consolidation file not found: ${consolidationPath}`,
    );
  }

  phaseLogger.info(" Loading Phase 2 consolidation from disk...");
  const phase2Consolidation = JSON.parse(
    readFileSync(consolidationPath, "utf-8"),
  );
  phaseLogger.success(" ✓ Phase 2 consolidation loaded from disk");

  try {
    // Define agent invocation function with feedback support
    const agentInvoke = async (feedbackPrompt: string): Promise<string> => {
      const consolidatedContext = `
=== CONSOLIDATED ANALYSIS FROM PHASE 2 ===

${JSON.stringify(phase2Consolidation, null, 2)}

${feedbackPrompt}
`;

      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: consolidatedContext,
        timeout: 600000, // 10 minutes (longer for Opus)
        useUltrathink: true, // Enable maximum thinking for thorough synthesis
        requireJsonOutput: false, // Synthesis agent outputs markdown, not JSON
      });

      const result = await agent.invoke({
        input: `Synthesize comprehensive results for: ${state.project_path}`,
      });

      return result.output || result.content || String(result);
    };

    const validator = (output: string): ValidationResult => {
      const errors: string[] = [];

      // Basic validation: should contain markdown content
      if (!output || output.length < 500) {
        return {
          valid: false,
          errors: [
            "Synthesis output too short or empty (minimum 500 characters)",
          ],
          data: null,
        };
      }

      // Check for required sections
      const hasCLAUDESection = output.includes("# CLAUDE.md Content");
      const hasProjectContextSection = output.includes(
        "# project-context/SKILL.md Content",
      );
      const hasSeparator = output.includes("---");

      if (!hasCLAUDESection) {
        errors.push(
          'Missing required section: "# CLAUDE.md Content" - this must be the first section header',
        );
      }

      if (!hasProjectContextSection) {
        errors.push(
          'Missing required section: "# project-context/SKILL.md Content" - this must come after the separator',
        );
      }

      if (!hasSeparator) {
        errors.push(
          'Missing separator "---" between CLAUDE.md and project-context sections',
        );
      }

      // Check that output doesn't look like JSON
      const trimmedOutput = output.trim();
      if (trimmedOutput.startsWith("{") && trimmedOutput.includes('"agent_name"')) {
        errors.push(
          "Output appears to be JSON format instead of markdown. Please output markdown content with the two required sections, not JSON.",
        );
      }

      if (errors.length > 0) {
        return {
          valid: false,
          errors: [
            "Synthesis output validation failed:",
            "",
            ...errors,
            "",
            "Expected format:",
            "# CLAUDE.md Content",
            "",
            "[markdown content for CLAUDE.md]",
            "",
            "---",
            "",
            "# project-context/SKILL.md Content",
            "",
            "[markdown content for project-context/SKILL.md with YAML frontmatter]",
          ],
          data: null,
        };
      }

      return {
        valid: true,
        errors: [],
        data: output,
      };
    };

    const synthesisContent = await retryWithEnhancedFeedback<string>(
      agentInvoke,
      validator,
      { ...DEFAULT_RETRY_CONFIG, maxAttempts: 10 },
    );

    const synthesisPath = join(tempDir, "synthesis-raw.md");
    writeFileSync(synthesisPath, synthesisContent);

    phaseLogger.success(" ✓ Synthesis complete");
    phaseLogger.info(
      `  - Output length: ${synthesisContent.length} characters`,
    );

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
      },
      current_phase: "phase3_synthesis",
    };
  } catch (error) {
    const errorMessage = `Synthesis failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: "failed",
    };
  }
}
