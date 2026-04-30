#!/usr/bin/env tsx
/**
 * Framework Resource Sync Script
 *
 * Idempotent script to sync framework skills and agents to a project.
 * Migrated from scripts/sync-framework-resources.sh
 *
 * Features:
 * - Hash-based change detection for skills and agents
 * - User modification detection and preservation
 * - Framework version detection and upgrade handling
 * - New language/framework detection from config changes
 * - Timestamped backups before replacements
 *
 * Usage:
 *   npm run sync-framework-resources
 */

import { fileURLToPath } from 'url';
import { mkdir, cp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../utils/logger.js';
import { ConfigUpdaterService } from '../services/framework/config-updater.service.js';
import {
  updateSingleSkill,
  addSingleSkill,
  regenerateSingleAgent,
} from '../services/framework/sync-helpers.service.js';
import { resolveSkills } from '../nodes/initialize-project/phase5/skill-resolver.js';
import { generateAgents } from '../nodes/initialize-project/phase5/agent-generator.js';
import { upsertCodeGraphMcpConfig } from '../services/framework/mcp-config.service.js';
import {
  resolveConfigPath,
  resolveFrameworkConfigPath,
  resolveBackupPath,
  setActiveProvider,
  getActiveProvider,
  getProviderPaths,
  getAllProviderConfigDirs,
} from '../utils/provider-paths.js';
import { Provider } from '../providers/types.js';
import { getFrameworkPath, getProjectPath } from '../services/framework/paths.service.js';

interface SyncConfig {
  projectPath: string;
  frameworkPath: string;
}

interface SyncResult {
  skills: {
    updated: number;
    added: number;
    skipped: number;
  };
  agents: {
    updated: number;
    added: number;
    regenerated: number;
    skipped: number;
  };
  backupPath: string;
}

/**
 * Resolve the provider this sync run should use.
 *
 * Precedence:
 *   1. `--provider claude|codex` CLI flag
 *   2. `$PROVIDER` env var
 *   3. Auto-detect from existing config dir in `projectPath`
 *      (e.g., `.claude/` present → Provider.CLAUDE)
 *   4. Default: Provider.CLAUDE
 *
 * Fails when both provider dirs are present (ambiguous project state).
 */
function resolveProviderFromEnvOrDisk(projectPath: string): Provider {
  const argIdx = process.argv.indexOf('--provider');
  const cliValue =
    argIdx >= 0 && argIdx + 1 < process.argv.length ? process.argv[argIdx + 1] : undefined;
  const raw = (cliValue ?? process.env.PROVIDER ?? '').toLowerCase();

  if (raw === 'codex' || raw === 'openai') return Provider.CODEX;
  if (raw === 'claude' || raw === 'anthropic') return Provider.CLAUDE;
  if (raw && raw !== '') {
    throw new Error(`Unknown provider: ${raw}. Use 'claude' or 'codex'.`);
  }

  const configDirs = getAllProviderConfigDirs();
  const present = configDirs.filter((d) => existsSync(join(projectPath, d)));
  if (present.length > 1) {
    throw new Error(
      `Ambiguous project state: multiple provider config dirs present (${present.join(', ')}). ` +
        `Pass --provider <claude|codex> to disambiguate.`,
    );
  }
  if (present.length === 1) {
    return present[0] === PROVIDER_DIR_CLAUDE ? Provider.CLAUDE : Provider.CODEX;
  }
  return Provider.CLAUDE;
}

const PROVIDER_DIR_CLAUDE = getProviderPaths(Provider.CLAUDE).configDir;

/**
 * Resolve paths via paths.service (single source of truth, derived from
 * import.meta.url, dogfooding-aware via the qubika-agentic-framework -> .
 * self-symlink check).
 */
function detectPaths(): SyncConfig {
  const frameworkPath = getFrameworkPath();
  const projectPath = getProjectPath();

  if (!existsSync(frameworkPath)) {
    throw new Error(`Framework path does not exist: ${frameworkPath}`);
  }

  if (!existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  if (projectPath === frameworkPath) {
    logger.warn(
      '⚠️  Project and framework paths are identical - running in dogfooding mode (framework on itself)',
    );
  }

  return { projectPath, frameworkPath };
}

/**
 * Validate prerequisites
 */
async function validatePrerequisites(config: SyncConfig): Promise<void> {
  logger.info('Step 1: Validating prerequisites...');

  // Check for framework-config.json
  const configFile = resolveFrameworkConfigPath(config.projectPath);
  if (!existsSync(configFile)) {
    throw new Error(
      `framework-config.json not found at ${configFile}. Run initialize-project first.`,
    );
  }

  logger.success('✓ Prerequisites validated\n');
}

/**
 * Detect framework version and check for updates
 */
async function detectFrameworkVersion(config: SyncConfig) {
  logger.info('Step 2: Detecting framework version...');

  const configUpdater = new ConfigUpdaterService(config.projectPath, config.frameworkPath);
  const versionInfo = await configUpdater.isFrameworkUpdated();

  logger.info(`  Current framework version:    ${versionInfo.current}`);
  logger.info(`  Configured framework version: ${versionInfo.configured}`);

  if (versionInfo.updated) {
    logger.warn('  Framework version mismatch - full sync recommended');
  }

  logger.info('');
  return versionInfo;
}

/**
 * Detect user modifications
 */
async function detectUserModifications(config: SyncConfig) {
  logger.info('Step 3: Detecting user modifications...');

  const configUpdater = new ConfigUpdaterService(config.projectPath, config.frameworkPath);
  const modifications = await configUpdater.detectUserModifications();

  if (modifications.skills.length > 0 || modifications.agents.length > 0) {
    logger.warn('  User modifications detected:');
    logger.warn(`     - Modified skills: ${modifications.skills.length}`);
    logger.warn(`     - Modified agents: ${modifications.agents.length}`);
    logger.info('');
    logger.info('  These resources will be skipped during sync to preserve your changes.');
  } else {
    logger.success('  ✓ No user modifications detected');
  }

  logger.info('');
  return modifications;
}

/**
 * Create timestamped backup
 */
async function createBackup(config: SyncConfig): Promise<string> {
  logger.info('Step 4: Creating backup...');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0] + 'Z';
  const backupDir = resolveBackupPath(config.projectPath, timestamp);

  await mkdir(backupDir, { recursive: true });

  // Backup skills (including the three generated convention skills, which
  // live alongside framework-shipped skills in <project>/.claude/skills/)
  const skillsPath = resolveConfigPath(config.projectPath, 'skills');
  if (existsSync(skillsPath)) {
    const backupSkillsPath = join(backupDir, 'skills');
    await mkdir(backupSkillsPath, { recursive: true });

    try {
      await cp(skillsPath, backupSkillsPath, { recursive: true });
    } catch (error) {
      logger.warn(
        `  Warning: Could not backup skills: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Backup agents
  const agentsPath = resolveConfigPath(config.projectPath, 'agents');
  if (existsSync(agentsPath)) {
    try {
      await cp(agentsPath, join(backupDir, 'agents'), { recursive: true });
    } catch (error) {
      logger.warn(
        `  Warning: Could not backup agents: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.success(`✓ Backup created at: ${backupDir}\n`);
  return backupDir;
}

/**
 * Sync skills from framework
 */
async function syncSkills(config: SyncConfig): Promise<{
  updated: number;
  added: number;
  removed: number;
  skipped: number;
}> {
  logger.info('Step 5: Syncing skills...');

  const configUpdater = new ConfigUpdaterService(config.projectPath, config.frameworkPath);
  const frameworkConfig = await configUpdater.readConfig();

  // Resolve which skills should exist based on stack profile
  const resolvedSkills = resolveSkills(frameworkConfig.stack_profile as any, config.frameworkPath);

  const result = { updated: 0, added: 0, removed: 0, skipped: 0 };

  // Create a set of skill names that should exist
  const expectedSkillNames = new Set(resolvedSkills.map((s) => s.name));

  // Process each skill that should exist for this project
  for (const resolvedSkill of resolvedSkills) {
    const skillName = resolvedSkill.name;
    const existingSkillInfo = frameworkConfig.resource_state.skills[skillName];

    // Skip if skill is user-managed
    if (existingSkillInfo && !existingSkillInfo.managed_by_framework) {
      result.skipped++;
      continue;
    }

    const sourcePath = join(config.frameworkPath, 'skills', resolvedSkill.relative_path);
    if (!existsSync(sourcePath)) {
      logger.warn(`  Warning: Source skill not found: ${skillName} at ${sourcePath}`);
      continue;
    }

    const currentSourceHash = configUpdater.hashDirectory(sourcePath);

    // If skill doesn't exist in project yet, add it
    if (!existingSkillInfo) {
      try {
        const syncResult = await addSingleSkill(
          skillName,
          config.projectPath,
          config.frameworkPath,
        );
        if (syncResult.added) {
          result.added++;

          // Add to resource state
          await configUpdater.updateResourceState('skills', skillName, {
            managed_by_framework: true,
            source_path: `skills/${resolvedSkill.relative_path}`,
            source_hash: currentSourceHash,
            file_hash: currentSourceHash,
          });
        }
      } catch (error) {
        logger.error(
          `  Failed to add skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    // If skill exists and source has changed, update it
    else if (currentSourceHash !== existingSkillInfo.source_hash) {
      try {
        const syncResult = await updateSingleSkill(
          skillName,
          config.projectPath,
          config.frameworkPath,
        );
        if (syncResult.updated) {
          result.updated++;

          // Update hash in config
          await configUpdater.updateResourceState('skills', skillName, {
            source_hash: currentSourceHash,
            file_hash: currentSourceHash,
          });
        }
      } catch (error) {
        logger.error(
          `  Failed to update skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // Remove skills that are no longer in the framework (only if managed by framework)
  const existingSkills = Object.keys(frameworkConfig.resource_state.skills || {});
  for (const existingSkillName of existingSkills) {
    const skillInfo = frameworkConfig.resource_state.skills[existingSkillName];

    // Skip if skill is user-managed
    if (!skillInfo.managed_by_framework) {
      continue;
    }

    // If skill no longer exists in resolved skills, remove it
    if (!expectedSkillNames.has(existingSkillName)) {
      try {
        const skillPath = resolveConfigPath(config.projectPath, 'skills', existingSkillName);

        if (existsSync(skillPath)) {
          await rm(skillPath, { recursive: true, force: true });
          logger.info(`  ℹ️  Removed skill: ${existingSkillName}`);
          result.removed++;
        }

        // Remove from resource state
        await configUpdater.removeResourceFromState('skills', existingSkillName);
      } catch (error) {
        logger.error(
          `  Failed to remove skill ${existingSkillName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  logger.success(`  ✓ Skills updated:  ${result.updated}`);
  logger.success(`  ✓ Skills added:    ${result.added}`);
  logger.success(`  ✓ Skills removed:  ${result.removed}`);
  logger.info(`  ℹ️  Skills skipped: ${result.skipped}\n`);

  return result;
}

/**
 * Sync agents from framework
 * @param skillsChanged - Whether skills were added or updated in this sync
 */
async function syncAgents(
  config: SyncConfig,
  skillsChanged: boolean = false,
): Promise<{
  updated: number;
  added: number;
  regenerated: number;
  skipped: number;
}> {
  logger.info('Step 6: Syncing agents...');

  const configUpdater = new ConfigUpdaterService(config.projectPath, config.frameworkPath);
  const frameworkConfig = await configUpdater.readConfig();

  // Resolve skills and generate all agents that should exist
  const resolvedSkills = resolveSkills(frameworkConfig.stack_profile as any, config.frameworkPath);
  const templatesPath = join(config.frameworkPath, 'agents', 'templates');
  const allAgents = generateAgents(
    frameworkConfig.stack_profile as any,
    resolvedSkills,
    config.projectPath,
    templatesPath,
    config.frameworkPath,
  );

  const result = { updated: 0, added: 0, regenerated: 0, skipped: 0 };

  // Process each agent that should exist for this project
  for (const agent of allAgents) {
    const agentName = agent.name;
    const existingAgentInfo = frameworkConfig.resource_state.agents[agentName];

    // Skip if agent is user-managed
    if (existingAgentInfo && !existingAgentInfo.managed_by_framework) {
      result.skipped++;
      continue;
    }

    // Determine template path based on agent name
    let templateFilename: string;
    if (agentName === 'implementer-generic') {
      // implementer-generic uses its own dedicated template
      templateFilename = 'implementer-generic.template.md';
    } else if (agentName.startsWith('implementer-')) {
      // Language-specific implementers: check for dedicated template, fall back to generic
      const dedicatedTemplate = `${agentName}.template.md`;
      const dedicatedPath = join(config.frameworkPath, 'agents', 'templates', dedicatedTemplate);
      templateFilename = existsSync(dedicatedPath) ? dedicatedTemplate : 'implementer.template.md';
    } else {
      // Other agents use their own templates
      templateFilename = `${agentName}.template.md`;
    }
    const templatePath = join(config.frameworkPath, 'agents', 'templates', templateFilename);

    if (!existsSync(templatePath)) {
      logger.warn(`  Warning: Template not found: ${agentName} at ${templatePath}`);
      continue;
    }

    const currentTemplateHash = configUpdater.hashFile(templatePath);
    const relativeTemplatePath = `agents/templates/${templateFilename}`;

    // If agent doesn't exist in project yet, add it
    if (!existingAgentInfo) {
      try {
        const regenerateResult = await regenerateSingleAgent(
          agentName,
          config.projectPath,
          config.frameworkPath,
        );
        if (regenerateResult.success) {
          result.added++;

          // Add to resource state
          await configUpdater.updateResourceState('agents', agentName, {
            managed_by_framework: true,
            template_path: relativeTemplatePath,
            template_hash: currentTemplateHash,
            file_hash: configUpdater.hashFile(
              resolveConfigPath(config.projectPath, 'agents', `${agentName}.md`),
            ),
          });
        }
      } catch (error) {
        logger.error(
          `  Failed to add agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    // If agent exists and (template changed OR skills changed), update it
    else if (currentTemplateHash !== existingAgentInfo.template_hash || skillsChanged) {
      try {
        const regenerateResult = await regenerateSingleAgent(
          agentName,
          config.projectPath,
          config.frameworkPath,
        );
        if (regenerateResult.success) {
          result.updated++;

          // Update hash in config
          await configUpdater.updateResourceState('agents', agentName, {
            template_hash: currentTemplateHash,
            file_hash: configUpdater.hashFile(
              resolveConfigPath(config.projectPath, 'agents', `${agentName}.md`),
            ),
          });
        } else if (regenerateResult.skipped) {
          result.skipped++;
        }
      } catch (error) {
        logger.error(
          `  Failed to regenerate agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  logger.success(`  ✓ Agents updated:  ${result.updated}`);
  logger.success(`  ✓ Agents added:    ${result.added}`);
  logger.info(`  ℹ️  Agents skipped: ${result.skipped}\n`);

  return result;
}

/**
 * Remove any legacy `<config-dir>/commands/` directory left over from previous
 * framework versions. Slash-commands have been deprecated in favour of direct
 * skill invocation, so we clean up after older projects on first sync.
 */
async function removeLegacyCommandsDir(config: SyncConfig): Promise<void> {
  const legacyCommandsDir = resolveConfigPath(config.projectPath, 'commands');
  if (!existsSync(legacyCommandsDir)) return;

  try {
    await rm(legacyCommandsDir, { recursive: true, force: true });
    logger.info(`  ℹ️  Removed legacy commands directory: ${legacyCommandsDir}\n`);
  } catch (error) {
    logger.warn(
      `  Warning: Could not remove legacy commands dir: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

/**
 * Sync project MCP config used by native Claude Code sessions.
 */
export async function syncMcpConfig(config: SyncConfig): Promise<{
  updated: boolean;
  backupPath?: string;
}> {
  logger.info('Step 8: Syncing MCP config...');
  const provider = getActiveProvider();

  const result = upsertCodeGraphMcpConfig({
    projectPath: config.projectPath,
    frameworkPath: config.frameworkPath,
    provider,
  });

  if (result.changed) {
    logger.success(`  ✓ Code graph MCP configured: ${result.configPath}`);
    if (result.backupPath) {
      logger.info(`  ℹ️  Previous code_graph MCP config backed up: ${result.backupPath}`);
    }
  } else {
    logger.info('  ℹ️  Code graph MCP already configured');
  }
  logger.info('');

  return {
    updated: result.changed,
    backupPath: result.backupPath,
  };
}

/**
 * Main sync function
 */
async function main() {
  logger.info('Framework Resource Sync');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Detect paths
    const config = detectPaths();

    // Resolve and activate the provider before any path resolution occurs.
    // This must happen before validatePrerequisites(), which uses
    // resolveFrameworkConfigPath().
    const provider = resolveProviderFromEnvOrDisk(config.projectPath);
    setActiveProvider(provider);
    const providerPaths = getProviderPaths();

    logger.info(`  Project:   ${config.projectPath}`);
    logger.info(`  Framework: ${config.frameworkPath}`);
    logger.info(`  Provider:  ${provider} (config: ${providerPaths.configDir})\n`);

    // Validate prerequisites
    await validatePrerequisites(config);

    // Detect framework version
    const versionInfo = await detectFrameworkVersion(config);

    // Detect user modifications
    const modifications = await detectUserModifications(config);

    // Create backup
    const backupPath = await createBackup(config);

    // Sync skills
    const skillsResult = await syncSkills(config);

    // Sync agents (pass skills result to know if skills changed)
    const agentsResult = await syncAgents(
      config,
      skillsResult.added > 0 || skillsResult.updated > 0,
    );

    // Clean up legacy commands directory (slash-commands were deprecated in favour of direct skill invocation)
    await removeLegacyCommandsDir(config);

    // Sync project MCP config
    const mcpResult = await syncMcpConfig(config);

    // Summary
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('  SYNC COMPLETE');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    logger.info('Summary:');
    logger.info(
      `  Skills:   ${skillsResult.updated} updated, ${skillsResult.added} added, ${skillsResult.removed} removed, ${skillsResult.skipped} skipped`,
    );
    logger.info(
      `  Agents:   ${agentsResult.updated} updated, ${agentsResult.added} added, ${agentsResult.regenerated} regenerated, ${agentsResult.skipped} skipped`,
    );
    logger.info(`  Backup:   ${backupPath}\n`);

    const totalChanges =
      skillsResult.updated +
      skillsResult.added +
      agentsResult.updated +
      agentsResult.added +
      agentsResult.regenerated +
      (mcpResult.updated ? 1 : 0);

    if (totalChanges === 0) {
      logger.info('ℹ️  No changes needed - all resources are up to date');
    } else {
      logger.success(`✅ Successfully synced ${totalChanges} resource(s)`);
    }

    logger.info('\nNotes:');
    logger.info('  - User-modified resources were preserved');
    logger.info('  - Backup created before any changes');
    logger.info('  - Restart Claude Code after MCP config changes so /mcp picks up code_graph');
    logger.info('  - Run this script again anytime to sync updates\n');

    process.exit(0);
  } catch (error) {
    logger.error(`\n❌ Sync failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
