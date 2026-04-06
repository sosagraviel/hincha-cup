/**
 * Phase 4: Service Extractor Helper
 *
 * Extracts service configurations from Phase 1 analyzer outputs.
 * This is the most complex extractor, handling all service-level data including
 * testing, databases, ORMs, environment, and package managers.
 */

import type {
  Service,
  ServiceTesting,
  ServiceDatabase,
  ServiceEnvironment,
} from "../../../../schemas/stack-profile.schema.js";

/**
 * Extract testing configuration for a specific service
 *
 * @param serviceId - Service identifier (e.g., "backend", "frontend")
 * @param codePatternsFindings - Findings from code-patterns-testing analyzer
 * @returns Testing configuration or undefined if not found
 */
export function extractTestingForService(serviceId: string, codePatternsFindings: any): ServiceTesting | undefined {
  const serviceTests = codePatternsFindings?.services?.find((s: any) => s.id === serviceId)?.testing;
  if (!serviceTests) return undefined;

  return {
    unit: serviceTests.unit,
    integration: serviceTests.integration,
    e2e: serviceTests.e2e,
  };
}

/**
 * Extract testing framework name for a specific service
 *
 * @param serviceId - Service identifier
 * @param codePatternsFindings - Findings from code-patterns-testing analyzer
 * @returns Testing framework name or undefined
 */
export function extractTestingFrameworkForService(serviceId: string, codePatternsFindings: any): string | undefined {
  const serviceTests = codePatternsFindings?.services?.find((s: any) => s.id === serviceId);
  return serviceTests?.frameworks?.testing;
}

/**
 * Extract databases for a specific service
 *
 * @param serviceId - Service identifier
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @param dataFlowsFindings - Optional findings from data-flows-integrations analyzer
 * @returns Array of database configurations or undefined
 */
export function extractDatabasesForService(
  serviceId: string,
  techStackFindings: any,
  dataFlowsFindings?: any
): ServiceDatabase[] | undefined {
  const serviceDbs = techStackFindings?.services?.find((s: any) => s.id === serviceId)?.databases;
  if (!serviceDbs || serviceDbs.length === 0) return undefined;

  return serviceDbs.map((db: any) => ({
    type: db.type,
    client_library: db.client_library,
    orm: db.orm,
    orm_version: db.orm_version,
    migration_tool: db.migration_tool,
  }));
}

/**
 * Extract ORM for a specific service (from first database that has one)
 *
 * @param serviceId - Service identifier
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns ORM name or undefined
 */
export function extractORMForService(serviceId: string, techStackFindings: any): string | undefined {
  const serviceDbs = techStackFindings?.services?.find((s: any) => s.id === serviceId)?.databases;
  if (!serviceDbs || serviceDbs.length === 0) return undefined;

  // Return ORM from first database that has one
  for (const db of serviceDbs) {
    if (db.orm) return db.orm;
  }

  return undefined;
}

/**
 * Extract environment configuration for a specific service
 *
 * @param serviceId - Service identifier
 * @param structureFindings - Findings from structure-architecture analyzer
 * @returns Environment configuration or undefined
 */
export function extractEnvironmentForService(serviceId: string, structureFindings: any): ServiceEnvironment | undefined {
  const svcEnv = structureFindings?.services?.find((s: any) => s.id === serviceId)?.environment;
  if (!svcEnv) return undefined;

  return {
    port: svcEnv.port,
    env_file: svcEnv.env_file,
    deployment_target: svcEnv.deployment_target,
    docker_image: svcEnv.docker_image,
  };
}

/**
 * Extract package manager for a specific service
 *
 * @param serviceId - Service identifier
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns Package manager name or undefined
 */
export function extractPackageManagerForService(serviceId: string, techStackFindings: any): string | undefined {
  return techStackFindings?.services?.find((s: any) => s.id === serviceId)?.package_manager;
}

/**
 * Extract manifest file path for a specific service
 *
 * @param serviceId - Service identifier
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns Manifest file path or undefined
 */
export function extractManifestFileForService(serviceId: string, techStackFindings: any): string | undefined {
  return techStackFindings?.services?.find((s: any) => s.id === serviceId)?.manifest_file;
}

/**
 * Extract services from Phase 1 analyzer outputs
 *
 * This is the main service extraction function that merges data from all Phase 1 analyzers
 * into a complete Service[] array for the service-centric stack profile.
 *
 * @param structureFindings - Findings from structure-architecture analyzer
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @param codePatternsFindings - Findings from code-patterns-testing analyzer
 * @param dataFlowsFindings - Optional findings from data-flows-integrations analyzer
 * @returns Array of complete Service objects
 * @throws Error if services[] array is not present in structure analyzer output
 */
export function extractServicesFromPhase1Analyzers(
  structureFindings: any,
  techStackFindings: any,
  codePatternsFindings: any,
  dataFlowsFindings?: any
): Service[] {
  const services: Service[] = [];

  // Use explicit services[] from Agent 01 (structure-architecture)
  if (!structureFindings?.services || !Array.isArray(structureFindings.services)) {
    throw new Error(
      "Phase 1 structure analyzer did not output services[] array. " +
      "Cannot generate service-centric framework config. " +
      "This indicates the analyzer is using an outdated output format."
    );
  }

  for (const svc of structureFindings.services) {
    const service: Service = {
      id: svc.id,
      name: svc.name,
      path: svc.path, // DYNAMIC path from agent discovery
      type: svc.type,
      language: svc.language.toLowerCase(),
      language_version: svc.language_version,
      frameworks: {
        main: svc.frameworks?.main,
        orm: svc.frameworks?.orm || extractORMForService(svc.id, techStackFindings),
        ui: svc.frameworks?.ui,
        testing: svc.frameworks?.testing || extractTestingFrameworkForService(svc.id, codePatternsFindings),
        additional: svc.frameworks?.additional,
      },
      testing: extractTestingForService(svc.id, codePatternsFindings),
      databases: extractDatabasesForService(svc.id, techStackFindings, dataFlowsFindings),
      environment: svc.environment || extractEnvironmentForService(svc.id, structureFindings),
      file_count: svc.file_count,
      package_manager: svc.package_manager || extractPackageManagerForService(svc.id, techStackFindings),
      manifest_file: svc.manifest_file || extractManifestFileForService(svc.id, techStackFindings), // DYNAMIC path
    };

    services.push(service);
  }

  return services;
}
