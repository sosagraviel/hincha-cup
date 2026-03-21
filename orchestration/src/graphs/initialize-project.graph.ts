import { StateGraph, END, START } from '@langchain/langgraph';
import type { InitializeProjectState } from '../state/schemas/initialize-project.schema.js';
import { InitializeProjectAnnotation } from '../state/schemas/initialize-project.schema.js';

import { structureArchitectureAnalyzerNode } from '../nodes/phase1/structure-architecture-analyzer.node.js';
import { techStackDependenciesAnalyzerNode } from '../nodes/phase1/tech-stack-dependencies-analyzer.node.js';
import { codePatternsTestingAnalyzerNode } from '../nodes/phase1/code-patterns-testing-analyzer.node.js';
import { dataFlowsIntegrationsAnalyzerNode } from '../nodes/phase1/data-flows-integrations-analyzer.node.js';
import { consolidationNode } from '../nodes/phase2/consolidation.node.js';
import { synthesisNode } from '../nodes/phase3/synthesis.node.js';
import { contextGenerationNode } from '../nodes/phase4/context-generation.node.js';
import { resourcesNode } from '../nodes/phase5/resources.node.js';
import { validationNode } from '../nodes/phase6/validation.node.js';

/**
 * Router function to determine which phase to start from
 */
function routeToPhase(state: InitializeProjectState): string | string[] {
  const startPhase = (state as any).start_phase || 1;

  switch (startPhase) {
    case 1:
      // Start from Phase 1 - run all 4 analyzers in parallel
      return [
        'structure_architecture_analyzer',
        'tech_stack_dependencies_analyzer',
        'code_patterns_testing_analyzer',
        'data_flows_integrations_analyzer'
      ];
    case 2:
      return 'consolidation';
    case 3:
      return 'synthesis';
    case 4:
      return 'context_generation';
    case 5:
      return 'resources';
    case 6:
      return 'validation';
    default:
      throw new Error(`Invalid start_phase: ${startPhase}. Must be between 1 and 6.`);
  }
}

/**
 * Initialize Project Graph - 6-Phase Workflow
 *
 * PHASE 1 (PARALLEL): Run 4 analyzer agents concurrently
 * PHASE 2: Consolidate findings and identify gaps
 * PHASE 3: Run Opus synthesis agent for comprehensive analysis
 * PHASE 4: Generate CLAUDE.md and project-context/SKILL.md
 * PHASE 5: Copy skills and resources
 * PHASE 6: Final validation
 *
 * Supports starting from any phase using the start_phase parameter in state.
 */
export const initializeProjectGraph = new StateGraph(InitializeProjectAnnotation)
  .addNode('structure_architecture_analyzer', structureArchitectureAnalyzerNode)
  .addNode('tech_stack_dependencies_analyzer', techStackDependenciesAnalyzerNode)
  .addNode('code_patterns_testing_analyzer', codePatternsTestingAnalyzerNode)
  .addNode('data_flows_integrations_analyzer', dataFlowsIntegrationsAnalyzerNode)
  .addNode('consolidation', consolidationNode)
  .addNode('synthesis', synthesisNode)
  .addNode('context_generation', contextGenerationNode)
  .addNode('resources', resourcesNode)
  .addNode('validation', validationNode)

  // Conditional routing from START based on start_phase
  .addConditionalEdges(START, routeToPhase)

  // Phase 1 → Phase 2 edges
  .addEdge('structure_architecture_analyzer', 'consolidation')
  .addEdge('tech_stack_dependencies_analyzer', 'consolidation')
  .addEdge('code_patterns_testing_analyzer', 'consolidation')
  .addEdge('data_flows_integrations_analyzer', 'consolidation')

  // Linear flow from Phase 2 onwards
  .addEdge('consolidation', 'synthesis')
  .addEdge('synthesis', 'context_generation')
  .addEdge('context_generation', 'resources')
  .addEdge('resources', 'validation')
  .addEdge('validation', END);

/**
 * Create compiled graph instance with checkpointer
 */
export async function createInitializeProjectGraph(checkpointer: any) {
  return initializeProjectGraph.compile({ checkpointer });
}
