import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { AgentFactory } from '../../../../utils/shared/agent-factory/index.js';
import { validateAndParseAgentOutput, type ValidationResult } from '../../../../utils/validator.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG,
} from '../../../../utils/enhanced-retry.js';
import { logger } from '../../../../utils/logger.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildPhase1AnalyzerPrompt } from '../shared/prompt-builder.js';
import { applyGraphToolUsageFromSidecar } from '../shared/graph-tool-usage.js';
import { getFrameworkAgentPath } from '../../shared/index.js';
import { reasoningPrefix } from '../../../../utils/shared/context-tags.js';
import { resolveTempPath } from '../../../../utils/provider-paths.js';
import {
  getInitializeProjectPhase,
  tryActiveDebugStore,
} from '../../../../services/framework/debug-store/index.js';

/**
 * Structure & Architecture Analyzer Node
 *
 * This node runs the structure-architecture-analyzer agent which analyzes:
 * - Project structure and organization
 * - Framework detection and configuration
 * - Architecture patterns (MVC, microservices, etc.)
 * - Monorepo/multi-workspace detection
 *
 * Features:
 * - Retry logic with exponential backoff (up to 5 attempts)
 * - Error feedback to agent for self-correction
 * - Zod validation of output
 * - Provider-agnostic via LLM factory
 *
 * @param state - Current workflow state
 * @returns Updated state with analyzer output
 */
export async function structureArchitectureAnalyzerNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'structure-architecture-analyzer';
  const agentFile = '01-structure-architecture.md';

  // Ensure temp directory exists
  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });

  try {
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildPhase1AnalyzerPrompt(
        state.project_path,
        state.framework_path,
        agentName,
        feedbackPrompt, // Feedback for retry
        {
          available: state.code_graph_available ?? false,
          dbPath: state.code_graph_path,
          toolCatalog: state.code_graph_tool_catalog,
          stats: state.code_graph_stats,
        },
      );

      // Create agent using new interface
      const factory = await AgentFactory.create();

      // Provider-aware reasoning prefix (ultrathink for Claude, empty for Codex)
      const inputPrompt = `${reasoningPrefix(factory.getAuthConfig())}${contextPrompt}\n\nAnalyze the project structure and architecture at: ${state.project_path}`;

      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 1800000, // 30 minutes
        resumeSessionId, // Pass session ID for context-preserving retry
        phase: getInitializeProjectPhase('phase1'),
        settingsPath: join(
          state.framework_path,
          'orchestration/src/nodes/initialize-project/phase1/structure-analyzer/settings.json',
        ),
      });

      const result = await agent.invoke({ inputPrompt, attemptNumber });

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const validator = (output: string): ValidationResult => {
      return validateAndParseAgentOutput(output, agentName);
    };

    const outputPath = join(tempDir, 'phase1-outputs', '01-structure-architecture.json');

    const { data: validatedData, sessionId } = await retryWithEnhancedFeedback(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG,
      {
        projectPath: state.project_path,
        agentName,
        phase: getInitializeProjectPhase('phase1'),
      },
    );

    // Overwrite agent-supplied graph_queries_used with the canonical sorted
    // list of `mcp__code_graph__*_tool` names from the Stop hook's sidecar.
    // The agent has demonstrated it cannot be trusted with this field.
    const persisted = applyGraphToolUsageFromSidecar(validatedData, state.project_path, sessionId);

    writeFileSync(outputPath, JSON.stringify(persisted, null, 2));

    // Overlay the post-sidecar persisted view onto the debug bucket so
    // anyone reading debug/runs/.../output.json sees the same overflow
    // telemetry the persisted phase1-outputs file carries (gira-init-run
    // audit findings F6 / F18). Best-effort — silent no-op if no debug
    // store is active or the attempt dir cannot be located.
    const activeStore = tryActiveDebugStore();
    if (activeStore && sessionId) {
      await activeStore.overlaySessionOutput(agentName, sessionId, persisted);
    }

    return {
      temp_dir: tempDir,
    };
  } catch (error) {
    const err = error as Error;

    if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
      throw error; // Re-throw to propagate up to graph.invoke()
    }

    return {
      errors: [...state.errors, `${agentName}: ${err.message}`],
      current_phase: 'failed',
    };
  }
}
