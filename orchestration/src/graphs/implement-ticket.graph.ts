import { StateGraph, START, END } from '@langchain/langgraph';
import {
  ImplementTicketAnnotation,
  type ImplementTicketState,
} from '../state/schemas/implement-ticket.schema.js';

// Import all 11 phase nodes
import { phase0PreflightNode } from '../nodes/implement-ticket/phase0-preflight.node.js';
import { phase1ContextNode } from '../nodes/implement-ticket/phase1-context.node.js';
import { phase2PlanningNode } from '../nodes/implement-ticket/phase2-planning.node.js';
import { phase3EnvironmentNode } from '../nodes/implement-ticket/phase3-environment.node.js';
import { phase4ImplementationNode } from '../nodes/implement-ticket/phase4-implementation.node.js';
import { phase5TestingNode } from '../nodes/implement-ticket/phase5-testing.node.js';
import { phase6VisualNode } from '../nodes/implement-ticket/phase6-visual.node.js';
import { phase7DocumentationNode } from '../nodes/implement-ticket/phase7-documentation.node.js';
import { phase8PRNode } from '../nodes/implement-ticket/phase8-pr.node.js';
import { phase9ReviewNode } from '../nodes/implement-ticket/phase9-review.node.js';
import { phase10CleanupNode } from '../nodes/implement-ticket/phase10-cleanup.node.js';

/**
 * Routing function for conditional start based on start_phase
 *
 * This allows resuming from any phase using --start-phase N flag
 */
function routeToStartPhase(state: typeof ImplementTicketAnnotation.State): string {
  const startPhase = state.start_phase ?? 0;

  switch (startPhase) {
    case 0:
      return 'phase0_preflight';
    case 1:
      return 'phase1_context';
    case 2:
      return 'phase2_planning';
    case 3:
      return 'phase3_environment';
    case 4:
      return 'phase4_implementation';
    case 5:
      return 'phase5_testing';
    case 6:
      return 'phase6_visual';
    case 7:
      return 'phase7_documentation';
    case 8:
      return 'phase8_pr';
    case 9:
      return 'phase9_review';
    case 10:
      return 'phase10_cleanup';
    default:
      return 'phase0_preflight';
  }
}

/**
 * Create Implement Ticket workflow graph
 *
 * 11-Phase Architecture:
 * - Phase 0: Preflight Validation
 * - Phase 1: Context Gathering
 * - Phase 2: Planning & Architecture
 * - Phase 3: Environment Setup
 * - Phase 4: Implementation
 * - Phase 5: Testing
 * - Phase 6: Visual Verification
 * - Phase 7: Documentation Update
 * - Phase 8: PR Creation
 * - Phase 9: Review Loop
 * - Phase 10: Cleanup
 *
 * Features:
 * - Conditional start (resume from any phase via --start-phase)
 * - Linear flow between phases
 * - Automatic cleanup on failure
 * - Checkpointing support
 * - Disk-first idempotency pattern
 */
export function createImplementTicketGraph() {
  const graph = new StateGraph(ImplementTicketAnnotation)
    // ============================================================================
    // ADD ALL 11 PHASE NODES
    // ============================================================================
    .addNode('phase0_preflight', phase0PreflightNode)
    .addNode('phase1_context', phase1ContextNode)
    .addNode('phase2_planning', phase2PlanningNode)
    .addNode('phase3_environment', phase3EnvironmentNode)
    .addNode('phase4_implementation', phase4ImplementationNode)
    .addNode('phase5_testing', phase5TestingNode)
    .addNode('phase6_visual', phase6VisualNode)
    .addNode('phase7_documentation', phase7DocumentationNode)
    .addNode('phase8_pr', phase8PRNode)
    .addNode('phase9_review', phase9ReviewNode)
    .addNode('phase10_cleanup', phase10CleanupNode)
    // Route to appropriate phase based on start_phase parameter
    .addConditionalEdges(START, routeToStartPhase, {
      phase0_preflight: 'phase0_preflight',
      phase1_context: 'phase1_context',
      phase2_planning: 'phase2_planning',
      phase3_environment: 'phase3_environment',
      phase4_implementation: 'phase4_implementation',
      phase5_testing: 'phase5_testing',
      phase6_visual: 'phase6_visual',
      phase7_documentation: 'phase7_documentation',
      phase8_pr: 'phase8_pr',
      phase9_review: 'phase9_review',
      phase10_cleanup: 'phase10_cleanup',
    })
    .addEdge('phase0_preflight', 'phase1_context')
    .addEdge('phase1_context', 'phase2_planning')
    .addEdge('phase2_planning', 'phase3_environment')
    .addEdge('phase3_environment', 'phase4_implementation')
    .addEdge('phase4_implementation', 'phase5_testing')
    .addEdge('phase5_testing', 'phase6_visual')
    .addEdge('phase6_visual', 'phase7_documentation')
    .addEdge('phase7_documentation', 'phase8_pr')
    .addEdge('phase8_pr', 'phase9_review')
    .addEdge('phase9_review', 'phase10_cleanup')
    .addEdge('phase10_cleanup', END);

  return graph;
}

/**
 * Compile Implement Ticket workflow with checkpointing
 *
 * @param checkpointer - Optional checkpointer for persistence
 * @returns Compiled graph
 */
export function compileImplementTicketGraph(checkpointer?: any) {
  const graph = createImplementTicketGraph();

  if (checkpointer) {
    return graph.compile({ checkpointer });
  }

  return graph.compile();
}
