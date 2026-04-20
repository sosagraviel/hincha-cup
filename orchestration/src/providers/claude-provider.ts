/**
 * Claude Code provider adapter.
 *
 * Encapsulates all Claude CLI-specific behavior: path detection,
 * model mapping, CLI arg building, auth checking, and output parsing.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  Provider,
  AuthMethod,
  type ProviderConfig,
  type ProviderPaths,
  type ProviderCLIConfig,
} from './types.js';
import type { ProviderAdapter, BuildCLIArgsParams, RateLimitInfo } from './provider-adapter.js';

export class ClaudeProvider implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config?: Partial<ProviderConfig>) {
    this.config = {
      provider: Provider.CLAUDE,
      authMethod: config?.authMethod ?? AuthMethod.NONE,
      llmProvider: 'anthropic',
      ...config,
    };
  }

  getConfig(): ProviderConfig {
    return this.config;
  }

  getPaths(): ProviderPaths {
    return {
      configDir: '.claude',
      instructionFile: 'CLAUDE.md',
      tempDir: '.claude-temp',
      backupDir: '.claude-backups',
      homeConfigDir: '.claude',
      hooksFile: 'settings.json',
      credentialsPath: '.claude/.credentials.json',
    };
  }

  getCLIConfig(): ProviderCLIConfig {
    return {
      agentFileFlag: '--agent',
      modelFlag: '--model',
      bypassPermissionsFlag: '--dangerously-skip-permissions',
      toolsFlag: '--tools',
      sessionFlag: '--session-id',
      resumeFlag: '--resume',
      settingsFlag: '--settings',
      skipConfirmationsEnvVar: 'CLAUDE_SKIP_CONFIRMATIONS',
      nonInteractiveMode: '-p',
      jsonOutputFlag: '--output-format json',
    };
  }

  buildCLIArgs(params: BuildCLIArgsParams): string[] {
    const args = ['--agent', params.agentFilePath, '--model', params.model];

    if (params.tools) {
      args.push('--tools', params.tools);
    } else {
      args.push('--dangerously-skip-permissions');
    }

    if (params.isRetry) {
      args.push('--resume', params.sessionId);
    } else {
      args.push('--session-id', params.sessionId);
    }

    if (params.settingsPath) {
      args.push('--settings', params.settingsPath);
    }

    return args;
  }

  buildEnvVars(frameworkPath: string): Record<string, string> {
    return {
      CLAUDE_SKIP_CONFIRMATIONS: '1',
      FRAMEWORK_PATH: frameworkPath,
    };
  }

  mapModelToCLI(modelAlias: string): string {
    if (modelAlias.includes('sonnet')) return 'sonnet';
    if (modelAlias.includes('opus')) return 'opus';
    if (modelAlias.includes('haiku')) return 'haiku';
    return 'sonnet';
  }

  async isCLIAvailable(): Promise<boolean> {
    try {
      execSync('which claude', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getCLIVersion(): Promise<string | undefined> {
    try {
      const output = execSync('claude --version', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.trim();
    } catch {
      return undefined;
    }
  }

  async isCLIAuthenticated(): Promise<boolean> {
    try {
      execSync('claude --help', { stdio: 'ignore', timeout: 5000 });

      const os = await import('os');
      const path = await import('path');

      if (process.platform === 'darwin') {
        return true;
      }

      const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
      return existsSync(credentialsPath);
    } catch {
      return false;
    }
  }

  getCLIPath(frameworkPath: string): { path: string; version: string } {
    const localClaudePath = join(frameworkPath, 'orchestration/node_modules/.bin/claude');

    if (existsSync(localClaudePath)) {
      try {
        const version = execSync(`"${localClaudePath}" --version`, {
          encoding: 'utf-8',
        }).trim();

        const versionMatch = version.match(/^(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          const [major] = versionMatch[1].split('.').map(Number);
          if (major >= 2) {
            return { path: localClaudePath, version: versionMatch[1] };
          }
        }
      } catch {
        // Fall through to global check
      }
    }

    try {
      const globalVersion = execSync('claude --version', { encoding: 'utf-8' }).trim();
      const versionMatch = globalVersion.match(/^(\d+\.\d+\.\d+)/);

      if (versionMatch) {
        const [major] = versionMatch[1].split('.').map(Number);
        if (major >= 2) {
          return { path: 'claude', version: versionMatch[1] };
        }
        throw new Error(
          `Claude CLI version ${versionMatch[1]} is too old (requires v2.0+). ` +
            `Try running: cd orchestration && pnpm install`,
        );
      }

      throw new Error(`Could not determine Claude CLI version from: ${globalVersion}`);
    } catch (error) {
      throw new Error(
        `Claude CLI not found or version check failed.\n` +
          `  Local path checked: ${localClaudePath}\n` +
          `  Global 'claude' command: Not found or too old\n\n` +
          `Install with: cd orchestration && pnpm install\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  parseCLIOutput(stdout: string): string {
    return stdout;
  }

  detectRateLimit(stdout: string, _stderr: string): RateLimitInfo | null {
    const isRateLimited =
      stdout.includes('Limit reached') ||
      stdout.includes('resets') ||
      stdout.includes('/upgrade to Max');

    if (!isRateLimited) return null;

    const resetMatch = stdout.match(/resets (\d+(?:am|pm)) \(([^)]+)\)/);
    const resetTime = resetMatch ? `${resetMatch[1]} ${resetMatch[2]}` : 'unknown';

    return {
      isRateLimited: true,
      resetTime,
      message:
        `RATE_LIMIT: Claude CLI usage limit reached. Resets at ${resetTime}.\n` +
        `Options:\n` +
        `  1. Wait until rate limit resets\n` +
        `  2. Set ANTHROPIC_API_KEY environment variable to use API key mode\n` +
        `  3. Upgrade to Max (20x limits) or enable /extra-usage`,
    };
  }

  getAuthErrorMessage(): string {
    return [
      'Claude CLI authentication required.',
      '',
      'Option 1: Use API Key',
      '  export ANTHROPIC_API_KEY=sk-ant-...',
      '',
      'Option 2: Authenticate Claude CLI',
      '  claude setup-token',
      '',
      'For more information:',
      '  https://code.claude.com',
    ].join('\n');
  }

  getValidFrontmatterFields(): string[] {
    return [
      'name',
      'description',
      'model',
      'tools',
      'disallowedTools',
      'permissionMode',
      'maxTurns',
      'skills',
      'mcpServers',
      'hooks',
      'memory',
      'background',
      'effort',
      'isolation',
      'initialPrompt',
      'user-prompt-submit-hook',
      'assistant-message-hook',
      'pre-tool-use-hook',
      'post-tool-use-hook',
      'stop-hook',
    ];
  }

  getInstructionFileMarkers(): { sectionStart: string; sectionEnd: string } {
    return {
      sectionStart: '# CLAUDE.md Content',
      sectionEnd: '---',
    };
  }

  /**
   * Detect configuration from environment
   */
  static async detectConfig(): Promise<Partial<ProviderConfig>> {
    const hasAPIKey = !!process.env.ANTHROPIC_API_KEY;
    if (hasAPIKey) {
      return {
        provider: Provider.CLAUDE,
        authMethod: AuthMethod.API_KEY,
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        llmProvider: 'anthropic',
      };
    }

    const provider = new ClaudeProvider();
    const isAvailable = await provider.isCLIAvailable();
    if (isAvailable) {
      const isAuth = await provider.isCLIAuthenticated();
      const version = await provider.getCLIVersion();
      return {
        provider: Provider.CLAUDE,
        authMethod: isAuth ? AuthMethod.CLI_SUBSCRIPTION : AuthMethod.NONE,
        cliVersion: version,
        llmProvider: 'anthropic',
      };
    }

    return {
      provider: Provider.CLAUDE,
      authMethod: AuthMethod.NONE,
      llmProvider: 'anthropic',
    };
  }
}
