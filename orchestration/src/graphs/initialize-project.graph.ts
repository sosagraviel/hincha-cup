import { StateGraph, END, START } from '@langchain/langgraph';
import type { InitializeProjectState } from '../state/schemas/initialize-project.schema.js';
import { InitializeProjectAnnotation } from '../state/schemas/initialize-project.schema.js';

import { graphFoundationNode } from '../nodes/initialize-project/phase0/graph-foundation.node.js';
import { structureArchitectureAnalyzerNode } from '../nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.js';
import { techStackDependenciesAnalyzerNode } from '../nodes/initialize-project/phase1/tech-stack-analyzer/tech-stack-dependencies-analyzer.node.js';
import { codePatternsTestingAnalyzerNode } from '../nodes/initialize-project/phase1/code-patterns-analyzer/code-patterns-testing-analyzer.node.js';
import { dataFlowsIntegrationsAnalyzerNode } from '../nodes/initialize-project/phase1/data-flows-analyzer/data-flows-integrations-analyzer.node.js';
import { consolidationNode } from '../nodes/initialize-project/phase2/question-consolidator/question-consolidator.node.js';
import { synthesisNode } from '../nodes/initialize-project/phase3/synthesis.node.js';
import { contextGenerationNode } from '../nodes/initialize-project/phase4/context-generation.node.js';
import { wikiPreparationNode } from '../nodes/initialize-project/phase4/wiki-docs/wiki-preparation.node.js';
import { wikiArchitectureDocNode } from '../nodes/initialize-project/phase4/wiki-docs/wiki-architecture.node.js';
import { wikiServiceDocsNode } from '../nodes/initialize-project/phase4/wiki-docs/wiki-service-docs.node.js';
import { wikiGenerationNode } from '../nodes/initialize-project/phase4/wiki-generation.node.js';
import { resourcesNode } from '../nodes/initialize-project/phase5/resources.node.js';
import { validationNode } from '../nodes/initialize-project/phase6/validation.node.js';

/**
 * Router function to determine which phase to start from
 */
