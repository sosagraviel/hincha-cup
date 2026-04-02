import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { createDeepAgent } from "deepagents";
import { getLLMFactory } from "../llm/llm-factory.js";
import { HybridAgentFactory } from "../agents/agent-factory-hybrid.js";
import { AuthMode } from "../auth/auth-detector.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

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
  useUltrathink?: boolean;
  /**
   * Whether to enforce JSON output format
   * Default: true (for Phase 1 analyzers)
   * Set to false for agents that output other formats (e.g., synthesis agent outputs markdown)
   */
  requireJsonOutput?: boolean;
  /**
   * Optional session ID to resume for context-preserving retry (Claude CLI only)
   * When provided, uses --resume flag to continue the conversation with full context
   */
  resumeSessionId?: string;
  /**
   * Optional path to settings.json file
   * Passed via --settings flag to Claude CLI
   */
  settingsPath?: string;
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
    additionalContext = "",
    timeout = 300000, // 5 minutes default
    useUltrathink = false,
    requireJsonOutput = true, // Default to true for backward compatibility
    resumeSessionId,
    settingsPath,
  } = config;

  const agentPath = join(frameworkPath, "orchestration/agents", agentFile);
  const agentInstructions = readFileSync(agentPath, "utf-8");

  const factory = await HybridAgentFactory.create();
  const authConfig = factory.getAuthConfig();

  // Build different prompts based on auth mode:
  // - CLI mode with --agent flag: Only dynamic context (agent instructions loaded from file)
  // - DeepAgents mode: Full prompt with agent instructions
  let promptToPass: string;

  if (authConfig.mode === AuthMode.CLAUDE_CLI) {
    // For CLI mode: Only pass dynamic context (agent loaded via --agent flag)
    promptToPass = buildDynamicContext(
      projectPath,
      additionalContext,
      frameworkPath,
      requireJsonOutput,
      agentName,
    );
  } else {
    // For DeepAgents mode: Pass full prompt with agent instructions
    promptToPass = buildAgentPrompt(
      agentInstructions,
      projectPath,
      additionalContext,
      frameworkPath,
      requireJsonOutput,
      agentName,
    );
  }

  const hybridAgent = await factory.createAgent({
    agentName,
    agentFile,
    projectPath,
    frameworkPath,
    additionalContext: promptToPass,
    timeout,
    useUltrathink,
    requireJsonOutput,
    resumeSessionId,
    settingsPath, // Pass settings path to HybridAgentFactory
  });

  return {
    invoke: async (input: { input: string }) => {
      const result = await hybridAgent.invoke(input);

      return {
        output: result.output,
        content: result.output,
        sessionId: result.sessionId, // Pass through session ID for retry
        mode: result.mode,
        executionTimeMs: result.executionTimeMs,
      };
    },

    getInfo: () => hybridAgent.getInfo(),
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
  if (!content.trim().startsWith("---")) {
    return content;
  }

  const lines = content.split("\n");
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return content;
  }

  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
}

/**
 * Standard directories to ignore during analysis
 * These are common build artifacts, dependencies, and caches
 */
const STANDARD_IGNORE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "bower_components",
  "jspm_packages",
  ".gradle",
  ".maven",
  "bin",
  "obj",
  ".claude",
  ".claude-temp",
  ".claude-backups",
];

/**
 * Parse .gitignore file and extract directory patterns
 * @param projectPath - Path to the project root
 * @returns Array of directory names to ignore
 */
function parseGitignore(projectPath: string): string[] {
  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n");
    const directories: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Extract directory patterns
      // Match patterns like: dirname/, /dirname/, dirname, **/dirname/
      let dirName = trimmed;

      // Remove leading slash
      if (dirName.startsWith("/")) {
        dirName = dirName.substring(1);
      }

      // Remove trailing slash
      if (dirName.endsWith("/")) {
        dirName = dirName.substring(0, dirName.length - 1);
      }

      // Remove **/ prefix
      if (dirName.startsWith("**/")) {
        dirName = dirName.substring(3);
      }

      // Skip patterns with wildcards (except **/ which we already handled)
      if (dirName.includes("*") || dirName.includes("?")) {
        continue;
      }

      // Skip file patterns (contain dots in the middle or at start, but allow hidden dirs like .env)
      if (dirName.includes(".") && !dirName.startsWith(".")) {
        continue;
      }

      // Skip patterns with subdirectories (contain /)
      if (dirName.includes("/")) {
        continue;
      }

      // Add valid directory name
      if (dirName) {
        directories.push(dirName);
      }
    }

    return directories;
  } catch (error) {
    // If we can't read .gitignore, just return empty array
    return [];
  }
}

