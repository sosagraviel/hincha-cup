import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import { assertAgentFileValid } from './agent-validator.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import { getAgentAction } from './agent-utils.js';
import { getClaudeCLIPath, getCLIModelForAgent, parseToolsFromFrontmatter } from './cli-utils.js';
import {
  summarizeCliError,
  emitTokenUsage,
} from '../../../services/framework/debug-store/index.js';
import { beginAttemptRecorder } from './attempt-recorder.js';
import { getExcludedDirectories } from '../prompt-loader.js';
import {
  buildClaudeAllowReadRules,
  buildClaudeDenyRules,
  renderDenyRulesPlaceholderValue,
} from '../../../services/framework/permissions/excluded-paths.js';
import { locateClaudeTranscript } from '../../../services/framework/transcripts/capture.js';
import { extractUsageFromClaudeJsonl, rollupToCacheHit } from './usage-extractor.js';

const activeProcesses: Set<ChildProcess> = new Set();
const activeInvocations: Map<number, (reason: Error) => void> = new Map();
let invocationCounter = 0;
let isAborting = false;

/**
 * Translate the unified `reasoningEffort` vocabulary used in
 * `model-config.json` into the Claude CLI's `--effort` flag values.
 *
 * Unified vocabulary (shared with the OpenAI/Codex tier):
 *   `minimal` | `low` | `medium` | `high` | `xhigh`
 *
 * Claude CLI `--effort` accepts: `low | medium | high | xhigh | max`.
 *
 * Mapping:
 *   - `minimal` → `low` (Claude has no `minimal`; floor to its lowest)
 *   - everything else passes through unchanged
 *   - `undefined` / unknown → `null` (no flag emitted; CLI default applies)
 *
 * The Codex adapter does the equivalent pass-through in
 * `codex-cli-utils.ts::getCodexReasoningEffortForAgent`. Keeping both
 * adapters thin and provider-vocabulary-aware lets `model-config.json` use
 * one effort vocabulary across every tier and agent.
 */
function effortToClaudeFlag(
  effort: string | undefined,
): 'low' | 'medium' | 'high' | 'xhigh' | null {
  if (!effort) return null;
  if (effort === 'minimal') return 'low';
  if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh') {
    return effort;
  }
  return null;
}

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

  for (const [, reject] of activeInvocations) {
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
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  activeProcesses.clear();
}

/**
 * Create agent using Claude CLI (subscription mode)
 */
