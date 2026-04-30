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
   */
  async createAgent(config: AgentConfig): Promise<Agent> {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      throw new Error(
        'API key / DeepAgents execution mode is no longer supported. Use Claude CLI or Codex CLI authentication instead.',
      );
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      if (!this.authConfig.claudeCLIVersion) {
        throw new Error('Claude CLI version is required for CLAUDE_CLI mode');
      }
      return createCLIAgentImpl(config, this.authConfig.claudeCLIVersion);
    } else if (this.authConfig.mode === AuthMode.CODEX_CLI) {
      if (!this.authConfig.codexCLIVersion) {
        throw new Error('Codex CLI version is required for CODEX_CLI mode');
      }
      return createCodexCLIAgentImpl(config, this.authConfig.codexCLIVersion);
    } else {
      throw new Error(getAuthErrorMessage(this.authConfig));
    }
  }
}