/**
 * Build dynamic context (without agent instructions)
 *
 * This is used when the agent file is loaded separately (e.g., via Claude CLI --agent flag).
 * Contains only the dynamic parts that change per invocation:
 * - Project path
 * - Excluded directories (standard + framework + .gitignore)
 * - JSON format instructions (optional)
 * - Additional context (feedback, consolidation data, etc.)
 *
 * @param projectPath - Path to the project being analyzed
 * @param additionalContext - Optional additional context (e.g., error feedback)
 * @param frameworkPath - Path to the framework directory
 * @param requireJsonOutput - Whether to enforce JSON output format (default: true)
 * @returns Dynamic context prompt (without agent instructions)
 */
export function buildDynamicContext(
  projectPath: string,
  additionalContext: string,
  frameworkPath?: string,
  requireJsonOutput: boolean = true,
  agentName?: string,
): string {
  // Derive the framework directory name (just the basename, not relative path)
  // This handles synced copies correctly (e.g., ai-agentic-framework in gira)
  const frameworkDirName = frameworkPath
    ? basename(frameworkPath)
    : "qubika-agentic-framework";

  // Parse .gitignore to get additional directories to exclude
  const gitignoreDirs = parseGitignore(projectPath);

  // Combine all directories to exclude (remove duplicates)
  const allExcludedDirs = Array.from(new Set([
    frameworkDirName,
    ...STANDARD_IGNORE_DIRS,
    ...gitignoreDirs,
  ]));

  const lines: string[] = [];

  // Exclusions: Build artifacts, dependencies, tooling to skip
  lines.push(
    `<excluded_directories>`,
    allExcludedDirs.join(", "),
    `</excluded_directories>`,
    ``,
    `<project_path>${projectPath}</project_path>`,
    ``,
  );

  // JSON output format requirements
  if (requireJsonOutput) {
    lines.push(
      `<output_format>`,
      `Raw JSON only. First character: { Last character: }`,
      `No markdown code blocks, no commentary, no explanations.`,
      ``,
      `If validation errors occur, output only the corrected JSON.`,
      `</output_format>`,
      ``,
    );
  }

  // Load execution instructions if agent name is provided
  if (agentName && frameworkPath) {
    try {
      const executionInstructionsPath = join(
        frameworkPath,
        "orchestration/agents/execution-instructions",
        `${agentName}.md`
      );
      const executionInstructions = readFileSync(executionInstructionsPath, "utf-8");

      lines.push(
        executionInstructions.trim(),
        ``,
      );
    } catch (error) {
      // If execution instructions file doesn't exist, continue without it
      // This maintains backward compatibility
    }
  }

  if (additionalContext) {
    lines.push("");
    lines.push(additionalContext);
  }

  return lines.join("\n");
}

/**
 * Build the full prompt for an agent
 *
 * Replicates the exact prompt format used by bash scripts for consistency.
 * Combines:
 * - Agent markdown instructions (without YAML frontmatter)
 * - Project path context
 * - Explicit JSON format instructions (critical for correct output) - only if requireJsonOutput is true
 * - Additional context (e.g., error feedback from previous attempts)
 *
 * This is used for DeepAgents mode where the entire prompt is passed as system prompt.
 * For Claude CLI mode with --agent flag, use buildDynamicContext instead.
 *
 * @param agentInstructions - Markdown instructions from agent file
 * @param projectPath - Path to the project being analyzed
 * @param additionalContext - Optional additional context (e.g., error feedback)
 * @param frameworkPath - Path to the framework directory
 * @param requireJsonOutput - Whether to enforce JSON output format (default: true)
 * @returns Full prompt string matching bash script format
 */
