import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import { assertAgentFileValid } from './agent-validator.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import { getAgentAction } from './agent-utils.js';
import { getClaudeCLIPath, getCLIModelForAgent, parseToolsFromFrontmatter } from './cli-utils.js';

// Track active processes and invocations for cleanup
const activeProcesses: Set<ChildProcess> = new Set();
const activeInvocations: Map<number, (reason: Error) => void> = new Map();
let invocationCounter = 0;
let isAborting = false;

/**
 * Abort all active invocations immediately
 */
export function abortAllInvocations() {
  if (activeInvocations.size === 0) {
    return;
  }

  isAborting = true;
  const abortError = new Error('SIGINT: Workflow interrupted by user (CTRL+C)');

  console.log(`\n⚠️  Aborting ${activeInvocations.size} active invocation(s)...`);

  for (const [id, reject] of activeInvocations) {
    reject(abortError);
  }

  activeInvocations.clear();
}

/**
 * Kill all active Claude CLI processes
 */
export function killAllActiveProcesses() {
  if (activeProcesses.size === 0) {
    return;
  }

  console.log(`\n⚠️  Killing ${activeProcesses.size} active Claude CLI process(es)...`);

  for (const proc of activeProcesses) {
    try {
      if (proc.pid && !proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch (e) {}
      }
    } catch (e) {}
  }

  activeProcesses.clear();
}

/**
 * Create agent using Claude CLI (subscription mode)
 */
