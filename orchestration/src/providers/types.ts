/**
 * Provider types and interfaces for multi-provider support.
 *
 * The framework supports multiple AI coding CLI providers (Claude Code, Codex).
 * These types define the provider abstraction used throughout the codebase.
 */

/**
 * Supported CLI providers
 */
export enum Provider {
  CLAUDE = 'claude',
  CODEX = 'codex',
}

/**
 * Authentication methods
 */
export enum AuthMethod {
  /** CLI with subscription auth (Claude Pro/Max, ChatGPT Plus/Pro/Enterprise) */
  CLI_SUBSCRIPTION = 'cli_subscription',
  /** API key (pay-per-token) */
  API_KEY = 'api_key',
  /** No authentication */
  NONE = 'none',
}

/**
 * Resolved provider configuration
 */
export interface ProviderConfig {
  /** Which provider: claude or codex */
  provider: Provider;
  /** How the user authenticates */
  authMethod: AuthMethod;
  /** Provider-specific API key env var name (if API key mode) */
  apiKeyEnvVar?: string;
  /** CLI binary path (if CLI mode) */
  cliBinaryPath?: string;
  /** CLI version string */
  cliVersion?: string;
  /** Provider for LLM factory (anthropic/openai/google) */
  llmProvider: string;
}

/**
 * Provider-specific directory and file naming
 */
export interface ProviderPaths {
  /** Config directory name inside project (e.g., '.claude' or '.codex') */
  configDir: string;
  /** Instruction/context file name (e.g., 'CLAUDE.md' or 'AGENTS.md') */
  instructionFile: string;
  /** Temp directory name (e.g., '.claude-temp' or '.codex-temp') */
  tempDir: string;
  /** Backup directory name */
  backupDir: string;
  /** Home config directory (e.g., '~/.claude' or '~/.codex') */
  homeConfigDir: string;
  /** Hooks file name (e.g., 'settings.json' or 'hooks.json') */
  hooksFile: string;
  /** Credentials storage path relative to home */
  credentialsPath: string;
}

/**
 * Provider-specific CLI flags and commands
 */
export interface ProviderCLIConfig {
  /** Flag to specify agent/system prompt file (null if not supported) */
  agentFileFlag: string | null;
  /** Flag to specify model */
  modelFlag: string;
  /** Flag to bypass all permissions/approvals */
  bypassPermissionsFlag: string;
  /** Flag to specify tools restriction (null if not supported) */
  toolsFlag: string | null;
  /** Flag to specify session ID (null if managed internally) */
  sessionFlag: string | null;
  /** Flag/subcommand to resume session */
  resumeFlag: string;
  /** Flag to specify settings/config file (null if not supported) */
  settingsFlag: string | null;
  /** Environment variable to skip confirmations (null if not applicable) */
  skipConfirmationsEnvVar: string | null;
  /** Non-interactive subcommand (e.g., 'exec' for codex) */
  nonInteractiveMode: string;
  /** Flag for JSON output */
  jsonOutputFlag: string;
}
