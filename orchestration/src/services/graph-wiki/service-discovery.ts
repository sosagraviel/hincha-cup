import type { AnalyzerDocument, WikiAnalyzerOutputs } from './types.js';
import { asStringArray, findValueByKey, isEmptyValue, isRecord, uniqueStrings } from './utils.js';

export function getServices(stackProfile: unknown): Record<string, unknown>[] {
  if (!isRecord(stackProfile) || !Array.isArray(stackProfile.services)) {
    return [];
  }

  return stackProfile.services.filter(
    (service) => isRecord(service) && !!(service.id ?? service.name),
  );
}

export function collectAnalyzerGraphQueries(analyzers: WikiAnalyzerOutputs): string[] {
  return [
    ...(analyzers.structure_architecture?.graph_queries_used ?? []),
    ...(analyzers.tech_stack_dependencies?.graph_queries_used ?? []),
    ...(analyzers.code_patterns_testing?.graph_queries_used ?? []),
    ...(analyzers.data_flows_integrations?.graph_queries_used ?? []),
  ].filter(Boolean);
}

export function discoverEntryPoints(
  serviceId: string,
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
): string[] {
  const candidates = [
    service.entry_points,
    service.entryPoints,
    findServiceAnalyzerValue(serviceId, analyzers.structure_architecture, 'entry_points'),
    findServiceAnalyzerValue(serviceId, analyzers.structure_architecture, 'entryPoints'),
  ];

  return uniqueStrings(candidates.flatMap(asStringArray));
}

export function discoverDependencies(
  serviceId: string,
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
): unknown {
  if (!isEmptyValue(service.dependencies)) {
    return service.dependencies;
  }

  const byService = findValueByKey(analyzers.tech_stack_dependencies?.findings, 'by_service');
  if (isRecord(byService) && !isEmptyValue(byService[serviceId])) {
    return byService[serviceId];
  }

  const serviceDependencies = findServiceAnalyzerValue(
    serviceId,
    analyzers.tech_stack_dependencies,
    'dependencies',
  );
  return isEmptyValue(serviceDependencies) ? undefined : serviceDependencies;
}

export function discoverCommunityId(
  serviceId: string,
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
): string | undefined {
  const candidates = [
    service.community_id,
    service.communityId,
    findServiceAnalyzerValue(serviceId, analyzers.structure_architecture, 'community_id'),
    findServiceAnalyzerValue(serviceId, analyzers.structure_architecture, 'communityId'),
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) as
    | string
    | undefined;
}

function findServiceAnalyzerValue(
  serviceId: string,
  analyzer: AnalyzerDocument | undefined,
  key: string,
): unknown {
  const services = findValueByKey(analyzer?.findings, 'services');
  if (!Array.isArray(services)) {
    return undefined;
  }

  const service = services.find(
    (candidate) =>
      isRecord(candidate) &&
      String(candidate.id ?? candidate.name ?? candidate.path) === String(serviceId),
  );

  return isRecord(service) ? findValueByKey(service, key) : undefined;
}