export async function createCLIAgentImpl(
  config: AgentConfig,
  claudeCLIVersion: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);

  // Get Claude CLI info once (to avoid repeated checks)
  const claudeCLI = getClaudeCLIPath(config.frameworkPath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      // Generate session ID upfront (either new UUID or use existing for retry)
      const { randomUUID } = await import('crypto');
      const sessionId = config.resumeSessionId || randomUUID();
      const isRetry = !!config.resumeSessionId;

      const action = getAgentAction(config.agentName);
      const sessionInfo = isRetry ? `resume:${sessionId}` : sessionId;
      const authInfo = `Auth: Subscription, Provider: anthropic, Model: ${modelInfo.alias}, Cli: claude, CliVersion: v${claudeCLI.version}, Session: ${sessionInfo}`;

      const trackerId = config.trackerId ?? config.agentName;
      const trackerDisplayName = config.trackerDisplayName ?? config.agentName;

      logger.trackConcurrentAgentStart(
        trackerId,
        trackerDisplayName,
        `${action} (${authInfo})`,
      );

      const startTime = Date.now();

      try {
        const { output, sessionId: returnedSessionId } = await invokeCLI(
          config.agentName,
          input.inputPrompt, // Use inputPrompt from invoke() parameter
          config.projectPath,
          config.agentFilePath, // Use agentFilePath directly (absolute path)
          config.frameworkPath,
          config.timeout,
          sessionId, // Pass our generated/existing session ID
          isRetry, // Tell CLI whether to use --session-id or --resume
          config.settingsPath, // Path to settings.json with hooks
        );

        const executionTimeMs = Date.now() - startTime;

        // Update tracker to success
        logger.trackConcurrentAgentSucceed(
          trackerId,
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
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.trackConcurrentAgentFail(
          trackerId,
          `Failed after ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        throw new Error(`Claude CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`);
      }
    },

    getInfo: () => ({
      agentName: config.agentName,
      mode: AuthMode.CLAUDE_CLI,
    }),
  };
}

/**
 * Invoke Claude CLI with input prompt
 */
async function invokeCLI(
  agentName: string,
  inputPrompt: string, // Full input prompt (built by node)
  projectPath: string,
  agentFilePath: string, // Absolute path to agent .md file
  frameworkPath: string,
  timeout: number = 300000,
  sessionId: string, // Session ID - either new (first attempt) or existing (retry)
  isRetry: boolean = false, // Whether this is a retry (use --resume instead of --session-id)
  settingsPath?: string, // Optional path to settings.json file
): Promise<{ output: string; sessionId: string }> {
  if (isAborting) {
    throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  }

  return new Promise(async (resolve, reject) => {
    const invocationId = invocationCounter++;
    activeInvocations.set(invocationId, reject);

    const { writeFile } = await import('fs/promises');

    const tempDir =
      (await mkdir(path.join(projectPath, '.claude-temp', agentName, sessionId), {
        recursive: true,
      })) || `${projectPath}/.claude-temp/${agentName}/${sessionId}`;
    const promptFile = path.join(tempDir, 'prompt.txt');
    const stdoutFile = path.join(tempDir, 'stdout.txt');
    const stderrFile = path.join(tempDir, 'stderr.txt');
    const argsFile = path.join(tempDir, 'claude-command.json');
    const debugFile = path.join(tempDir, 'claude-debug.log');

    try {
      // Write input prompt to file (no ultrathink - that's in the prompt if needed)
      await writeFile(promptFile, inputPrompt, 'utf-8');
    } catch (err) {
      activeInvocations.delete(invocationId);
      reject(new Error(`Failed to write prompt file: ${err}`));
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let claudeProcess: ChildProcess;

    const cleanup = async () => {
      activeInvocations.delete(invocationId);
      clearTimeout(timeoutId);
    };

    const promptFd = await new Promise<number>((res, rej) => {
      fs.open(promptFile, 'r', (err, fd) => {
        if (err) rej(err);
        else res(fd);
      });
    });

    // Validate agent file before spawning (Goal 1: Pre-invocation validation)
    assertAgentFileValid(agentFilePath);

    // Parse agent frontmatter to extract allowed tools
    const agentContent = fs.readFileSync(agentFilePath, 'utf-8');
    const toolsRestriction = parseToolsFromFrontmatter(agentContent);

    const claudeCLI = getClaudeCLIPath(frameworkPath);

    // Get the appropriate model for this agent from model-config.json
    const model = getCLIModelForAgent(agentName, frameworkPath);
    const cliArgs = ['--agent', agentFilePath, '--model', model, '--debug-file', debugFile];

    if (toolsRestriction) {
      // Split frontmatter list into built-in tools vs MCP permission patterns.
      // --tools gates the built-in set (Read/Grep/Glob/Bash/etc.)
      // --allowedTools is the permission allowlist (required for mcp__<server> entries
      // to be auto-approved; otherwise they hit the permission prompt and get denied
      // in non-interactive mode).
      const entries = toolsRestriction
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const builtIns = entries.filter((t) => !t.startsWith('mcp__'));
      if (builtIns.length > 0) {
        cliArgs.push('--tools', builtIns.join(','));
      }
      cliArgs.push('--allowedTools', entries.join(','));
    } else {
      cliArgs.push('--dangerously-skip-permissions');
    }

    cliArgs.push(...(isRetry ? ['--resume', sessionId] : ['--session-id', sessionId]));

    if (settingsPath) {
      try {
        // Read original settings file
        const originalSettings = fs.readFileSync(settingsPath, 'utf-8');

        // Replace ${FRAMEWORK_PATH} with actual framework path
        // Use regex to handle variations like ${FRAMEWORK_PATH} or $FRAMEWORK_PATH
        const resolvedSettings = originalSettings.replace(
          /\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g,
          frameworkPath,
        );

        // Write temporary settings file with resolved paths
        // File will be auto-cleaned when tempDir is removed by cleanup()
        const tempSettingsFile = path.join(tempDir, 'settings-resolved.json');
        fs.writeFileSync(tempSettingsFile, resolvedSettings, 'utf-8');

        cliArgs.push('--settings', tempSettingsFile);

        // Claude CLI's settings.json schema does not include `mcpServers`, so
        // MCP servers must be passed separately via --mcp-config. Convention:
        // co-locate an `mcp.json` file next to settings.json; if present, resolve
        // ${FRAMEWORK_PATH} and forward it.
        const mcpConfigSource = path.join(path.dirname(settingsPath), 'mcp.json');
        if (fs.existsSync(mcpConfigSource)) {
          const originalMcp = fs.readFileSync(mcpConfigSource, 'utf-8');
          const resolvedMcp = originalMcp.replace(
            /\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g,
            frameworkPath,
          );
          const tempMcpConfigFile = path.join(tempDir, 'mcp-config.json');
          fs.writeFileSync(tempMcpConfigFile, resolvedMcp, 'utf-8');
          cliArgs.push('--mcp-config', tempMcpConfigFile);
        }
      } catch (error) {
        // If settings file processing fails, log and continue without settings
        console.warn(
          `Warning: Failed to process settings file ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    try {
      await writeFile(
        argsFile,
        JSON.stringify(
          {
            command: claudeCLI.path,
            args: cliArgs,
            cwd: projectPath,
            sessionId,
            isRetry,
            agentName,
            agentFilePath,
            settingsPath,
          },
          null,
          2,
        ),
        'utf-8',
      );
    } catch {}

    claudeProcess = spawn(claudeCLI.path, cliArgs, {
      cwd: projectPath,
      env: {
        ...process.env,
        CLAUDE_SKIP_CONFIRMATIONS: '1',
        FRAMEWORK_PATH: frameworkPath,
      },
      stdio: [promptFd, 'pipe', 'pipe'],
      detached: false,
    });

    activeProcesses.add(claudeProcess);

    timeoutId = setTimeout(async () => {
      await cleanup();
      claudeProcess.kill('SIGTERM');
      reject(new Error(`Claude CLI timeout after ${timeout}ms`));
    }, timeout);

    claudeProcess.on('close', () => {
      activeProcesses.delete(claudeProcess);
    });

    let stdout = '';
    let stderr = '';

    if (claudeProcess.stdout) {
      claudeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (claudeProcess.stderr) {
      claudeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    claudeProcess.on('close', async (code) => {
      await cleanup();

      const { close } = await import('fs');
      close(promptFd, () => {});

      try {
        await writeFile(stdoutFile, stdout, 'utf-8');
        await writeFile(stderrFile, stderr, 'utf-8');
      } catch {}

      if (code === 0) {
        // Return raw output and the session ID we control
        // No JSON parsing needed - we generated the session ID upfront
        resolve({ output: stdout, sessionId });
      } else {
        const isRateLimit =
          stdout.includes('Limit reached') ||
          stdout.includes('resets') ||
          stdout.includes('/upgrade to Max');

        let errorMessage = `Claude CLI exited with code ${code}`;

        if (isRateLimit) {
          const resetMatch = stdout.match(/resets (\d+(?:am|pm)) \(([^)]+)\)/);
          const resetTime = resetMatch ? `${resetMatch[1]} ${resetMatch[2]}` : 'unknown';

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

    claudeProcess.on('error', (error) => {
      cleanup();
      reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
    });
  });
}
