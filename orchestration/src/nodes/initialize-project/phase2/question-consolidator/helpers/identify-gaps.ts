import type { AnalyzerOutput } from '../../../../../state/schemas/initialize-project.schema.js';
import type { Gap } from '../types.js';
import { normalizeAgentName } from './normalize-agent-name.js';

/**
 * Remove exact duplicate gaps
 */
function removeExactDuplicates(gaps: Gap[]): Gap[] {
  const seen = new Map<string, boolean>();
  const deduplicated: Gap[] = [];

  gaps.forEach((gap) => {
    const key = `${gap.item}|||${gap.question || ''}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduplicated.push(gap);
    }
  });

  return deduplicated;
}

/**
 * Identify gaps (missing information or needs verification)
 */
export function identifyGaps(analyzers: AnalyzerOutput[]): Gap[] {
  const gaps: Gap[] = [];

  analyzers.forEach((analyzer) => {
    if (analyzer.needs_verification && analyzer.needs_verification.length > 0) {
      analyzer.needs_verification.forEach((item: any) => {
        // Handle both string format (legacy) and object format (current)
        // Object format: { item: string, question: string, reason: string }
        // String format: just a string
        const isObject = typeof item === 'object' && item !== null;
        const itemText = isObject ? item.item || JSON.stringify(item) : String(item);
        const questionText = isObject ? item.question : String(item);
        const reasonText = isObject ? item.reason : undefined;

        gaps.push({
          type: 'needs_verification',
          agent: normalizeAgentName(analyzer.agent_name),
          item: itemText,
          question: questionText,
          reason: reasonText,
          priority: 'medium',
        });
      });
    }
  });

  analyzers.forEach((analyzer) => {
    const findingsCount = Object.keys(analyzer.findings || {}).length;
    if (findingsCount < 3) {
      gaps.push({
        type: 'sparse_findings',
        agent: normalizeAgentName(analyzer.agent_name),
        item: `Sparse findings from ${analyzer.agent_name}`,
        reason: `Agent returned only ${findingsCount} finding categories`,
        priority: 'low',
      });
    }
  });

  return removeExactDuplicates(gaps);
}
