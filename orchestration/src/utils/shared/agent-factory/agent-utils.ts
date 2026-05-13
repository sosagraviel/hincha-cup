/**
 * Get the action verb for an agent based on its name
 */
export function getAgentAction(agentName: string): string {
  const lowerName = agentName.toLowerCase();

  if (lowerName.includes('analyzer')) {
    return 'Analyzing codebase';
  }
  if (lowerName.includes('synthesizer') || lowerName.includes('architect')) {
    return 'Synthesizing analysis results';
  }
  if (lowerName.includes('consolidat')) {
    return 'Consolidating findings';
  }
  if (lowerName.includes('planner')) {
    return 'Planning implementation';
  }
  if (lowerName.includes('implementer')) {
    return 'Implementing changes';
  }
  if (lowerName.includes('reviewer')) {
    return 'Reviewing code';
  }
  if (lowerName.includes('verifier')) {
    return 'Verifying output';
  }

  return 'Processing';
}
