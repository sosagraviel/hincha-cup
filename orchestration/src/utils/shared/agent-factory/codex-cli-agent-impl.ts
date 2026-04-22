import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
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
import { saveAttemptDiagnostics, summarizeCliError, getAttemptDir } from './diagnostics-store.js';
import { resolveTempPath } from '../../provider-paths.js';

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
 * Transform a JSON Schema to be compatible with OpenAI Structured Outputs.
 *
 * OpenAI Structured Outputs enforces strict requirements:
 * 1. All object properties must be listed in "required"
 * 2. "additionalProperties" must be false (not {} or true)
 * 3. Validation keywords (minItems, maxItems, minLength, maxLength, minimum,
 *    maximum, pattern) are not supported
 * 4. Optional properties must use {"anyOf": [<type>, {"type": "null"}]}
 *
 * Zod's .passthrough() generates "additionalProperties": {} which fails.
 * Zod's .optional() omits the property from "required" which also fails.
 */
function transformSchemaForStructuredOutputs(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  // Deep clone to avoid mutating the original
  const result = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  transformObjectRecursive(result);
  return result;
}

function transformObjectRecursive(node: Record<string, unknown>): void {
  if (!node || typeof node !== 'object') return;

  // Remove keywords the OpenAI Structured Outputs validator rejects.
  // `propertyNames` is emitted by Zod 4 for z.record(z.string(), ...) and is
  // never permitted in strict response_format schemas.
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
  for (const keyword of unsupportedKeywords) {
    delete node[keyword];
  }

  delete node['$schema'];

  // Object nodes fall into three shapes:
  //   a) Has `properties`  → standard struct. Force additionalProperties:false,
  //      mark every property required, and wrap missing-from-required props as
  //      `anyOf: [<schema>, {type: "null"}]` so the model can omit them.
  //   b) Record (no `properties`, `additionalProperties` is a schema object) →
  //      keep the value schema and recurse into it. OpenAI accepts this as an
  //      open map when there are no sibling `properties`.
  //   c) Bare `type: object` with empty/true additionalProperties (from
  //      `.passthrough()` leaves or plain `z.object({})`) → normalize to
  //      additionalProperties:false.
  if (node['type'] === 'object') {
    const properties = node['properties'] as Record<string, Record<string, unknown>> | undefined;
    const additional = node['additionalProperties'];

    if (properties) {
      const currentRequired = (node['required'] as string[]) || [];
      const allPropertyNames = Object.keys(properties);

      node['additionalProperties'] = false;

      for (const propName of allPropertyNames) {
        if (!currentRequired.includes(propName)) {
          const propSchema = properties[propName];
          if (propSchema && !isAlreadyNullable(propSchema)) {
            properties[propName] = {
              anyOf: [propSchema, { type: 'null' }],
            };
          }
        }
      }

      node['required'] = allPropertyNames;
    } else if (additional && typeof additional === 'object' && !Array.isArray(additional)) {
      const valueSchema = additional as Record<string, unknown>;
      if (Object.keys(valueSchema).length === 0) {
        // additionalProperties: {} from .passthrough() on an empty object.
        node['additionalProperties'] = false;
      } else {
        // Genuine record: keep value schema and recurse into it.
        transformObjectRecursive(valueSchema);
      }
    } else {
      node['additionalProperties'] = false;
    }
  } else if ('additionalProperties' in node) {
    // Non-object nodes should not carry additionalProperties.
    delete node['additionalProperties'];
  }

  if (node['properties']) {
    const properties = node['properties'] as Record<string, Record<string, unknown>>;
    for (const prop of Object.values(properties)) {
      if (prop && typeof prop === 'object') {
        transformObjectRecursive(prop);
      }
    }
  }

  if (node['items'] && typeof node['items'] === 'object') {
    transformObjectRecursive(node['items'] as Record<string, unknown>);
  }

  if (Array.isArray(node['anyOf'])) {
    for (const subSchema of node['anyOf']) {
      if (subSchema && typeof subSchema === 'object') {
        transformObjectRecursive(subSchema as Record<string, unknown>);
      }
    }
  }

  if (Array.isArray(node['oneOf'])) {
    for (const subSchema of node['oneOf']) {
      if (subSchema && typeof subSchema === 'object') {
        transformObjectRecursive(subSchema as Record<string, unknown>);
      }
    }
  }
}

function isAlreadyNullable(schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema['anyOf'])) {
    return schema['anyOf'].some(
      (s: Record<string, unknown>) => s && typeof s === 'object' && s['type'] === 'null',
    );
  }
  return false;
}

/**
 * Generate a JSON Schema file for an agent from the Zod schema registry.
 * Uses Zod 4's built-in z.toJSONSchema() and then transforms for
 * OpenAI Structured Outputs compatibility.
 *
 * Returns the path to the generated temp file, or null if no schema exists.
 */
