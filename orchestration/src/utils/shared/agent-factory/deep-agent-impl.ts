import { createDeepAgent } from "deepagents";
import { AuthMode } from "../../../auth/auth-detector.js";
import { getLLMFactory } from "../../../llm/llm-factory.js";
import { logger } from "../../logger.js";
import { loadMarkdownFile } from "../prompt-loader.js";
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from "./types.js";
import { getAgentAction } from "./agent-utils.js";

/**
 * Create agent using DeepAgents.js (API key mode)
 */
export async function createDeepAgentImpl(
  config: AgentConfig,
  authProvider: string
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);

  const model = await llmFactory.createModel(config.agentName);

  // Read agent file and parse frontmatter (simple file read for DeepAgents workaround)
  const { frontmatter, body } = loadMarkdownFile(config.agentFilePath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      // Combine agent + input (DeepAgents limitation - doesn't support file-based subagents)
      const systemPrompt = `${body}\n\n${input.inputPrompt}`;

      // Create subagent with frontmatter as config
      const agent = await createDeepAgent({
        model: model,
        subagents: [
          {
            name: frontmatter.name || config.agentName,
            description: frontmatter.description || `Agent: ${config.agentName}`,
            systemPrompt: systemPrompt,
            tools: [],
          },
        ],
      });
      const action = getAgentAction(config.agentName);
      const authInfo = `Auth: API Key, Provider: ${authProvider}, Model: ${modelInfo.alias}`;

      logger.trackConcurrentAgentStart(
        config.agentName,
        config.agentName,
        `${action} (${authInfo})`,
      );

      const startTime = Date.now();
      const timeout = config.timeout || 300000;

      try {
        // Input is already in systemPrompt (combined with agent instructions)
        const agentPromise = (agent as any).invoke({
          messages: [],
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

        // Generate session ID for tracking (DeepAgents doesn't use --resume like CLI)
        const sessionId =
          config.resumeSessionId ||
          `deepagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return {
          output,
          sessionId,
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
