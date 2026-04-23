import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';

/**
 * Get the Codex CLI model ID for an agent from model-config.json.
 * Codex CLI accepts full model IDs directly (e.g., "gpt-5.4"),
 * so we just return the modelId from config — no mapping needed.
 */
export function getCodexCLIModelForAgent(agentName: string, frameworkPath: string): string {
  try {
    const configPath = path.join(frameworkPath, 'orchestration/config/model-config.json');
    const factory = getLLMFactory(configPath);
    const modelInfo = factory.getModelInfo(agentName);
    return modelInfo.modelId;
  } catch (error) {
    console.warn(
      `Warning: Failed to get model for agent '${agentName}': ${error instanceof Error ? error.message : String(error)}. Defaulting to 'gpt-5.4'.`,
    );
    return 'gpt-5.4';
  }
}

/**
 * Get the configured `model_reasoning_effort` for an agent from
 * model-config.json, or `undefined` when the tier leaves it to the user's
 * `~/.codex/config.toml`. Returned verbatim so the caller can decide how to
 * encode it for the Codex CLI.
 *
 * Lookup failures are treated as "no override" — we never want a missing
 * config entry to block an invocation.
 */
export function getCodexReasoningEffortForAgent(
  agentName: string,
  frameworkPath: string,
): string | undefined {
  try {
    const configPath = path.join(frameworkPath, 'orchestration/config/model-config.json');
    const factory = getLLMFactory(configPath);
    return factory.getReasoningEffort(agentName);
  } catch (error) {
    logger.warn(
      `Failed to resolve reasoning effort for agent '${agentName}': ${
        error instanceof Error ? error.message : String(error)
      }. Falling back to Codex CLI default.`,
    );
    return undefined;
  }
}

/**
 * Get path to Codex CLI binary (bundled with framework or global)
 */
export function getCodexCLIPath(frameworkPath: string): { path: string; version: string } {
  const localCodexPath = path.join(frameworkPath, 'orchestration/node_modules/.bin/codex');

  if (fs.existsSync(localCodexPath)) {
    try {
      const version = execSync(`"${localCodexPath}" --version`, {
        encoding: 'utf-8',
      }).trim();

      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        return { path: localCodexPath, version: versionMatch[1] };
      }
    } catch (error) {
      logger.warn(`Local Codex CLI found but version check failed: ${error}`);
    }
  }

  try {
    const globalVersion = execSync('codex --version', { encoding: 'utf-8' }).trim();
    const versionMatch = globalVersion.match(/(\d+\.\d+\.\d+)/);

    if (versionMatch) {
      logger.warn(
        `Using global Codex CLI v${versionMatch[1]} - consider using framework's bundled version for consistency`,
      );
      return { path: 'codex', version: versionMatch[1] };
    }

    throw new Error(`Could not determine Codex CLI version from: ${globalVersion}`);
  } catch (error) {
    throw new Error(
      `Codex CLI not found or version check failed.\n` +
        `  Local path checked: ${localCodexPath}\n` +
        `  Global 'codex' command: Not found\n\n` +
        `Install with: npm install -g @openai/codex\n` +
        `Or authenticate with: codex login\n\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
