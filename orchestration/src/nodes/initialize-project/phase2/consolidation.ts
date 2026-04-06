import type { AnalyzerOutput, Phase2Consolidation } from '../../../state/schemas/initialize-project.schema.js';

/**
 * Overlap between analyzer findings
 */
interface Overlap {
  category: string;
  agents: string[];
  count: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Gap in analyzer findings (missing or needs verification)
 */
interface Gap {
  type: 'needs_verification' | 'sparse_findings';
  agent: string;
  item: string;
  question?: string;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Conflict between analyzer findings
 */
interface Conflict {
  type: string;
  agents: string[];
  conflicting_values: any[];
  severity: 'high' | 'medium' | 'low';
}

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
export function consolidateAnalyses(analyzers: AnalyzerOutput[]): Phase2Consolidation {
  if (analyzers.length !== 4) {
    throw new Error(`Expected 4 analyzer outputs, got ${analyzers.length}`);
  }

  const consolidated_findings: Record<string, any> = {};

  analyzers.forEach(analyzer => {
    const agentKey = normalizeAgentName(analyzer.agent_name);
    consolidated_findings[agentKey] = {
      agent_name: analyzer.agent_name,
      timestamp: analyzer.timestamp,
      findings: analyzer.findings,
      confidence_level: analyzer.confidence_level || 'medium'
    };
  });

  const overlaps = findOverlaps(analyzers);
  if (overlaps.length > 0) {
    consolidated_findings.overlaps = overlaps;
  }

  const gaps = identifyGaps(analyzers);
  const identified_gaps = gaps.length > 0
    ? gaps.map(g => `${g.agent}: ${g.item}${g.question ? ` (${g.question})` : ''}`)
    : undefined;

  const conflicts = detectConflicts(analyzers);
  const conflicting_findings = conflicts.length > 0
    ? conflicts.map(c => `${c.type} between ${c.agents.join(', ')}`)
    : undefined;

  return {
    consolidated_findings,
    identified_gaps,
    conflicting_findings,
    timestamp: new Date().toISOString()
  };
}

/**
 * Normalize agent name for consistency
 */
function normalizeAgentName(agentName: string): string {
  const name = agentName.toLowerCase();

  if (name.includes('structure') || name.includes('architecture')) {
    return '01-structure-architecture';
  }
  if (name.includes('stack') || name.includes('dependencies')) {
    return '02-tech-stack-dependencies';
  }
  if (name.includes('patterns') || name.includes('testing')) {
    return '03-code-patterns-testing';
  }
  if (name.includes('flow') || name.includes('integration')) {
    return '04-data-flows-integrations';
  }

  return agentName;
}

/**
 * Find overlaps between agent findings
 */
function findOverlaps(analyzers: AnalyzerOutput[]): Overlap[] {
  const overlaps: Overlap[] = [];

  const allFindings = analyzers.flatMap(analyzer => {
    return Object.entries(analyzer.findings || {}).map(([category, items]) => ({
      agent: analyzer.agent_name,
      category,
      items: Array.isArray(items) ? items : [items]
    }));
  });

  const byCategory: Record<string, typeof allFindings> = {};
  allFindings.forEach(finding => {
    if (!byCategory[finding.category]) {
      byCategory[finding.category] = [];
    }
    byCategory[finding.category].push(finding);
  });

  Object.entries(byCategory).forEach(([category, findings]) => {
    if (findings.length > 1) {
      overlaps.push({
        category,
        agents: findings.map(f => f.agent),
        count: findings.length,
        confidence: findings.length >= 3 ? 'high' : 'medium'
      });
    }
  });

  return overlaps;
}

/**
 * Identify gaps (missing information or needs verification)
 */
function identifyGaps(analyzers: AnalyzerOutput[]): Gap[] {
  const gaps: Gap[] = [];

  analyzers.forEach(analyzer => {
    if (analyzer.needs_verification && analyzer.needs_verification.length > 0) {
      analyzer.needs_verification.forEach(item => {
        // Handle both string format (legacy) and object format (current)
        // Object format: { item: string, question: string, reason: string }
        // String format: just a string
        const isObject = typeof item === 'object' && item !== null;
        const itemText = isObject ? (item as any).item || JSON.stringify(item) : String(item);
        const questionText = isObject ? (item as any).question : String(item);
        const reasonText = isObject ? (item as any).reason : undefined;

        gaps.push({
          type: 'needs_verification',
          agent: normalizeAgentName(analyzer.agent_name),
          item: itemText,
          question: questionText,
          reason: reasonText,
          priority: 'medium'
        });
      });
    }
  });

  analyzers.forEach(analyzer => {
    const findingsCount = Object.keys(analyzer.findings || {}).length;
    if (findingsCount < 3) {
      gaps.push({
        type: 'sparse_findings',
        agent: normalizeAgentName(analyzer.agent_name),
        item: `Sparse findings from ${analyzer.agent_name}`,
        reason: `Agent returned only ${findingsCount} finding categories`,
        priority: 'low'
      });
    }
  });

  return removeExactDuplicates(gaps);
}

/**
 * Remove exact duplicate gaps
 */
function removeExactDuplicates(gaps: Gap[]): Gap[] {
  const seen = new Map<string, boolean>();
  const deduplicated: Gap[] = [];

  gaps.forEach(gap => {
    const key = `${gap.item}|||${gap.question || ''}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduplicated.push(gap);
    }
  });

  return deduplicated;
}

/**
 * Detect conflicts between analyzer findings
 */
function detectConflicts(analyzers: AnalyzerOutput[]): Conflict[] {
  const conflicts: Conflict[] = [];

  const techStacks = analyzers
    .filter(a =>
      (a.findings as any)?.tech_stack ||
      (a.findings as any)?.languages ||
      (a.findings as any)?.frameworks
    )
    .map(a => ({
      agent: a.agent_name,
      languages: (a.findings as any)?.languages || (a.findings as any)?.tech_stack?.languages || [],
      frameworks: (a.findings as any)?.frameworks || (a.findings as any)?.tech_stack?.frameworks || []
    }));

  if (techStacks.length > 1) {
    const allLanguages = new Set<string>();
    const languagesByAgent: Record<string, string[]> = {};

    techStacks.forEach(stack => {
      const langs = Array.isArray(stack.languages) ? stack.languages : [];
      langs.forEach(lang => allLanguages.add(String(lang)));
      languagesByAgent[stack.agent] = langs.map(String);
    });

    const uniqueAgents = Object.keys(languagesByAgent);
    if (uniqueAgents.length > 1) {
      const firstLangs = new Set(languagesByAgent[uniqueAgents[0]]);
      const hasConflict = uniqueAgents.slice(1).some(agent => {
        const langs = new Set(languagesByAgent[agent]);
        return firstLangs.size !== langs.size ||
          ![...firstLangs].every(lang => langs.has(lang));
      });

      if (hasConflict) {
        conflicts.push({
          type: 'language_detection',
          agents: uniqueAgents,
          conflicting_values: Object.values(languagesByAgent),
          severity: 'medium'
        });
      }
    }
  }

  return conflicts;
}
