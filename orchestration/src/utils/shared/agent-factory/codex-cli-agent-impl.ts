import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises';
import { z } from 'zod';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import type { ValidationResult } from '../../validator.js';
import { getAgentAction } from './agent-utils.js';
import {
  getCodexCLIPath,
  getCodexCLIModelForAgent,
  getCodexReasoningEffortForAgent,
} from './codex-cli-utils.js';
import { getSchemaForAgent } from '../../../schemas/phase1-agent-outputs.schema.js';
import {
  summarizeCliError,
  emitTokenUsage,
} from '../../../services/framework/debug-store/index.js';
import { beginAttemptRecorder, type AttemptRecorder } from './attempt-recorder.js';
import { getExcludedDirectories } from '../prompt-loader.js';
import { extractGraphToolUsesFromCodexJsonl } from '../../../nodes/initialize-project/phase1/shared/graph-tool-uses-extractor.js';
import { codexSidecarDir } from '../../../nodes/initialize-project/phase1/shared/graph-tool-usage.js';
import { locateCodexRollout } from '../../../services/framework/transcripts/capture.js';
import { extractUsageFromCodexJsonl, rollupToCacheHit } from './usage-extractor.js';

const activeCodexProcesses: Set<ChildProcess> = new Set();
const activeCodexInvocations: Map<number, (reason: Error) => void> = new Map();
let codexInvocationCounter = 0;
let isCodexAborting = false;

export function abortAllCodexInvocations() {
  if (activeCodexInvocations.size === 0) return;
  isCodexAborting = true;
  const abortError = new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  console.log(`\n⚠️  Aborting ${activeCodexInvocations.size} active Codex invocation(s)...`);
  for (const [, reject] of activeCodexInvocations) reject(abortError);
  activeCodexInvocations.clear();
}

export function killAllActiveCodexProcesses() {
  if (activeCodexProcesses.size === 0) return;
  console.log(`\n⚠️  Killing ${activeCodexProcesses.size} active Codex CLI process(es)...`);
  for (const proc of activeCodexProcesses) {
    try {
      if (proc.pid && !proc.killed) proc.kill('SIGKILL');
    } catch {
      continue;
    }
  }
  activeCodexProcesses.clear();
}

/**
 * Transform a JSON Schema to be compatible with OpenAI Structured Outputs.
 */
export function transformSchemaForStructuredOutputs(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  transformObjectRecursive(result);
  return result;
}

function transformObjectRecursive(node: Record<string, unknown>): void {
  if (!node || typeof node !== 'object') return;
  const unsupportedKeywords = [
    'minItems',
    'maxItems',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'pattern',
    'format',
    'propertyNames',
  ];
  for (const keyword of unsupportedKeywords) delete node[keyword];
  delete node['$schema'];

  if (node['type'] === 'object') {
    const properties = node['properties'] as Record<string, Record<string, unknown>> | undefined;
    const additional = node['additionalProperties'];

    if (properties) {
      for (const [propName, propSchema] of Object.entries(properties)) {
        if (isNeverJsonSchema(propSchema)) {
          delete properties[propName];
        }
      }

      const currentRequired = ((node['required'] as string[]) || []).filter(
        (propName) => propName in properties,
      );
      const allPropertyNames = Object.keys(properties);
      node['additionalProperties'] = false;
      for (const propName of allPropertyNames) {
        if (!currentRequired.includes(propName)) {
          const propSchema = properties[propName];
          if (propSchema && !isAlreadyNullable(propSchema)) {
            properties[propName] = { anyOf: [propSchema, { type: 'null' }] };
          }
        }
      }
      node['required'] = allPropertyNames;
    } else if (additional && typeof additional === 'object' && !Array.isArray(additional)) {
      const valueSchema = additional as Record<string, unknown>;
      if (Object.keys(valueSchema).length === 0) {
        node['additionalProperties'] = false;
      } else {
        transformObjectRecursive(valueSchema);
      }
    } else {
      node['additionalProperties'] = false;
    }
  } else if ('additionalProperties' in node) {
    delete node['additionalProperties'];
  }

  if (node['properties']) {
    const properties = node['properties'] as Record<string, Record<string, unknown>>;
    for (const prop of Object.values(properties)) {
      if (prop && typeof prop === 'object') transformObjectRecursive(prop);
    }
  }
  if (node['items'] && typeof node['items'] === 'object') {
    transformObjectRecursive(node['items'] as Record<string, unknown>);
  }
  if (Array.isArray(node['anyOf'])) {
    for (const subSchema of node['anyOf']) {
      if (subSchema && typeof subSchema === 'object')
        transformObjectRecursive(subSchema as Record<string, unknown>);
    }
  }
  if (Array.isArray(node['oneOf'])) {
    for (const subSchema of node['oneOf']) {
      if (subSchema && typeof subSchema === 'object')
        transformObjectRecursive(subSchema as Record<string, unknown>);
    }
  }
}

