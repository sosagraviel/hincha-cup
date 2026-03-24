import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  statSync,
} from "fs";
import { join } from "path";
import {
  resolveSkills,
  copyResolvedSkills,
} from "../../../utils/skill-resolver.js";
import { generateAgents, writeAgents } from "../../../utils/agent-generator.js";
import type { StackProfile } from "../../../utils/config-generator.js";
import { logger } from "../../../utils/logger.js";

/**
 * Phase 5: Resources Node
 *
 * This node:
 * - Resolves and copies filtered skills based on detected stack
 * - Generates agents (planner, implementers, visual-verifier)
 * - Copies commands from framework
 * - Sets up project directory structure
 *
 * @param state - Current workflow state
 * @returns Updated state with resources copied
 */
export async function resourcesNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child("Phase 5: Resources");
  phaseLogger.info(" Copying resources...");

  // Verify Phase 4 completed
  if (!state.phase4_context?.framework_config_generated) {
    throw new Error("Phase 4 context generation not completed");
  }

  try {
    const projectClaudeDir = join(state.project_path, ".claude");

    // Read framework-config.json to get stack profile
    const frameworkConfigPath = join(projectClaudeDir, "framework-config.json");
    const frameworkConfig = JSON.parse(
      readFileSync(frameworkConfigPath, "utf-8"),
    );
    const stackProfile: StackProfile = frameworkConfig.stack_profile;

    phaseLogger.info(" Stack profile loaded");
    phaseLogger.info(
      `  Languages: ${stackProfile.languages?.join(", ") || "none"}`,
    );

    // VALIDATION: Ensure stack profile is complete before generating resources
    phaseLogger.info(" Validating stack profile before resource generation...");

    if (!stackProfile || !stackProfile.languages || stackProfile.languages.length === 0) {
      throw new Error(
        "Stack profile is empty or invalid. Cannot generate agents/skills without knowing project languages.",
      );
    }

    // If we have file counts, verify they match languages
    if (stackProfile.file_counts) {
      const languagesWithFiles = stackProfile.file_counts.by_language
        .filter((lc) => lc.count >= 5)
        .map((lc) => lc.language.toLowerCase());

      const profileLanguages = new Set(
        stackProfile.languages.map((l) => l.toLowerCase()),
      );

      for (const lang of languagesWithFiles) {
        if (!profileLanguages.has(lang)) {
          const fileCount = stackProfile.file_counts.by_language.find(
            (lc) => lc.language.toLowerCase() === lang,
          )?.count;
          phaseLogger.error(
            ` Language ${lang} has ${fileCount} files but is not in stack profile`,
          );
          throw new Error(
            `Stack profile validation failed: ${lang} detected but not included. ` +
              `This indicates a Phase 4 bug. Check file counting and language detection.`,
          );
        }
      }
    }

    phaseLogger.success(
      ` ✓ Stack profile validated: ${stackProfile.languages.join(", ")}`,
    );
    if (stackProfile.multi_stack?.is_monorepo) {
      phaseLogger.info(
        `  Monorepo with ${stackProfile.multi_stack.workspaces.length} workspaces`,
      );
    }

    // Step 1: Resolve and copy filtered skills
    phaseLogger.info(" Resolving skills...");
    const resolvedSkills = resolveSkills(stackProfile, state.framework_path);

    phaseLogger.info(`  Resolved ${resolvedSkills.length} skills`);

    // Copy resolved skills
    const copiedSkillsCount = copyResolvedSkills(
      resolvedSkills,
      state.project_path,
    );

    phaseLogger.success(
      `✓ Copied ${resolvedSkills.length} skills (${copiedSkillsCount} files)`,
    );

    // Step 2: Generate agents
    phaseLogger.info(" Generating agents...");
    const templatesPath = join(state.framework_path, "agents", "templates");
    const agents = generateAgents(
      stackProfile,
      resolvedSkills,
      state.project_path,
      templatesPath,
      state.framework_path,
    );

    // Write agents to disk
    writeAgents(agents, state.project_path);

    phaseLogger.success(`✓ Generated ${agents.length} agents`);

    // Step 3: Copy commands
    phaseLogger.info(" Copying commands...");
    const commandsTargetDir = join(projectClaudeDir, "commands");
    const frameworkCommandsDir = join(state.framework_path, "commands");

    mkdirSync(commandsTargetDir, { recursive: true });

    const commandFiles = readdirSync(frameworkCommandsDir).filter(
      (file) => file.endsWith(".md") && file !== "initialize-project.md",
    );

    for (const cmdFile of commandFiles) {
      copyFileSync(
        join(frameworkCommandsDir, cmdFile),
        join(commandsTargetDir, cmdFile),
      );
    }

    phaseLogger.success(`✓ Copied ${commandFiles.length} commands`);

    phaseLogger.success(" ✓ Resource copying complete");

    return {
      current_phase: "phase5_resources",
    };
  } catch (error) {
    const errorMessage = `Resources copying failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);
    phaseLogger.error((error as Error).stack || "");

    return {
      errors: [...state.errors, errorMessage],
      current_phase: "failed",
    };
  }
}
