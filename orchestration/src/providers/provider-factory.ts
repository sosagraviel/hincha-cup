/**
 * Provider factory for auto-detection and creation.
 *
 * Detection priority:
 * 1. Explicit PROVIDER env var (claude/codex)
 * 2. API keys (ANTHROPIC_API_KEY -> claude, OPENAI_API_KEY -> codex)
 * 3. CLI detection (whichever is authenticated)
 * 4. Error state
 */

import { Provider, AuthMethod } from './types.js';
import { ClaudeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import type { ProviderAdapter } from './provider-adapter.js';

export class ProviderFactory {
  /**
   * Auto-detect and create the appropriate provider
   */
  static async detect(): Promise<ProviderAdapter> {
    const explicitProvider = process.env.PROVIDER?.toLowerCase();

    if (explicitProvider === 'codex' || explicitProvider === 'openai') {
      const config = await CodexProvider.detectConfig();
      return new CodexProvider(config);
    }

    if (explicitProvider === 'claude' || explicitProvider === 'anthropic') {
      const config = await ClaudeProvider.detectConfig();
      return new ClaudeProvider(config);
    }

    if (process.env.ANTHROPIC_API_KEY) {
      return new ClaudeProvider({
        provider: Provider.CLAUDE,
        authMethod: AuthMethod.API_KEY,
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        llmProvider: 'anthropic',
      });
    }

    if (process.env.OPENAI_API_KEY) {
      return new CodexProvider({
        provider: Provider.CODEX,
        authMethod: AuthMethod.API_KEY,
        apiKeyEnvVar: 'OPENAI_API_KEY',
        llmProvider: 'openai',
      });
    }

    if (process.env.GOOGLE_API_KEY) {
      return new ClaudeProvider({
        provider: Provider.CLAUDE,
        authMethod: AuthMethod.API_KEY,
        apiKeyEnvVar: 'GOOGLE_API_KEY',
        llmProvider: 'google',
      });
    }

    const codexProvider = new CodexProvider();
    if (await codexProvider.isCLIAvailable()) {
      if (await codexProvider.isCLIAuthenticated()) {
        return new CodexProvider({
          provider: Provider.CODEX,
          authMethod: AuthMethod.CLI_SUBSCRIPTION,
          cliVersion: await codexProvider.getCLIVersion(),
          llmProvider: 'openai',
        });
      }
    }

    const claudeProvider = new ClaudeProvider();
    if (await claudeProvider.isCLIAvailable()) {
      if (await claudeProvider.isCLIAuthenticated()) {
        return new ClaudeProvider({
          provider: Provider.CLAUDE,
          authMethod: AuthMethod.CLI_SUBSCRIPTION,
          cliVersion: await claudeProvider.getCLIVersion(),
          llmProvider: 'anthropic',
        });
      }
    }

    throw new Error(getMultiProviderAuthError());
  }

  /**
   * Create provider by explicit name
   */
  static create(provider: Provider): ProviderAdapter {
    switch (provider) {
      case Provider.CLAUDE:
        return new ClaudeProvider();
      case Provider.CODEX:
        return new CodexProvider();
    }
  }
}

function getMultiProviderAuthError(): string {
  return [
    'No authentication available.',
    '',
    'Please choose one of the following options:',
    '',
    'Option 1: Use API Key',
    '  export ANTHROPIC_API_KEY=sk-ant-...  (Anthropic)',
    '  export OPENAI_API_KEY=sk-...         (OpenAI)',
    '  export GOOGLE_API_KEY=...            (Google)',
    '',
    'Option 2: Authenticate Codex CLI (uses ChatGPT subscription)',
    '  npm install -g @openai/codex',
    '  codex login',
    '',
    'Option 3: Authenticate Claude CLI (uses Claude Pro/Max subscription)',
    '  Visit: https://code.claude.com',
    '  Then run: claude setup-token',
  ].join('\n');
}