export async function createCLIAgentImpl(
  config: AgentConfig,
  _claudeCLIVersion: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);

  const claudeCLI = getClaudeCLIPath(config.frameworkPath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      const { randomUUID } = await import('crypto');
      const sessionId = config.resumeSessionId || randomUUID();
      const isRetry = !!config.resumeSessionId;
      const attemptNumber = input.attemptNumber ?? 1;

      const action = getAgentAction(config.agentName);
      const sessionInfo = isRetry ? `resume:${sessionId}` : sessionId;
      const authInfo = `Auth: Subscription, Provider: anthropic, Model: ${modelInfo.alias}, Cli: claude, CliVersion: v${claudeCLI.version}, Session: ${sessionInfo}`;

      const trackerId = config.trackerId ?? config.agentName;
      const trackerDisplayName = config.trackerDisplayName ?? config.agentName;

      logger.trackConcurrentAgentStart(trackerId, trackerDisplayName, `${action} (${authInfo})`);

      const startTime = Date.now();

      try {
        const { output, sessionId: returnedSessionId } = await invokeCLI(config, {
          inputPrompt: input.inputPrompt,
          sessionId,
          isRetry,
          attemptNumber,
          model: getCLIModelForAgent(config.agentName, config.frameworkPath),
        });

        const executionTimeMs = Date.now() - startTime;

        logger.trackConcurrentAgentSucceed(
          trackerId,
          `Completed in ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        return {
          output,
          sessionId: returnedSessionId,
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
 * Invoke Claude CLI with input prompt.
 */
async function invokeCLI(
  config: AgentConfig,
  run: {
    inputPrompt: string;
    sessionId: string;
    isRetry: boolean;
    attemptNumber: number;
    model: string;
  },
): Promise<{ output: string; sessionId: string }> {
  if (isAborting) {
    throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  }
  const timeout = config.timeout ?? 300000;

  const recorder = beginAttemptRecorder({
    agentName: config.agentName,
    sessionId: run.sessionId,
    attemptNumber: run.attemptNumber,
    phase: config.phase,
    provider: 'claude',
    cli: 'claude',
    model: run.model,
    projectPath: config.projectPath,
  });

  return new Promise<{ output: string; sessionId: string }>((resolve, reject) => {
    const invocationId = invocationCounter++;
    activeInvocations.set(invocationId, reject);

    (async () => {
      const sessionTempDir = await mkdtemp(path.join(os.tmpdir(), 'framework-claude-'));
      const promptFile = path.join(sessionTempDir, 'prompt.txt');

      try {
        await writeFile(promptFile, run.inputPrompt, 'utf-8');
      } catch (err) {
        activeInvocations.delete(invocationId);
        await rm(sessionTempDir, { recursive: true, force: true }).catch(() => undefined);
        reject(new Error(`Failed to write prompt file: ${err}`));
        return;
      }

      await recorder.writePromptInput(run.inputPrompt);
      await recorder.snapshotAgentFile(config.agentFilePath);

      let timeoutId: ReturnType<typeof setTimeout>;
      let claudeProcess: ChildProcess;

      const cleanup = () => {
        activeInvocations.delete(invocationId);
        clearTimeout(timeoutId);
      };

      const removeScratchDir = async () => {
        await rm(sessionTempDir, { recursive: true, force: true }).catch(() => undefined);
      };

      const promptFd = await new Promise<number>((res, rej) => {
        fs.open(promptFile, 'r', (err, fd) => {
          if (err) rej(err);
          else res(fd);
        });
      });

      assertAgentFileValid(config.agentFilePath);

      const agentContent = fs.readFileSync(config.agentFilePath, 'utf-8');
      const toolsRestriction = parseToolsFromFrontmatter(agentContent);

      const claudeCLI = getClaudeCLIPath(config.frameworkPath);

      const cliArgs = ['--agent', config.agentFilePath, '--model', run.model];

      /*
       * Per-agent `reasoningEffort` from `model-config.json` (the same
       * mechanism the Codex adapter uses for `model_reasoning_effort`).
       * `effortToClaudeFlag` clamps the unified vocabulary onto the values
       * Claude CLI's `--effort` flag accepts. When the model-config has no
       * effort entry for this agent, no flag is emitted and the CLI default
       * applies.
       */
      const effort = effortToClaudeFlag(getLLMFactory().getReasoningEffort(config.agentName));
      if (effort) cliArgs.push('--effort', effort);

      if (toolsRestriction) {
        const entries = toolsRestriction
          .split(',')
          .map((tool) => tool.trim())
          .filter((tool) => tool.length > 0);
        const builtIns = entries.filter((tool) => !tool.startsWith('mcp__'));
        if (builtIns.length > 0) {
          cliArgs.push('--tools', builtIns.join(','));
        }
        cliArgs.push('--allowedTools', entries.join(','));
      } else {
        cliArgs.push('--dangerously-skip-permissions');
      }

      cliArgs.push(
        ...(run.isRetry ? ['--resume', run.sessionId] : ['--session-id', run.sessionId]),
      );

      if (config.settingsPath) {
        try {
          const originalSettings = fs.readFileSync(config.settingsPath, 'utf-8');
          const denyRules = buildClaudeDenyRules(
            config.projectPath,
            config.frameworkPath,
            config.excludedDirsOverride,
          );
          const denyRulesPlaceholderValue = renderDenyRulesPlaceholderValue(denyRules);
          const allowReadRules = buildClaudeAllowReadRules(config.allowReadPaths ?? []);
          const allowReadPlaceholderValue = renderDenyRulesPlaceholderValue(allowReadRules);
          const resolvedSettings = originalSettings
            .replace(/\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g, config.frameworkPath)
            .replace(/"\$\{FRAMEWORK_EXCLUDED_DENY_RULES\}"/g, denyRulesPlaceholderValue)
            .replace(/"\$\{FRAMEWORK_AGENT_READ_ALLOW\}"/g, allowReadPlaceholderValue);

          const tempSettingsFile = path.join(sessionTempDir, 'settings-resolved.json');
          fs.writeFileSync(tempSettingsFile, resolvedSettings, 'utf-8');
          await recorder.writeSettings(resolvedSettings);
          cliArgs.push('--settings', tempSettingsFile);

          const mcpConfigSource = path.join(path.dirname(config.settingsPath), 'mcp.json');
          if (fs.existsSync(mcpConfigSource)) {
            const originalMcp = fs.readFileSync(mcpConfigSource, 'utf-8');
            const resolvedMcp = originalMcp.replace(
              /\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g,
              config.frameworkPath,
            );
            const tempMcpConfigFile = path.join(sessionTempDir, 'mcp-config.json');
            fs.writeFileSync(tempMcpConfigFile, resolvedMcp, 'utf-8');
            cliArgs.push('--mcp-config', tempMcpConfigFile);
          }
        } catch (error) {
          console.warn(
            `Warning: Failed to process settings file ${config.settingsPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      /*
       * The PreToolUse path-restriction hook always sees the full project
       * default excluded-dirs list, even when `config.excludedDirsOverride`
       * trimmed entries from the Claude permissions.deny rules generated
       * above. Combined with `FRAMEWORK_ALLOW_READ_PATHS`, the hook keeps
       * blocking every file under the trimmed dirs except those explicitly
       * allowed.
       *
       * Why the split: Claude CLI evaluates `deny` before `allow`, so a
       * coarse `Read(./.claude-temp/**)` deny entry defeats an exact-path
       * `Read(/abs/.../project-inspection.json)` allow entry. Stripping the
       * provider temp dirs from the deny rules is the only way to make the
       * allow-list effective; the hook restores broader enforcement.
       */
      const hookEnforceExcludedDirs = getExcludedDirectories(
        config.projectPath,
        config.frameworkPath,
      );

      const allowReadPathsEnv = JSON.stringify([...(config.allowReadPaths ?? [])]);

      claudeProcess = spawn(claudeCLI.path, cliArgs, {
        cwd: config.projectPath,
        env: {
          ...process.env,
          ...(config.extraEnv ?? {}),
          CLAUDE_SKIP_CONFIRMATIONS: '1',
          FRAMEWORK_PATH: config.frameworkPath,
          FRAMEWORK_PROJECT_PATH: config.projectPath,
          FRAMEWORK_EXCLUDED_DIRS: JSON.stringify(hookEnforceExcludedDirs),
          FRAMEWORK_ALLOW_READ_PATHS: allowReadPathsEnv,
          FRAMEWORK_ENFORCE: '1',
        },
        stdio: [promptFd, 'pipe', 'pipe'],
        detached: false,
      });

      activeProcesses.add(claudeProcess);

      timeoutId = setTimeout(async () => {
        cleanup();
        claudeProcess.kill('SIGTERM');
        await recorder
          .writeErrorSummary(`Claude CLI timeout after ${timeout}ms`)
          .catch(() => undefined);
        await recorder.finalize('failure', { failureReason: 'timeout' });
        await removeScratchDir();
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
        cleanup();

        const { close } = await import('fs');
        close(promptFd, () => {});

        await recorder.writeStdout(stdout);
        await recorder.writeStderr(stderr);

        if (code === 0) {
          await recorder.writeOutput(stdout);
          await recorder.mergeMeta({ code, failureReason: undefined });
          await recorder.captureTranscript({ outcome: 'success' });
          await recorder.finalize('success', { code });
          await removeScratchDir();
          const usage = await readClaudeUsage(config.projectPath, run.sessionId);
          emitTokenUsage(config.projectPath, {
            ts: new Date().toISOString(),
            phase: config.phase?.phaseId ?? 'phase-unknown',
            agent: config.agentName,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cache_hit: rollupToCacheHit(usage),
            cache_read_input_tokens: usage.cacheReadInputTokens,
            cache_creation_input_tokens: usage.cacheCreationInputTokens,
            duration_ms: Date.now() - recorder.startedAtMs,
            budget_key: config.budgetKey,
          }).catch(() => undefined);
          resolve({ output: stdout, sessionId: run.sessionId });
          return;
        }

        const isRateLimit =
          stdout.includes('Limit reached') ||
          stdout.includes('resets') ||
          stdout.includes('/upgrade to Max');

        const summary = summarizeCliError(stdout, stderr);
        let errorMessage: string;

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
        } else {
          errorMessage = `Claude CLI exited with code ${code}: ${summary}`;
        }

        await recorder.writeErrorSummary(errorMessage);
        await recorder.mergeMeta({ code, rateLimit: isRateLimit });
        await recorder.captureTranscript({ outcome: 'failure' });
        await recorder.finalize('failure', { code, rateLimit: isRateLimit });
        await removeScratchDir();
        emitTokenUsage(config.projectPath, {
          ts: new Date().toISOString(),
          phase: config.phase?.phaseId ?? 'phase-unknown',
          agent: config.agentName,
          input_tokens: -1,
          output_tokens: -1,
          cache_hit: false,
          duration_ms: Date.now() - recorder.startedAtMs,
          budget_key: config.budgetKey,
        }).catch(() => undefined);

        reject(new Error(errorMessage));
      });

      claudeProcess.on('error', async (error) => {
        cleanup();
        await recorder.writeErrorSummary(`Failed to spawn Claude CLI: ${error.message}`);
        await recorder.finalize('failure', { failureReason: 'spawn-error' });
        await removeScratchDir();
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });
    })().catch((err) => reject(err as Error));
  });
}

/**
 * Best-effort read of the Claude JSONL transcript and rollup of token usage / cache reads.
 * Returns the unknown-marker shape on any failure.
 */
async function readClaudeUsage(
  projectPath: string,
  sessionId: string,
): Promise<{
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}> {
  try {
    const transcriptPath = await locateClaudeTranscript(projectPath, sessionId, {
      timeoutMs: 1000,
    });
    if (!transcriptPath) {
      return {
        inputTokens: -1,
        outputTokens: -1,
        cacheReadInputTokens: -1,
        cacheCreationInputTokens: -1,
      };
    }
    const jsonl = await readFile(transcriptPath, 'utf-8');
    return extractUsageFromClaudeJsonl(jsonl);
  } catch {
    return {
      inputTokens: -1,
      outputTokens: -1,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
    };
  }
}
