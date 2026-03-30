import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { consolidateAnalyses } from "../../../utils/consolidation.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createAgentFromMarkdown } from "../../../utils/agent-factory.js";
import {
  extractJSON,
  type ValidationResult,
} from "../../../utils/validator.js";
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from "../../../utils/enhanced-retry.js";
import { logger } from "../../../utils/logger.js";
import { GapQuestionsService } from "../../../services/gap-questions.service.js";

interface Gap {
  type: "needs_verification" | "sparse_findings" | "missing_language_coverage";
  agent: string;
  item: string;
  question?: string;
  reason?: string;
  priority: "high" | "medium" | "low";
}

interface ConsolidatedGap extends Gap {
  consolidated_from: string[];
  original_count: number;
}

interface QuestionConsolidationOutput {
  consolidated_gaps: ConsolidatedGap[];
  consolidation_metadata: {
    original_gap_count: number;
    consolidated_gap_count: number;
    reduction_percentage: number;
    consolidation_groups: Array<{
      group_id: number;
      topic: string;
      original_items: string[];
      consolidated_to: string;
      reason?: string;
    }>;
  };
}

/**
 * Consolidates outputs from all 4 Phase 1 analyzer agents
 * Includes gap question consolidation and interactive questioning
 */
export async function consolidationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child("Phase 2: Consolidation");
  phaseLogger.info(" Starting...");

  // Read Phase 1 outputs from disk (not from state)
  const tempDir =
    state.temp_dir ||
    join(state.project_path, ".claude-temp/initialize-project");
  const phase1Dir = join(tempDir, "phase1-outputs");

  if (!existsSync(phase1Dir)) {
    throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
  }

  phaseLogger.info(" Loading Phase 1 outputs from disk...");

  const phase1Files = [
    "01-structure-architecture.json",
    "02-tech-stack-dependencies.json",
    "03-code-patterns-testing.json",
    "04-data-flows-integrations.json",
  ];

  const analyzers: any[] = [];

  for (const filename of phase1Files) {
    const filePath = join(phase1Dir, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Phase 1 output file not found: ${filePath}`);
    }
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    analyzers.push(content);
    phaseLogger.success(`  ✓ Loaded ${filename}`);
  }

  phaseLogger.info(" ✓ All Phase 1 outputs loaded from disk");

  try {
    // ========================================================================
    // STEP 1: MERGE ANALYSES
    // ========================================================================
    phaseLogger.info(" Step 1: Merging analyzer outputs...");

    // analyzers array is already populated from files

    const consolidated = consolidateAnalyses(analyzers);

    const tempDir = state.temp_dir!;
    const consolidatedPath = join(tempDir, "phase2-consolidation.json");
    writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    phaseLogger.info(" ✓ Consolidation complete");
    logger.blank();

    // ========================================================================
    // STEP 2: GAP ANALYSIS
    // ========================================================================
    phaseLogger.info(" Step 2: Analyzing gaps...");

    const consolidationData = JSON.parse(
      readFileSync(consolidatedPath, "utf-8"),
    );
    let gaps: Gap[] = [];

    // Extract gaps from identified_gaps array (which are strings)
    // We need to reconstruct Gap objects from the consolidated analysis
    if (
      consolidationData.identified_gaps &&
      consolidationData.identified_gaps.length > 0
    ) {
      // Re-run gap extraction to get structured data
      gaps = extractStructuredGaps(analyzers);
    }

    const conflictsCount = consolidationData.conflicting_findings?.length || 0;

    phaseLogger.info(`  Gaps identified: ${gaps.length}`);
    phaseLogger.info(`  Conflicts detected: ${conflictsCount}`);
    logger.blank();

    // ========================================================================
    // STEP 3: QUESTION CONSOLIDATION (if > 1 gap)
    // ========================================================================
    if (gaps.length > 1) {
      phaseLogger.info(" Step 3: Consolidating similar questions...");
      phaseLogger.info("  Running AI-powered question consolidation agent...");
      logger.blank();

      const consolidationResult = await consolidateQuestions(
        gaps,
        state.project_path,
        state.framework_path,
        tempDir,
        consolidatedPath,
      );

      if (consolidationResult.success && consolidationResult.consolidated) {
        // Update consolidation.json with consolidated gaps
        const consolidatedGaps = consolidationResult.consolidated.consolidated_gaps;

        // Ensure every gap has an agent field (fallback to first consolidated_from if missing)
        consolidatedGaps.forEach((gap) => {
          if (!gap.agent && gap.consolidated_from && gap.consolidated_from.length > 0) {
            gap.agent = gap.consolidated_from[0];
          }
        });

        consolidationData.gaps = consolidatedGaps;
        consolidationData.question_consolidation =
          consolidationResult.consolidated.consolidation_metadata;
        writeFileSync(
          consolidatedPath,
          JSON.stringify(consolidationData, null, 2),
        );

        const newGapCount =
          consolidationResult.consolidated.consolidated_gaps.length;
        phaseLogger.info(
          `  Questions after consolidation: ${newGapCount} (was ${gaps.length})`,
        );
        gaps = consolidationResult.consolidated.consolidated_gaps;
      } else {
        phaseLogger.info("  ⚠ WARNING: Question consolidation failed");
        phaseLogger.info("  Proceeding with original unconsolidated gaps");

        // Convert gaps to ConsolidatedGap format (each gap is its own group)
        const consolidatedGaps: ConsolidatedGap[] = gaps.map((gap) => ({
          ...gap,
          consolidated_from: [gap.agent],
          original_count: 1,
        }));

        consolidationData.gaps = consolidatedGaps;
        writeFileSync(
          consolidatedPath,
          JSON.stringify(consolidationData, null, 2),
        );
      }
      logger.blank();
    } else if (gaps.length === 1) {
      phaseLogger.info(" Step 3: Only 1 gap found - skipping consolidation");

      // Convert single gap to ConsolidatedGap format
      const consolidatedGap: ConsolidatedGap = {
        ...gaps[0],
        consolidated_from: [gaps[0].agent],
        original_count: 1,
      };

      consolidationData.gaps = [consolidatedGap];
      writeFileSync(
        consolidatedPath,
        JSON.stringify(consolidationData, null, 2),
      );
      logger.blank();
    } else {
      phaseLogger.info(" Step 3: No gaps found - skipping consolidation");
      logger.blank();
    }

    // ========================================================================
    // STEP 4: INTERACTIVE QUESTIONS (if needed)
    // ========================================================================
    const needsUserInput = gaps.length > 5 || conflictsCount > 0;

    if (needsUserInput) {
      phaseLogger.warn("Warning: Gaps or conflicts detected in analysis");
      phaseLogger.info(`  Gaps: ${gaps.length}`);
      phaseLogger.info(`  Conflicts: ${conflictsCount}`);
      logger.blank();

      const skipQuestions = process.env.SKIP_GAP_QUESTIONS === "true";

      if (skipQuestions) {
        phaseLogger.info(
          "ℹ SKIP_GAP_QUESTIONS=true - Continuing without user input",
        );
        phaseLogger.info("  (Synthesis will proceed with available data)");
        logger.blank();
      } else {
        // Stop all ora spinners to prevent interference with user input
        logger.stopAllSpinners();
        phaseLogger.info("Launching interactive questionnaire...");
        logger.blank();

        const askResult = await askGapQuestions(consolidatedPath, false);

        if (!askResult.success) {
          logger.blank();
          phaseLogger.error("❌ Error during gap questionnaire");
          logger.blank();
          phaseLogger.info("You can:");
          phaseLogger.info(
            "  1. Set SKIP_GAP_QUESTIONS=true to skip questions",
          );
          phaseLogger.info(`  2. Manually edit: ${consolidatedPath}`);
          phaseLogger.info("  3. Try again");
          logger.blank();

          return {
            errors: [...state.errors, "Gap questionnaire failed"],
            current_phase: "failed",
          };
        }

        phaseLogger.success("Gap clarifications complete");
        logger.blank();
      }
    } else {
      phaseLogger.success("No critical gaps requiring user input");
      logger.blank();
    }

    // ========================================================================
    // STEP 5: FINALIZE CONSOLIDATION
    // ========================================================================
    phaseLogger.info(" Step 4: Finalizing consolidation...");

    const finalConsolidation = JSON.parse(
      readFileSync(consolidatedPath, "utf-8"),
    );

    phaseLogger.success("Consolidation ready for synthesis");
    phaseLogger.info(`  File: ${consolidatedPath}`);
    logger.blank();

    phaseLogger.info(" ✓ Complete");
    phaseLogger.info(`  - Gaps identified: ${gaps.length}`);

    return {
      // Mark Phase 1 as completed (Phase 6 validation checks this)
      phase1_analysis: {
        all_completed: true,
        completion_timestamp: new Date().toISOString(),
      },
      phase2_consolidation: {
        ...consolidated,
        ...finalConsolidation,
        timestamp: new Date().toISOString(),
      },
      current_phase: "phase2_consolidation",
    };
  } catch (error) {
    const errorMessage = `Consolidation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ Error: ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: "failed",
    };
  }
}

