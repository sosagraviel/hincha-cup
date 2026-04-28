import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getFrameworkAgentPath } from '../../nodes/initialize-project/shared/index.js';
import { AgentFactory } from '../../utils/shared/agent-factory/index.js';
import {
  WIKI_AGENT_FILE,
  WIKI_AGENT_NAME,
  type GeneratedWikiFilename,
  type WikiGeneratorServiceOptions,
} from './types.js';

const AGENT_TIMEOUT_MS = 600000;
const SETTINGS_SUBPATH =
  'orchestration/src/nodes/initialize-project/phase4/wiki-generator/settings.json';

export async function invokeWikiAgent(
  options: WikiGeneratorServiceOptions,
  documentType: string,
  filename: GeneratedWikiFilename,
  prompt: string,
): Promise<string> {
  const factory = await AgentFactory.create();
  // Per-invocation tracker id — the wiki-generator agent is invoked in parallel
  // (3 core docs + N service docs), so we need a unique key per call to avoid
  // Spinnies collisions. `agentName` stays `wiki-generator` so model/settings
  // lookup is unchanged.
  const trackerId = `${WIKI_AGENT_NAME}:${filename}`;
  const agent = await factory.createAgent({
    agentName: WIKI_AGENT_NAME,
    agentFilePath: getFrameworkAgentPath(options.frameworkPath, WIKI_AGENT_FILE),
    projectPath: options.projectPath,
    frameworkPath: options.frameworkPath,
    timeout: AGENT_TIMEOUT_MS,
    settingsPath: join(options.frameworkPath, SETTINGS_SUBPATH),
    trackerId,
    trackerDisplayName: trackerId,
  });

  // No `ultrathink` prefix: this agent runs closed-book over digested upstream.
  // Narrative synthesis from a structured prompt does not benefit from extended
  // thinking; the gira run had the Patterns doc spend 5 minutes on it.
  const result = await agent.invoke({
    inputPrompt: `${prompt}\n\nGenerate ${filename} (${documentType}).`,
  });

  return result.output;
}

export function computeGraphVersion(graphPath: string): string {
  return createHash('sha256').update(readFileSync(graphPath)).digest('hex');
}

/**
 * Returns the current HEAD commit SHA of the given repository path.
 * Falls back to 'unknown' if the git command fails (e.g., not a git repo).
 */
export function computeGraphCommit(repoPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
