import { StateGraph, END, START } from '@langchain/langgraph';
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
 * Initialize Project Graph - 6-Phase Workflow
 *
 * PHASE 1 (PARALLEL): Run 4 analyzer agents concurrently
 * PHASE 2: Consolidate findings and identify gaps
 * PHASE 3: Run Opus synthesis agent for comprehensive analysis
 * PHASE 4: Generate CLAUDE.md and project-context/SKILL.md
 * PHASE 5: Copy skills and resources
 * PHASE 6: Final validation
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

  .addEdge(START, 'structure_architecture_analyzer')
  .addEdge(START, 'tech_stack_dependencies_analyzer')
  .addEdge(START, 'code_patterns_testing_analyzer')
  .addEdge(START, 'data_flows_integrations_analyzer')

  .addEdge('structure_architecture_analyzer', 'consolidation')
  .addEdge('tech_stack_dependencies_analyzer', 'consolidation')
  .addEdge('code_patterns_testing_analyzer', 'consolidation')
  .addEdge('data_flows_integrations_analyzer', 'consolidation')

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
