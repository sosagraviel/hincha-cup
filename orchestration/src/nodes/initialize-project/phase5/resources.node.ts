import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { mkdirSync, copyFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveSkills, copyResolvedSkills } from './skill-resolver.js';
import { generateAgents, writeAgents } from './agent-generator.js';
import type { StackProfile } from '../../../schemas/index.js';
import { logger } from '../../../utils/logger.js';
import { upsertCodeGraphMcpConfig } from '../../../services/framework/mcp-config.service.js';

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
  const phaseLogger = logger.child('Phase 5: Resources');
  phaseLogger.info(' Copying resources...');

  try {
    const projectClaudeDir = join(state.project_path, '.claude');
    const frameworkConfigPath = join(projectClaudeDir, 'framework-config.json');

    // Verify Phase 4 completed by checking file exists (never use state)
    if (!existsSync(frameworkConfigPath)) {
      throw new Error('Phase 4 context generation not completed - framework-config.json not found');
    }

    // Read framework-config.json to get stack profile
    const frameworkConfig = JSON.parse(readFileSync(frameworkConfigPath, 'utf-8'));
    const stackProfile: StackProfile = frameworkConfig.stack_profile;

    phaseLogger.info(' Stack profile loaded');

    // Get languages from services array
    const languages = Array.from(new Set(stackProfile.services.map((s) => s.language)));
    phaseLogger.info(`  Languages: ${languages.join(', ') || 'none'}`);

    // VALIDATION: Ensure stack profile is complete before generating resources
    phaseLogger.info(' Validating stack profile before resource generation...');

    if (!stackProfile || !stackProfile.services || stackProfile.services.length === 0) {
      throw new Error(
        'Stack profile is empty or invalid. Cannot generate agents/skills without knowing project services.',
      );
    }

    if (languages.length === 0) {
      throw new Error(
        'No languages detected in services. Cannot generate agents/skills without knowing project languages.',
      );
    }

    // If we have file counts, verify they match languages
    if (stackProfile.file_counts?.by_language) {
      // Debug logging
      phaseLogger.info(
        `  Services: ${stackProfile.services.map((s) => `${s.id}(${s.language})`).join(', ')}`,
      );
      phaseLogger.info(`  File counts: ${JSON.stringify(stackProfile.file_counts.by_language)}`);

      // Languages commonly used for infrastructure/config files rather than services
      const INFRASTRUCTURE_LANGUAGES = new Set([
        'javascript',
        'json',
        'yaml',
        'yml',
        'toml',
        'ini',
        'sh',
        'bash',
      ]);
      const WARN_THRESHOLD = 10; // Warn for 10-19 files (may be utility scripts or test fixtures)
      const ERROR_THRESHOLD = 20; // Error for 20+ files (likely a real service)

      const profileLanguages = new Set(languages.map((l) => l.toLowerCase()));

      for (const [lang, fileCount] of Object.entries(stackProfile.file_counts.by_language)) {
        const langLower = lang.toLowerCase();
        const isInProfile = profileLanguages.has(langLower);

        // Skip if language is in profile (valid)
        if (isInProfile) continue;

        // Skip infrastructure languages with modest file counts
        if (INFRASTRUCTURE_LANGUAGES.has(langLower) && fileCount < 30) {
          phaseLogger.info(
            ` ${fileCount} ${lang} files - likely infrastructure/config files, skipping validation`,
          );
          continue;
        }

        // STRICT: 20+ files without a service is a hard error (Phase 4 should have created a fallback service)
        if (fileCount >= ERROR_THRESHOLD) {
          phaseLogger.error(` Language ${lang} has ${fileCount} files but is not in stack profile`);
          throw new Error(
            `Stack profile validation failed: ${lang} detected (${fileCount} files) but not included in any service. ` +
              `This indicates Phase 4 service extraction logic failed to create a fallback service.`,
          );
        }

        // LENIENT: 10-19 files is a warning (may be scattered config files)
        if (fileCount >= WARN_THRESHOLD) {
          phaseLogger.warn(
            ` Advisory: ${fileCount} ${lang} files found but no service detected. ` +
              `This may be scattered config files or build artifacts.`,
          );
        }
      }
    }

    phaseLogger.success(` ✓ Stack profile validated: ${languages.join(', ')}`);
    if (stackProfile.is_monorepo) {
      const serviceCount = stackProfile.services.length;
      phaseLogger.info(`  Monorepo with ${serviceCount} service${serviceCount !== 1 ? 's' : ''}`);
    }

    // Step 1: Resolve and copy filtered skills
    phaseLogger.info(' Resolving skills...');
    const resolvedSkills = resolveSkills(stackProfile, state.framework_path);

    phaseLogger.info(`  Resolved ${resolvedSkills.length} skills`);

    // Copy resolved skills
    const copiedSkillsCount = copyResolvedSkills(resolvedSkills, state.project_path);

    phaseLogger.success(`✓ Copied ${resolvedSkills.length} skills (${copiedSkillsCount} files)`);

    // Step 2: Generate agents
    phaseLogger.info(' Generating agents...');
    const templatesPath = join(state.framework_path, 'agents', 'templates');
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
    phaseLogger.info(' Copying commands...');
    const commandsTargetDir = join(projectClaudeDir, 'commands');
    const frameworkCommandsDir = join(state.framework_path, 'commands');

    mkdirSync(commandsTargetDir, { recursive: true });

    const commandFiles = readdirSync(frameworkCommandsDir).filter(
      (file) => file.endsWith('.md') && file !== 'initialize-project.md',
    );

    for (const cmdFile of commandFiles) {
      copyFileSync(join(frameworkCommandsDir, cmdFile), join(commandsTargetDir, cmdFile));
    }

    phaseLogger.success(`✓ Copied ${commandFiles.length} commands`);

    // Step 4: Write project-scoped MCP config for native Claude Code sessions
    phaseLogger.info(' Configuring project MCP...');
    const mcpResult = upsertCodeGraphMcpConfig({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
    });

    if (mcpResult.changed) {
      phaseLogger.success(`✓ Configured code graph MCP (${mcpResult.configPath})`);
    } else {
      phaseLogger.success('✓ Code graph MCP already configured');
    }

    phaseLogger.success(' ✓ Resource copying complete');

    return {
      current_phase: 'phase5_resources',
    };
  } catch (error) {
    const errorMessage = `Resources copying failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);
    phaseLogger.error((error as Error).stack || '');

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}
