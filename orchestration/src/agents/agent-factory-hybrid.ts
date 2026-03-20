import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { AuthMode, AuthConfig, detectAuthMode, getAuthErrorMessage } from '../auth/auth-detector.js';
import { createDeepAgent } from 'deepagents';
import { getLLMFactory } from '../llm/llm-factory.js';

/**
 * Configuration for creating an agent
 */
export interface AgentConfig {
  /** Name of the agent (e.g., 'planner', 'implementer-typescript') */
  agentName: string;

  /** Agent markdown file name (e.g., 'planner.md') */
  agentFile: string;

  /** Project path where agent will execute */
  projectPath: string;

  /** Framework path where agents/ folder is located */
  frameworkPath: string;

  /** Additional context to append to agent instructions */
  additionalContext?: string;

  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * Result from agent invocation
 */
export interface AgentInvokeResult {
  /** Agent output text */
  output: string;

  /** Authentication mode used */
  mode: AuthMode;

  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Unified agent interface that works with both DeepAgents.js and Claude CLI
 */
export interface HybridAgent {
  /** Invoke the agent with input text */
  invoke(input: { input: string }): Promise<AgentInvokeResult>;

  /** Get information about the agent */
  getInfo(): {
    agentName: string;
    mode: AuthMode;
  };
}

/**
 * Hybrid Agent Factory
 *
 * Creates agents using either:
 * - DeepAgents.js with API keys (Mode 1)
 * - Claude CLI with subscription (Mode 2)
 *
 * The factory automatically detects available authentication and chooses the best mode.
 *
 * @example
 * ```typescript
 * const factory = await HybridAgentFactory.create();
 *
 * const agent = await factory.createAgent({
 *   agentName: 'planner',
 *   agentFile: 'planner.md',
 *   projectPath: '/path/to/project',
 *   frameworkPath: '/path/to/framework'
 * });
 *
 * const result = await agent.invoke({ input: 'Create a plan for PROJ-123' });
 * console.log(result.output);
 * ```
 */
export class HybridAgentFactory {
  private authConfig: AuthConfig;
  private static activeProcesses: Set<ChildProcess> = new Set();

  constructor(authConfig: AuthConfig) {
    this.authConfig = authConfig;
  }

  /**
   * Kill all active Claude CLI processes
   * This is exposed as a public static method so the main CLI can call it
   * during shutdown
   */
  static killAllActiveProcesses() {
    if (this.activeProcesses.size === 0) {
      return;
    }

    console.log(`\n⚠️  Killing ${this.activeProcesses.size} active Claude CLI process(es)...`);

    // Kill all tracked processes
    // Use SIGKILL immediately - we're exiting anyway, no point in graceful shutdown
    for (const proc of this.activeProcesses) {
      try {
        if (proc.pid && !proc.killed) {
          // Send SIGKILL immediately to ensure process dies before parent exits
          // This is critical for CTRL+C handling - we can't use async setTimeout
          // because the parent process.exit() happens before the timeout fires
          try {
            proc.kill('SIGKILL');
          } catch (e) {
            // Process already dead, ignore
          }
        }
      } catch (e) {
        // Process already dead, ignore
      }
    }

    this.activeProcesses.clear();
  }

  /**
   * Create a factory instance with automatic auth detection
   */
  static async create(): Promise<HybridAgentFactory> {
    const authConfig = await detectAuthMode();

    // If no authentication available, throw error with helpful message
    if (authConfig.mode === AuthMode.NONE) {
      throw new Error(getAuthErrorMessage(authConfig));
    }

    return new HybridAgentFactory(authConfig);
  }

  /**
   * Get the current authentication configuration
   */
  getAuthConfig(): AuthConfig {
    return this.authConfig;
  }

  /**
   * Create an agent using the appropriate mode (DeepAgents.js or Claude CLI)
   */
  async createAgent(config: AgentConfig): Promise<HybridAgent> {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      console.log(`[HybridAgentFactory] Auth: DeepAgents.js (${this.authConfig.provider} API Key)`);
      return this.createDeepAgent(config);
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      console.log(`[HybridAgentFactory] Auth: Claude CLI (Subscription)`);
      return this.createCLIAgent(config);
    } else {
      throw new Error(getAuthErrorMessage(this.authConfig));
    }
  }

  /**
   * Create agent using DeepAgents.js with API key
   * @private
   */
  private async createDeepAgent(config: AgentConfig): Promise<HybridAgent> {
    const llmFactory = getLLMFactory();

    // Get model info for logging before creating the model
    const modelInfo = llmFactory.getModelInfo(config.agentName);

    console.log(
      `[${config.agentName}] Tier: ${modelInfo.tier}, Model: ${modelInfo.modelId} ` +
      `(alias: ${modelInfo.alias}, provider: ${modelInfo.provider})`
    );

    const model = await llmFactory.createModel(config.agentName);

    // Load agent markdown file
    const agentPath = path.join(
      config.frameworkPath,
      '.claude',
      'agents',
      config.agentFile
    );

    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }

    const agentInstructions = fs.readFileSync(agentPath, 'utf-8');

    // Append additional context if provided
    const fullInstructions = config.additionalContext
      ? agentInstructions + '\n\n' + config.additionalContext
      : agentInstructions;

