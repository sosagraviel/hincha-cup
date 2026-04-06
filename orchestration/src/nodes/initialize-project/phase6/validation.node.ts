import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { logger } from "../../../utils/logger.js";
import { validateMarkdownFile } from "./helpers/file-validator.js";
import { validateFrameworkConfig } from "./helpers/config-validator.js";
import {
  validateDirectoryExists,
  validateDirectoryWithFiles,
  getClaudeDirectories,
} from "./helpers/directory-validator.js";
import { validateAgentCoverage } from "./helpers/agent-coverage-validator.js";
import { validatePhaseCompletion } from "./helpers/phase-completion-validator.js";

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
    // Get standard directory paths
    const directories = getClaudeDirectories(state.project_path);

    // 1. Validate CLAUDE.md exists and is valid
    const claudeMdResult = validateMarkdownFile(state.claude_md_path, "CLAUDE.md");
    validationErrors.push(...claudeMdResult.errors);
    validationWarnings.push(...claudeMdResult.warnings);
    if (claudeMdResult.valid) {
      phaseLogger.success(" ✓ CLAUDE.md validated");
    }

    // 2. Validate project-context/SKILL.md exists and is valid
    const projectContextResult = validateMarkdownFile(
      state.project_context_path,
      "project-context/SKILL.md",
    );
    validationErrors.push(...projectContextResult.errors);
    validationWarnings.push(...projectContextResult.warnings);
    if (projectContextResult.valid) {
      phaseLogger.success(" ✓ project-context/SKILL.md validated");
    }

    // 3. Validate framework-config.json exists and is valid
    const configResult = validateFrameworkConfig(state.framework_config_path);
    validationErrors.push(...configResult.errors);
    validationWarnings.push(...configResult.warnings);
    if (configResult.valid) {
      phaseLogger.success(" ✓ framework-config.json validated");
    }

    // 4. Validate skills directory exists
    const skillsResult = validateDirectoryExists(directories.skills, "Skills");
    validationErrors.push(...skillsResult.errors);
    if (skillsResult.valid) {
      phaseLogger.success(" ✓ Skills directory exists");
    }

    // 5. Validate agents directory exists and has minimum agents
    const agentsResult = validateDirectoryWithFiles(directories.agents, "Agents");
    validationErrors.push(...agentsResult.errors);

    if (agentsResult.valid && agentsResult.files) {
      phaseLogger.success(` ✓ Agents directory exists with ${agentsResult.fileCount} agents`);

      // Validate agent coverage
      const coverageResult = validateAgentCoverage(agentsResult.files, state.framework_config_path);
      validationErrors.push(...coverageResult.errors);
      validationWarnings.push(...coverageResult.warnings);

      if (
        coverageResult.valid &&
        coverageResult.significantLanguages.length > 0 &&
        coverageResult.missingImplementers.length === 0
      ) {
        phaseLogger.success(
          ` ✓ Multi-stack coverage validated for ${coverageResult.significantLanguages.length} languages`,
        );
      }
    }

    // 6. Validate commands directory exists
    const commandsResult = validateDirectoryWithFiles(directories.commands, "Commands");
    validationErrors.push(...commandsResult.errors);
    if (commandsResult.valid) {
      phaseLogger.success(` ✓ Commands directory exists with ${commandsResult.fileCount} commands`);
    }

    // 7. Validate all phases completed
    const phaseCompletionResult = validatePhaseCompletion(state);
    validationErrors.push(...phaseCompletionResult.errors);
    validationWarnings.push(...phaseCompletionResult.warnings);

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
