import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { createDeepAgent } from 'deepagents';
import { getLLMFactory } from '../llm/llm-factory.js';
import { HybridAgentFactory } from '../agents/agent-factory-hybrid.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Agent configuration for creating DeepAgents from markdown files
 */
export interface AgentConfig {
  agentName: string;
  agentFile: string;
  projectPath: string;
  frameworkPath: string;
  additionalContext?: string;
  timeout?: number;
}

/**
 * Create an agent from an agent markdown file using Hybrid Authentication
 *
 * This function automatically detects available authentication and creates an agent using:
 * - DeepAgents.js with API keys (Mode 1: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)
 * - Claude CLI with subscription (Mode 2: Claude Pro/Max subscription)
 *
 * The function:
 * 1. Detects authentication mode (HybridAgentFactory handles this)
 * 2. Loads agent markdown instructions
 * 3. Builds full prompt with project context
 * 4. Creates and returns a unified agent interface
 *
 * @param config - Agent configuration
 * @returns Configured agent with unified interface (works with both modes)
 *
 * @example
 * ```typescript
 * const agent = await createAgentFromMarkdown({
 *   agentName: 'structure-architecture-analyzer',
 *   agentFile: '01-structure-architecture.md',
 *   projectPath: '/path/to/project',
 *   frameworkPath: '/path/to/framework'
 * });
 *
 * const result = await agent.invoke({
 *   input: 'Analyze the project structure'
 * });
 * ```
 */
export async function createAgentFromMarkdown(config: AgentConfig) {
  const {
    agentName,
    agentFile,
    projectPath,
    frameworkPath,
    additionalContext = '',
    timeout = 300000 // 5 minutes default
  } = config;

  // Load agent markdown instructions
  const agentPath = join(frameworkPath, 'orchestration/agents', agentFile);
  const agentInstructions = readFileSync(agentPath, 'utf-8');

  // Build full instructions with context
  const fullInstructions = buildAgentPrompt(
    agentInstructions,
    projectPath,
    additionalContext,
    frameworkPath
  );

  // Create hybrid factory (automatically detects auth mode)
  const factory = await HybridAgentFactory.create();

  // Create agent using hybrid factory
  // The factory will use either DeepAgents.js or Claude CLI based on available auth
  const hybridAgent = await factory.createAgent({
    agentName,
    agentFile,
    projectPath,
    frameworkPath,
    additionalContext: fullInstructions,
    timeout
  });

  // Return a wrapper that matches the existing interface
  // This allows existing node code to work without changes
  return {
    invoke: async (input: { input: string }) => {
      const result = await hybridAgent.invoke(input);

      // Log execution info
      console.log(
        `[${agentName}] Completed in ${result.executionTimeMs}ms ` +
        `using ${result.mode} mode`
      );

      return {
        output: result.output,
        content: result.output, // For backward compatibility
        mode: result.mode,
        executionTimeMs: result.executionTimeMs
      };
    },

    getInfo: () => hybridAgent.getInfo()
  };
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * Agent markdown files have YAML frontmatter that should be removed before sending to Claude CLI.
 * Example:
 * ---
 * name: agent-name
 * model: haiku
 * ---
 * # Agent Instructions
 * ...
 *
 * @param content - Full markdown content with frontmatter
 * @returns Markdown content without frontmatter
 */
function removeFrontmatter(content: string): string {
  // Check if content starts with frontmatter delimiter
  if (!content.trim().startsWith('---')) {
    return content;
  }

  // Find the closing delimiter
  const lines = content.split('\n');
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing delimiter found, return as-is
    return content;
  }

  // Return content after frontmatter
  return lines.slice(endIndex + 1).join('\n').trim();
}

/**
 * Build the full prompt for an agent
 *
 * Replicates the exact prompt format used by bash scripts for consistency.
 * Combines:
 * - Agent markdown instructions (without YAML frontmatter)
 * - Project path context
 * - Explicit JSON format instructions (critical for correct output)
 * - Additional context (e.g., error feedback from previous attempts)
 *
 * @param agentInstructions - Markdown instructions from agent file
 * @param projectPath - Path to the project being analyzed
 * @param additionalContext - Optional additional context (e.g., error feedback)
 * @returns Full prompt string matching bash script format
 */
