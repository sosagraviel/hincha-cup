import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildContentSection } from '../../../utils/shared/context-tags.js';

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
  ];

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}
