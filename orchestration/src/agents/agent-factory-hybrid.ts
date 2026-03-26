import { spawn, ChildProcess } from "child_process";
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

/**
 * Get the action verb for an agent based on its name
 */
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
}

export interface AgentInvokeResult {
  output: string;
  mode: AuthMode;
  executionTimeMs: number;
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

          return {
            output,
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

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const action = getAgentAction(config.agentName);
        const authInfo = `Auth: Subscription, Provider: anthropic, Model: ${modelInfo.alias}`;

        logger.trackConcurrentAgentStart(
          config.agentName,
          config.agentName,
          `${action} (${authInfo})`,
        );

        const startTime = Date.now();

        try {
          const fullPrompt = config.additionalContext || input.input;

          const output = await this.invokeCLI(
            config.agentName,
            fullPrompt,
            config.projectPath,
            config.agentFile,
            config.frameworkPath,
            config.timeout,
            config.useUltrathink,
          );

          const executionTimeMs = Date.now() - startTime;

          // Update tracker to success
          logger.trackConcurrentAgentSucceed(
            config.agentName,
            `Completed in ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
          );

          return {
            output,
            mode: AuthMode.CLAUDE_CLI,
            executionTimeMs,
          };
        } catch (error: unknown) {
          const executionTimeMs = Date.now() - startTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          logger.trackConcurrentAgentFail(
            config.agentName,
            `Failed after ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
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
  ): Promise<string> {
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
      const agentPath = path.join(frameworkPath, "orchestration/agents", agentFile);

      // Set cwd to agents directory so hook paths (./hooks/...) resolve correctly
      const agentsDir = path.join(frameworkPath, "orchestration/agents");

      claudeProcess = spawn(
        "claude",
        [
          "--agent", agentPath,
          "--model", "sonnet",
          "--dangerously-skip-permissions",
          "--add-dir", projectPath,  // Grant access to project directory
        ],
        {
          cwd: agentsDir, // Changed from projectPath to agentsDir so hooks resolve
          env: {
            ...process.env,
            CLAUDE_SKIP_CONFIRMATIONS: "1",
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
          resolve(stdout);
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
