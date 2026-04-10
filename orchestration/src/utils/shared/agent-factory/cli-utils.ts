import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';

/**
 * Get the Claude CLI model name from the agent name based on model-config.json
 * Maps from model aliases (e.g., "sonnet-latest") to CLI model names (e.g., "sonnet")
 */
export function getCLIModelForAgent(agentName: string, frameworkPath: string): string {
  try {
    const configPath = path.join(frameworkPath, 'orchestration/config/model-config.json');
    const factory = getLLMFactory(configPath);
    const modelInfo = factory.getModelInfo(agentName);

    // Map from alias to CLI model name
    // Claude CLI accepts: "sonnet", "opus", "haiku"
    if (modelInfo.alias.includes('sonnet')) {
      return 'sonnet';
    } else if (modelInfo.alias.includes('opus')) {
      return 'opus';
    } else if (modelInfo.alias.includes('haiku')) {
      return 'haiku';
    }

    // Default to sonnet for non-Anthropic models or unknown aliases
    console.warn(
      `Warning: Unable to map alias '${modelInfo.alias}' to CLI model name for agent '${agentName}'. Defaulting to 'sonnet'.`,
    );
    return 'sonnet';
  } catch (error) {
    console.warn(
      `Warning: Failed to get model for agent '${agentName}': ${error instanceof Error ? error.message : String(error)}. Defaulting to 'sonnet'.`,
    );
    return 'sonnet';
  }
}

/**
 * Get path to local Claude CLI binary (bundled with framework)
 *
 * Searches for node_modules/.bin/claude in the framework directory.
 * Falls back to global 'claude' command with version verification.
 *
 * @param frameworkPath - Path to the framework root directory
 * @returns Object with path and version of Claude CLI binary
 * @throws Error if Claude CLI not found or version < 2.0
 */
export function getClaudeCLIPath(frameworkPath: string): {
  path: string;
  version: string;
} {
  // Use frameworkPath to locate the bundled Claude CLI
  // frameworkPath points to framework root (e.g., /path/to/qubika-agentic-framework)
  const localClaudePath = path.join(frameworkPath, 'orchestration/node_modules/.bin/claude');

  // Prefer local bundled Claude CLI (guaranteed v2.1+)
  if (fs.existsSync(localClaudePath)) {
    try {
      // Verify version
      const version = execSync(`"${localClaudePath}" --version`, {
        encoding: 'utf-8',
      }).trim();

      // Extract version number (e.g., "2.1.87 (Claude Code)" -> "2.1.87")
      const versionMatch = version.match(/^(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        const [major, minor] = versionMatch[1].split('.').map(Number);
        if (major >= 2 && minor >= 0) {
          return { path: localClaudePath, version: versionMatch[1] };
        }
      }
    } catch (error) {
      logger.warn(`Local Claude CLI found but version check failed: ${error}`);
      // Fall through to global check
    }
  }

  // Fallback: Try global Claude CLI with version check
  try {
    const globalVersion = execSync('claude --version', {
      encoding: 'utf-8',
    }).trim();
    const versionMatch = globalVersion.match(/^(\d+\.\d+\.\d+)/);

    if (versionMatch) {
      const [major, minor] = versionMatch[1].split('.').map(Number);
      if (major >= 2 && minor >= 0) {
        logger.warn(
          `Using global Claude CLI v${versionMatch[1]} - consider using framework's bundled version for consistency`,
        );
        return { path: 'claude', version: versionMatch[1] };
      } else {
        throw new Error(
          `Global Claude CLI version ${versionMatch[1]} is too old (requires v2.0+). ` +
            `The framework should bundle Claude CLI v2.1+ automatically. ` +
            `Try running: cd orchestration && npm install`,
        );
      }
    }

    throw new Error(`Could not determine Claude CLI version from: ${globalVersion}`);
  } catch (error) {
    throw new Error(
      `Claude CLI not found or version check failed.\n` +
        `  Local path checked: ${localClaudePath}\n` +
        `  Global 'claude' command: Not found or too old\n` +
        `\n` +
        `This framework bundles Claude CLI v2.1+ automatically.\n` +
        `Please run: cd orchestration && npm install\n` +
        `\n` +
        `Error details: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parse tools restriction from agent frontmatter
 * Returns comma-separated list of allowed tools or null if no restriction
 */
export function parseToolsFromFrontmatter(agentContent: string): string | null {
  // Match YAML frontmatter
  const frontmatterMatch = agentContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // Match tools: field (can be on one line or multiple lines)
  const toolsMatch = frontmatter.match(/^tools:\s*(.+)$/m);
  if (!toolsMatch) {
    return null;
  }

  // Parse tools list (comma-separated or space-separated)
  const toolsLine = toolsMatch[1].trim();

  // Handle comma-separated: "Read, Grep, Glob"
  // Handle space-separated: "Read Grep Glob"
  const tools = toolsLine
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return tools.join(',');
}
