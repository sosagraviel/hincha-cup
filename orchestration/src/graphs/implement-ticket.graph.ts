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
      return 'phase0';
    case 1:
      return 'phase1';
    case 2:
      return 'phase2';
    case 3:
      return 'phase3';
    case 4:
      return 'phase4';
    case 5:
      return 'phase5';
    case 6:
      return 'phase6';
    case 7:
      return 'phase7';
    case 8:
      return 'phase8';
    case 9:
      return 'phase9';
    case 10:
      return 'phase10';
    default:
      return 'phase0';
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
    .addNode('phase0', phase0PreflightNode)
    .addNode('phase1', phase1ContextNode)
    .addNode('phase2', phase2PlanningNode)
    .addNode('phase3', phase3EnvironmentNode)
    .addNode('phase4', phase4ImplementationNode)
    .addNode('phase5', phase5TestingNode)
    .addNode('phase6', phase6VisualNode)
    .addNode('phase7', phase7DocumentationNode)
    .addNode('phase8', phase8PRNode)
    .addNode('phase9', phase9ReviewNode)
    .addNode('phase10', phase10CleanupNode)
    // Route to appropriate phase based on start_phase parameter
    .addConditionalEdges(START, routeToStartPhase, {
      phase0: 'phase0',
      phase1: 'phase1',
      phase2: 'phase2',
      phase3: 'phase3',
      phase4: 'phase4',
      phase5: 'phase5',
      phase6: 'phase6',
      phase7: 'phase7',
      phase8: 'phase8',
      phase9: 'phase9',
      phase10: 'phase10',
    })
    .addEdge('phase0', 'phase1')
    .addEdge('phase1', 'phase2')
    .addEdge('phase2', 'phase3')
    .addEdge('phase3', 'phase4')
    .addEdge('phase4', 'phase5')
    .addEdge('phase5', 'phase6')
    .addEdge('phase6', 'phase7')
    .addEdge('phase7', 'phase8')
    .addEdge('phase8', 'phase9')
    .addEdge('phase9', 'phase10')
    .addEdge('phase10', END);

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
