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
 * Phase 1 analyzer prompts share a byte-identical prefix so the provider prefix cache
 * hits on calls 2..N without explicit cache_control markers.
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
