import type {
  WikiAnalyzerOutputs,
  WikiDocumentSpec,
  WikiGeneratorServiceOptions,
  WikiGraphState,
} from './types.js';
import {
  discoverCommunityId,
  discoverDependencies,
  discoverEntryPoints,
} from './service-discovery.js';
import { isEmptyValue, slugifyServiceId, stableJsonStringify, uniqueStrings } from './utils.js';

export function buildCoreSpecs(options: WikiGeneratorServiceOptions): WikiDocumentSpec[] {
  const { analyzers, stackProfile, graph } = options;
  return [
    architectureSpec(analyzers, stackProfile, graph),
    servicesSpec(analyzers, stackProfile),
    dataFlowsSpec(analyzers, stackProfile),
    patternsSpec(analyzers, stackProfile),
  ];
}

export function buildServiceSpec(
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
): WikiDocumentSpec {
  const serviceId = String(service.id ?? service.name);
  const entryPoints = discoverEntryPoints(serviceId, service, analyzers);
  const dependencies = discoverDependencies(serviceId, service, analyzers);
  const communityId = discoverCommunityId(serviceId, service, analyzers);

  const frontmatterExtras: Record<string, unknown> = { service_id: serviceId };
  if (entryPoints.length > 0) frontmatterExtras.entry_points = entryPoints;
  if (!isEmptyValue(dependencies)) frontmatterExtras.dependencies = dependencies;
  if (communityId) frontmatterExtras.community_id = communityId;

  return {
    filename: `services/${slugifyServiceId(serviceId)}.md`,
    documentType: 'service',
    title: `Service: ${serviceId}`,
    graphTools: [
      'mcp__code_graph__semantic_search_nodes',
      'mcp__code_graph__query_graph',
      'mcp__code_graph__get_community',
      'mcp__code_graph__get_minimal_context',
    ],
    graphQueriesUsed: uniqueStrings([
      'mcp__code_graph__semantic_search_nodes',
      'mcp__code_graph__query_graph',
      ...(communityId ? ['mcp__code_graph__get_community'] : []),
      ...(analyzers.structure_architecture?.graph_queries_used ?? []),
      ...(analyzers.tech_stack_dependencies?.graph_queries_used ?? []),
    ]),
    promptFocus: [
      `Document only the "${serviceId}" service.`,
      'Use service profile as the base inventory and graph MCP tools to verify boundaries.',
      'Use community, semantic search, and query context where available for entry points and dependencies.',
    ],
    sourceContext: {
      service,
      service_id: serviceId,
      entry_points: entryPoints,
      dependencies,
      community_id: communityId,
      analyzers,
    },
    frontmatterExtras,
  };
}

export function buildPrompt(spec: WikiDocumentSpec, projectPath: string): string {
  return [
    `Generate ${spec.title} as narrative markdown for ${projectPath}.`,
    '',
    'Graph-first instructions:',
    '- Use graph MCP tools first before Read/Grep/Glob.',
    '- Treat graph relationships, communities, flows, and searches as the primary structural evidence.',
    '- Use Read/Grep/Glob only for details that graph tools cannot provide or to verify source snippets.',
    '- Return markdown body only. Do not include YAML frontmatter. Do not wrap the response in code fences.',
    '',
    'Relevant graph MCP tools:',
    ...spec.graphTools.map((tool) => `- ${tool}`),
    '',
    'Document-specific focus:',
    ...spec.promptFocus.map((focus) => `- ${focus}`),
    '',
    'Available deterministic context:',
    '```json',
    stableJsonStringify(spec.sourceContext),
    '```',
  ].join('\n');
}

