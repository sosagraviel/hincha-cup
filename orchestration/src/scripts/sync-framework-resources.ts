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

import { mkdir, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { ConfigUpdaterService } from '../services/framework/config-updater.service.js';
import {
  updateSingleSkill,
  addSingleSkill,
  regenerateSingleAgent,
} from '../services/framework/sync-helpers.service.js';
import { resolveSkills } from '../utils/skill-resolver.js';
import { generateAgents } from '../utils/agent-generator.js';

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
 * Auto-detect paths from script location
 */
function detectPaths(): SyncConfig {
  // Framework path is parent of orchestration
  const frameworkPath = join(process.cwd(), '..');

  // Project path is parent of framework
  const projectPath = join(frameworkPath, '..');

  // Validate framework path exists
  if (!existsSync(frameworkPath)) {
    throw new Error(`Framework path does not exist: ${frameworkPath}`);
  }

  // Validate project path is not the same as framework
  if (projectPath === frameworkPath) {
    throw new Error(
      'Framework is not inside a project directory. The framework must be cloned at your project root.'
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
  const configFile = join(config.projectPath, '.claude/framework-config.json');
  if (!existsSync(configFile)) {
    throw new Error(
      `framework-config.json not found at ${configFile}. Run initialize-project first.`
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
  const backupDir = join(config.projectPath, '.claude-backups', timestamp);

  await mkdir(backupDir, { recursive: true });

  // Backup skills (excluding project-context)
  const skillsPath = join(config.projectPath, '.claude/skills');
  if (existsSync(skillsPath)) {
    const backupSkillsPath = join(backupDir, 'skills');
    await mkdir(backupSkillsPath, { recursive: true });

    try {
      await cp(skillsPath, backupSkillsPath, { recursive: true });
    } catch (error) {
      logger.warn(`  Warning: Could not backup skills: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Backup agents
  const agentsPath = join(config.projectPath, '.claude/agents');
  if (existsSync(agentsPath)) {
    try {
      await cp(agentsPath, join(backupDir, 'agents'), { recursive: true });
    } catch (error) {
      logger.warn(`  Warning: Could not backup agents: ${error instanceof Error ? error.message : String(error)}`);
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
  skipped: number;
}> {
  logger.info('Step 5: Syncing skills...');

  const configUpdater = new ConfigUpdaterService(config.projectPath, config.frameworkPath);
  const frameworkConfig = await configUpdater.readConfig();

  // Resolve which skills should exist based on stack profile
  const resolvedSkills = resolveSkills(frameworkConfig.stack_profile as any, config.frameworkPath);

  const result = { updated: 0, added: 0, skipped: 0 };

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
        const syncResult = await addSingleSkill(skillName, config.projectPath, config.frameworkPath);
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
        logger.error(`  Failed to add skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // If skill exists and source has changed, update it
    else if (currentSourceHash !== existingSkillInfo.source_hash) {
      try {
        const syncResult = await updateSingleSkill(skillName, config.projectPath, config.frameworkPath);
        if (syncResult.updated) {
          result.updated++;

          // Update hash in config
          await configUpdater.updateResourceState('skills', skillName, {
            source_hash: currentSourceHash,
            file_hash: currentSourceHash,
          });
        }
      } catch (error) {
        logger.error(`  Failed to update skill ${skillName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  logger.success(`  ✓ Skills updated:  ${result.updated}`);
  logger.success(`  ✓ Skills added:    ${result.added}`);
  logger.info(`  ℹ️  Skills skipped: ${result.skipped}\n`);

  return result;
}

/**
 * Sync agents from framework
 * @param skillsChanged - Whether skills were added or updated in this sync
 */
async function syncAgents(config: SyncConfig, skillsChanged: boolean = false): Promise<{
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
    config.frameworkPath
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
    const templateFilename = agentName.startsWith('implementer-')
      ? 'implementer.template.md'
      : `${agentName}.template.md`;
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
        const regenerateResult = await regenerateSingleAgent(agentName, config.projectPath, config.frameworkPath);
        if (regenerateResult.success) {
          result.added++;

          // Add to resource state
          await configUpdater.updateResourceState('agents', agentName, {
            managed_by_framework: true,
            template_path: relativeTemplatePath,
            template_hash: currentTemplateHash,
            file_hash: configUpdater.hashFile(join(config.projectPath, '.claude/agents', `${agentName}.md`)),
          });
        }
      } catch (error) {
        logger.error(`  Failed to add agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // If agent exists and (template changed OR skills changed), update it
    else if (currentTemplateHash !== existingAgentInfo.template_hash || skillsChanged) {
      try {
        const regenerateResult = await regenerateSingleAgent(agentName, config.projectPath, config.frameworkPath);
        if (regenerateResult.success) {
          result.updated++;

          // Update hash in config
          await configUpdater.updateResourceState('agents', agentName, {
            template_hash: currentTemplateHash,
            file_hash: configUpdater.hashFile(join(config.projectPath, '.claude/agents', `${agentName}.md`)),
          });
        } else if (regenerateResult.skipped) {
          result.skipped++;
        }
      } catch (error) {
        logger.error(`  Failed to regenerate agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  logger.success(`  ✓ Agents updated:  ${result.updated}`);
  logger.success(`  ✓ Agents added:    ${result.added}`);
  logger.info(`  ℹ️  Agents skipped: ${result.skipped}\n`);

  return result;
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

    logger.info(`  Project:   ${config.projectPath}`);
    logger.info(`  Framework: ${config.frameworkPath}\n`);

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
    const agentsResult = await syncAgents(config, skillsResult.added > 0 || skillsResult.updated > 0);

    // Summary
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('  SYNC COMPLETE');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    logger.info('Summary:');
    logger.info(
      `  Skills:  ${skillsResult.updated} updated, ${skillsResult.added} added, ${skillsResult.skipped} skipped`
    );
    logger.info(
      `  Agents:  ${agentsResult.updated} updated, ${agentsResult.added} added, ${agentsResult.regenerated} regenerated, ${agentsResult.skipped} skipped`
    );
    logger.info(`  Backup:  ${backupPath}\n`);

    const totalChanges =
      skillsResult.updated +
      skillsResult.added +
      agentsResult.updated +
      agentsResult.added +
      agentsResult.regenerated;

    if (totalChanges === 0) {
      logger.info('ℹ️  No changes needed - all resources are up to date');
    } else {
      logger.success(`✅ Successfully synced ${totalChanges} resource(s)`);
    }

    logger.info('\nNotes:');
    logger.info('  - User-modified resources were preserved');
    logger.info('  - Backup created before any changes');
    logger.info('  - Run this script again anytime to sync updates\n');

    process.exit(0);
  } catch (error) {
    logger.error(`\n❌ Sync failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
