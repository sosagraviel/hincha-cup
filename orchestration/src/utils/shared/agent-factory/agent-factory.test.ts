import { describe, it, expect } from 'vitest';
import { AgentFactory } from './agent-factory.js';
import type { AgentConfig } from './types.js';
import { AuthMode, type AuthConfig } from '../../../auth/auth-detector.js';

const baseConfig: AgentConfig = {
  agentName: 'test-agent',
  agentFilePath: '/tmp/agent.md',
  projectPath: '/tmp/project',
  frameworkPath: '/tmp/framework',
};

describe('AgentFactory.createAgent — missing CLI version', () => {
  it('throws an actionable error (not the cryptic one) when CLAUDE_CLI mode has no version', async () => {
    const authConfig: AuthConfig = {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
      hasClaudeCLI: true,
      hasCodexCLI: false,
      hasAPIKey: false,
      claudeCLIVersion: undefined,
    };
    const factory = new AgentFactory(authConfig);

    await expect(factory.createAgent(baseConfig)).rejects.toThrow(
      /version could not be determined/,
    );
    // And it points the user at a concrete repair, not the old opaque message.
    await expect(factory.createAgent(baseConfig)).rejects.toThrow(/npm install/);
    await expect(factory.createAgent(baseConfig)).rejects.not.toThrow(
      /version is required for CLAUDE_CLI mode/,
    );
  });

  it('throws an actionable error when CODEX_CLI mode has no version', async () => {
    const authConfig: AuthConfig = {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasClaudeCLI: false,
      hasCodexCLI: true,
      hasAPIKey: false,
      codexCLIVersion: undefined,
    };
    const factory = new AgentFactory(authConfig);

    await expect(factory.createAgent(baseConfig)).rejects.toThrow(
      /version could not be determined/,
    );
    await expect(factory.createAgent(baseConfig)).rejects.toThrow(/@openai\/codex/);
  });
});
