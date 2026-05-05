import { createDeepAgent } from 'deepagents';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import { loadMarkdownFile } from '../prompt-loader.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import { getAgentAction } from './agent-utils.js';
import { beginAttemptRecorder } from './attempt-recorder.js';
import { emitTokenUsage } from '../../../services/framework/debug-store/index.js';

/**
 * Create agent using DeepAgents.js (API key mode).
 *
 * **Prompt caching contract** (plan §F, 2026-05-05).
 *
 * Phase 1 analyzer prompts are constructed by
 * `phase1/shared/prompt-builder.ts` so the first ~19 KB are
 * **byte-identical across all four analyzers** within a single init
 * run (see `buildPhase1SharedPrefix`). DeepAgents passes our
 * concatenated `${body}\n\n${input.inputPrompt}` to the LLM as a
 * subagent system prompt; Anthropic's API automatically caches system
 * prompts ≥ 1024 tokens and reads them back at ~10% of normal input
 * rate on subsequent requests within the 5-minute TTL.
 *
 * That means: the four parallel analyzer spawns implicitly benefit
 * from the cache without explicit `cache_control` markers, **as long
 * as the prefix stays byte-identical**. The unit test in
 * `prompt-builder-cache.test.ts` is the regression net — it
 * SHA-256s the prefix across all four analyzers and fails on drift.
 *
 * Cache observability: `usage.cache_read_input_tokens` is read out of
 * the `result.usage` object below and surfaced via
 * `emitTokenUsage(...).cache_hit`. The debug-store run index renders
 * cache hit rate per phase (plan commit 9).
 *
 * If a future change requires an explicit `cache_control` block split
 * (e.g. moving the prefix into a discrete user-message content block
 * with `{ type: 'ephemeral' }`), the LLM-factory call would need to
 * bypass DeepAgents and call the Anthropic SDK directly. Defer until
 * empirical hit-rate measurements show the implicit caching is
 * insufficient — the byte-determinism contract above is what makes
 * the savings possible either way.
 */
export async function createDeepAgentImpl(
  config: AgentConfig,
  authProvider: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);
  const model = await llmFactory.createModel(config.agentName);
  const { frontmatter, body } = loadMarkdownFile(config.agentFilePath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      const systemPrompt = `${body}\n\n${input.inputPrompt}`;
      const sessionId =
        config.resumeSessionId ||
        `deepagent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const attemptNumber = input.attemptNumber ?? 1;

      const recorder = beginAttemptRecorder({
        agentName: config.agentName,
        sessionId,
        attemptNumber,
        phase: config.phase,
        provider: 'deepagent',
        cli: 'deepagent',
        model: modelInfo.alias,
        projectPath: config.projectPath,
      });
      await recorder.writePromptInput(input.inputPrompt);
      await recorder.writePromptResolved(systemPrompt);
      await recorder.snapshotAgentFile(config.agentFilePath);

      const agent = await createDeepAgent({
        model,
        subagents: [
          {
            name: frontmatter.name || config.agentName,
            description: frontmatter.description || `Agent: ${config.agentName}`,
            systemPrompt,
            tools: [],
          },
        ],
      });

      const action = getAgentAction(config.agentName);
      const authInfo = `Auth: API Key, Provider: ${authProvider}, Model: ${modelInfo.alias}`;

      const trackerId = config.trackerId ?? config.agentName;
      const trackerDisplayName = config.trackerDisplayName ?? config.agentName;

      logger.trackConcurrentAgentStart(trackerId, trackerDisplayName, `${action} (${authInfo})`);

      const startTime = Date.now();
      const timeout = config.timeout || 300000;

      try {
        const agentPromise = (
          agent as unknown as {
            invoke: (payload: { messages: unknown[] }) => Promise<Record<string, unknown>>;
          }
        ).invoke({ messages: [] });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`DeepAgent execution timeout after ${timeout}ms`)),
            timeout,
          );
        });

        const result = (await Promise.race([agentPromise, timeoutPromise])) as Record<
          string,
          unknown
        >;
        const executionTimeMs = Date.now() - startTime;
        const output =
          (result.output as string | undefined) ??
          (result.content as string | undefined) ??
          JSON.stringify(result);

        const usage = result.usage as
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            }
          | undefined;

        logger.trackConcurrentAgentSucceed(
          trackerId,
          `Completed in ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
        );

        await recorder.writeOutput(output);
        await recorder.mergeMeta({ code: null });
        await recorder.captureTranscript({
          systemPrompt,
          deepAgentMessages: result.messages ?? [],
          outcome: 'success',
        });
        await recorder.finalize('success');

        emitTokenUsage(config.projectPath, {
          ts: new Date().toISOString(),
          phase: config.phase?.phaseId ?? 'phase-unknown',
          agent: config.agentName,
          input_tokens: usage?.input_tokens ?? -1,
          output_tokens: usage?.output_tokens ?? -1,
          cache_hit: (usage?.cache_read_input_tokens ?? 0) > 0,
          // Surface cache savings/creation alongside `cache_hit` so the
          // run-stats sidebar can show real volumes, not just a boolean
          // (plan §F, codex-parity follow-up, 2026-05-05). When the
          // upstream usage object is absent (rare), fall back to -1.
          cache_read_input_tokens: usage?.cache_read_input_tokens ?? -1,
          cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? -1,
          duration_ms: executionTimeMs,
          budget_key: config.budgetKey,
        }).catch(() => undefined);

        return { output, sessionId, mode: AuthMode.API_KEY, executionTimeMs };
      } catch (error: unknown) {
        const executionTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.trackConcurrentAgentFail(
          trackerId,
          `Failed after ${(executionTimeMs / 1000).toFixed(1)}s (${authInfo})`,
        );

        await recorder.writeErrorSummary(errorMessage);
        await recorder.captureTranscript({
          systemPrompt,
          deepAgentMessages: [],
          outcome: 'failure',
        });
        await recorder.finalize('failure');

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

        throw new Error(`DeepAgent execution failed after ${executionTimeMs}ms: ${errorMessage}`);
      }
    },

    getInfo: () => ({ agentName: config.agentName, mode: AuthMode.API_KEY }),
  };
}