    // Create DeepAgent
    const agent = await createDeepAgent({
      model: model,
      systemPrompt: fullInstructions, // DeepAgents uses systemPrompt, not instructions
      tools: [] // Tools are configured in agent markdown
    });

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const startTime = Date.now();
        const timeout = config.timeout || 300000; // Default 5 minutes

        try {
          // Invoke agent with timeout using Promise.race
          const agentPromise = (agent as any).invoke({
            messages: [{ role: 'user', content: input.input }]
          });

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`DeepAgent execution timeout after ${timeout}ms`));
            }, timeout);
          });

          const result = await Promise.race([agentPromise, timeoutPromise]);
          const executionTimeMs = Date.now() - startTime;

          // Extract output from result (supports both .output and .content properties)
          const output = (result as any).output || (result as any).content || JSON.stringify(result);

          return {
            output,
            mode: AuthMode.API_KEY,
            executionTimeMs
          };
        } catch (error: unknown) {
          const executionTimeMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(
            `DeepAgent execution failed after ${executionTimeMs}ms: ${errorMessage}`
          );
        }
      },

      getInfo: () => ({
        agentName: config.agentName,
        mode: AuthMode.API_KEY
      })
    };
  }

  /**
   * Create agent using Claude CLI with subscription
   * @private
   */
  private async createCLIAgent(config: AgentConfig): Promise<HybridAgent> {
    const llmFactory = getLLMFactory();
    const modelInfo = llmFactory.getModelInfo(config.agentName);

    // Log model information
    console.log(
      `[${config.agentName}] Tier: ${modelInfo.tier}, Model: Claude CLI (target: ${modelInfo.alias})`
    );

    return {
      invoke: async (input: { input: string }): Promise<AgentInvokeResult> => {
        const startTime = Date.now();

        try {
          // Use full prompt from additionalContext (has agent instructions)
          // NOT the short input message
          const fullPrompt = config.additionalContext || input.input;

          const output = await this.invokeCLI(
            config.agentName,
            fullPrompt,
            config.projectPath,
            config.timeout
          );

          const executionTimeMs = Date.now() - startTime;

          return {
            output,
            mode: AuthMode.CLAUDE_CLI,
            executionTimeMs
          };
        } catch (error: unknown) {
          const executionTimeMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Claude CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`
          );
        }
      },

      getInfo: () => ({
        agentName: config.agentName,
        mode: AuthMode.CLAUDE_CLI
      })
    };
  }

  /**
   * Invoke Claude CLI as a child process
   * @private
   */
  private async invokeCLI(
    agentName: string,
    prompt: string,
    projectPath: string,
    timeout: number = 300000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let claudeProcess: ChildProcess;

      // Set up timeout
      timeoutId = setTimeout(() => {
        claudeProcess.kill('SIGTERM');
        reject(new Error(`Claude CLI timeout after ${timeout}ms`));
      }, timeout);

      // Spawn Claude CLI process - EXACT same arguments as bash script
      // bash: claude --model sonnet --dangerously-skip-permissions
      claudeProcess = spawn('claude', [
        '--model',
        'sonnet',
        '--dangerously-skip-permissions'
      ], {
        cwd: projectPath,
        env: {
          ...process.env,
          CLAUDE_SKIP_CONFIRMATIONS: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false // Don't detach - keep in same process group
      });

      // Track this process so we can kill it on SIGINT
      HybridAgentFactory.activeProcesses.add(claudeProcess);

      // Remove from tracking when process ends
      claudeProcess.on('close', () => {
        HybridAgentFactory.activeProcesses.delete(claudeProcess);
      });

      let stdout = '';
      let stderr = '';

      // Send prompt to stdin (same as bash: claude <<< "$PROMPT")
      if (claudeProcess.stdin) {
        claudeProcess.stdin.write(prompt);
        claudeProcess.stdin.end();
      }

      // Collect stdout
      if (claudeProcess.stdout) {
        claudeProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      // Collect stderr
      if (claudeProcess.stderr) {
        claudeProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Handle process completion
      claudeProcess.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          resolve(stdout);
        } else {
          // Check for rate limit error
          const isRateLimit = stdout.includes('Limit reached') ||
                             stdout.includes('resets') ||
                             stdout.includes('/upgrade to Max');

          let errorMessage = `Claude CLI exited with code ${code}`;

          if (isRateLimit) {
            const resetMatch = stdout.match(/resets (\d+(?:am|pm)) \(([^)]+)\)/);
            const resetTime = resetMatch ? `${resetMatch[1]} ${resetMatch[2]}` : 'unknown';

            errorMessage = `RATE_LIMIT: Claude CLI usage limit reached. Resets at ${resetTime}.\n` +
                          `Options:\n` +
                          `  1. Wait until rate limit resets\n` +
                          `  2. Set ANTHROPIC_API_KEY environment variable to use API key mode\n` +
                          `  3. Upgrade to Max (20x limits) or enable /extra-usage\n\n` +
                          `To switch to API key mode:\n` +
                          `  export ANTHROPIC_API_KEY="your-api-key"\n` +
                          `  # Framework will automatically detect and use API key mode`;
          }

          // Include full output for debugging
          errorMessage += `\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;

          reject(new Error(errorMessage));
        }
      });

      // Handle process errors
      claudeProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });
    });
  }
}
