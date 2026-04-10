import type { AnalyzerOutput } from '../../../../../state/schemas/initialize-project.schema.js';
import type { Overlap } from '../types.js';

/**
 * Find overlaps between agent findings
 */
export function findOverlaps(analyzers: AnalyzerOutput[]): Overlap[] {
  const overlaps: Overlap[] = [];

  const allFindings = analyzers.flatMap((analyzer) => {
    return Object.entries(analyzer.findings || {}).map(([category, items]) => ({
      agent: analyzer.agent_name,
      category,
      items: Array.isArray(items) ? items : [items],
    }));
  });

  const byCategory: Record<string, typeof allFindings> = {};
  allFindings.forEach((finding) => {
    if (!byCategory[finding.category]) {
      byCategory[finding.category] = [];
    }
    byCategory[finding.category].push(finding);
  });

  Object.entries(byCategory).forEach(([category, findings]) => {
    if (findings.length > 1) {
      overlaps.push({
        category,
        agents: findings.map((f) => f.agent),
        count: findings.length,
        confidence: findings.length >= 3 ? 'high' : 'medium',
      });
    }
  });

  return overlaps;
}