export function routeToPhase(state: InitializeProjectState): string | string[] {
  const startPhase = (state as any).start_phase || 1;

  switch (startPhase) {
    case 1:
      return 'graph_foundation';
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

export function routeAfterGraphFoundation(state: InitializeProjectState): string | string[] {
  if (state.current_phase === 'failed') {
    return END;
  }

  // Phase 1 is sequential at the head + parallel at the tail:
  //   structure_architecture_analyzer (single source of truth for services[])
  //   → [ tech_stack, code_patterns, data_flows ] (parallel; consume structure's
  //      services[] as authoritative input).
  // The earlier topology fanned out all four analyzers in parallel and let
  // each re-derive its own service list, which produced inconsistent IDs and
  // dropped services across runs (see plans/2026-04-29-gira-init-run-audit-refactor
  // findings F7/F8/F9/F22).
  return 'structure_architecture_analyzer';
}

export function routeAfterStructureAnalyzer(state: InitializeProjectState): string | string[] {
  if (state.current_phase === 'failed') {
    return END;
  }

  return [
    'tech_stack_dependencies_analyzer',
    'code_patterns_testing_analyzer',
    'data_flows_integrations_analyzer',
  ];
}

export function routeAfterWikiPreparation(state: InitializeProjectState): string | string[] {
  if (state.current_phase === 'failed') {
    return END;
  }

  // Only ARCHITECTURE.md is rendered as a cross-cutting LLM-generated wiki
  // page. DATA-FLOWS.md and PATTERNS.md were retired in the H4 split: data
  // flows are now described per-service in `wiki/services/<id>.md` (where
  // they have actual context), and patterns moved to the prescriptive
  // `code-conventions` and `testing-conventions` skills (where they belong
  // — patterns are about what to DO, not what IS).
  return 'wiki_architecture_doc';
}

/**
 * Initialize Project Graph - 6-Phase Workflow
 *
 * PHASE 1 (sequential head + parallel tail):
 *   structure_architecture_analyzer first (single source of truth for services[]),
 *   then [tech-stack, code-patterns, data-flows] in parallel with structure's
 *   services[] injected as authoritative input.
 * PHASE 2: Consolidate findings and identify gaps
 * PHASE 3: Run Opus synthesis agent for comprehensive analysis
 * PHASE 4: Generate CLAUDE.md plus three prescriptive convention skills
 *   (code-conventions, multi-file-workflows, testing-conventions) and
 *   persist the architectural narrative for the wiki-generator
 * PHASE 4b: Generate docs/llm-wiki wiki via subgraph:
 *   wiki_preparation → wiki_architecture_doc → wiki_service_docs (N
 *   concurrent per-service LLM calls) → wiki_generation (deterministic
 *   SERVICES.md catalog + index + disk writes). Cross-cutting DATA-FLOWS.md
 *   and PATTERNS.md were retired — flows are now per-service, patterns are
 *   prescriptive and live in the convention skills.
 * PHASE 5: Copy skills and resources
 * PHASE 6: Final validation
 *
 * Supports starting from any phase using the start_phase parameter in state.
 */
export const initializeProjectGraph = new StateGraph(InitializeProjectAnnotation)
  .addNode('graph_foundation', graphFoundationNode)
  .addNode('structure_architecture_analyzer', structureArchitectureAnalyzerNode)
  .addNode('tech_stack_dependencies_analyzer', techStackDependenciesAnalyzerNode)
  .addNode('code_patterns_testing_analyzer', codePatternsTestingAnalyzerNode)
  .addNode('data_flows_integrations_analyzer', dataFlowsIntegrationsAnalyzerNode)
  .addNode('consolidation', consolidationNode)
  .addNode('synthesis', synthesisNode)
  .addNode('context_generation', contextGenerationNode)
  .addNode('wiki_preparation', wikiPreparationNode)
  .addNode('wiki_architecture_doc', wikiArchitectureDocNode)
  .addNode('wiki_service_docs', wikiServiceDocsNode)
  .addNode('wiki_generation', wikiGenerationNode)
  .addNode('resources', resourcesNode)
  .addNode('validation', validationNode)
  // Conditional routing from START based on start_phase
  .addConditionalEdges(START, routeToPhase)
  // Phase 0 → structure_architecture_analyzer (sequential head — sole source
  // of truth for services[]).
  .addConditionalEdges('graph_foundation', routeAfterGraphFoundation)
  // structure_architecture_analyzer → [02, 03, 04] in parallel. The downstream
  // analyzers read structure-analyzer's persisted output for the authoritative
  // services[] list before building their own prompts.
  .addConditionalEdges('structure_architecture_analyzer', routeAfterStructureAnalyzer)
  // [02, 03, 04] → consolidation
  .addEdge('tech_stack_dependencies_analyzer', 'consolidation')
  .addEdge('code_patterns_testing_analyzer', 'consolidation')
  .addEdge('data_flows_integrations_analyzer', 'consolidation')
  // Linear flow from Phase 2 through Phase 4 context generation
  .addEdge('consolidation', 'synthesis')
  .addEdge('synthesis', 'context_generation')
  // Phase 4b: wiki preparation fans out to 3 parallel core-doc nodes
  .addEdge('context_generation', 'wiki_preparation')
  .addConditionalEdges('wiki_preparation', routeAfterWikiPreparation)
  // Architecture doc converges on the service-docs node
  .addEdge('wiki_architecture_doc', 'wiki_service_docs')
  // Service docs → finalization → resources
  .addEdge('wiki_service_docs', 'wiki_generation')
  .addEdge('wiki_generation', 'resources')
  .addEdge('resources', 'validation')
  .addEdge('validation', END);

/**
 * Create compiled graph instance with checkpointer
 */
export async function createInitializeProjectGraph(checkpointer: any) {
  return initializeProjectGraph.compile({ checkpointer });
}
