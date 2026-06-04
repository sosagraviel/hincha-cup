import {
  AuthMode,
  AuthConfig,
  detectAuthMode,
  getAuthErrorMessage,
} from '../../../auth/auth-detector.js';
import type { Agent, AgentConfig } from './types.js';
import {
  createCLIAgentImpl,
  abortAllInvocations,
  killAllActiveProcesses,
} from './cli-agent-impl.js';
import {
  createCodexCLIAgentImpl,
  abortAllCodexInvocations,
  killAllActiveCodexProcesses,
} from './codex-cli-agent-impl.js';

/**
 * Creates agents using provider CLIs only.
 */
export class AgentFactory {
  private authConfig: AuthConfig;

  constructor(authConfig: AuthConfig) {
    this.authConfig = authConfig;
  }

  /**
   * Abort all active invocations immediately (both Claude and Codex)
   */
  static abortAllInvocations = () => {
    abortAllInvocations();
    abortAllCodexInvocations();
  };

  /**
   * Kill all active CLI processes (both Claude and Codex)
   */
  static killAllActiveProcesses = () => {
    killAllActiveProcesses();
    killAllActiveCodexProcesses();
  };

  /**
   * Create factory instance with automatic auth detection
   */
  static async create(): Promise<AgentFactory> {
    const authConfig = await detectAuthMode();

    if (authConfig.mode === AuthMode.NONE) {
      throw new Error(getAuthErrorMessage(authConfig));
    }

    return new AgentFactory(authConfig);
  }

  getAuthConfig(): AuthConfig {
    return this.authConfig;
  }

  /**
   * Create agent using Claude CLI or Codex CLI.
   *
   * Per-agent reasoning effort is resolved inside each CLI adapter from
   * `model-config.json` (`LLMFactory.getReasoningEffort`). The adapters
   * translate the model-config value into whichever flag the active CLI
   * supports.
   */
  async createAgent(config: AgentConfig): Promise<Agent> {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      throw new Error(
        'API key / DeepAgents execution mode is no longer supported. Use Claude CLI or Codex CLI authentication instead.',
      );
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      if (!this.authConfig.claudeCLIVersion) {
        throw new Error(
          'Claude CLI was detected but its version could not be determined — the CLI is likely ' +
            'broken (e.g. the bundled native binary was not installed because npm/pnpm ran with ' +
            '--ignore-scripts or --omit=optional).\n' +
            'Repair the bundled CLI:\n' +
            '  cd orchestration && rm -rf node_modules && npm install\n' +
            '  (or: npm rebuild @anthropic-ai/claude-code)\n' +
            'Or install/repair a global CLI: npm install -g @anthropic-ai/claude-code\n' +
            'See the orchestration logs above for the underlying `claude --version` error.',
        );
      }
      return createCLIAgentImpl(config, this.authConfig.claudeCLIVersion);
    } else if (this.authConfig.mode === AuthMode.CODEX_CLI) {
      if (!this.authConfig.codexCLIVersion) {
        throw new Error(
          'Codex CLI was detected but its version could not be determined — the CLI is likely ' +
            'broken (e.g. the bundled native binary was not installed because npm/pnpm ran with ' +
            '--ignore-scripts or --omit=optional).\n' +
            'Repair the bundled CLI:\n' +
            '  cd orchestration && rm -rf node_modules && pnpm install\n' +
            '  (or: pnpm rebuild @openai/codex)\n' +
            'Or install/repair a global CLI: npm install -g @openai/codex\n' +
            'See the orchestration logs above for the underlying `codex --version` error.',
        );
      }
      return createCodexCLIAgentImpl(config, this.authConfig.codexCLIVersion);
    } else {
      throw new Error(getAuthErrorMessage(this.authConfig));
    }
  }
}
