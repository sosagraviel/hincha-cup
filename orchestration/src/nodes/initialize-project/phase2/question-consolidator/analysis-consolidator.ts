import type {
  AnalyzerOutput,
  Phase2Consolidation,
} from '../../../../state/schemas/initialize-project.schema.js';
import {
  normalizeAgentName,
  findOverlaps,
  identifyGaps,
  detectConflicts,
} from './helpers/index.js';

/**
 * Consolidate findings from 4 analyzer agents
 *
 * This function:
 * 1. Merges all findings into a unified structure
 * 2. Identifies overlaps (high confidence when multiple agents agree)
 * 3. Identifies gaps (missing info or needs verification)
 * 4. Detects conflicts (contradictory findings)
 *
 * @param analyzers - Array of 4 analyzer outputs
 * @returns Consolidated findings with gaps and conflicts identified
 */
export function analysisConsolidator(analyzers: AnalyzerOutput[]): Phase2Consolidation {
  if (analyzers.length !== 4) {
    throw new Error(`Expected 4 analyzer outputs, got ${analyzers.length}`);
  }

  const consolidated_findings: Record<string, any> = {};

  analyzers.forEach((analyzer) => {
    const agentKey = normalizeAgentName(analyzer.agent_name);
    consolidated_findings[agentKey] = {
      agent_name: analyzer.agent_name,
      timestamp: analyzer.timestamp,
      findings: analyzer.findings,
      confidence_level: analyzer.confidence_level || 'medium',
    };
  });

  const overlaps = findOverlaps(analyzers);
  if (overlaps.length > 0) {
    consolidated_findings.overlaps = overlaps;
  }

  const gaps = identifyGaps(analyzers);
  const identified_gaps =
    gaps.length > 0
      ? gaps.map((g) => `${g.agent}: ${g.item}${g.question ? ` (${g.question})` : ''}`)
      : undefined;

  const conflicts = detectConflicts(analyzers);
  const conflicting_findings =
    conflicts.length > 0
      ? conflicts.map((c) => `${c.type} between ${c.agents.join(', ')}`)
      : undefined;

  return {
    consolidated_findings,
    identified_gaps,
    conflicting_findings,
    timestamp: new Date().toISOString(),
  };
}
