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
  buildClaudeDenyRules,
  renderDenyRulesPlaceholderValue,
} from '../../../services/framework/permissions/excluded-paths.js';
import { locateClaudeTranscript } from '../../../services/framework/transcripts/capture.js';
import { extractUsageFromClaudeJsonl, rollupToCacheHit } from './usage-extractor.js';

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
      // Transient scratch dir for the subprocess — holds the prompt file that
      // Claude CLI reads via stdin and (optionally) the resolved settings
      // file passed via `--settings`. We deliberately keep this OUT of the
      // project's `.<provider>-temp/` tree: every debug artifact lives under
      // `debug/runs/<runId>/…` (via the DebugStore). Cleaned up after exit.
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

      if (toolsRestriction) {
        // Split frontmatter list into built-in tools vs MCP permission patterns.
        // --tools gates built-ins; --allowedTools auto-approves MCP permission names.
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
          // First substitution: ${FRAMEWORK_PATH} → absolute framework root.
          // Second substitution: "${FRAMEWORK_EXCLUDED_DENY_RULES}" → expanded
          // list of Claude Code `permissions.deny` rules covering every
          // excluded directory for this project. The placeholder is a single
          // quoted entry inside a JSON array, replaced with N comma-separated
          // quoted entries — see services/framework/permissions/excluded-paths.ts
          // for the rationale and the load-bearing official-docs quote that
          // guarantees these rules filter Glob/Grep results.
          // Plan v4 Phase A.1 (2026-05-09) — when the caller supplies an
          // `excludedDirsOverride` (Phase 3's synthesizer drops `.claude-temp`
          // and `.codex-temp` from its exclusion list so it can read the
          // composer views), the override MUST flow through to the deny-rules
          // builder too. Claude CLI 2.1.x evaluates deny rules BEFORE allow
          // rules regardless of specificity, so even an explicit
          // `Read(./.claude-temp/initialize-project/composer-views/**)` allow
          // is shadowed by the broader `Read(./.claude-temp/**)` deny. The
          // archive (archive/v3-iteration-100, run 2026-05-08T23-30-20) shows
          // the synthesizer's reads being silently denied for ~ 5 minutes
          // before it gave up and emitted a stub. Threading the override here
          // is the single load-bearing fix.
          const denyRules = buildClaudeDenyRules(
            config.projectPath,
            config.frameworkPath,
            config.excludedDirsOverride,
          );
          const denyRulesPlaceholderValue = renderDenyRulesPlaceholderValue(denyRules);
          const resolvedSettings = originalSettings
            .replace(/\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g, config.frameworkPath)
            .replace(/"\$\{FRAMEWORK_EXCLUDED_DENY_RULES\}"/g, denyRulesPlaceholderValue);

          const tempSettingsFile = path.join(sessionTempDir, 'settings-resolved.json');
          fs.writeFileSync(tempSettingsFile, resolvedSettings, 'utf-8');
          await recorder.writeSettings(resolvedSettings);
          cliArgs.push('--settings', tempSettingsFile);

          // Claude CLI settings do not carry MCP server definitions; if an
          // mcp.json sits next to settings.json, resolve and pass it explicitly.
          //
          // Codex parity note: the Codex CLI does NOT take a per-session MCP
          // config flag. Codex auto-discovers `<cwd>/.codex/config.toml` (and
          // `~/.codex/config.toml`) on session start. The framework writes the
          // project-level `.codex/config.toml` in Phase 0 (graph-foundation)
          // via upsertCodeGraphMcpConfig so Codex Phase 1 analyzers find the
          // `code_graph` MCP server too. See codex-cli-agent-impl.ts for the
          // Codex spawn (no --mcp-config flag is needed there).
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

      // Pass project boundary + excluded dirs so the PreToolUse hook
      // (`restrict-agent-paths.hook.ts`) can hard-block tool calls that leave
      // the project or enter excluded dirs — which prompt-only guidance
      // doesn't reliably enforce.
      //
      // Plan v4 Phase A.1 (2026-05-09) — `excludedDirsOverride` (when set)
      // takes precedence over the project default. The Phase 3 synthesizer
      // uses this to drop `.claude-temp` and `.codex-temp` from the
      // exclusion list so it can read composer views + the consolidation.
      // The override flows to BOTH the hook env var (here) AND the deny
      // rules (above) — keep them aligned or the synthesizer's reads
      // will pass one layer and fail the other.
      const excludedDirs =
        config.excludedDirsOverride ??
        getExcludedDirectories(config.projectPath, config.frameworkPath);

      claudeProcess = spawn(claudeCLI.path, cliArgs, {
        cwd: config.projectPath,
        env: {
          ...process.env,
          CLAUDE_SKIP_CONFIRMATIONS: '1',
          // ────────────────────────────────────────────────────────────────────
          // ONLY ALLOWED ENV-INJECTION POINT for FRAMEWORK_PATH/FRAMEWORK_PROJECT_PATH.
          // The bash MCP launcher inside the spawned subprocess uses
          // `${FRAMEWORK_PATH}` substitution in mcp.json; the PreToolUse path-
          // restriction hook reads FRAMEWORK_PROJECT_PATH. The orchestration's
          // own code never reads these env vars — it uses paths.service instead.
          // Do NOT add new framework-internal call sites that read these env vars.
          // ────────────────────────────────────────────────────────────────────
          FRAMEWORK_PATH: config.frameworkPath,
          FRAMEWORK_PROJECT_PATH: config.projectPath,
          FRAMEWORK_EXCLUDED_DIRS: JSON.stringify(excludedDirs),
          // FRAMEWORK_ENFORCE=1 tells the PreToolUse hook that path exclusion
          // is mandatory for this invocation — any internal hook error must
          // fail closed (block), not fall back to allow. Unset in ad-hoc CLI
          // usage outside our spawn, where the hook silently no-ops.
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
          // Plan §E, commit C (2026-05-05) — extract real cache hit /
          // token usage from the JSONL transcript Claude CLI wrote at
          // `~/.claude/projects/<slug>/<sessionId>.jsonl`. Before this
          // commit `cache_hit` was hardcoded `false`, so the run-stats
          // sidebar always showed 0% cache hit rate even when caching
          // was working. Best-effort: any IO/parse failure falls back
          // to the prior unknown-marker shape (`-1` tokens,
          // `cache_hit: false`).
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
 * Plan §E, commit C (2026-05-05) — best-effort read of the Claude
 * JSONL transcript and rollup of token usage / cache reads. Returns the
 * unknown-marker shape on any failure so the surrounding `emitTokenUsage`
 * call still succeeds with the same fallback values it used before this
 * commit.
 *
 * Why we re-locate the transcript here instead of plumbing it through
 * the recorder: the recorder handles transcript capture for HTML
 * rendering and meta tracking; usage rollup is a separate concern that
 * happens in parallel, and decoupling them keeps the recorder API
 * narrow. Locator + parser are both pure / cheap, so the small bit of
 * duplicated IO is fine.
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