function buildAgentPrompt(
  agentInstructions: string,
  projectPath: string,
  additionalContext: string,
  frameworkPath?: string,
  requireJsonOutput: boolean = true,
  agentName?: string,
): string {
  const cleanInstructions = removeFrontmatter(agentInstructions);

  const agentNameMatch = cleanInstructions.match(/^#\s+(.+)/m);
  const agentDisplayName = agentNameMatch
    ? agentNameMatch[1]
    : "Analyzer Agent";

  // Derive the framework directory name (just the basename, not relative path)
  const frameworkDirName = frameworkPath
    ? basename(frameworkPath)
    : "qubika-agentic-framework";

  // Parse .gitignore to get additional directories to exclude
  const gitignoreDirs = parseGitignore(projectPath);

  // Combine all directories to exclude (remove duplicates)
  const allExcludedDirs = Array.from(new Set([
    frameworkDirName,
    ...STANDARD_IGNORE_DIRS,
    ...gitignoreDirs,
  ]));

  const lines = [
    `You are the ${agentDisplayName}.`,
    ``,
    `Follow ALL instructions in the agent file below.`,
    ``,
    `Analyze the codebase at: ${projectPath}`,
    ``,
    `# ════════════════════════════════════════════════════════════════════════════════`,
    `# CRITICAL: EXCLUDED DIRECTORIES (${allExcludedDirs.length} total)`,
    `# ════════════════════════════════════════════════════════════════════════════════`,
    ``,
    `⚠️  DO NOT use Read, Grep, or Glob on these directories:`,
    ``,
  ];

  // Format directories in compact rows of ~8 items each for readability
  const ITEMS_PER_ROW = 8;
  for (let i = 0; i < allExcludedDirs.length; i += ITEMS_PER_ROW) {
    const chunk = allExcludedDirs.slice(i, i + ITEMS_PER_ROW);
    lines.push(`  ${chunk.map(d => `${d}/`).join(", ")}`);
  }

  lines.push(
    ``,
    `⚠️  DO NOT include files, dependencies, patterns, or findings from these directories`,
    `⚠️  ONLY analyze actual project source code`,
    ``,
    `# ════════════════════════════════════════════════════════════════════════════════`,
    ``,
  );

  // Only add JSON format instructions if this agent requires JSON output
  if (requireJsonOutput) {
    const agentNameValue = agentName ? `"${agentName}"` : `"string"`;
    lines.push(
      `CRITICAL OUTPUT FORMAT:`,
      `- Output ONLY raw JSON starting with { and ending with }`,
      `- Do NOT wrap in markdown code blocks (\`\`\`json)`,
      `- Do NOT add ANY text before or after the JSON`,
      `- Do NOT add explanatory sentences like "Here is the output:" or "Based on my analysis:"`,
      `- The FIRST character must be { and the LAST character must be }`,
      ``,
      `Required JSON structure:`,
      `{`,
      `  "agent_name": ${agentNameValue},`,
      `  "timestamp": "ISO 8601 timestamp",`,
      `  "findings": {},`,
      `  "needs_verification": [] // CRITICAL: Maximum 5 items - keep ONLY the most critical unknowns`,
      `}`,
      ``,
      `IMPORTANT: needs_verification array MUST have ≤ 5 items (maximum 5, not more!)`,
      ``
    );
  }

  if (additionalContext) {
    lines.push("");
    lines.push(additionalContext);
  }

  lines.push("");
  lines.push("=== AGENT INSTRUCTIONS ===");
  lines.push(cleanInstructions);

  return lines.join("\n");
}

/**
 * Agent configurations for all Phase 1 analyzers
 * Model is now determined by tier configuration via MODEL_TIER env var
 */
export const PHASE1_AGENTS = [
  {
    name: "structure-architecture-analyzer",
    file: "01-structure-architecture.md",
  },
  {
    name: "tech-stack-dependencies-analyzer",
    file: "02-tech-stack-dependencies.md",
  },
  {
    name: "code-patterns-testing-analyzer",
    file: "03-code-patterns-testing.md",
  },
  {
    name: "data-flows-integrations-analyzer",
    file: "04-data-flows-integrations.md",
  },
] as const;

/**
 * Get agent config by name
 */
export function getAgentConfig(agentName: string) {
  return PHASE1_AGENTS.find((a) => a.name === agentName);
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
    additionalContext = "",
    timeout = 300000,
    requireJsonOutput = true,
  } = config;

  const agentPath = join(frameworkPath, "orchestration/agents", agentFile);
  const agentInstructions = readFileSync(agentPath, "utf-8");

  const llmFactory = getLLMFactory();
  const model = await llmFactory.createModel(agentName);

  const modelInfo = llmFactory.getModelInfo(agentName);
  console.log(
    `[${agentName}] Tier: ${modelInfo.tier}, Model: ${modelInfo.modelId} (${modelInfo.provider})`,
  );

  const fullInstructions = buildAgentPrompt(
    agentInstructions,
    projectPath,
    additionalContext,
    frameworkPath,
    requireJsonOutput,
    agentName,
  );

  const agent = await createDeepAgent({
    model: model as BaseChatModel,
    systemPrompt: fullInstructions,
    tools: [],
  });

  return agent;
}
