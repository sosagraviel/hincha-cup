import type { PhaseSlot } from './types.js';

/**
 * Every phase that can produce debug artifacts in the initialize-project
 * workflow. Values here are the on-disk directory segment (`phase-1-discovery`).
 * Keep the set in sync with the graph in `initialize-project.graph.ts`.
 */
export const INITIALIZE_PROJECT_PHASES: Record<string, PhaseSlot> = {
  phase1: {
    phaseId: 'phase-1-discovery',
    phaseNumber: 1,
    phaseLabel: 'Phase 1 — Discovery',
  },
  phase2: {
    phaseId: 'phase-2-consolidation',
    phaseNumber: 2,
    phaseLabel: 'Phase 2 — Consolidation',
  },
  phase3: {
    phaseId: 'phase-3-synthesis',
    phaseNumber: 3,
    phaseLabel: 'Phase 3 — Synthesis',
  },
  phase4: {
    phaseId: 'phase-4-context-generation',
    phaseNumber: 4,
    phaseLabel: 'Phase 4 — Context Generation',
  },
  // Wiki generation runs at the tail of Phase 4 (a parallel sub-graph fans
  // out per page). Distinct slot so debug artifacts don't pile into the
  // context-generation bucket — and so the prior `phase-unknown/` bucket
  // (gira-run finding F2) never recurs.
  phase4Wiki: {
    phaseId: 'phase-4-wiki',
    phaseNumber: 4,
    phaseLabel: 'Phase 4 — Wiki Generation',
  },
  phase5: {
    phaseId: 'phase-5-resources',
    phaseNumber: 5,
    phaseLabel: 'Phase 5 — Resources',
  },
  phase6: {
    phaseId: 'phase-6-validation',
    phaseNumber: 6,
    phaseLabel: 'Phase 6 — Validation',
  },
};

export function getInitializeProjectPhase(key: keyof typeof INITIALIZE_PROJECT_PHASES): PhaseSlot {
  return INITIALIZE_PROJECT_PHASES[key];
}
