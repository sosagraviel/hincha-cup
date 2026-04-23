import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../../../utils/logger.js';
import { validateMarkdownFile, validateWikiMarkdownFile } from './helpers/file-validator.js';
import {
  resolveInstructionFilePath,
  resolveFrameworkConfigPath,
  resolveConfigPath,
  getInstructionFileName,
  getActiveProvider,
} from '../../../utils/provider-paths.js';
import { validateFrameworkConfig } from './helpers/config-validator.js';
import {
  validateDirectoryExists,
  validateDirectoryWithFiles,
  getClaudeDirectories,
} from './helpers/directory-validator.js';
import { validateAgentCoverage } from './helpers/agent-coverage-validator.js';
import { validatePhaseCompletion } from './helpers/phase-completion-validator.js';
import { getExpectedAiKnowledgeFiles } from '../../../services/graph-wiki/wiki-generator.service.js';
import { validateCodeGraphMcpConfig } from '../../../services/framework/mcp-config.service.js';

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
  const phaseLogger = logger.child('Phase 6: Validation');
  phaseLogger.info(' Starting final validation...');

  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  try {
    const instructionFilePath = resolveInstructionFilePath(state.project_path);
    const instructionFileName = getInstructionFileName();
    const projectContextPath =
      state.project_context_path ||
      resolveConfigPath(state.project_path, 'skills', 'project-context', 'SKILL.md');
    const frameworkConfigPath =
      state.framework_config_path || resolveFrameworkConfigPath(state.project_path);
    const shouldValidateWiki = Boolean(state.ai_knowledge_path || state.phase4_wiki_generation);
    const aiKnowledgePath =
      state.ai_knowledge_path || join(state.project_path, 'docs', 'ai-knowledge');

    // Get standard directory paths
    const directories = getClaudeDirectories(state.project_path);

    // 1. Validate instruction file (CLAUDE.md or AGENTS.md) exists and is valid
    const claudeMdResult = validateMarkdownFile(instructionFilePath, instructionFileName);
    validationErrors.push(...claudeMdResult.errors);
    validationWarnings.push(...claudeMdResult.warnings);
    if (claudeMdResult.valid) {
      phaseLogger.success(` ✓ ${instructionFileName} validated`);
    }

    // 2. Validate project-context/SKILL.md exists and is valid
    const projectContextResult = validateMarkdownFile(
      projectContextPath,
      'project-context/SKILL.md',
    );
    validationErrors.push(...projectContextResult.errors);
    validationWarnings.push(...projectContextResult.warnings);
    if (projectContextResult.valid) {
      phaseLogger.success(' ✓ project-context/SKILL.md validated');
    }

    // 3. Validate framework-config.json exists and is valid
    const configResult = validateFrameworkConfig(frameworkConfigPath);
    validationErrors.push(...configResult.errors);
    validationWarnings.push(...configResult.warnings);
    if (configResult.valid) {
      phaseLogger.success(' ✓ framework-config.json validated');
    }

    // 4. Validate AI knowledge wiki when this workflow generated it
    if (shouldValidateWiki) {
      const wikiErrors: string[] = [];
      const wikiStackProfile = readStackProfileForWiki(state, frameworkConfigPath);
      const expectedWikiFiles = getExpectedAiKnowledgeFiles(wikiStackProfile);

      for (const fileName of expectedWikiFiles) {
        const wikiFileResult = validateWikiMarkdownFile(
          join(aiKnowledgePath, fileName),
          `docs/ai-knowledge/${fileName}`,
          { serviceDoc: fileName.startsWith('services/') },
        );
        wikiErrors.push(...wikiFileResult.errors);
        validationWarnings.push(...wikiFileResult.warnings);
      }

      validationErrors.push(...wikiErrors);
      if (wikiErrors.length === 0) {
        phaseLogger.success(' ✓ AI knowledge wiki validated');
      }
    }

    // 5. Validate skills directory exists
    const skillsResult = validateDirectoryExists(directories.skills, 'Skills');
    validationErrors.push(...skillsResult.errors);
    if (skillsResult.valid) {
      phaseLogger.success(' ✓ Skills directory exists');
    }

    // 6. Validate agents directory exists and has minimum agents
    const agentsResult = validateDirectoryWithFiles(directories.agents, 'Agents');
    validationErrors.push(...agentsResult.errors);

    if (agentsResult.valid && agentsResult.files) {
      phaseLogger.success(` ✓ Agents directory exists with ${agentsResult.fileCount} agents`);

      // Validate agent coverage
      const coverageResult = validateAgentCoverage(agentsResult.files, frameworkConfigPath);
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

      const graphAgentErrors = validateGraphAwareAgents(directories.agents, agentsResult.files);
      validationErrors.push(...graphAgentErrors);
      if (graphAgentErrors.length === 0) {
        phaseLogger.success(' ✓ Graph-aware planner and implementer agents validated');
      }
    }

    // 7. Validate code graph MCP for the active provider's native config format
    const graphMcpResult = validateCodeGraphMcpConfig({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider: getActiveProvider(),
    });
    validationErrors.push(...graphMcpResult.errors);
    validationWarnings.push(...graphMcpResult.warnings);
    if (graphMcpResult.valid) {
      phaseLogger.success(' ✓ Code graph MCP config validated');
    }

    // 8. Validate all phases completed
    const phaseCompletionResult = validatePhaseCompletion(state);
    validationErrors.push(...phaseCompletionResult.errors);
    validationWarnings.push(...phaseCompletionResult.warnings);

    // Check for validation errors
    if (validationErrors.length > 0) {
      phaseLogger.error(' ✗ Validation failed:');
      validationErrors.forEach((err) => phaseLogger.error(`  - ${err}`));

      return {
        errors: [...state.errors, ...validationErrors],
        warnings: [...state.warnings, ...validationWarnings],
        current_phase: 'failed',
      };
    }

    // Success!
    const completedAt = new Date().toISOString();
    const totalDuration = state.started_at
      ? new Date(completedAt).getTime() - new Date(state.started_at).getTime()
      : undefined;

    phaseLogger.success(' ✓ All validations passed');
    if (validationWarnings.length > 0) {
      phaseLogger.warn(' Warnings:');
      validationWarnings.forEach((warn) => phaseLogger.warn(`  - ${warn}`));
    }

    phaseLogger.blank();
    phaseLogger.success('=== INITIALIZATION COMPLETE ===');
    phaseLogger.info(`Project: ${state.project_path}`);
    phaseLogger.info(`${instructionFileName}: ${instructionFilePath}`);
    phaseLogger.info(`Config: ${frameworkConfigPath}`);
    if (shouldValidateWiki) {
      phaseLogger.info(`AI Knowledge: ${aiKnowledgePath}`);
    }
    if (totalDuration) {
      phaseLogger.info(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    }

    return {
      current_phase: 'complete',
      completed_at: completedAt,
      total_duration_ms: totalDuration,
      warnings: [...state.warnings, ...validationWarnings],
      // Set paths in state if they weren't already set (for --start-phase 6)
      claude_md_path: instructionFilePath,
      project_context_path: projectContextPath,
      framework_config_path: frameworkConfigPath,
      ai_knowledge_path: shouldValidateWiki ? aiKnowledgePath : state.ai_knowledge_path,
      ai_knowledge_files: shouldValidateWiki
        ? getExpectedAiKnowledgeFiles(readStackProfileForWiki(state, frameworkConfigPath)).map(
            (fileName) => join(aiKnowledgePath, fileName),
          )
        : state.ai_knowledge_files,
    };
  } catch (error) {
    const errorMessage = `Validation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}

function validateGraphAwareAgents(agentsDir: string, agentFiles: string[]): string[] {
  const requiredGraphAgents = agentFiles.filter(
    (file) => file === 'planner.md' || file.startsWith('implementer-'),
  );
  const errors: string[] = [];

  for (const agentFile of requiredGraphAgents) {
    const agentPath = join(agentsDir, agentFile);
    try {
      const content = readFileSync(agentPath, 'utf-8');
      if (!content.includes('mcp__code_graph')) {
        errors.push(`${agentFile} missing mcp__code_graph tool allowlist`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Could not validate ${agentFile} graph tools: ${message}`);
    }
  }

  return errors;
}

function readStackProfileForWiki(
  state: InitializeProjectState,
  frameworkConfigPath: string,
): unknown {
  if (state.phase4_context?.stack_profile) {
    return state.phase4_context.stack_profile;
  }

  try {
    const config = JSON.parse(readFileSync(frameworkConfigPath, 'utf-8')) as {
      stack_profile?: unknown;
    };
    return config.stack_profile;
  } catch {
    return undefined;
  }
}
