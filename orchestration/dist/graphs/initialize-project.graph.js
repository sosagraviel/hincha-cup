import { StateGraph, END, START } from '@langchain/langgraph';
import { InitializeProjectAnnotation } from '../state/schemas/initialize-project.schema.js';
// Phase 1: Parallel Analyzer Nodes (4 agents run in parallel)
import { structureArchitectureAnalyzerNode } from '../nodes/phase1/structure-architecture-analyzer.node.js';
import { techStackDependenciesAnalyzerNode } from '../nodes/phase1/tech-stack-dependencies-analyzer.node.js';
import { codePatternsTestingAnalyzerNode } from '../nodes/phase1/code-patterns-testing-analyzer.node.js';
import { dataFlowsIntegrationsAnalyzerNode } from '../nodes/phase1/data-flows-integrations-analyzer.node.js';
// Phase 2: Consolidation Node
import { consolidationNode } from '../nodes/phase2/consolidation.node.js';
// Phase 3: Synthesis Node
import { synthesisNode } from '../nodes/phase3/synthesis.node.js';
// Phase 4: Context Generation Node
import { contextGenerationNode } from '../nodes/phase4/context-generation.node.js';
// Phase 5: Resources Node
import { resourcesNode } from '../nodes/phase5/resources.node.js';
// Phase 6: Validation Node
import { validationNode } from '../nodes/phase6/validation.node.js';
/**
 * Initialize Project Graph - 6-Phase Workflow
 *
 * PHASE 1 (PARALLEL): Run 4 analyzer agents concurrently
 *   - structure-architecture-analyzer
 *   - tech-stack-dependencies-analyzer
 *   - code-patterns-testing-analyzer
 *   - data-flows-integrations-analyzer
 *
 * PHASE 2: Consolidate findings and identify gaps
 * PHASE 3: Run Opus synthesis agent for comprehensive analysis
 * PHASE 4: Generate CLAUDE.md and project-context/SKILL.md
 * PHASE 5: Copy skills and resources
 * PHASE 6: Final validation
 *
 * Each phase has retry logic with exponential backoff and error feedback.
 * Phase 1 agents run in parallel using LangGraph's built-in parallelization.
 */
export const initializeProjectGraph = new StateGraph(InitializeProjectAnnotation)
    // PHASE 1: Add all 4 analyzer nodes
    .addNode('structure_architecture_analyzer', structureArchitectureAnalyzerNode)
    .addNode('tech_stack_dependencies_analyzer', techStackDependenciesAnalyzerNode)
    .addNode('code_patterns_testing_analyzer', codePatternsTestingAnalyzerNode)
    .addNode('data_flows_integrations_analyzer', dataFlowsIntegrationsAnalyzerNode)
    // PHASE 2: Consolidation
    .addNode('consolidation', consolidationNode)
    // PHASE 3: Synthesis
    .addNode('synthesis', synthesisNode)
    // PHASE 4: Context Generation
    .addNode('context_generation', contextGenerationNode)
    // PHASE 5: Resources
    .addNode('resources', resourcesNode)
    // PHASE 6: Validation
    .addNode('validation', validationNode)
    // PHASE 1: Start all 4 analyzers in parallel from START
    .addEdge(START, 'structure_architecture_analyzer')
    .addEdge(START, 'tech_stack_dependencies_analyzer')
    .addEdge(START, 'code_patterns_testing_analyzer')
    .addEdge(START, 'data_flows_integrations_analyzer')
    // All 4 analyzers converge to consolidation
    .addEdge('structure_architecture_analyzer', 'consolidation')
    .addEdge('tech_stack_dependencies_analyzer', 'consolidation')
    .addEdge('code_patterns_testing_analyzer', 'consolidation')
    .addEdge('data_flows_integrations_analyzer', 'consolidation')
    // Sequential flow after consolidation
    .addEdge('consolidation', 'synthesis')
    .addEdge('synthesis', 'context_generation')
    .addEdge('context_generation', 'resources')
    .addEdge('resources', 'validation')
    .addEdge('validation', END);
/**
 * Create a compiled graph instance with checkpointer
 *
 * @param checkpointer - LangGraph checkpointer (SqliteSaver or PostgresSaver)
 * @returns Compiled graph ready for execution
 *
 * @example
 * ```typescript
 * import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
 *
 * const checkpointer = new SqliteSaver('./checkpoints.db');
 * const graph = await createInitializeProjectGraph(checkpointer);
 *
 * const result = await graph.invoke({
 *   project_path: '/path/to/project',
 *   framework_path: '/path/to/framework',
 *   current_phase: 'init'
 * }, {
 *   configurable: { thread_id: 'init-123' }
 * });
 * ```
 */
export async function createInitializeProjectGraph(checkpointer) {
    return initializeProjectGraph.compile({ checkpointer });
}
//# sourceMappingURL=initialize-project.graph.js.map