function isNeverJsonSchema(schema: Record<string, unknown>): boolean {
  const notSchema = schema['not'];
  return (
    notSchema !== null &&
    typeof notSchema === 'object' &&
    !Array.isArray(notSchema) &&
    Object.keys(notSchema as Record<string, unknown>).length === 0
  );
}

function isAlreadyNullable(schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema['anyOf'])) {
    return schema['anyOf'].some(
      (s: Record<string, unknown>) => s && typeof s === 'object' && s['type'] === 'null',
    );
  }
  return false;
}

async function generateOutputSchema(
  agentName: string,
  tempDir: string,
): Promise<{ path: string; schema: unknown } | null> {
  const zodSchema = getSchemaForAgent(agentName);
  if (!zodSchema) return null;
  try {
    const rawJsonSchema = z.toJSONSchema(zodSchema, {
      target: 'draft-7',
      io: 'input',
      unrepresentable: 'any',
    });
    const jsonSchema = transformSchemaForStructuredOutputs(
      rawJsonSchema as Record<string, unknown>,
    );
    const schemaPath = path.join(tempDir, 'output-schema.json');
    await writeFile(schemaPath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
    return { path: schemaPath, schema: jsonSchema };
  } catch (error) {
    logger.warn(
      `Warning: Failed to generate JSON Schema for ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export function normalizeCodexReasoningEffort(effort: string | undefined): string | undefined {
  // Codex CLI may attach native web_search tools to exec requests. The OpenAI
  // API rejects web_search when reasoning.effort is "minimal", so floor Codex
  // invocations to "low". Claude has its own adapter and mapping.
  if (effort === 'minimal') return 'low';
  return effort;
}

export async function createCodexCLIAgentImpl(
  config: AgentConfig,
  _codexCLIVersion: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);
  const codexCLI = getCodexCLIPath(config.frameworkPath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      const { randomUUID } = await import('crypto');
      const sessionId = config.resumeSessionId || randomUUID();
      const isRetry = !!config.resumeSessionId;
      const attemptNumber = input.attemptNumber ?? 1;

      const trackerId = config.trackerId ?? config.agentName;
      const trackerDisplayName = config.trackerDisplayName ?? config.agentName;
      const action = getAgentAction(config.agentName);
      const sessionInfo = isRetry ? `resume:${sessionId}` : sessionId;
      const authInfo = `Auth: Subscription, Provider: openai, Model: ${modelInfo.alias}, Cli: codex, CliVersion: v${codexCLI.version}, Session: ${sessionInfo}`;

      logger.trackConcurrentAgentStart(trackerId, trackerDisplayName, `${action} (${authInfo})`);

      const startTime = Date.now();

      try {
        const { output, codexSessionId } = await invokeCodexCLI(config, {
          inputPrompt: input.inputPrompt,
          sessionId,
          attemptNumber,
        });

        const executionTimeMs = Date.now() - startTime;
        logger.trackConcurrentAgentSucceed(
          trackerId,
          `Completed in ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        const usage = await readCodexUsage(codexSessionId);
        emitTokenUsage(config.projectPath, {
          ts: new Date().toISOString(),
          phase: config.phase?.phaseId ?? 'phase-unknown',
          agent: config.agentName,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_hit: rollupToCacheHit(usage),
          cache_read_input_tokens: usage.cacheReadInputTokens,
          cache_creation_input_tokens: usage.cacheCreationInputTokens,
          duration_ms: executionTimeMs,
          budget_key: config.budgetKey,
        }).catch(() => undefined);

        return { output, sessionId, mode: AuthMode.CODEX_CLI, executionTimeMs };
      } catch (error: unknown) {
        const executionTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.trackConcurrentAgentFail(
          trackerId,
          `Failed after ${(executionTimeMs / 1000).toFixed(1)}s`,
        );

        emitTokenUsage(config.projectPath, {
          ts: new Date().toISOString(),
          phase: config.phase?.phaseId ?? 'phase-unknown',
          agent: config.agentName,
          input_tokens: -1,
          output_tokens: -1,
          cache_hit: false,
          duration_ms: executionTimeMs,
          budget_key: config.budgetKey,
        }).catch(() => undefined);

        throw new Error(`Codex CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`);
      }
    },
    getInfo: () => ({ agentName: config.agentName, mode: AuthMode.CODEX_CLI }),
  };
}

