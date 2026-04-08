/**
 * Phase 2 Consolidation Types
 *
 * All type definitions used across consolidation logic
 */

/**
 * Overlap between analyzer findings
 */
export interface Overlap {
  category: string;
  agents: string[];
  count: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Gap in analyzer findings (missing or needs verification)
 */
export interface Gap {
  type: 'needs_verification' | 'sparse_findings' | 'missing_language_coverage';
  agent: string;
  item: string;
  question?: string;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Consolidated gap with metadata about consolidation
 */
export interface ConsolidatedGap extends Gap {
  consolidated_from: string[];
  original_count: number;
}

/**
 * Conflict between analyzer findings
 */
export interface Conflict {
  type: string;
  agents: string[];
  conflicting_values: any[];
  severity: 'high' | 'medium' | 'low';
}

/**
 * Question consolidation output from agent
 */
export interface QuestionConsolidationOutput {
  consolidated_gaps: ConsolidatedGap[];
  consolidation_metadata: {
    original_gap_count: number;
    consolidated_gap_count: number;
    reduction_percentage: number;
    consolidation_groups: Array<{
      group_id: number;
      topic: string;
      original_items: string[];
      consolidated_to: string;
      reason?: string;
    }>;
  };
}
