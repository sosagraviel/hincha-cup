import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { AgentFactory } from "../../../utils/shared/agent-factory/index.js";
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from "../../../utils/enhanced-retry.js";
import type { ValidationResult } from "../../../utils/validator.js";
import { validateSynthesisOutput } from "./validators/index.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../../../utils/logger.js";
import { buildSynthesisPrompt } from "./prompt-builder.js";
import {
  getFrameworkAgentPath,
} from "../shared/index.js";

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
    const agentInvoke = async (feedbackPrompt: string, resumeSessionId?: string): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildSynthesisPrompt(phase2Consolidation, feedbackPrompt);

      // Add ultrathink for deep reasoning
      // Synthesis analyzes code in depth to fill gaps identified in Phase 2 consolidation
      // It must NOT assume or guess - it reads actual code to fill missing information
      const inputPrompt = `ultrathink\n\n${contextPrompt}\n\nSynthesize comprehensive results for: ${state.project_path}`;

      // Create agent using new interface
      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 600000, // 10 minutes (agent should use max 10 tool calls, mostly synthesis)
        resumeSessionId, // Pass session ID for context-preserving retry
        settingsPath: join(state.framework_path, 'orchestration/src/nodes/initialize-project/phase3/settings.json'),
      });

      const result = await agent.invoke({ inputPrompt }); // Pass inputPrompt to invoke()

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const validator = (output: string): ValidationResult => {
      // CRITICAL: This validator MUST be IDENTICAL to the stop hook validation
      // Uses the shared comprehensive validator from synthesis-validator.ts
      const result = validateSynthesisOutput(output);

      return {
        valid: result.valid,
        errors: result.errors,
        data: result.valid ? output : null,
      };
    };

    const synthesisPath = join(tempDir, "synthesis-raw.md");

    const synthesisContent = await retryWithEnhancedFeedback<string>(
      agentInvoke,
      validator,
      { ...DEFAULT_RETRY_CONFIG, maxAttempts: 10 },
      synthesisPath, // Save failed attempts as synthesis-raw.attempt-N.md
    );
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
