/**
 * Phase 4: Infrastructure Extractor Helper
 *
 * Extracts infrastructure information from Phase 1 tech-stack analyzer.
 */

/**
 * Extract infrastructure from Phase 1 tech-stack-dependencies analyzer
 *
 * @param techStackFindings - Findings from tech-stack-dependencies analyzer
 * @returns Array of infrastructure tool names
 */
export function extractInfrastructure(techStackFindings: any): string[] {
  const infrastructureFromPhase1 = Array.isArray(
    techStackFindings?.infrastructure,
  )
    ? (techStackFindings.infrastructure as string[])
    : [];

  return infrastructureFromPhase1;
}
