import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import { getAgentAction } from './agent-utils.js';
import { getCodexCLIPath, getCodexCLIModelForAgent } from './codex-cli-utils.js';

// Track active processes and invocations for cleanup
const activeCodexProcesses: Set<ChildProcess> = new Set();
const activeCodexInvocations: Map<number, (reason: Error) => void> = new Map();
let codexInvocationCounter = 0;
let isCodexAborting = false;

/**
 * Abort all active Codex invocations immediately
 */
export function abortAllCodexInvocations() {
  if (activeCodexInvocations.size === 0) {
    return;
  }

  isCodexAborting = true;
  const abortError = new Error('SIGINT: Workflow interrupted by user (CTRL+C)');

  console.log(`\n⚠️  Aborting ${activeCodexInvocations.size} active Codex invocation(s)...`);

  for (const [, reject] of activeCodexInvocations) {
    reject(abortError);
  }

  activeCodexInvocations.clear();
}

/**
 * Kill all active Codex CLI processes
 */
export function killAllActiveCodexProcesses() {
  if (activeCodexProcesses.size === 0) {
    return;
  }

  console.log(`\n⚠️  Killing ${activeCodexProcesses.size} active Codex CLI process(es)...`);

  for (const proc of activeCodexProcesses) {
    try {
      if (proc.pid && !proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Ignore kill errors
    }
  }

  activeCodexProcesses.clear();
}

/**
 * Create agent using Codex CLI (subscription mode)
 */
export async function createCodexCLIAgentImpl(
  config: AgentConfig,
  codexCLIVersion: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);

  const codexCLI = getCodexCLIPath(config.frameworkPath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      const { randomUUID } = await import('crypto');
      const sessionId = config.resumeSessionId || randomUUID();
      const isRetry = !!config.resumeSessionId;

      const action = getAgentAction(config.agentName);
      const sessionInfo = isRetry ? `resume:${sessionId}` : sessionId;
      const authInfo = `Auth: Subscription, Provider: openai, Model: ${modelInfo.alias}, Cli: codex, CliVersion: v${codexCLI.version}, Session: ${sessionInfo}`;

      logger.trackConcurrentAgentStart(
        config.agentName,
        config.agentName,
        `${action} (${authInfo})`,
      );

      const startTime = Date.now();

      try {
        const { output } = await invokeCodexCLI(
          config.agentName,
          input.inputPrompt,
          config.projectPath,
          config.agentFilePath,
          config.frameworkPath,
          config.timeout,
          sessionId,
          config.settingsPath,
        );

        const executionTimeMs = Date.now() - startTime;

        logger.trackConcurrentAgentSucceed(
          config.agentName,
          `Completed in ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        return {
          output,
          sessionId,
          mode: AuthMode.CODEX_CLI,
          executionTimeMs,
        };
      } catch (error: unknown) {
        const executionTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.trackConcurrentAgentFail(
          config.agentName,
          `Failed after ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        throw new Error(`Codex CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`);
      }
    },

    getInfo: () => ({
      agentName: config.agentName,
      mode: AuthMode.CODEX_CLI,
    }),
  };
}

/**
 * Set up Codex hooks from a Claude settings.json file.
 *
 * Reads the Claude settings.json, finds the corresponding codex-hooks.json
 * in the same directory, resolves ${FRAMEWORK_PATH}, and writes it to
 * a temporary .codex/hooks.json in the project directory.
 *
 * Returns the path to clean up, or null if no hooks were set up.
 */
