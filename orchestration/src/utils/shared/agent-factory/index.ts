/**
 * Agent Factory Module
 *
 * Provides a unified interface for creating agents that work with both
 * API key (DeepAgents) and Claude CLI (subscription) modes.
 *
 * Usage:
 * ```typescript
 * import { AgentFactory } from './utils/shared/agent-factory/index.js';
 *
 * const factory = await AgentFactory.create();
 * const agent = await factory.createAgent({
 *   agentName: 'my-agent',
 *   agentFilePath: '/path/to/agent.md',
 *   projectPath: '/path/to/project',
 *   frameworkPath: '/path/to/framework',
 * });
 *
 * const result = await agent.invoke({ inputPrompt: 'Hello!' });
 * ```
 */

export { AgentFactory } from './agent-factory.js';
export type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';

// Export utility functions for advanced use cases
export { getAgentAction } from './agent-utils.js';
export { getCLIModelForAgent, getClaudeCLIPath, parseToolsFromFrontmatter } from './cli-utils.js';
