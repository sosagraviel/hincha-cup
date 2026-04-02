import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { StackProfile } from "../../../schemas/index.js";
import { logger } from "../../../utils/logger.js";

/**
 * Phase 6: Validation Node
 *
 * This node:
 * - Validates all generated files exist
 * - Validates framework-config.json structure
 * - Verifies CLAUDE.md and project-context/SKILL.md are valid markdown
 * - Confirms workflow completed successfully
 *
 * This is the final phase that marks the workflow as complete.
 *
 * @param state - Current workflow state
 * @returns Updated state with validation results
 */
export async function validationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child("Phase 6: Validation");
  phaseLogger.info(" Starting final validation...");

  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  try {
    // 1. Validate CLAUDE.md exists and is valid
    if (!state.claude_md_path || !existsSync(state.claude_md_path)) {
      validationErrors.push("CLAUDE.md not found");
    } else {
      const claudeMdContent = readFileSync(state.claude_md_path, "utf-8");
      if (claudeMdContent.length < 100) {
        validationWarnings.push("CLAUDE.md content seems too short");
      }
      phaseLogger.success(" ✓ CLAUDE.md validated");
    }

    // 2. Validate project-context/SKILL.md exists and is valid
    if (
      !state.project_context_path ||
      !existsSync(state.project_context_path)
    ) {
      validationErrors.push("project-context/SKILL.md not found");
    } else {
      const projectContextContent = readFileSync(
        state.project_context_path,
        "utf-8",
      );
      if (projectContextContent.length < 100) {
        validationWarnings.push(
          "project-context/SKILL.md content seems too short",
        );
      }
      phaseLogger.success(" ✓ project-context/SKILL.md validated");
    }

    // 3. Validate framework-config.json exists and is valid
    if (
      !state.framework_config_path ||
      !existsSync(state.framework_config_path)
    ) {
      validationErrors.push("framework-config.json not found");
    } else {
      const configContent = readFileSync(state.framework_config_path, "utf-8");
      try {
        const config = JSON.parse(configContent);

        // Validate required sections exist
        if (!config.version) {
          validationErrors.push("framework-config.json missing version");
        }
        if (!config.project_metadata) {
          validationErrors.push(
            "framework-config.json missing project_metadata",
          );
        }
        if (!config.analysis_results) {
          validationErrors.push(
            "framework-config.json missing analysis_results",
          );
        }

        phaseLogger.success(" ✓ framework-config.json validated");
      } catch (error) {
        validationErrors.push(
          `framework-config.json invalid JSON: ${(error as Error).message}`,
        );
      }
    }

    // 4. Validate skills directory exists
    const skillsDir = join(state.project_path, ".claude", "skills");
    if (!existsSync(skillsDir)) {
      validationErrors.push("Skills directory not found");
    } else {
      phaseLogger.success(" ✓ Skills directory exists");
    }

    // 5. Validate agents directory exists and has minimum agents
    const agentsDir = join(state.project_path, ".claude", "agents");
    if (!existsSync(agentsDir)) {
      validationErrors.push("Agents directory not found");
    } else {
      const agentFiles = readdirSync(agentsDir).filter((f) =>
        f.endsWith(".md"),
      );
      const agentCount = agentFiles.length;

      if (agentCount < 2) {
        validationErrors.push(
          `Insufficient agents generated: found ${agentCount}, expected at least 2 (planner + implementer)`,
        );
      } else {
        phaseLogger.success(
          ` ✓ Agents directory exists with ${agentCount} agents`,
        );
      }

      const hasPlannerAgent = agentFiles.some((f) => f.includes("planner"));
      if (!hasPlannerAgent) {
        validationErrors.push("Planner agent not found");
      }

      // Validate multi-stack coverage
      if (
        state.framework_config_path &&
        existsSync(state.framework_config_path)
      ) {
        try {
          const configContent = readFileSync(
            state.framework_config_path,
            "utf-8",
          );
          const config = JSON.parse(configContent);
          const stackProfile: StackProfile = config.stack_profile;

          if (stackProfile && stackProfile.file_counts?.by_language) {
            const significantLanguages = Object.entries(stackProfile.file_counts.by_language)
              .filter(([, count]) => count > 10)
              .map(([lang]) => lang.toLowerCase());

            // Check if there's an implementer for each significant language
            const missingImplementers: string[] = [];
            for (const lang of significantLanguages) {
              const hasImplementer = agentFiles.some(
                (f) =>
                  f.includes("implementer") && f.toLowerCase().includes(lang),
              );
              if (!hasImplementer) {
                missingImplementers.push(lang);
              }
            }

            if (missingImplementers.length > 0) {
              validationWarnings.push(
                `Missing implementers for significant languages: ${missingImplementers.join(", ")}`,
              );
            } else if (significantLanguages.length > 0) {
              phaseLogger.success(
                ` ✓ Multi-stack coverage validated for ${significantLanguages.length} languages`,
              );
            }
          }
        } catch (error) {
          validationWarnings.push(
            `Could not validate multi-stack coverage: ${(error as Error).message}`,
          );
        }
      }
    }

    // 6. Validate commands directory exists
    const commandsDir = join(state.project_path, ".claude", "commands");
    if (!existsSync(commandsDir)) {
      validationErrors.push("Commands directory not found");
    } else {
      const commandFiles = readdirSync(commandsDir).filter((f) =>
        f.endsWith(".md"),
      );
      phaseLogger.success(
        ` ✓ Commands directory exists with ${commandFiles.length} commands`,
      );
    }

    // 7. Validate all phases completed
    if (!state.phase1_analysis?.all_completed) {
      validationErrors.push("Phase 1 analysis not marked as complete");
    }
    if (!state.phase2_consolidation) {
      validationErrors.push("Phase 2 consolidation missing");
    }
    if (!state.phase3_synthesis) {
      validationErrors.push("Phase 3 synthesis missing");
    }
    if (!state.phase4_context?.framework_config_generated) {
      validationErrors.push("Phase 4 context generation not complete");
    }

    // Check for validation errors
    if (validationErrors.length > 0) {
      phaseLogger.error(" ✗ Validation failed:");
      validationErrors.forEach((err) => phaseLogger.error(`  - ${err}`));

      return {
        errors: [...state.errors, ...validationErrors],
        warnings: [...state.warnings, ...validationWarnings],
        current_phase: "failed",
      };
    }

    // Success!
    const completedAt = new Date().toISOString();
    const totalDuration = state.started_at
      ? new Date(completedAt).getTime() - new Date(state.started_at).getTime()
      : undefined;

    phaseLogger.success(" ✓ All validations passed");
    if (validationWarnings.length > 0) {
      phaseLogger.warn(" Warnings:");
      validationWarnings.forEach((warn) => phaseLogger.warn(`  - ${warn}`));
    }

    phaseLogger.blank();
    phaseLogger.success("=== INITIALIZATION COMPLETE ===");
    phaseLogger.info(`Project: ${state.project_path}`);
    phaseLogger.info(`CLAUDE.md: ${state.claude_md_path}`);
    phaseLogger.info(`Config: ${state.framework_config_path}`);
    if (totalDuration) {
      phaseLogger.info(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    }

    return {
      current_phase: "complete",
      completed_at: completedAt,
      total_duration_ms: totalDuration,
      warnings: [...state.warnings, ...validationWarnings],
    };
  } catch (error) {
    const errorMessage = `Validation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: "failed",
    };
  }
}