async function generateOutputSchema(agentName: string, tempDir: string): Promise<string | null> {
  const zodSchema = getSchemaForAgent(agentName);
  if (!zodSchema) return null;

  try {
    const rawJsonSchema = z.toJSONSchema(zodSchema, { target: 'draft-7' });
    // Transform for OpenAI Structured Outputs compatibility
    const jsonSchema = transformSchemaForStructuredOutputs(
      rawJsonSchema as Record<string, unknown>,
    );
    const schemaPath = path.join(tempDir, 'output-schema.json');
    await writeFile(schemaPath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
    return schemaPath;
  } catch (error) {
    logger.warn(
      `Warning: Failed to generate JSON Schema for ${agentName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
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
      const attemptNumber = input.attemptNumber ?? 1;

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
          attemptNumber,
          config.validator,
          config.maxInternalIterations,
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
 * Invoke Codex CLI with input prompt.
 *
 * Key design decisions for Codex vs Claude:
 *
 * 1. No --agent flag: Agent instructions are prepended to the prompt.
 *    The combined prompt is delivered via stdin (not CLI arg) to avoid
 *    OS argument length limits on large analysis prompts.
 *
 * 2. Two-layer validation (mirrors Claude's stop-hook architecture):
 *    - Layer 1a — `--output-schema` (token-level): constrained decoding via
 *      OpenAI Structured Outputs guarantees JSON structure for phase-1
 *      analyzers. Transformed at runtime (additionalProperties:false, all
 *      properties required, no validation keywords).
 *    - Layer 1b — in-session validator + `codex exec resume`: Codex's
 *      `codex_hooks` feature is notification-only (it can't block the
 *      session), so we instead run the caller-supplied `config.validator`
 *      after each exec and, on failure, resume the session with the
 *      validation feedback as a new turn. Same session, so the model sees
 *      its own prior attempt while correcting — the context-preserving
 *      behavior Claude gets for free from stop hooks.
 *
 * 3. External retry loop (enhanced-retry.ts) remains as the Layer 2 safety net
 *    for the rare case internal iterations exhaust.
 *
 * 4. Prompt delivered via stdin (like Claude's implementation) to handle
 *    arbitrarily large prompts without hitting ARG_MAX limits.
 */
async function invokeCodexCLI(
  agentName: string,
  inputPrompt: string,
  projectPath: string,
  agentFilePath: string,
  frameworkPath: string,
  timeout: number = 300000,
  sessionId: string,
  attemptNumber: number = 1,
  validator?: (output: string) => ValidationResult,
  maxInternalIterations: number = 5,
): Promise<{ output: string; sessionId: string }> {
  if (isCodexAborting) {
    throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  }

  const tempDir = resolveTempPath(projectPath, agentName, sessionId);
  await mkdir(tempDir, { recursive: true });

  const attemptDir = getAttemptDir(projectPath, agentName, sessionId, attemptNumber);
  await mkdir(attemptDir, { recursive: true });

  // Read agent file and strip frontmatter (Codex doesn't understand it).
  const agentContent = fs.readFileSync(agentFilePath, 'utf-8');
  const agentBody = agentContent.replace(/^---[\s\S]*?---\n?/, '');
  const fullPrompt = `${agentBody}\n\n---\n\n${inputPrompt}`;

  const codexCLI = getCodexCLIPath(frameworkPath);
  const model = getCodexCLIModelForAgent(agentName, frameworkPath);
  const reasoningEffort = getCodexReasoningEffortForAgent(agentName, frameworkPath);

  // Flags that are safe for both `codex exec` and `codex exec resume`.
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

  // `--output-schema` is only accepted by the top-level `codex exec` subcommand
  // (not by `codex exec resume`), so we keep it on the initial-exec args only.
  const initialOnlyArgs: string[] = [];
  const schemaPath = await generateOutputSchema(agentName, tempDir);
  if (schemaPath) {
    initialOnlyArgs.push('--output-schema', schemaPath);
  }

  const diagnosticsCtx = {
    projectPath,
    agentName,
    sessionId,
    attemptNumber,
    fullPrompt,
    meta: { model, cli: 'codex' as const },
  };

  // Initial exec: `codex exec -` (prompt on stdin).
  const first = await runCodex({
    codexPath: codexCLI.path,
    cliArgs: ['exec', '-', ...baseCliArgs, ...initialOnlyArgs],
    prompt: fullPrompt,
    tempDir,
    cwd: projectPath,
    frameworkPath,
    timeout,
    iteration: 0,
  });

  if (first.code !== 0) {
    await saveFailureDiagnostics(diagnosticsCtx, first);
    throw new Error(buildFailureMessage(first));
  }

  let output = first.output;
  let codexSessionId = first.codexSessionId;

  // No internal validator ⇒ single-shot behavior (phase-1 analyzers use
  // --output-schema instead). Save success diagnostics and return.
  if (!validator) {
    await saveAttemptDiagnostics({
      ...diagnosticsCtx,
      outcome: 'success',
      prompt: fullPrompt,
      stdout: first.stdout,
      stderr: first.stderr,
      output,
      meta: { ...diagnosticsCtx.meta, code: first.code },
    });
    return { output, sessionId };
  }

  // Internal validation loop: validate, and on failure resume the session
  // with feedback as a new user turn. Same session = context preserved.
  let validation = validator(output);
  let iteration = 0;

  while (!validation.valid && iteration < maxInternalIterations) {
    iteration++;

    // Require a real Codex session ID to resume. If we failed to capture it
    // (e.g. Codex changed its --json event shape), surface the failure so the
    // external retry layer picks it up rather than silently giving up.
    if (!codexSessionId) {
      logger.warn(
        `[${agentName}] internal validation failed but no Codex session id was captured from --json events; deferring to external retry`,
      );
      break;
    }

    logger.warn(
      `[${agentName}] internal validation failed (iter ${iteration}/${maxInternalIterations}) — resuming session ${codexSessionId}`,
    );

    const feedbackPrompt = buildInternalValidationFeedback(
      validation.errors,
      iteration,
      maxInternalIterations,
    );

    const resumeRun = await runCodex({
      codexPath: codexCLI.path,
      cliArgs: ['exec', 'resume', codexSessionId, '-', ...baseCliArgs],
      prompt: feedbackPrompt,
      tempDir,
      cwd: projectPath,
      frameworkPath,
      timeout,
      iteration,
    });

    if (resumeRun.code !== 0) {
      await saveFailureDiagnostics(
        { ...diagnosticsCtx, fullPrompt: feedbackPrompt },
        resumeRun,
      );
      throw new Error(buildFailureMessage(resumeRun));
    }

    output = resumeRun.output;
    if (resumeRun.codexSessionId) {
      codexSessionId = resumeRun.codexSessionId;
    }
    validation = validator(output);
  }

  if (validation.valid) {
    if (iteration > 0) {
      logger.success(
        `[${agentName}] internal validation passed after ${iteration} in-session correction(s)`,
      );
    }
    await saveAttemptDiagnostics({
      ...diagnosticsCtx,
      outcome: 'success',
      prompt: fullPrompt,
      stdout: first.stdout,
      stderr: first.stderr,
      output,
      meta: {
        ...diagnosticsCtx.meta,
        code: 0,
        internalIterations: iteration,
      },
    });
    return { output, sessionId };
  }

  // Internal iterations exhausted — persist the last output so the external
  // retry layer has diagnostics and can spin up a fresh session.
  logger.warn(
    `[${agentName}] internal validation exhausted after ${iteration} iteration(s); falling through to external retry`,
  );
  await saveAttemptDiagnostics({
    ...diagnosticsCtx,
    outcome: 'success', // exit code was 0 — failure is semantic, not CLI
    prompt: fullPrompt,
    stdout: first.stdout,
    stderr: first.stderr,
    output,
    meta: {
      ...diagnosticsCtx.meta,
      code: 0,
      internalIterations: iteration,
      internalValidationExhausted: true,
      lastValidationErrors: validation.errors,
    },
  });
  return { output, sessionId };
}

/**
 * Spawn one Codex CLI process and await exit. Captures stdout (JSONL events),
 * extracts the session id from the first `session_meta` event, and reads the
 * last-message output from the `-o` file that we wrote into `tempDir`.
 *
 * Single process per call — looping across iterations is the caller's job.
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
}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  output: string;
  codexSessionId: string | null;
}> {
  return new Promise(async (resolve, reject) => {
    const invocationId = codexInvocationCounter++;
    activeCodexInvocations.set(invocationId, reject);

    // Use a per-iteration prompt/output file pair so diagnostics for each
    // in-session correction don't clobber the previous one.
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

    const proc = spawn(params.codexPath, cliArgs, {
      cwd: params.cwd,
      env: {
        ...process.env,
        FRAMEWORK_PATH: params.frameworkPath,
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
        if (!codexSessionId) {
          codexSessionId = extractSessionId(chunk) ?? codexSessionId;
        }
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

      if (!codexSessionId) {
        codexSessionId = extractSessionId(stdout);
      }

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
  });
}

/**
 * Extract Codex's internally-generated session UUID from a chunk of --json stdout.
 * Session ID lives at `payload.id` on `session_meta` events (see codex rollout files).
 */
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

/**
 * Build the feedback prompt we send into `codex exec resume` after a validator
 * rejection. The model is still in-session, so it already has its prior output
 * in context — we just need to tell it what to fix.
 */
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

async function saveFailureDiagnostics(
  ctx: {
    projectPath: string;
    agentName: string;
    sessionId: string;
    attemptNumber: number;
    fullPrompt: string;
    meta: { model: string; cli: 'codex' };
  },
  run: { code: number | null; stdout: string; stderr: string },
): Promise<void> {
  const isRateLimit =
    run.stderr.includes('429') ||
    run.stdout.includes('rate limit') ||
    run.stdout.includes('capacity');

  await saveAttemptDiagnostics({
    projectPath: ctx.projectPath,
    agentName: ctx.agentName,
    sessionId: ctx.sessionId,
    attemptNumber: ctx.attemptNumber,
    outcome: 'failure',
    prompt: ctx.fullPrompt,
    stdout: run.stdout,
    stderr: run.stderr,
    errorMessage: buildFailureMessage(run),
    meta: { ...ctx.meta, code: run.code ?? -1, rateLimit: isRateLimit },
  });
}

function buildFailureMessage(run: {
  code: number | null;
  stdout: string;
  stderr: string;
}): string {
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
