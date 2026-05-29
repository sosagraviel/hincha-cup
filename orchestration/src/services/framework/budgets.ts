/**
 * Token-budget SLA constants for per-run metrics aggregation.
 *
 * `target` is the expected nominal value; `warn` is the threshold above which
 * the aggregator emits a budget-breach warning in the summary report.
 * For fraction-based budgets the values are fractions of the total context
 * window or total input tokens for that run. For count-based budgets the
 * values are absolute counts.
 */
export const TOKEN_BUDGETS = {
  minimal_context_per_ticket: { target: 0.06, warn: 0.12 },
  wiki_preload: { target: 0.25, warn: 0.4 },
  overview_query: { target: 0.03, warn: 0.1 },
  planner_total_graph_queries: { target: 8, warn: 16 },
} as const;

export type BudgetKey = keyof typeof TOKEN_BUDGETS;

export interface BudgetSpec {
  target: number;
  warn: number;
}