function architectureSpec(
  analyzers: WikiAnalyzerOutputs,
  stackProfile: unknown,
  graph: WikiGraphState,
): WikiDocumentSpec {
  return {
    filename: 'ARCHITECTURE.md',
    documentType: 'architecture',
    title: 'Architecture',
    graphTools: [
      'mcp__code_graph__get_architecture_overview',
      'mcp__code_graph__list_communities',
      'mcp__code_graph__get_community',
      'mcp__code_graph__query_graph',
    ],
    graphQueriesUsed: uniqueStrings([
      'mcp__code_graph__get_architecture_overview',
      'mcp__code_graph__list_communities',
      'mcp__code_graph__get_community',
      ...(analyzers.structure_architecture?.graph_queries_used ?? []),
    ]),
    promptFocus: [
      'Use graph overview as the primary architecture source.',
      'List graph communities and summarize representative community details.',
      'Connect services and important directories to graph-backed relationships.',
    ],
    sourceContext: {
      graph,
      stack_profile: stackProfile,
      structure_architecture: analyzers.structure_architecture,
    },
  };
}

function servicesSpec(analyzers: WikiAnalyzerOutputs, stackProfile: unknown): WikiDocumentSpec {
  return {
    filename: 'SERVICES.md',
    documentType: 'services',
    title: 'Services',
    graphTools: [
      'mcp__code_graph__list_communities',
      'mcp__code_graph__get_community',
      'mcp__code_graph__semantic_search_nodes',
      'mcp__code_graph__query_graph',
    ],
    graphQueriesUsed: uniqueStrings([
      'mcp__code_graph__list_communities',
      'mcp__code_graph__semantic_search_nodes',
      ...(analyzers.tech_stack_dependencies?.graph_queries_used ?? []),
      ...(analyzers.structure_architecture?.graph_queries_used ?? []),
    ]),
    promptFocus: [
      'Use stack profile services as the service inventory.',
      'Use graph community and search context to explain service boundaries.',
      'Describe service responsibilities, entry points, and relationships when evidence exists.',
    ],
    sourceContext: {
      stack_profile: stackProfile,
      structure_architecture: analyzers.structure_architecture,
      tech_stack_dependencies: analyzers.tech_stack_dependencies,
    },
  };
}

function dataFlowsSpec(analyzers: WikiAnalyzerOutputs, stackProfile: unknown): WikiDocumentSpec {
  return {
    filename: 'DATA-FLOWS.md',
    documentType: 'data-flow',
    title: 'Data Flows',
    graphTools: [
      'mcp__code_graph__list_flows',
      'mcp__code_graph__get_flow',
      'mcp__code_graph__query_graph',
      'mcp__code_graph__semantic_search_nodes',
    ],
    graphQueriesUsed: uniqueStrings([
      'mcp__code_graph__list_flows',
      'mcp__code_graph__get_flow',
      ...(analyzers.data_flows_integrations?.graph_queries_used ?? []),
    ]),
    promptFocus: [
      'Use graph flow tools first for execution and data-flow relationships.',
      'Blend graph flows with Phase 1 routes, auth, persistence, and integration findings.',
      'Explain the highest-signal flows in narrative markdown.',
    ],
    sourceContext: {
      data_flows_integrations: analyzers.data_flows_integrations,
      stack_profile: stackProfile,
    },
  };
}

function patternsSpec(analyzers: WikiAnalyzerOutputs, stackProfile: unknown): WikiDocumentSpec {
  return {
    filename: 'PATTERNS.md',
    documentType: 'pattern',
    title: 'Patterns',
    graphTools: [
      'mcp__code_graph__find_large_functions',
      'mcp__code_graph__list_communities',
      'mcp__code_graph__get_community',
      'mcp__code_graph__query_graph',
    ],
    graphQueriesUsed: uniqueStrings([
      'mcp__code_graph__find_large_functions',
      ...(analyzers.code_patterns_testing?.graph_queries_used ?? []),
    ]),
    promptFocus: [
      'Use graph large-function and community tools first for pattern evidence.',
      'Blend graph signals with Phase 1 testing, convention, and quality findings.',
      'Call out recurring implementation patterns without inventing unsupported decisions.',
    ],
    sourceContext: {
      code_patterns_testing: analyzers.code_patterns_testing,
      stack_profile: stackProfile,
    },
  };
}