/**
 * Extract structured gap objects from analyzer outputs
 */
function extractStructuredGaps(analyzers: any[]): Gap[] {
  const gaps: Gap[] = [];

  analyzers.forEach((analyzer) => {
    if (analyzer.needs_verification && analyzer.needs_verification.length > 0) {
      analyzer.needs_verification.forEach((item: any) => {
        const isObject = typeof item === "object" && item !== null;
        const itemText = isObject
          ? item.item || JSON.stringify(item)
          : String(item);
        const questionText = isObject ? item.question : String(item);
        const reasonText = isObject ? item.reason : undefined;

        gaps.push({
          type: "needs_verification",
          agent: normalizeAgentName(analyzer.agent_name),
          item: itemText,
          question: questionText,
          reason: reasonText,
          priority: "medium",
        });
      });
    }
  });

  return gaps;
}

/**
 * Normalize agent name for consistency
 */
function normalizeAgentName(agentName: string): string {
  const name = agentName.toLowerCase();

  if (name.includes("structure") || name.includes("architecture")) {
    return "01-structure-architecture";
  }
  if (name.includes("stack") || name.includes("dependencies")) {
    return "02-tech-stack-dependencies";
  }
  if (name.includes("patterns") || name.includes("testing")) {
    return "03-code-patterns-testing";
  }
  if (name.includes("flow") || name.includes("integration")) {
    return "04-data-flows-integrations";
  }

  return agentName;
}

