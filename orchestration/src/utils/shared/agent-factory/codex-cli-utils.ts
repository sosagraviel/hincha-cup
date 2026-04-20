import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';

/**
 * Get the Codex CLI model name from the agent name based on model-config.json
 * Maps from model aliases (e.g., "gpt5-latest") to CLI model names (e.g., "gpt-5.4")
 */
export function getCodexCLIModelForAgent(agentName: string, frameworkPath: string): string {
  try {
    const configPath = path.join(frameworkPath, 'orchestration/config/model-config.json');
    const factory = getLLMFactory(configPath);
    const modelInfo = factory.getModelInfo(agentName);

    const alias = modelInfo.alias;
    if (alias.includes('gpt5-latest') || alias === 'gpt5-latest') return 'gpt-5.4';
    if (alias.includes('gpt5-mini') || alias === 'gpt5-mini') return 'gpt-5.4-mini';

    console.warn(
      `Warning: Unable to map alias '${alias}' to Codex CLI model name for agent '${agentName}'. Defaulting to 'gpt-5.4'.`,
    );
    return 'gpt-5.4';
  } catch (error) {
    console.warn(
      `Warning: Failed to get model for agent '${agentName}': ${error instanceof Error ? error.message : String(error)}. Defaulting to 'gpt-5.4'.`,
    );
    return 'gpt-5.4';
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
