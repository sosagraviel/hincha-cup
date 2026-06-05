/**
 * Cross-phase shared utilities for initialize-project workflow nodes.
 */

import { join } from 'path';

/**
 * Resolve an agent prompt file inside the framework to its on-disk location.
 * Every supported agent must be in the explicit map — missing entries throw.
 */
export function getFrameworkAgentPath(frameworkPath: string, agentFile: string): string {
  const agentPathMap: Record<string, string> = {
    '01-structure-architecture.md':
      'orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md',
    '02-tech-stack-dependencies.md':
      'orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/prompts/agent.md',
    '03-code-patterns-testing.md':
      'orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/prompts/agent.md',
    '04-data-flows-integrations.md':
      'orchestration/src/nodes/initialize-project/phase1/data-flows-analyzer/prompts/agent.md',
    '05-architect-synthesizer.md':
      'orchestration/src/nodes/initialize-project/phase3/prompts/agent.md',
    '08-context-verifier.md':
      'orchestration/src/nodes/initialize-project/phase3_5/prompts/agent.md',
    '06-question-consolidator.md':
      'orchestration/src/nodes/initialize-project/phase2/question-consolidator/prompts/agent.md',
    '07-wiki-generator.md':
      'orchestration/src/nodes/initialize-project/phase4/wiki-generator/prompts/agent.md',
  };

  const newPath = agentPathMap[agentFile];
  if (newPath) {
    return join(frameworkPath, newPath);
  }

  throw new Error(
    `Agent file '${agentFile}' not found in agent path map. ` +
      `Available agents: ${Object.keys(agentPathMap).join(', ')}`,
  );
}