/**
 * Consolidate similar questions using question-consolidator agent
 */
async function consolidateQuestions(
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
    // Build prompt with gaps
    const gapsJson = JSON.stringify(gaps, null, 2);

    // Define agent invocation function with feedback support and session resumption
    const agentInvoke = async (feedbackPrompt: string, resumeSessionId?: string): Promise<{ output: string; sessionId: string }> => {
      const additionalContext = `
CRITICAL: Follow ALL instructions in the agent file below.

CRITICAL OUTPUT STRUCTURE - Your JSON MUST have EXACTLY these TWO top-level keys:
{
  "consolidated_gaps": [...],      // REQUIRED: Array of gap objects
  "consolidation_metadata": {...}  // REQUIRED: Metadata object
}

DO NOT wrap in "findings" or any other key. DO NOT output a bare array.
The FIRST character must be { and the LAST character must be }
Do NOT wrap in markdown code blocks (no \`\`\`json)
Do NOT add ANY text before or after the JSON

CRITICAL VALIDATION REQUIREMENTS:
1. Every 'question' field MUST end with a question mark (?)
   - WRONG: "What are the requirements. Please specify details."
   - WRONG: "What tools are used? (e.g., eslint, prettier)"
   - RIGHT: "What are the requirements and details?"
   - RIGHT: "What tools and configurations are used for linting?"

2. Remove clarifying examples or follow-up instructions from questions
   - If you need to add context, put it in the 'reason' field instead

3. When populating 'consolidated_from' array, use these EXACT agent names:
   - 01-structure-architecture
   - 02-tech-stack-dependencies
   - 03-code-patterns-testing
   - 04-data-flows-integrations
   - consolidation

   Do NOT use descriptive names like 'tech-stack-dependencies-analyzer'.
   Use the file name format shown above (with numeric prefixes, no -analyzer suffix).

4. Every gap object MUST have ALL 8 fields:
   - agent (string)
   - item (string)
   - question (string ending with ?)
   - reason (string)
   - priority (high|medium|low)
   - type (needs_verification|sparse_findings|missing_language_coverage)
   - consolidated_from (array of strings)
   - original_count (number)

=== INPUT DATA ===
Current gaps that need consolidation:
${gapsJson}

${feedbackPrompt}
`;

      const agent = await createAgentFromMarkdown({
        agentName: "question-consolidator",
        agentFile: "06-question-consolidator.md",
        projectPath,
        frameworkPath,
        additionalContext,
        timeout: 120000, // 2 minutes
        useUltrathink: true, // Enable maximum thinking for thorough consolidation
        resumeSessionId, // Pass session ID for context-preserving retry with --resume
      });

      const result = await agent.invoke({
        input: "Consolidate the questions provided in the context above.",
      });

      return {
        output: result.output || result.content || JSON.stringify(result),
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
    const outputPath = consolidatedPath.replace('.json', '-question-consolidation.json');

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

/**
 * Ask gap questions interactively using TypeScript service
 */
async function askGapQuestions(
  consolidationPath: string,
  skipQuestions: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  const gapService = new GapQuestionsService();

  try {
    const result = await gapService.askGapQuestions(
      consolidationPath,
      skipQuestions,
    );

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: `Gap questions failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
