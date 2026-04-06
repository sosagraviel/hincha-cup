import type { InitializeProjectState } from "../../../../state/schemas/initialize-project.schema.js";
import { analysisConsolidator } from "./analysis-consolidator.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../../../../utils/logger.js";
import type { Gap, ConsolidatedGap } from "./types.js";
import { extractStructuredGaps } from "./helpers/extract-structured-gaps.js";
import { consolidateQuestions } from "./helpers/consolidate-questions.js";
import { askGapQuestions } from "./helpers/ask-gap-questions.js";

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

    const consolidated = analysisConsolidator(analyzers);

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
        const consolidatedGaps =
          consolidationResult.consolidated.consolidated_gaps;

        // Ensure every gap has an agent field (fallback to first consolidated_from if missing)
        consolidatedGaps.forEach((gap) => {
          if (
            !gap.agent &&
            gap.consolidated_from &&
            gap.consolidated_from.length > 0
          ) {
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