function buildAgentPrompt(
  agentInstructions: string,
  projectPath: string,
  additionalContext: string,
  frameworkPath?: string
): string {
  // Remove YAML frontmatter (used by DeepAgents, not needed for Claude CLI)
  const cleanInstructions = removeFrontmatter(agentInstructions);

  // Extract agent name from instructions (first heading or filename)
  const agentNameMatch = cleanInstructions.match(/^#\s+(.+)/m);
  const agentDisplayName = agentNameMatch ? agentNameMatch[1] : 'Analyzer Agent';

  // Derive the framework directory name relative to the project root
  // e.g., "/home/user/project/qubika-agentic-framework" → "qubika-agentic-framework"
  const frameworkDirName = frameworkPath
    ? relative(projectPath, frameworkPath)
    : 'qubika-agentic-framework';

  // Build prompt EXACTLY like bash script does
  const lines = [
    `You are the ${agentDisplayName}.`,
    ``,
    `Follow ALL instructions in the agent file below.`,
    ``,
    `Analyze the codebase at: ${projectPath}`,
    ``,
    `CRITICAL: EXCLUDED DIRECTORIES`,
    `The following directories are NOT part of the project codebase and MUST be completely ignored during analysis:`,
    `- ${frameworkDirName}/ (this is the AI Agentic Framework tooling, not the project itself)`,
    `- .claude-temp/ (temporary analysis files)`,
    `- .claude-backups/ (backup files)`,
    `Do NOT include files, dependencies, patterns, or any findings from these directories in your analysis.`,
    `Only analyze the actual project code.`,
    ``,
    `CRITICAL OUTPUT FORMAT:`,
    `- Output ONLY raw JSON starting with { and ending with }`,
    `- Do NOT wrap in markdown code blocks (\`\`\`json)`,
    `- Do NOT add ANY text before or after the JSON`,
    `- Do NOT add explanatory sentences like "Here is the output:" or "Based on my analysis:"`,
    `- The FIRST character must be { and the LAST character must be }`,
    ``,
    `Required JSON structure:`,
    `{`,
    `  "agent_name": "string",`,
    `  "timestamp": "ISO 8601 timestamp",`,
    `  "findings": {},`,
    `  "needs_verification": []`,
    `}`
  ];

  if (additionalContext) {
    lines.push('');
    lines.push(additionalContext);
  }

  lines.push('');
  lines.push('=== AGENT INSTRUCTIONS ===');
  lines.push(cleanInstructions);

  return lines.join('\n');
}

/**
 * Agent configurations for all Phase 1 analyzers
 * Model is now determined by tier configuration via MODEL_TIER env var
 */
export const PHASE1_AGENTS = [
  {
    name: 'structure-architecture-analyzer',
    file: '01-structure-architecture.md'
  },
  {
    name: 'tech-stack-dependencies-analyzer',
    file: '02-tech-stack-dependencies.md'
  },
  {
    name: 'code-patterns-testing-analyzer',
    file: '03-code-patterns-testing.md'
  },
  {
    name: 'data-flows-integrations-analyzer',
    file: '04-data-flows-integrations.md'
  }
] as const;

/**
 * Get agent config by name
 */
export function getAgentConfig(agentName: string) {
  return PHASE1_AGENTS.find(a => a.name === agentName);
}

/**
 * Create a DeepAgent directly (LEGACY - use createAgentFromMarkdown instead)
 *
 * This function bypasses the hybrid authentication layer and creates a DeepAgent directly.
 * Only use this if you specifically need API key mode behavior.
 *
 * @deprecated Use createAgentFromMarkdown() which supports both API keys and Claude CLI
 * @param config - Agent configuration
 * @returns Configured DeepAgent instance
 */
export async function createDeepAgentDirect(config: AgentConfig): Promise<any> {
  const {
    agentName,
    agentFile,
    projectPath,
    frameworkPath,
    additionalContext = '',
    timeout = 300000
  } = config;

  // Load agent markdown instructions
  const agentPath = join(frameworkPath, 'orchestration/agents', agentFile);
  const agentInstructions = readFileSync(agentPath, 'utf-8');

  // Get LLM instance from factory (provider-agnostic, tier-based)
  const llmFactory = getLLMFactory();
  const model = await llmFactory.createModel(agentName);

  // Log model info for debugging
  const modelInfo = llmFactory.getModelInfo(agentName);
  console.log(`[${agentName}] Tier: ${modelInfo.tier}, Model: ${modelInfo.modelId} (${modelInfo.provider})`);

  // Build full instructions with context
  const fullInstructions = buildAgentPrompt(
    agentInstructions,
    projectPath,
    additionalContext,
    frameworkPath
  );

  // Create DeepAgent with LLM instance
  const agent = await createDeepAgent({
    model: model as BaseChatModel,
    systemPrompt: fullInstructions, // DeepAgents uses systemPrompt, not instructions
    tools: [] // Agents use built-in tools (Read, Grep, Glob, etc.)
  });

  return agent;
}
