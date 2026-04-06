import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  Gap,
  QuestionConsolidationOutput,
} from "../types.js";
import { AgentFactory } from "../../../../../utils/shared/agent-factory/index.js";
import {
  extractJSON,
  type ValidationResult,
} from "../../../../../utils/validator.js";
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from "../../../../../utils/enhanced-retry.js";
import { logger } from "../../../../../utils/logger.js";
import { buildConsolidationPrompt } from "../prompt-builder.js";
import {
  getFrameworkAgentPath,
  getInitializeProjectSettingsPath,
} from "../../../shared/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load consolidation instructions from markdown file
 */
function loadConsolidationInstructions(): string {
  const instructionsPath = join(
    __dirname,
    "../prompts/consolidation-instructions.md",
  );
  return readFileSync(instructionsPath, "utf-8");
}

/**
 * Consolidate similar questions using question-consolidator agent
 */
export async function consolidateQuestions(
  gaps: Gap[],
  projectPath: string,
  frameworkPath: string,
  _tempDir: string,
  consolidatedPath: string,
): Promise<{
  success: boolean;
  consolidated?: QuestionConsolidationOutput;
  error?: string;
}> {
  const consolidationLogger = logger.child("Phase 2: Consolidation");

  try {
    const consolidationInstructions = loadConsolidationInstructions();

    // Define agent invocation function with feedback support and session resumption
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
    ): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildConsolidationPrompt(gaps, feedbackPrompt);

      // Add ultrathink and consolidation instructions
      const inputPrompt = `ultrathink

${contextPrompt}

${consolidationInstructions}`;

      // Create agent using new interface
      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName: "question-consolidator",
        agentFilePath: getFrameworkAgentPath(
          frameworkPath,
          "06-question-consolidator.md",
        ),
        projectPath,
        frameworkPath,
        timeout: 300000, // 5 minutes
        resumeSessionId, // Pass session ID for context-preserving retry
        settingsPath: getInitializeProjectSettingsPath(frameworkPath),
      });

      const result = await agent.invoke({ inputPrompt }); // Pass inputPrompt to invoke()

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    // Define validator function
    const validator = (output: string): ValidationResult => {
      try {
        // Extract and parse JSON
        const jsonOutput = extractJSON(output);
        let parsed: any = JSON.parse(jsonOutput);

        // Unwrap: LLM often wraps output in analyzer schema { findings: { consolidated_gaps, ... } }
        if (parsed.findings && typeof parsed.findings === "object") {
          parsed = parsed.findings;
        }

        // Auto-wrap: if the LLM returned a bare array of gaps
        if (Array.isArray(parsed)) {
          parsed = {
            consolidated_gaps: parsed,
            consolidation_metadata: {
              original_gap_count: gaps.length,
              consolidated_gap_count: parsed.length,
              reduction_percentage:
                gaps.length > 0
                  ? Math.round(
                      ((gaps.length - parsed.length) / gaps.length) * 100,
                    )
                  : 0,
              consolidation_groups: [],
            },
          };
        }

        // Auto-remap: if the LLM used a different key name for the gaps array
        if (!parsed.consolidated_gaps && !Array.isArray(parsed)) {
          const arrayKey = Object.keys(parsed).find(
            (k) => Array.isArray(parsed[k]) && k !== "consolidation_groups",
          );
          if (arrayKey) {
            parsed.consolidated_gaps = parsed[arrayKey];
          }
        }

        // Basic validation
        if (
          !parsed.consolidated_gaps ||
          !Array.isArray(parsed.consolidated_gaps)
        ) {
          const topLevelKeys = Object.keys(parsed).join(", ");
          return {
            valid: false,
            errors: [
              `Invalid output: missing consolidated_gaps array. Top-level keys found: ${topLevelKeys || "(none)"}. Expected structure: { "consolidated_gaps": [...], "consolidation_metadata": {...} }`,
            ],
            data: null,
          };
        }

        if (!parsed.consolidation_metadata) {
          // Auto-generate metadata if gaps are valid but metadata is missing
          parsed.consolidation_metadata = {
            original_gap_count: gaps.length,
            consolidated_gap_count: parsed.consolidated_gaps.length,
            reduction_percentage:
              gaps.length > 0
                ? Math.round(
                    ((gaps.length - parsed.consolidated_gaps.length) /
                      gaps.length) *
                      100,
                  )
                : 0,
            consolidation_groups: [],
          };
        }

        // Validate question format (must end with ?)
        for (const gap of parsed.consolidated_gaps) {
          if (!gap.question || !gap.question.endsWith("?")) {
            return {
              valid: false,
              errors: [
                `Invalid question format: "${gap.question}" must end with ?`,
              ],
              data: null,
            };
          }
        }

        return {
          valid: true,
          errors: [],
          data: parsed as QuestionConsolidationOutput,
        };
      } catch (error) {
        return {
          valid: false,
          errors: [(error as Error).message],
          data: null,
        };
      }
    };

    // Use enhanced retry with progressive feedback
    // Save failed attempts with .attempt-N-question-consolidation suffix
    const outputPath = consolidatedPath.replace(
      ".json",
      "-question-consolidation.json",
    );

    const parsed = await retryWithEnhancedFeedback<QuestionConsolidationOutput>(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG,
      outputPath, // Pass output path for attempt logging
    );

    consolidationLogger.info("  ✓ Consolidation successful and validated");
    return { success: true, consolidated: parsed };
  } catch (error) {
    const errMsg = (error as Error).message;
    consolidationLogger.error(`  ✗ Consolidation failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}
