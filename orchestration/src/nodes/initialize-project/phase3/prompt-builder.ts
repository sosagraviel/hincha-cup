import { buildContentSection } from '../../../utils/shared/context-tags.js';

/**
 * Build input prompt for Phase 3 synthesis agent
 */
export function buildSynthesisPrompt(
  consolidatedData: any,
  feedbackPrompt?: string,
): string {
  const consolidatedJson = JSON.stringify(consolidatedData, null, 2);

  const parts: string[] = [
    buildContentSection('Consolidated Analysis', consolidatedJson),
  ];

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}
