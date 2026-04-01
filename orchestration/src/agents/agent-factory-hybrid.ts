import { spawn, ChildProcess, execSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  AuthMode,
  AuthConfig,
  detectAuthMode,
  getAuthErrorMessage,
} from "../auth/auth-detector.js";
import { createDeepAgent } from "deepagents";
import { getLLMFactory } from "../llm/llm-factory.js";
import { logger } from "../utils/logger.js";
import { assertAgentFileValid } from "./agent-validator.js";

/**
 * Get path to local Claude CLI binary (bundled with framework)
 *
 * Searches for node_modules/.bin/claude in the framework directory.
 * Falls back to global 'claude' command with version verification.
 *
 * @param frameworkPath - Path to the framework root directory
 * @returns Object with path and version of Claude CLI binary
 * @throws Error if Claude CLI not found or version < 2.0
 */
function getClaudeCLIPath(frameworkPath: string): {
  path: string;
  version: string;
} {
  // Use frameworkPath to locate the bundled Claude CLI
  // frameworkPath points to framework root (e.g., /path/to/qubika-agentic-framework)
  const localClaudePath = path.join(
    frameworkPath,
    "orchestration/node_modules/.bin/claude",
  );

  // Prefer local bundled Claude CLI (guaranteed v2.1+)
  if (fs.existsSync(localClaudePath)) {
    try {
      // Verify version
      const version = execSync(`"${localClaudePath}" --version`, {
        encoding: "utf-8",
      }).trim();

      // Extract version number (e.g., "2.1.87 (Claude Code)" -> "2.1.87")
      const versionMatch = version.match(/^(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        const [major, minor] = versionMatch[1].split(".").map(Number);
        if (major >= 2 && minor >= 0) {
          return { path: localClaudePath, version: versionMatch[1] };
        }
      }
    } catch (error) {
      logger.warn(`Local Claude CLI found but version check failed: ${error}`);
      // Fall through to global check
    }
  }

  // Fallback: Try global Claude CLI with version check
  try {
    const globalVersion = execSync("claude --version", {
      encoding: "utf-8",
    }).trim();
    const versionMatch = globalVersion.match(/^(\d+\.\d+\.\d+)/);

    if (versionMatch) {
      const [major, minor] = versionMatch[1].split(".").map(Number);
      if (major >= 2 && minor >= 0) {
        logger.warn(
          `Using global Claude CLI v${versionMatch[1]} - consider using framework's bundled version for consistency`,
        );
        return { path: "claude", version: versionMatch[1] };
      } else {
        throw new Error(
          `Global Claude CLI version ${versionMatch[1]} is too old (requires v2.0+). ` +
            `The framework should bundle Claude CLI v2.1+ automatically. ` +
            `Try running: cd orchestration && npm install`,
        );
      }
    }

    throw new Error(
      `Could not determine Claude CLI version from: ${globalVersion}`,
    );
  } catch (error) {
    throw new Error(
      `Claude CLI not found or version check failed.\n` +
        `  Local path checked: ${localClaudePath}\n` +
        `  Global 'claude' command: Not found or too old\n` +
        `\n` +
        `This framework bundles Claude CLI v2.1+ automatically.\n` +
        `Please run: cd orchestration && npm install\n` +
        `\n` +
        `Error details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the action verb for an agent based on its name
 */
/**
 * Parse tools restriction from agent frontmatter
 * Returns comma-separated list of allowed tools or null if no restriction
 */
function parseToolsFromFrontmatter(agentContent: string): string | null {
  // Match YAML frontmatter
  const frontmatterMatch = agentContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // Match tools: field (can be on one line or multiple lines)
  const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m);
  if (!toolsMatch) {
    return null;
  }

  // Parse tools list (comma-separated or space-separated)
  const toolsLine = toolsMatch[1].trim();

  // Handle comma-separated: "Read, Grep, Glob"
  // Handle space-separated: "Read Grep Glob"
  const tools = toolsLine
    .split(/[,\s]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  return tools.join(',');
}

function getAgentAction(agentName: string): string {
  const lowerName = agentName.toLowerCase();

  if (lowerName.includes("analyzer")) {
    return "Analyzing codebase";
  }
  if (lowerName.includes("synthesizer") || lowerName.includes("architect")) {
    return "Synthesizing analysis results";
  }
  if (lowerName.includes("consolidat")) {
    return "Consolidating findings";
  }
  if (lowerName.includes("planner")) {
    return "Planning implementation";
  }
  if (lowerName.includes("implementer")) {
    return "Implementing changes";
  }
  if (lowerName.includes("reviewer")) {
    return "Reviewing code";
  }
  if (lowerName.includes("verifier")) {
    return "Verifying output";
  }

  // Default fallback
  return "Processing";
}

export interface AgentConfig {
  agentName: string;
  agentFile: string;
  projectPath: string;
  frameworkPath: string;
  additionalContext?: string;
  timeout?: number;
  useUltrathink?: boolean;
  requireJsonOutput?: boolean;
  resumeSessionId?: string; // Session ID to resume (for context-preserving retry)
  settingsPath?: string; // Optional path to settings.json file passed via --settings flag
}

export interface AgentInvokeResult {
  output: string;
  mode: AuthMode;
  executionTimeMs: number;
  sessionId: string; // Session ID for context-preserving retry with --resume
}

export interface HybridAgent {
  invoke(input: { input: string }): Promise<AgentInvokeResult>;
  getInfo(): {
    agentName: string;
    mode: AuthMode;
  };
}

/**
 * Creates agents using DeepAgents.js (API key) or Claude CLI (subscription)
 */
export class HybridAgentFactory {
  private authConfig: AuthConfig;
  private static activeProcesses: Set<ChildProcess> = new Set();
  private static activeInvocations: Map<number, (reason: Error) => void> =
    new Map();
  private static invocationCounter = 0;
  private static isAborting = false;

  constructor(authConfig: AuthConfig) {
    this.authConfig = authConfig;
  }

  /**
   * Abort all active invocations immediately
   */
  static abortAllInvocations() {
    if (this.activeInvocations.size === 0) {
      return;
    }

    this.isAborting = true;
    const abortError = new Error(
      "SIGINT: Workflow interrupted by user (CTRL+C)",
    );

    console.log(
      `\n⚠️  Aborting ${this.activeInvocations.size} active invocation(s)...`,
    );

    for (const [id, reject] of this.activeInvocations) {
      reject(abortError);
    }

    this.activeInvocations.clear();
  }

  /**
   * Kill all active Claude CLI processes
   */
  static killAllActiveProcesses() {
    if (this.activeProcesses.size === 0) {
      return;
    }

    console.log(
      `\n⚠️  Killing ${this.activeProcesses.size} active Claude CLI process(es)...`,
    );

    for (const proc of this.activeProcesses) {
      try {
        if (proc.pid && !proc.killed) {
          try {
            proc.kill("SIGKILL");
          } catch (e) {}
        }
      } catch (e) {}
    }

    this.activeProcesses.clear();
  }

  /**
   * Create factory instance with automatic auth detection
   */
  static async create(): Promise<HybridAgentFactory> {
    const authConfig = await detectAuthMode();

    if (authConfig.mode === AuthMode.NONE) {
      throw new Error(getAuthErrorMessage(authConfig));
    }

    return new HybridAgentFactory(authConfig);
  }

  getAuthConfig(): AuthConfig {
    return this.authConfig;
  }

  /**
   * Create agent using DeepAgents.js or Claude CLI
   */
  async createAgent(config: AgentConfig): Promise<HybridAgent> {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      return this.createDeepAgent(config);
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      return this.createCLIAgent(config);
    } else {
      throw new Error(getAuthErrorMessage(this.authConfig));
    }
  }

  private async createDeepAgent(config: AgentConfig): Promise<HybridAgent> {
    const llmFactory = getLLMFactory();
    const modelInfo = llmFactory.getModelInfo(config.agentName);

    const model = await llmFactory.createModel(config.agentName);

    // Agent files are at <frameworkPath>/orchestration/agents/
    // This works whether frameworkPath points to the framework root
    // or is nested inside a project (e.g., <project>/qubika-agentic-framework/)
    const agentPath = path.join(
      config.frameworkPath,
      "orchestration/agents",
      config.agentFile,
    );

    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }

    const agentInstructions = fs.readFileSync(agentPath, "utf-8");

    const fullInstructions = config.additionalContext
      ? agentInstructions + "\n\n" + config.additionalContext
      : agentInstructions;

    const agent = await createDeepAgent({
      model: model,
      systemPrompt: fullInstructions,
      tools: [],
    });

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const action = getAgentAction(config.agentName);
        const authInfo = `Auth: API Key, Provider: ${this.authConfig.provider}, Model: ${modelInfo.alias}`;

        logger.trackConcurrentAgentStart(
          config.agentName,
          config.agentName,
          `${action} (${authInfo})`,
        );

        const startTime = Date.now();
        const timeout = config.timeout || 300000;

        try {
          const agentPromise = (agent as any).invoke({
            messages: [{ role: "user", content: input.input }],
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(`DeepAgent execution timeout after ${timeout}ms`),
              );
            }, timeout);
          });

          const result = await Promise.race([agentPromise, timeoutPromise]);
          const executionTimeMs = Date.now() - startTime;

          const output =
            (result as any).output ||
            (result as any).content ||
            JSON.stringify(result);

          // Update tracker to success
          logger.trackConcurrentAgentSucceed(
            config.agentName,
            `Completed in ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
          );

          // Generate session ID for tracking (DeepAgents doesn't use --resume like CLI)
          const sessionId = config.resumeSessionId || `deepagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          return {
            output,
            sessionId,
            mode: AuthMode.API_KEY,
            executionTimeMs,
          };
        } catch (error: unknown) {
          // Update to failure state
          const executionTimeMs = Date.now() - startTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          logger.trackConcurrentAgentFail(
            config.agentName,
            `Failed after ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
          );

          throw new Error(
            `DeepAgent execution failed after ${executionTimeMs}ms: ${errorMessage}`,
          );
        }
      },

      getInfo: () => ({
        agentName: config.agentName,
        mode: AuthMode.API_KEY,
      }),
    };
  }

  private async createCLIAgent(config: AgentConfig): Promise<HybridAgent> {
    const llmFactory = getLLMFactory();
    const modelInfo = llmFactory.getModelInfo(config.agentName);

    // Get Claude CLI info once (to avoid repeated checks)
    const claudeCLI = getClaudeCLIPath(config.frameworkPath);

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        // Generate session ID upfront (either new UUID or use existing for retry)
        const { randomUUID } = await import("crypto");
        const sessionId = config.resumeSessionId || randomUUID();
        const isRetry = !!config.resumeSessionId;

        const action = getAgentAction(config.agentName);
        const sessionInfo = isRetry ? `resume:${sessionId.slice(0, 8)}` : sessionId.slice(0, 8);
        const authInfo = `Auth: Subscription, Provider: anthropic, Model: ${modelInfo.alias}, Cli: claude, CliVersion: v${claudeCLI.version}, Session: ${sessionInfo}`;

        logger.trackConcurrentAgentStart(
          config.agentName,
          config.agentName,
          `${action} (${authInfo})`,
        );

        const startTime = Date.now();

        try {
          const fullPrompt = config.additionalContext || input.input;

          const { output, sessionId: returnedSessionId } = await this.invokeCLI(
            config.agentName,
            fullPrompt,
            config.projectPath,
            config.agentFile,
            config.frameworkPath,
            config.timeout,
            config.useUltrathink,
            sessionId, // Pass our generated/existing session ID
            isRetry, // Tell CLI whether to use --session-id or --resume
            config.settingsPath, // Path to settings.json with hooks
          );

          const executionTimeMs = Date.now() - startTime;

          // Update tracker to success
          logger.trackConcurrentAgentSucceed(
            config.agentName,
            `Completed in ${(executionTimeMs / 1000).toFixed(1)}s`,
          );

          return {
            output,
            sessionId: returnedSessionId, // Return sessionId for potential retry
            mode: AuthMode.CLAUDE_CLI,
            executionTimeMs,
          };
        } catch (error: unknown) {
          const executionTimeMs = Date.now() - startTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          logger.trackConcurrentAgentFail(
            config.agentName,
            `Failed after ${(executionTimeMs / 1000).toFixed(1)}s`,
          );

          throw new Error(
            `Claude CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`,
          );
        }
      },

      getInfo: () => ({
        agentName: config.agentName,
        mode: AuthMode.CLAUDE_CLI,
      }),
    };
  }

  private async invokeCLI(
    agentName: string,
    prompt: string,
    projectPath: string,
    agentFile: string,
    frameworkPath: string,
    timeout: number = 300000,
    useUltrathink: boolean = false,
    sessionId: string, // Session ID - either new (first attempt) or existing (retry)
    isRetry: boolean = false, // Whether this is a retry (use --resume instead of --session-id)
    settingsPath?: string, // Optional path to settings.json file
  ): Promise<{ output: string; sessionId: string }> {
    if (HybridAgentFactory.isAborting) {
      throw new Error("SIGINT: Workflow interrupted by user (CTRL+C)");
    }

    return new Promise(async (resolve, reject) => {
      const invocationId = HybridAgentFactory.invocationCounter++;
      HybridAgentFactory.activeInvocations.set(invocationId, reject);

      const { mkdtemp, writeFile, rm } = await import("fs/promises");
      const { tmpdir } = await import("os");
      const { join } = await import("path");

      const tempDir = await mkdtemp(join(tmpdir(), "claude-prompt-"));
      const promptFile = join(tempDir, "prompt.txt");
      let promptFileCreated = false;

      try {
        const finalPrompt = useUltrathink ? `ultrathink\n\n${prompt}` : prompt;
        await writeFile(promptFile, finalPrompt, "utf-8");
        promptFileCreated = true;
      } catch (err) {
        HybridAgentFactory.activeInvocations.delete(invocationId);
        reject(new Error(`Failed to write prompt file: ${err}`));
        return;
      }

      const cleanup = async () => {
        HybridAgentFactory.activeInvocations.delete(invocationId);
        clearTimeout(timeoutId);
        if (promptFileCreated) {
          try {
            await rm(tempDir, { recursive: true, force: true });
          } catch {}
        }
      };

      let timeoutId: NodeJS.Timeout;
      let claudeProcess: ChildProcess;

      timeoutId = setTimeout(async () => {
        await cleanup();
        claudeProcess.kill("SIGTERM");
        reject(new Error(`Claude CLI timeout after ${timeout}ms`));
      }, timeout);

      const { open } = await import("fs");
      const promptFd = await new Promise<number>((res, rej) => {
        open(promptFile, "r", (err, fd) => {
          if (err) rej(err);
          else res(fd);
        });
      });

      // Construct path to agent file
      const agentPath = path.join(
        frameworkPath,
        "orchestration/agents",
        agentFile,
      );

      // Set cwd to agents directory so hook paths (./hooks/...) resolve correctly
      const agentsDir = path.join(frameworkPath, "orchestration/agents");

      // Validate agent file before spawning (Goal 1: Pre-invocation validation)
      assertAgentFileValid(agentPath);

      // Parse agent frontmatter to extract allowed tools
      const agentContent = fs.readFileSync(agentPath, "utf-8");
      const toolsRestriction = parseToolsFromFrontmatter(agentContent);

      // Get Claude CLI path (local bundled version preferred)
      const claudeCLI = getClaudeCLIPath(frameworkPath);

      const cliArgs = [
        "--agent",
        agentPath,
        "--model",
        "sonnet",
      ];

      // CRITICAL PERMISSION LOGIC:
      // If agent has tools restriction in frontmatter → use strict permissions (no --dangerously-skip-permissions)
      // If no tools restriction → use unrestricted mode (for implement-ticket, etc.)
      if (toolsRestriction) {
        // Strict mode: Only allow specified tools (e.g., "Read,Grep,Glob")
        // This prevents browser launches, clipboard access, and other non-tool capabilities
        cliArgs.push("--tools", toolsRestriction);
      } else {
        // Unrestricted mode: Allow everything (for agents that need Write, Bash, etc.)
        cliArgs.push("--dangerously-skip-permissions");
      }

      cliArgs.push(
        "--add-dir",
        projectPath, // Grant access to project directory
        // First attempt: set our generated session ID. Retry: resume existing session
        ...(isRetry ? ["--resume", sessionId] : ["--session-id", sessionId]),
      );

      // Add settings file if provided
      if (settingsPath) {
        cliArgs.push("--settings", settingsPath);
      }

      claudeProcess = spawn(
        claudeCLI.path,
        cliArgs,
        {
          cwd: agentsDir, // Changed from projectPath to agentsDir so hooks resolve
          env: {
            ...process.env,
            CLAUDE_SKIP_CONFIRMATIONS: "1",
            FRAMEWORK_PATH: frameworkPath, // Framework root path for hook resolution
          },
          stdio: [promptFd, "pipe", "pipe"],
          detached: false,
        },
      );

      HybridAgentFactory.activeProcesses.add(claudeProcess);

      claudeProcess.on("close", () => {
        HybridAgentFactory.activeProcesses.delete(claudeProcess);
      });

      let stdout = "";
      let stderr = "";

      if (claudeProcess.stdout) {
        claudeProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      if (claudeProcess.stderr) {
        claudeProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      claudeProcess.on("close", async (code) => {
        await cleanup();

        const { close } = await import("fs");
        close(promptFd, () => {});

        if (code === 0) {
          // Return raw output and the session ID we control
          // No JSON parsing needed - we generated the session ID upfront
          resolve({ output: stdout, sessionId });
        } else {
          const isRateLimit =
            stdout.includes("Limit reached") ||
            stdout.includes("resets") ||
            stdout.includes("/upgrade to Max");

          let errorMessage = `Claude CLI exited with code ${code}`;

          if (isRateLimit) {
            const resetMatch = stdout.match(
              /resets (\d+(?:am|pm)) \(([^)]+)\)/,
            );
            const resetTime = resetMatch
              ? `${resetMatch[1]} ${resetMatch[2]}`
              : "unknown";

            errorMessage =
              `RATE_LIMIT: Claude CLI usage limit reached. Resets at ${resetTime}.\n` +
              `Options:\n` +
              `  1. Wait until rate limit resets\n` +
              `  2. Set ANTHROPIC_API_KEY environment variable to use API key mode\n` +
              `  3. Upgrade to Max (20x limits) or enable /extra-usage\n\n` +
              `To switch to API key mode:\n` +
              `  export ANTHROPIC_API_KEY="your-api-key"\n` +
              `  # Framework will automatically detect and use API key mode`;
          }

          errorMessage += `\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;

          reject(new Error(errorMessage));
        }
      });

      claudeProcess.on("error", (error) => {
        cleanup();
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });
    });
  }
}
