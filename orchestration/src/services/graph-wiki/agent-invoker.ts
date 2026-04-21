import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
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
  const agent = await factory.createAgent({
    agentName: WIKI_AGENT_NAME,
    agentFilePath: getFrameworkAgentPath(options.frameworkPath, WIKI_AGENT_FILE),
    projectPath: options.projectPath,
    frameworkPath: options.frameworkPath,
    timeout: AGENT_TIMEOUT_MS,
    settingsPath: join(options.frameworkPath, SETTINGS_SUBPATH),
  });

  const result = await agent.invoke({
    inputPrompt: `ultrathink\n\n${prompt}\n\nGenerate ${filename} (${documentType}).`,
  });

  return result.output;
}

export function computeGraphVersion(graphPath: string): string {
  return createHash('sha256').update(readFileSync(graphPath)).digest('hex');
}
