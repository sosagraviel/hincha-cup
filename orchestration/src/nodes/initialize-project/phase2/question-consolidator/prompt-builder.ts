import { buildContentSection } from '../../../../utils/shared/context-tags.js';

/**
 * Build input prompt for Phase 2 consolidation agent
 */
export function buildConsolidationPrompt(gaps: any[], feedbackPrompt?: string): string {
  const gapsJson = JSON.stringify(gaps, null, 2);

  const parts: string[] = [buildContentSection('Input Gaps', gapsJson)];

  // Add consolidation-specific instructions
  parts.push(
    '',
    [
      'CRITICAL: Output structure must be:',
      '{',
      '  "consolidated_gaps": [...],',
      '  "consolidation_metadata": {...}',
      '}',
    ].join('\n'),
  );

  if (feedbackPrompt) {
    parts.push('', buildContentSection('Validation Feedback', feedbackPrompt));
  }

  return parts.join('\n');
}
