/**
 * Provider adapter interface.
 *
 * Each provider (Claude, Codex) implements this interface to encapsulate
 * all provider-specific behavior. The framework interacts with providers
 * exclusively through this interface.
 */

import type { ProviderConfig, ProviderPaths, ProviderCLIConfig } from './types.js';

export interface BuildCLIArgsParams {
  agentFilePath: string;
  model: string;
  inputPrompt: string;
  tools?: string | null;
  sessionId: string;
  isRetry: boolean;
  settingsPath?: string;
}

export interface RateLimitInfo {
  isRateLimited: boolean;
  resetTime?: string;
  message?: string;
}

export interface ProviderAdapter {
  /** Get provider configuration */
  getConfig(): ProviderConfig;

  /** Get provider-specific paths */
  getPaths(): ProviderPaths;

  /** Get CLI configuration (flags, subcommands) */
  getCLIConfig(): ProviderCLIConfig;

  /**
   * Build CLI arguments for spawning an agent subprocess
   */
  buildCLIArgs(params: BuildCLIArgsParams): string[];

  /**
   * Build environment variables for the CLI subprocess
   */
  buildEnvVars(frameworkPath: string): Record<string, string>;

  /**
   * Map model alias to CLI-compatible model name
   */
  mapModelToCLI(modelAlias: string): string;

  /**
   * Check if the CLI binary is installed and available
   */
  isCLIAvailable(): Promise<boolean>;

  /**
   * Get CLI version
   */
  getCLIVersion(): Promise<string | undefined>;

  /**
   * Check if CLI is authenticated
   */
  isCLIAuthenticated(): Promise<boolean>;

  /**
   * Get the CLI binary path
   */
  getCLIPath(frameworkPath: string): { path: string; version: string };

  /**
   * Parse CLI output to extract the agent's response
   */
  parseCLIOutput(stdout: string): string;

  /**
   * Detect rate limiting from CLI output
   */
  detectRateLimit(stdout: string, stderr: string): RateLimitInfo | null;

  /**
   * Get user-friendly error message for missing authentication
   */
  getAuthErrorMessage(): string;

  /**
   * Get the set of valid frontmatter fields for this provider's agent files
   */
  getValidFrontmatterFields(): string[];

  /**
   * Get the instruction file content section markers
   * Used by Phase 3 synthesis to know what to generate
   */
  getInstructionFileMarkers(): {
    sectionStart: string;
    sectionEnd: string;
  };
}