async function setupCodexHooks(
  settingsPath: string,
  projectPath: string,
  frameworkPath: string,
  tempDir: string,
): Promise<string | null> {
  try {
    // Find the codex-hooks.json alongside the Claude settings.json
    const settingsDir = path.dirname(settingsPath);
    const codexHooksPath = path.join(settingsDir, 'codex-hooks.json');

    if (!fs.existsSync(codexHooksPath)) {
      return null;
    }

    // Read and resolve ${FRAMEWORK_PATH} placeholders
    let hooksContent = fs.readFileSync(codexHooksPath, 'utf-8');
    hooksContent = hooksContent.replace(/\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g, frameworkPath);

    // Write resolved hooks to the project's .codex/ directory
    const codexConfigDir = path.join(projectPath, '.codex');
    await mkdir(codexConfigDir, { recursive: true });
    const targetHooksPath = path.join(codexConfigDir, 'hooks.json');
    await writeFile(targetHooksPath, hooksContent, 'utf-8');

    // Also write a config.toml to enable hooks feature
    const configTomlPath = path.join(codexConfigDir, 'config.toml');
    if (!fs.existsSync(configTomlPath)) {
      await writeFile(configTomlPath, '[features]\ncodex_hooks = true\n', 'utf-8');
    }

    return targetHooksPath;
  } catch (error) {
    logger.warn(
      `Warning: Failed to setup Codex hooks: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Invoke Codex CLI with input prompt
 *
 * Since Codex doesn't have a --agent flag, agent instructions are
 * prepended to the prompt. If settingsPath is provided, Codex hooks
 * are set up for inline validation (same behavior as Claude's stop hooks).
 */
async function invokeCodexCLI(
  agentName: string,
  inputPrompt: string,
  projectPath: string,
  agentFilePath: string,
  frameworkPath: string,
  timeout: number = 300000,
  sessionId: string,
  settingsPath?: string,
): Promise<{ output: string; sessionId: string }> {
  if (isCodexAborting) {
    throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  }

  return new Promise(async (resolve, reject) => {
    const invocationId = codexInvocationCounter++;
    activeCodexInvocations.set(invocationId, reject);

    // Create temp directory for this invocation
    const tempDir = path.join(projectPath, '.codex-temp', agentName, sessionId);
    await mkdir(tempDir, { recursive: true });

    // Set up Codex hooks if settings provided (for inline validation)
    let hooksCleanupPath: string | null = null;
    if (settingsPath) {
      hooksCleanupPath = await setupCodexHooks(settingsPath, projectPath, frameworkPath, tempDir);
    }

    // Read agent file and strip frontmatter (Codex doesn't understand it)
    const agentContent = fs.readFileSync(agentFilePath, 'utf-8');
    const agentBody = agentContent.replace(/^---[\s\S]*?---\n?/, '');

    // Combine agent instructions + input prompt
    const fullPrompt = `${agentBody}\n\n---\n\n${inputPrompt}`;

    // Write prompt to file to avoid shell argument length limits
    const promptFile = path.join(tempDir, 'prompt.txt');
    await writeFile(promptFile, fullPrompt, 'utf-8');

    // Output file for capturing last message
    const outputFile = path.join(tempDir, 'output.txt');

    const codexCLI = getCodexCLIPath(frameworkPath);
    const model = getCodexCLIModelForAgent(agentName, frameworkPath);

    // Build Codex CLI arguments
    const cliArgs = [
      'exec',
      fullPrompt,
      '--model',
      model,
      '--yolo',
      '-o',
      outputFile,
      '--skip-git-repo-check',
    ];

    let timeoutId: NodeJS.Timeout;

    const codexProcess = spawn(codexCLI.path, cliArgs, {
      cwd: projectPath,
      env: {
        ...process.env,
        FRAMEWORK_PATH: frameworkPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    activeCodexProcesses.add(codexProcess);

    const cleanup = async () => {
      activeCodexInvocations.delete(invocationId);
      clearTimeout(timeoutId);

      // Clean up temporary hooks file
      if (hooksCleanupPath) {
        try {
          await rm(hooksCleanupPath, { force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    timeoutId = setTimeout(async () => {
      await cleanup();
      codexProcess.kill('SIGTERM');
      reject(new Error(`Codex CLI timeout after ${timeout}ms`));
    }, timeout);

    codexProcess.on('close', () => {
      activeCodexProcesses.delete(codexProcess);
    });

    let stdout = '';
    let stderr = '';

    if (codexProcess.stdout) {
      codexProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (codexProcess.stderr) {
      codexProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    codexProcess.on('close', async (code) => {
      await cleanup();

      if (code === 0) {
        // Read output from file (more reliable than parsing JSON stream)
        let output = '';
        try {
          output = await readFile(outputFile, 'utf-8');
        } catch {
          // Fallback to stdout parsing if output file not created
          output = parseCodexJsonOutput(stdout);
        }
        resolve({ output, sessionId });
      } else {
        const isRateLimit =
          stderr.includes('429') || stdout.includes('rate limit') || stdout.includes('capacity');

        let errorMessage = `Codex CLI exited with code ${code}`;

        if (isRateLimit) {
          errorMessage =
            `RATE_LIMIT: Codex CLI usage limit reached.\n` +
            `Options:\n` +
            `  1. Wait for the 5-hour rate limit window to reset\n` +
            `  2. Set OPENAI_API_KEY environment variable for API key mode\n` +
            `  3. Upgrade to Pro (5x/20x) for higher limits\n\n` +
            `To switch to API key mode:\n` +
            `  export OPENAI_API_KEY="your-api-key"`;
        }

        errorMessage += `\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;

        reject(new Error(errorMessage));
      }
    });

    codexProcess.on('error', (error) => {
      cleanup();
      reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });
  });
}

/**
 * Parse Codex JSON output stream to extract final message content
 */
function parseCodexJsonOutput(jsonStream: string): string {
  const lines = jsonStream.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === 'message' && event.content) {
        return event.content;
      }
    } catch {
      continue;
    }
  }
  // Fallback: return all stdout
  return jsonStream;
}