async function invokeCodexCLI(
  config: AgentConfig,
  run: {
    inputPrompt: string;
    sessionId: string;
    attemptNumber: number;
  },
): Promise<{ output: string; sessionId: string; codexSessionId: string | null }> {
  if (isCodexAborting) throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');

  const timeout = config.timeout ?? 300000;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'framework-codex-'));
  const removeScratchDir = async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  };

  const agentContent = fs.readFileSync(config.agentFilePath, 'utf-8');
  const agentBody = agentContent.replace(/^---[\s\S]*?---\n?/, '');

  const fullPrompt = `${run.inputPrompt}\n\n---\n\n${agentBody}`;

  const codexCLI = getCodexCLIPath(config.frameworkPath);
  const model = getCodexCLIModelForAgent(config.agentName, config.frameworkPath);
  const reasoningEffort = normalizeCodexReasoningEffort(
    getCodexReasoningEffortForAgent(config.agentName, config.frameworkPath),
  );

  const recorder = beginAttemptRecorder({
    agentName: config.agentName,
    sessionId: run.sessionId,
    attemptNumber: run.attemptNumber,
    phase: config.phase,
    provider: 'codex',
    cli: 'codex',
    model,
    projectPath: config.projectPath,
  });

  await recorder.writePromptInput(run.inputPrompt);
  await recorder.writePromptResolved(fullPrompt);
  await recorder.snapshotAgentFile(config.agentFilePath);

  const baseCliArgs: string[] = [
    '--model',
    model,
    '--full-auto',
    '--skip-git-repo-check',
    '--json',
  ];
  if (reasoningEffort) {
    baseCliArgs.push('-c', `model_reasoning_effort="${reasoningEffort}"`);
  }

  const initialOnlyArgs: string[] = [];
  const schema = await generateOutputSchema(config.agentName, tempDir);
  if (schema) {
    initialOnlyArgs.push('--output-schema', schema.path);
    await recorder.writeOutputSchema(schema.schema as object);
  }

  const first = await runCodex({
    codexPath: codexCLI.path,
    cliArgs: ['exec', '-', ...baseCliArgs, ...initialOnlyArgs],
    prompt: fullPrompt,
    tempDir,
    cwd: config.projectPath,
    frameworkPath: config.frameworkPath,
    timeout,
    iteration: 0,
    extraEnv: config.extraEnv,
    allowReadPaths: config.allowReadPaths,
  });

  if (first.code !== 0) {
    await finalizeCodexFailure(recorder, first, run.sessionId);
    await removeScratchDir();
    throw new Error(buildFailureMessage(first));
  }

  let output = first.output;
  let codexSessionId = first.codexSessionId;

  await recorder.writeStdout(first.stdout);
  await recorder.writeStderr(first.stderr);

  if (!config.validator) {
    await recorder.writeOutput(output);
    await recorder.mergeMeta({ code: first.code, internalIterations: 0 });
    await recorder.captureTranscript({
      outcome: 'success',
      codexSessionIdOverride: codexSessionId ?? undefined,
    });
    await writeCodexGraphToolUsesSidecar(
      config.projectPath,
      run.sessionId,
      codexSessionId ?? null,
      first.stdout,
    );
    await recorder.finalize('success', { code: first.code });
    await removeScratchDir();
    return { output, sessionId: run.sessionId, codexSessionId };
  }

  let validation = config.validator(output);
  let iteration = 0;
  const maxInternal = config.maxInternalIterations ?? 5;
  let lastStdout = first.stdout;
  let lastStderr = first.stderr;

  while (!validation.valid && iteration < maxInternal) {
    iteration++;
    if (!codexSessionId) {
      logger.warn(
        `[${config.agentName}] internal validation failed but no Codex session id was captured from --json events; deferring to external retry`,
      );
      break;
    }
    logger.warn(
      `[${config.agentName}] internal validation failed (iter ${iteration}/${maxInternal}) — resuming session ${codexSessionId}`,
    );
    const feedbackPrompt = buildInternalValidationFeedback(
      validation.errors,
      iteration,
      maxInternal,
    );
    const resumeRun = await runCodex({
      codexPath: codexCLI.path,
      cliArgs: ['exec', 'resume', codexSessionId, '-', ...baseCliArgs],
      prompt: feedbackPrompt,
      tempDir,
      cwd: config.projectPath,
      frameworkPath: config.frameworkPath,
      timeout,
      iteration,
      extraEnv: config.extraEnv,
      allowReadPaths: config.allowReadPaths,
    });
    if (resumeRun.code !== 0) {
      await finalizeCodexFailure(recorder, resumeRun, run.sessionId, feedbackPrompt);
      await removeScratchDir();
      throw new Error(buildFailureMessage(resumeRun));
    }
    output = resumeRun.output;
    lastStdout = resumeRun.stdout;
    lastStderr = resumeRun.stderr;
    if (resumeRun.codexSessionId) codexSessionId = resumeRun.codexSessionId;
    validation = config.validator(output);
  }

  await recorder.writeStdout(lastStdout);
  await recorder.writeStderr(lastStderr);
  await recorder.writeOutput(output);

  if (validation.valid) {
    if (iteration > 0) {
      logger.success(
        `[${config.agentName}] internal validation passed after ${iteration} in-session correction(s)`,
      );
    }
    await recorder.mergeMeta({ code: 0, internalIterations: iteration });
    await recorder.captureTranscript({
      outcome: 'success',
      codexSessionIdOverride: codexSessionId ?? undefined,
    });
    await writeCodexGraphToolUsesSidecar(
      config.projectPath,
      run.sessionId,
      codexSessionId ?? null,
      lastStdout,
    );
    await recorder.finalize('success', { code: 0 });
    await removeScratchDir();
    return { output, sessionId: run.sessionId, codexSessionId };
  }

  logger.warn(
    `[${config.agentName}] internal validation exhausted after ${iteration} iteration(s); falling through to external retry`,
  );
  await recorder.mergeMeta({
    code: 0,
    internalIterations: iteration,
    internalValidationExhausted: true,
  });
  await recorder.writeValidationErrors(validation.errors);
  await recorder.captureTranscript({
    outcome: 'success',
    codexSessionIdOverride: codexSessionId ?? undefined,
  });
  await writeCodexGraphToolUsesSidecar(
    config.projectPath,
    run.sessionId,
    codexSessionId ?? null,
    lastStdout,
  );
  await recorder.finalize('success', { code: 0, failureReason: 'internal-validation-exhausted' });
  await removeScratchDir();
  return { output, sessionId: run.sessionId, codexSessionId };
}

