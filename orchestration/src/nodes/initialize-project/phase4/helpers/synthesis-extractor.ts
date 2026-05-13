/**
 * Phase 4: Synthesis Extractor Helper
 *
 * Extracts the five sections from Phase 3 synthesis (one Opus call) and
 * writes the four file-bound sections to disk:
 *
 *   1. CLAUDE.md (or AGENTS.md on Codex) → `<project>/.claude/CLAUDE.md`
 *      (or `.codex/AGENTS.md`).
 *   2. code-conventions/SKILL.md → `<project>/.claude/skills/code-conventions/SKILL.md`.
 *   3. multi-file-workflows/SKILL.md → `<project>/.claude/skills/multi-file-workflows/SKILL.md`.
 *   4. testing-conventions/SKILL.md → `<project>/.claude/skills/testing-conventions/SKILL.md`.
 *
 * The fifth section — the Architectural Narrative — is NOT written as a
 * skill. It is returned to the caller (Phase 4b wiki preparation) as
 * descriptive prose the wiki-generator agent consumes when compiling
 * ARCHITECTURE.md and per-service docs. See
 * `ai-documentation-strategy/09-context-strategy/analysis.md` for the
 * descriptive/prescriptive split.
 *
 * Every write goes through PortableWriter, which fails fast if the
 * synthesizer emitted a non-portable absolute path (`/Users/<name>/…`).
 * That triggers the orchestration's retry-with-feedback loop.
 */

import { join } from 'path';
import { extractSynthesisMarkdown } from '../../../../utils/validator.js';
import { resolveConfigPath, resolveInstructionFilePath } from '../../../../utils/provider-paths.js';
import {
  PortablePathResolver,
  PortableWriter,
  PortabilityError,
  asAbsolutePath,
} from '../../../../services/framework/portable-paths/index.js';

export interface SynthesisExtractionResult {
  claudeMdContent: string;
  codeConventionsContent: string;
  multiFileWorkflowsContent: string;
  testingConventionsContent: string;
  architecturalNarrative: string;
  claudeMdPath: string;
  codeConventionsPath: string;
  multiFileWorkflowsPath: string;
  testingConventionsPath: string;
}

/**
 * Skill-specific metadata for the on-disk write step. The framework
 * normalizes the YAML `name:` field to the canonical skill slug (regardless
 * of what the LLM put in the synthesis blob) so consumers can look up the
 * skill by a stable name.
 */
const PRESCRIPTIVE_SKILLS = [
  {
    section: 'codeConventions' as const,
    skillName: 'code-conventions',
    successLabel: 'code-conventions/SKILL.md',
  },
  {
    section: 'multiFileWorkflows' as const,
    skillName: 'multi-file-workflows',
    successLabel: 'multi-file-workflows/SKILL.md',
  },
  {
    section: 'testingConventions' as const,
    skillName: 'testing-conventions',
    successLabel: 'testing-conventions/SKILL.md',
  },
];

/**
 * Force the YAML `name:` field in a skill body to the canonical slug. The
 * synthesizer might emit `name: code_conventions` or `name: My Code Rules`;
 * downstream skill-loading code requires the exact slug.
 */
function normalizeSkillName(content: string, expectedName: string): string {
  return content.replace(
    /^---\n([\s\S]*?)name:\s*[^\n]+\n([\s\S]*?)---/m,
    (_match, before: string, after: string) => `---\n${before}name: ${expectedName}\n${after}---`,
  );
}

export function extractAndWriteSynthesis(
  synthesisContent: string,
  projectPath: string,
  logger: any,
): SynthesisExtractionResult {
  logger.info(' Extracting synthesis sections...');

  const extracted = extractSynthesisMarkdown(synthesisContent);
  if (!extracted) {
    throw new Error(
      'Could not find required sections in synthesis output. Expected (in order): ' +
        '"# CLAUDE.md Content" (or "# AGENTS.md Content"), ' +
        '"# code-conventions/SKILL.md Content", ' +
        '"# multi-file-workflows/SKILL.md Content", ' +
        '"# testing-conventions/SKILL.md Content", ' +
        '"# Architectural Narrative Content".',
    );
  }

  const claudeMdLines = extracted.claudemd.split('\n').length;
  logger.success(`✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);
  for (const { section, successLabel } of PRESCRIPTIVE_SKILLS) {
    const lines = extracted[section].split('\n').length;
    logger.success(`✓ Extracted ${successLabel} (${lines} lines)`);
  }
  const narrativeLines = extracted.architecturalNarrative.split('\n').length;
  logger.success(`✓ Extracted Architectural Narrative (${narrativeLines} lines)`);

  const portableWriter = new PortableWriter(new PortablePathResolver(asAbsolutePath(projectPath)));

  const claudeMdPath = resolveInstructionFilePath(projectPath);
  try {
    portableWriter.writeMarkdown(asAbsolutePath(claudeMdPath), extracted.claudemd);
  } catch (err) {
    if (err instanceof PortabilityError) {
      throw new Error(
        `Phase 3 synthesis emitted a non-portable absolute path in CLAUDE.md content. ` +
          `Re-run synthesis with explicit "use only project-relative paths" guidance. ` +
          `Underlying: ${err.message}`,
      );
    }
    throw err;
  }
  logger.success(`✓ Written: ${claudeMdPath}`);

  const skillContents: Record<(typeof PRESCRIPTIVE_SKILLS)[number]['skillName'], string> = {
    'code-conventions': '',
    'multi-file-workflows': '',
    'testing-conventions': '',
  };
  const skillPaths: Record<(typeof PRESCRIPTIVE_SKILLS)[number]['skillName'], string> = {
    'code-conventions': '',
    'multi-file-workflows': '',
    'testing-conventions': '',
  };

  for (const { section, skillName } of PRESCRIPTIVE_SKILLS) {
    const skillDir = resolveConfigPath(projectPath, 'skills', skillName);
    const skillPath = join(skillDir, 'SKILL.md');
    const normalized = normalizeSkillName(extracted[section], skillName);

    try {
      portableWriter.writeMarkdown(asAbsolutePath(skillPath), normalized);
    } catch (err) {
      if (err instanceof PortabilityError) {
        throw new Error(
          `Phase 3 synthesis emitted a non-portable absolute path in ${skillName}/SKILL.md. ` +
            `Re-run synthesis with explicit "use only project-relative paths" guidance. ` +
            `Underlying: ${err.message}`,
        );
      }
      throw err;
    }
    logger.success(`✓ Written: ${skillPath}`);

    skillContents[skillName] = normalized;
    skillPaths[skillName] = skillPath;
  }

  return {
    claudeMdContent: extracted.claudemd,
    codeConventionsContent: skillContents['code-conventions'],
    multiFileWorkflowsContent: skillContents['multi-file-workflows'],
    testingConventionsContent: skillContents['testing-conventions'],
    architecturalNarrative: extracted.architecturalNarrative,
    claudeMdPath,
    codeConventionsPath: skillPaths['code-conventions'],
    multiFileWorkflowsPath: skillPaths['multi-file-workflows'],
    testingConventionsPath: skillPaths['testing-conventions'],
  };
}
