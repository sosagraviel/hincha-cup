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
 *
 * `attempted_resolution` and `impact` are required on `needs_verification`
 * entries by the Plan 14 §C.1 + §C.7 schema, but optional in the type
 * because `sparse_findings` / `missing_language_coverage` types do not
 * carry them. The deterministic dedupe pre-pass passes these through
 * verbatim when present.
 */
export interface Gap {
  type: 'needs_verification' | 'sparse_findings' | 'missing_language_coverage';
  agent: string;
  item: string;
  question?: string;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
  attempted_resolution?: string[];
  impact?: string;
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