/**
 * Codex equivalent of Claude's Stop hook sidecar writer. Attempts to locate the
 * rollout JSONL in ~/.codex/sessions first; falls back to the captured stdout
 * (which carries the same JSONL stream) because `codex exec` mode does not write
 * rollout files to disk.
 * Best-effort: a missing sidecar causes the analyzer to return empty telemetry.
 */
async function writeCodexGraphToolUsesSidecar(
  projectPath: string,
  frameworkSessionId: string,
  codexSessionId: string | null,
  stdoutFallback?: string,
): Promise<void> {
  let jsonl: string | null = null;

  if (codexSessionId) {
    try {
      const rolloutPath = await locateCodexRollout(codexSessionId, { timeoutMs: 3000 });
      if (rolloutPath) {
        jsonl = await readFile(rolloutPath, 'utf-8');
      }
    } catch {
      // fall through to stdout fallback
    }
  }

  if (!jsonl && stdoutFallback) {
    jsonl = stdoutFallback;
  }

  if (!jsonl) {
    logger.warn(
      `[graph-tool-uses] No JSONL source for session ${frameworkSessionId} — analyzer will see empty graph telemetry`,
    );
    return;
  }

  try {
    const sidecar = extractGraphToolUsesFromCodexJsonl(jsonl);
    const dir = codexSidecarDir(projectPath);
    await mkdir(dir, { recursive: true });
    const out = path.join(dir, `${frameworkSessionId}.graph-tool-uses.json`);
    await writeFile(out, JSON.stringify(sidecar, null, 2), 'utf-8');
  } catch (err) {
    logger.warn(
      `[graph-tool-uses] Failed to write Codex sidecar for session ${frameworkSessionId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function finalizeCodexFailure(
  recorder: AttemptRecorder,
  run: { code: number | null; stdout: string; stderr: string },
  sessionIdForTranscript: string,
  feedbackPrompt?: string,
): Promise<void> {
  const isRateLimit =
    run.stderr.includes('429') ||
    run.stdout.includes('rate limit') ||
    run.stdout.includes('capacity');
  const message = buildFailureMessage(run);

  await recorder.writeStdout(run.stdout);
  await recorder.writeStderr(run.stderr);
  if (feedbackPrompt) {
    await recorder.writePromptResolved(feedbackPrompt);
  }
  await recorder.writeErrorSummary(message);
  await recorder.mergeMeta({ code: run.code ?? -1, rateLimit: isRateLimit });
  await recorder.captureTranscript({
    outcome: 'failure',
    codexSessionIdOverride: sessionIdForTranscript,
  });
  await recorder.finalize('failure', { code: run.code ?? -1, rateLimit: isRateLimit });
}

function buildInternalValidationFeedback(
  errors: string[],
  iteration: number,
  maxIterations: number,
): string {
  const header = `[Internal validation failed — correction attempt ${iteration}/${maxIterations}]`;
  const body = errors.join('\n');
  return [
    header,
    '',
    'Your previous response did not pass the project-local validator. See errors below.',
    'Fix the issues and re-emit the COMPLETE response — not a diff, not an apology, not meta-commentary.',
    'The output format requirements have not changed; only the content needs correction.',
    '',
    '=== VALIDATION ERRORS ===',
    body,
  ].join('\n');
}

function buildFailureMessage(run: { code: number | null; stdout: string; stderr: string }): string {
  const isRateLimit =
    run.stderr.includes('429') ||
    run.stdout.includes('rate limit') ||
    run.stdout.includes('capacity');

  if (isRateLimit) {
    return (
      `RATE_LIMIT: Codex CLI usage limit reached.\n` +
      `Options:\n` +
      `  1. Wait for the 5-hour rate limit window to reset\n` +
      `  2. Set OPENAI_API_KEY environment variable for API key mode\n` +
      `  3. Upgrade to Pro (5x/20x) for higher limits\n\n` +
      `To switch to API key mode:\n` +
      `  export OPENAI_API_KEY="your-api-key"`
    );
  }
  const summary = summarizeCliError(run.stdout, run.stderr);
  return `Codex CLI exited with code ${run.code}: ${summary}`;
}

/**
 * Spawn one Codex CLI process and await exit. Captures stdout (JSONL events),
 * extracts the session id from the first `session_meta` event, and reads the
 * last-message output from the `-o` file that we wrote into `tempDir`.
 */
function runCodex(params: {
  codexPath: string;
  cliArgs: string[];
  prompt: string;
  tempDir: string;
  cwd: string;
  frameworkPath: string;
  timeout: number;
  iteration: number;
  extraEnv?: Record<string, string>;
  allowReadPaths?: ReadonlyArray<string>;
}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  output: string;
  codexSessionId: string | null;
}> {
  return new Promise((resolve, reject) => {
    const invocationId = codexInvocationCounter++;
    activeCodexInvocations.set(invocationId, reject);

    (async () => {
      const suffix = params.iteration === 0 ? '' : `.iter${params.iteration}`;
      const promptFile = path.join(params.tempDir, `prompt${suffix}.txt`);
      const outputFile = path.join(params.tempDir, `output${suffix}.txt`);
      await writeFile(promptFile, params.prompt, 'utf-8');

      const cliArgs = [...params.cliArgs, '-o', outputFile];

      const promptFd = await new Promise<number>((res, rej) => {
        fs.open(promptFile, 'r', (err, fd) => {
          if (err) rej(err);
          else res(fd);
        });
      });

      let timeoutId: NodeJS.Timeout | undefined;

      /*
       * Codex has no `permissions.deny` analogue, so we always pass the
       * full project default excluded-dirs list straight to the PreToolUse
       * hook (Codex configures the hook via
       * `upsertCodexPathRestrictionHookConfig`). Combined with
       * `FRAMEWORK_ALLOW_READ_PATHS`, the hook still blocks every file
       * under those dirs except the explicit allow-list entries — the
       * surgical exemption mirrors the Claude path even though there's no
       * deny rule to compete with.
       */
      const excludedDirs = getExcludedDirectories(params.cwd, params.frameworkPath);
      const allowReadPathsEnv = JSON.stringify([...(params.allowReadPaths ?? [])]);

      const proc = spawn(params.codexPath, cliArgs, {
        cwd: params.cwd,
        env: {
          ...process.env,
          ...(params.extraEnv ?? {}),
          FRAMEWORK_PATH: params.frameworkPath,
          FRAMEWORK_PROJECT_PATH: params.cwd,
          FRAMEWORK_EXCLUDED_DIRS: JSON.stringify(excludedDirs),
          FRAMEWORK_ALLOW_READ_PATHS: allowReadPathsEnv,
          FRAMEWORK_ENFORCE: '1',
        },
        stdio: [promptFd, 'pipe', 'pipe'],
        detached: false,
      });

      activeCodexProcesses.add(proc);

      const cleanup = () => {
        activeCodexInvocations.delete(invocationId);
        if (timeoutId) clearTimeout(timeoutId);
        fs.close(promptFd, () => {});
      };

      timeoutId = setTimeout(() => {
        cleanup();
        proc.kill('SIGTERM');
        reject(new Error(`Codex CLI timeout after ${params.timeout}ms`));
      }, params.timeout);

      let stdout = '';
      let stderr = '';
      let codexSessionId: string | null = null;

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          if (!codexSessionId) codexSessionId = extractSessionId(chunk) ?? codexSessionId;
        });
      }
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', async (code) => {
        activeCodexProcesses.delete(proc);
        cleanup();

        if (!codexSessionId) codexSessionId = extractSessionId(stdout);

        let output = '';
        if (code === 0) {
          try {
            output = await readFile(outputFile, 'utf-8');
          } catch {
            output = parseCodexJsonOutput(stdout);
          }
        }
        resolve({ code, stdout, stderr, output, codexSessionId });
      });

      proc.on('error', (error) => {
        cleanup();
        activeCodexProcesses.delete(proc);
        reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
      });
    })().catch((err) => reject(err as Error));
  });
}

function extractSessionId(stdoutChunk: string): string | null {
  for (const line of stdoutChunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event?.type === 'session_meta' && typeof event?.payload?.id === 'string') {
        return event.payload.id;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function parseCodexJsonOutput(jsonStream: string): string {
  const lines = jsonStream.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === 'message' && event.content) return event.content;
    } catch {
      continue;
    }
  }
  return jsonStream;
}

/**
 * Best-effort read of the Codex rollout JSONL and rollup of token usage / cache reads.
 * Returns the unknown-marker shape on any failure.
 */
async function readCodexUsage(codexSessionId: string | null): Promise<{
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}> {
  const unknown = {
    inputTokens: -1,
    outputTokens: -1,
    cacheReadInputTokens: -1,
    cacheCreationInputTokens: -1,
  };
  if (!codexSessionId) return unknown;
  try {
    const rolloutPath = await locateCodexRollout(codexSessionId, { timeoutMs: 1000 });
    if (!rolloutPath) return unknown;
    const jsonl = await readFile(rolloutPath, 'utf-8');
    return extractUsageFromCodexJsonl(jsonl);
  } catch {
    return unknown;
  }
}

export type { ValidationResult };
