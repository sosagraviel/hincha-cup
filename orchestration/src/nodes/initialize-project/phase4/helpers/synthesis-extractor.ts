/**
 * Phase 4: Synthesis Extractor Helper
 *
 * Extracts CLAUDE.md and project-context/SKILL.md content from Phase 3 synthesis
 * and writes them to the appropriate locations in the project directory.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { extractSynthesisMarkdown } from '../../../../utils/validator.js';

/**
 * Result of synthesis extraction and file writing
 */
export interface SynthesisExtractionResult {
  claudeMdContent: string;
  projectContextContent: string;
  claudeMdPath: string;
  projectContextPath: string;
}

/**
 * Extract and write synthesis files from Phase 3 synthesis output
 *
 * This function:
 * - Uses extractSynthesisMarkdown() to extract CLAUDE.md and project-context content
 * - Writes CLAUDE.md to .claude/CLAUDE.md
 * - Writes project-context/SKILL.md to .claude/skills/project-context/SKILL.md
 * - Normalizes the skill name to "project-context" (not project-specific name)
 *
 * @param synthesisContent - Raw synthesis content from Phase 3
 * @param projectPath - Path to the project root directory
 * @param logger - Logger instance for success messages
 * @returns Object containing content and paths for both files
 * @throws Error if extraction fails or required sections are missing
 */
export function extractAndWriteSynthesis(
  synthesisContent: string,
  projectPath: string,
  logger: any,
): SynthesisExtractionResult {
  logger.info(' Extracting from markdown format...');

  // Use resilient extraction (handles preamble text like "Let me output...")
  const extracted = extractSynthesisMarkdown(synthesisContent);
  if (!extracted) {
    throw new Error(
      'Could not find required sections in synthesis output. ' +
        "Expected '# CLAUDE.md Content', '---', and '# project-context/SKILL.md Content'",
    );
  }

  const claudeMdContent = extracted.claudemd;
  const claudeMdLines = claudeMdContent.split('\n').length;
  logger.success(`✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);

  const projectContextContent = extracted.projectContext;
  const projectContextLines = projectContextContent.split('\n').length;
  logger.success(`✓ Extracted project-context/SKILL.md (${projectContextLines} lines)`);

  // Write CLAUDE.md
  const claudeMdPath = join(projectPath, '.claude', 'CLAUDE.md');
  mkdirSync(join(projectPath, '.claude'), { recursive: true });
  writeFileSync(claudeMdPath, claudeMdContent);
  logger.success(`✓ Written: ${claudeMdPath}`);

  // Write project-context/SKILL.md
  const projectContextDir = join(projectPath, '.claude', 'skills', 'project-context');
  mkdirSync(projectContextDir, { recursive: true });
  const projectContextPath = join(projectContextDir, 'SKILL.md');

  // Ensure the skill name is always "project-context" (not project-specific name)
  const normalizedProjectContext = projectContextContent.replace(
    /^---\n([\s\S]*?)name:\s*[^\n]+\n([\s\S]*?)---/m,
    (match, before, after) => `---\n${before}name: project-context\n${after}---`,
  );

  writeFileSync(projectContextPath, normalizedProjectContext);
  logger.success(`✓ Written: ${projectContextPath}`);

  return {
    claudeMdContent,
    projectContextContent: normalizedProjectContext,
    claudeMdPath,
    projectContextPath,
  };
}
