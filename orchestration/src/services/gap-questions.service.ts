import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { logger } from "../utils/logger.js";
import chalk from "chalk";

/**
 * Gap from Phase 2 consolidation
 */
export interface ConsolidatedGap {
  type:
    | "needs_verification"
    | "sparse_findings"
    | "missing_language_coverage";
  agent: string;
  item: string;
  question: string;
  reason?: string;
  priority: "high" | "medium" | "low";
  consolidated_from: string[];
  original_count: number;
  user_response?: string;
  response_timestamp?: string;
  status?: "answered" | "skipped" | "pending";
}

/**
 * Result of gap questions interaction
 */
export interface GapQuestionsResult {
  success: boolean;
  answered_count: number;
  skipped_count: number;
  error?: string;
}

/**
 * Service for interactive gap question prompts
 * Collects user responses to enrich project analysis
 */
export class GapQuestionsService {
  private serviceLogger = logger.child("gap-questions");

  /**
   * Ask gap questions interactively and update consolidation file
   *
   * @param consolidationPath - Path to consolidation.json file
   * @param skipQuestions - If true, skip all questions (automated mode)
   * @returns Result with counts of answered/skipped questions
   */
  async askGapQuestions(
    consolidationPath: string,
    skipQuestions: boolean = false,
  ): Promise<GapQuestionsResult> {
    try {
      // Read consolidation file
      const consolidationData = JSON.parse(
        readFileSync(consolidationPath, "utf-8"),
      );

      const gaps: ConsolidatedGap[] = consolidationData.gaps || [];

      if (gaps.length === 0) {
        this.serviceLogger.info("No gaps to address");
        return { success: true, answered_count: 0, skipped_count: 0 };
      }

      if (skipQuestions) {
        this.serviceLogger.info(
          `Skipping ${gaps.length} gap questions (automated mode)`,
        );
        // Mark all as skipped
        for (const gap of gaps) {
          gap.status = "skipped";
        }
        writeFileSync(
          consolidationPath,
          JSON.stringify(consolidationData, null, 2),
        );
        return {
          success: true,
          answered_count: 0,
          skipped_count: gaps.length,
        };
      }

      // Interactive mode
      this.serviceLogger.info(`Found ${gaps.length} gaps to address`);

      // Check if stdin is available for reading
      if (input.readableEnded) {
        this.serviceLogger.error("stdin has been closed/ended - cannot read user input");
        // Mark all as skipped since we can't read input
        for (const gap of gaps) {
          gap.status = "skipped";
        }
        writeFileSync(
          consolidationPath,
          JSON.stringify(consolidationData, null, 2),
        );
        return {
          success: true,
          answered_count: 0,
          skipped_count: gaps.length,
          error: "stdin not available for interactive input",
        };
      }

      // Resume stdin to ensure it's in readable state
      // This is critical because stdin might be paused after the shell script's confirmation prompt
      // Calling resume() is safe even if stdin is already flowing
      input.resume();

      console.log("\n");
      console.log(chalk.cyan("━".repeat(70)));
      console.log(
        chalk.cyan.bold(
          "  GAP QUESTIONS - Help us understand your project better",
        ),
      );
      console.log(chalk.cyan("━".repeat(70)));
      console.log(
        "\nWe found some areas where more information would be helpful.",
      );
      console.log(
        "Please answer the following questions (or press Enter to skip):\n",
      );

      const rl = createInterface({ input, output });

      let answeredCount = 0;
      let skippedCount = 0;

      try {
        for (let i = 0; i < gaps.length; i++) {
          const gap = gaps[i];

          // Display question
          console.log(chalk.yellow(`\n[Question ${i + 1}/${gaps.length}]`));
          console.log(
            chalk.gray(`Priority: ${gap.priority} | From: ${gap.agent}`),
          );
          console.log(chalk.white.bold(`\n${gap.question}`));

          if (gap.reason) {
            console.log(chalk.gray(`Context: ${gap.reason}`));
          }

          console.log(
            chalk.gray("\n(Press Enter to skip, or type your answer)\n"),
          );

          // Get user response
          const response = await rl.question(chalk.green("> "));

          if (response.trim() === "") {
            gap.status = "skipped";
            skippedCount++;
            console.log(chalk.gray("  ⊘ Skipped"));
          } else {
            gap.user_response = response.trim();
            gap.response_timestamp = new Date().toISOString();
            gap.status = "answered";
            answeredCount++;
            console.log(chalk.green("  ✓ Answer recorded"));
          }
        }

        rl.close();

        // Write updated consolidation
        consolidationData.gaps = gaps;
        consolidationData.gap_questions_completed = true;
        consolidationData.gap_questions_timestamp = new Date().toISOString();

        writeFileSync(
          consolidationPath,
          JSON.stringify(consolidationData, null, 2),
        );

        console.log("\n");
        console.log(chalk.cyan("━".repeat(70)));
        console.log(
          chalk.green(
            `✓ Gap questions complete: ${answeredCount} answered, ${skippedCount} skipped`,
          ),
        );
        console.log(chalk.cyan("━".repeat(70)));
        console.log("\n");

        this.serviceLogger.success(
          `Gap questions completed: ${answeredCount} answered, ${skippedCount} skipped`,
        );

        return {
          success: true,
          answered_count: answeredCount,
          skipped_count: skippedCount,
        };
      } catch (error) {
        // Handle interruption (Ctrl+C)
        rl.close();

        // Save partial progress
        consolidationData.gaps = gaps;
        consolidationData.gap_questions_partial = true;
        writeFileSync(
          consolidationPath,
          JSON.stringify(consolidationData, null, 2),
        );

        if (
          error instanceof Error &&
          (error.message.includes("aborted") ||
            error.message.includes("canceled"))
        ) {
          console.log("\n");
          console.log(chalk.yellow("⚠ Gap questions interrupted"));
          console.log(
            chalk.gray(`Partial progress saved: ${answeredCount} answered`),
          );

          this.serviceLogger.warn(
            `Gap questions interrupted after ${answeredCount} answers`,
          );

          return {
            success: true,
            answered_count: answeredCount,
            skipped_count: skippedCount,
          };
        }

        throw error;
      }
    } catch (error) {
      const errorMsg = `Gap questions failed: ${error instanceof Error ? error.message : String(error)}`;
      this.serviceLogger.error(errorMsg);

      return {
        success: false,
        answered_count: 0,
        skipped_count: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if gap questions have been completed
   */
  checkGapQuestionsStatus(consolidationPath: string): {
    completed: boolean;
    partial: boolean;
    answered: number;
    skipped: number;
  } {
    try {
      const consolidationData = JSON.parse(
        readFileSync(consolidationPath, "utf-8"),
      );

      const gaps: ConsolidatedGap[] = consolidationData.gaps || [];
      const answered = gaps.filter((g) => g.status === "answered").length;
      const skipped = gaps.filter((g) => g.status === "skipped").length;

      return {
        completed: consolidationData.gap_questions_completed === true,
        partial: consolidationData.gap_questions_partial === true,
        answered,
        skipped,
      };
    } catch {
      return { completed: false, partial: false, answered: 0, skipped: 0 };
    }
  }
}
