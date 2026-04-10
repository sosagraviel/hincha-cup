/**
 * Normalize agent name for consistency
 *
 * Converts analyzer agent names to standardized format
 */
export function normalizeAgentName(agentName: string): string {
  const name = agentName.toLowerCase();

  if (name.includes('structure') || name.includes('architecture')) {
    return '01-structure-architecture';
  }
  if (name.includes('stack') || name.includes('dependencies')) {
    return '02-tech-stack-dependencies';
  }
  if (name.includes('patterns') || name.includes('testing')) {
    return '03-code-patterns-testing';
  }
  if (name.includes('flow') || name.includes('integration')) {
    return '04-data-flows-integrations';
  }

  return agentName;
}
