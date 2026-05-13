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
import { getExpectedLlmWikiFiles } from '../../../services/graph-wiki/wiki-generator.service.js';
import { validateCodeGraphMcpConfig } from '../../../services/framework/mcp-config.service.js';
import { validatePortability } from './helpers/portability-validator.js';

/**
 * Phase 6: Validation Node
 *
 * This node:
 * - Validates all generated files exist
 * - Validates framework-config.json structure
 * - Verifies CLAUDE.md (or AGENTS.md) and the three prescriptive convention
 *   skills (code-conventions, multi-file-workflows, testing-conventions) are
 *   valid markdown
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

    const conventionSkillPaths: Array<{ label: string; path: string }> = [
      {
        label: 'code-conventions/SKILL.md',
        path:
          state.code_conventions_path ||
          resolveConfigPath(state.project_path, 'skills', 'code-conventions', 'SKILL.md'),
      },
      {
        label: 'multi-file-workflows/SKILL.md',
        path:
          state.multi_file_workflows_path ||
          resolveConfigPath(state.project_path, 'skills', 'multi-file-workflows', 'SKILL.md'),
      },
      {
        label: 'testing-conventions/SKILL.md',
        path:
          state.testing_conventions_path ||
          resolveConfigPath(state.project_path, 'skills', 'testing-conventions', 'SKILL.md'),
      },
    ];

    const frameworkConfigPath =
      state.framework_config_path || resolveFrameworkConfigPath(state.project_path);
    const shouldValidateWiki = Boolean(state.llm_wiki_path || state.phase4_wiki_generation);
    const llmWikiPath = state.llm_wiki_path || join(state.project_path, 'docs', 'llm-wiki');

    const directories = getClaudeDirectories(state.project_path);

    const claudeMdResult = validateMarkdownFile(instructionFilePath, instructionFileName);
    validationErrors.push(...claudeMdResult.errors);
    validationWarnings.push(...claudeMdResult.warnings);
    if (claudeMdResult.valid) {
      phaseLogger.success(` ✓ ${instructionFileName} validated`);
    }

    for (const { label, path } of conventionSkillPaths) {
      const skillResult = validateMarkdownFile(path, label);
      validationErrors.push(...skillResult.errors);
      validationWarnings.push(...skillResult.warnings);
      if (skillResult.valid) {
        phaseLogger.success(` ✓ ${label} validated`);
      }
    }

    const configResult = validateFrameworkConfig(frameworkConfigPath);
    validationErrors.push(...configResult.errors);
    validationWarnings.push(...configResult.warnings);
    if (configResult.valid) {
      phaseLogger.success(' ✓ framework-config.json validated');
    }

    if (shouldValidateWiki) {
      const wikiErrors: string[] = [];
      const wikiStackProfile = readStackProfileForWiki(state, frameworkConfigPath);
      const expectedWikiFiles = getExpectedLlmWikiFiles(wikiStackProfile);

      for (const fileName of expectedWikiFiles) {
        const wikiFileResult = validateWikiMarkdownFile(
          join(llmWikiPath, String(fileName)),
          `docs/llm-wiki/${String(fileName)}`,
          { serviceDoc: String(fileName).startsWith('wiki/services/') },
        );
        wikiErrors.push(...wikiFileResult.errors);
        validationWarnings.push(...wikiFileResult.warnings);
      }

      validationErrors.push(...wikiErrors);
      if (wikiErrors.length === 0) {
        phaseLogger.success(' ✓ LLM wiki validated');
      }
    }

    const skillsResult = validateDirectoryExists(directories.skills, 'Skills');
    validationErrors.push(...skillsResult.errors);
    if (skillsResult.valid) {
      phaseLogger.success(' ✓ Skills directory exists');
    }

    const agentsResult = validateDirectoryWithFiles(directories.agents, 'Agents');
    validationErrors.push(...agentsResult.errors);

    if (agentsResult.valid && agentsResult.files) {
      phaseLogger.success(` ✓ Agents directory exists with ${agentsResult.fileCount} agents`);

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

    const phaseCompletionResult = validatePhaseCompletion(state);
    validationErrors.push(...phaseCompletionResult.errors);
    validationWarnings.push(...phaseCompletionResult.warnings);

    phaseLogger.info(' Validating portability of generated .claude/ + .codex/ artifacts...');
    const portability = validatePortability(state.project_path);
    if (!portability.ok) {
      phaseLogger.error(' ✗ Portability scan FAILED:');
      const TOP_N = 20;
      portability.violations.slice(0, TOP_N).forEach((v) => {
        phaseLogger.error(`  - ${v.file}:${v.line}: ${v.content}`);
      });
      if (portability.violations.length > TOP_N) {
        phaseLogger.error(
          `  ... and ${portability.violations.length - TOP_N} more (run with --debug for the full list)`,
        );
      }
      validationErrors.push(
        `Portability scan: ${portability.violations.length} non-portable absolute path(s) found in committed .claude/ or .codex/ artifacts (e.g. ${portability.violations[0]?.file}:${portability.violations[0]?.line}). Generated outputs must contain only project-relative paths, /tmp/, or URLs.`,
      );
    } else {
      phaseLogger.success(
        ` ✓ Portability scan passed (${portability.filesScanned} file${portability.filesScanned === 1 ? '' : 's'} scanned, 0 violations)`,
      );
    }

    if (validationErrors.length > 0) {
      phaseLogger.error(' ✗ Validation failed:');
      validationErrors.forEach((err) => phaseLogger.error(`  - ${err}`));

      return {
        errors: [...state.errors, ...validationErrors],
        warnings: [...state.warnings, ...validationWarnings],
        current_phase: 'failed',
      };
    }

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
      phaseLogger.info(`LLM Wiki: ${llmWikiPath}`);
    }
    if (totalDuration) {
      phaseLogger.info(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    }

    return {
      current_phase: 'complete',
      completed_at: completedAt,
      total_duration_ms: totalDuration,
      warnings: [...state.warnings, ...validationWarnings],
      claude_md_path: instructionFilePath,
      code_conventions_path: state.code_conventions_path || conventionSkillPaths[0].path,
      multi_file_workflows_path: state.multi_file_workflows_path || conventionSkillPaths[1].path,
      testing_conventions_path: state.testing_conventions_path || conventionSkillPaths[2].path,
      framework_config_path: frameworkConfigPath,
      llm_wiki_path: shouldValidateWiki ? llmWikiPath : state.llm_wiki_path,
      llm_wiki_files: shouldValidateWiki
        ? getExpectedLlmWikiFiles(readStackProfileForWiki(state, frameworkConfigPath)).map(
            (fileName) => join(llmWikiPath, String(fileName)),
          )
        : state.llm_wiki_files,
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
