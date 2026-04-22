import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildContentSection } from '../../../utils/shared/context-tags.js';
import { getInstructionFileName, resolveConfigPath } from '../../../utils/provider-paths.js';

/**
 * Build a provider-aware output-format block that overrides the default
 * `CLAUDE.md` markers in the static agent prompt when Codex is active.
 *
 * The validator (extract-synthesis-markdown.ts) accepts both
 * `# CLAUDE.md Content` and `# AGENTS.md Content`; this block tells the agent
 * which one to emit and what path the orchestration layer will write to.
 */
function buildProviderOutputFormat(): string {
  const instructionFile = getInstructionFileName();
  const sectionHeader = `# ${instructionFile} Content`;
  const instructionFilePath = resolveConfigPath('<project>', instructionFile);
  const skillPath = resolveConfigPath('<project>', 'skills', 'project-context', 'SKILL.md');

  return [
    '<provider_output_format>',
    'ACTIVE PROVIDER OVERRIDE — these values take precedence over any example',
    'paths or section headers mentioned in the static agent prompt.',
    '',
    `  • Instruction file name: ${instructionFile}`,
    `  • First-section marker (line 1 of your response): ${sectionHeader}`,
    `  • Orchestration will write it to: ${instructionFilePath}`,
    `  • Project-context skill will be written to: ${skillPath}`,
    '',
    `Your response MUST start with exactly: ${sectionHeader}`,
    'Followed by the instruction-file body, then `---`, then',
    '`# project-context/SKILL.md Content`, then the skill body.',
    '</provider_output_format>',
  ].join('\n');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load synthesis instructions from the colocated prompts directory.
 * Matches the local-loader convention used by phase 2's consolidator.
 */
function loadSynthesisInstructions(): string {
  const instructionsPath = join(__dirname, 'prompts/synthesis-instructions.md');
  let content: string;
  try {
    content = readFileSync(instructionsPath, 'utf-8');
  } catch {
    throw new Error('Failed to load synthesis instructions: file not found');
  }
  if (!content.trim()) {
    throw new Error('Failed to load synthesis instructions: file not found');
  }
  return content;
}

/**
 * Build input prompt for Phase 3 synthesis agent.
 * Appends synthesis-instructions.md between the consolidated data
 * and any validation feedback.
 */
export function buildSynthesisPrompt(consolidatedData: any, feedbackPrompt?: string): string {
  const consolidatedJson = JSON.stringify(consolidatedData, null, 2);

  const parts: string[] = [
    buildContentSection('Consolidated Analysis', consolidatedJson),
    '',
    loadSynthesisInstructions(),
    '',
    buildProviderOutputFormat(),
  ];

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}
