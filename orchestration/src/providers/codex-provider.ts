/**
 * OpenAI Codex CLI provider adapter.
 *
 * Encapsulates all Codex CLI-specific behavior: path detection,
 * model mapping, CLI arg building, auth checking, and output parsing.
 *
 * Key differences from Claude:
 * - Uses AGENTS.md instead of CLAUDE.md
 * - Uses .codex/ instead of .claude/
 * - CLI invocation: `codex exec "prompt" --model <model> --yolo`
 * - No --agent flag (agent instructions injected via prompt or AGENTS.md)
 * - Sessions managed internally (codex resume for resuming)
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

export class CodexProvider implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config?: Partial<ProviderConfig>) {
    this.config = {
      provider: Provider.CODEX,
      authMethod: config?.authMethod ?? AuthMethod.NONE,
      llmProvider: 'openai',
      ...config,
    };
  }

  getConfig(): ProviderConfig {
    return this.config;
  }

  getPaths(): ProviderPaths {
    return {
      configDir: '.codex',
      instructionFile: 'AGENTS.md',
      tempDir: '.codex-temp',
      backupDir: '.codex-backups',
      homeConfigDir: '.codex',
      hooksFile: 'hooks.json',
      credentialsPath: '.codex/auth.json',
    };
  }

  getCLIConfig(): ProviderCLIConfig {
    return {
      agentFileFlag: null, // Codex reads AGENTS.md from directory hierarchy
      modelFlag: '--model',
      bypassPermissionsFlag: '--yolo',
      toolsFlag: null, // Codex manages tools internally
      sessionFlag: null, // Codex manages sessions internally
      resumeFlag: 'resume', // codex resume <id>
      settingsFlag: '--config',
      skipConfirmationsEnvVar: null, // Use --yolo instead
      nonInteractiveMode: 'exec',
      jsonOutputFlag: '--json',
    };
  }

  buildCLIArgs(params: BuildCLIArgsParams): string[] {
    const args = [
      'exec',
      params.inputPrompt,
      '--model',
      params.model,
      '--yolo', // Bypass all approvals and sandboxing
      '--skip-git-repo-check',
    ];

    return args;
  }

  buildEnvVars(frameworkPath: string): Record<string, string> {
    return {
      FRAMEWORK_PATH: frameworkPath,
    };
  }

  mapModelToCLI(modelAlias: string): string {
    if (modelAlias.includes('gpt5-latest') || modelAlias === 'gpt5-latest') return 'gpt-5.4';
    if (modelAlias.includes('gpt5-mini') || modelAlias === 'gpt5-mini') return 'gpt-5.4-mini';
    if (modelAlias.includes('codex')) return 'gpt-5.3-codex';
    if (modelAlias.includes('o3')) return 'o3';
    if (modelAlias.includes('o4-mini')) return 'o4-mini';
    return 'gpt-5.4';
  }

  async isCLIAvailable(): Promise<boolean> {
    try {
      execSync('which codex', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getCLIVersion(): Promise<string | undefined> {
    try {
      const output = execSync('codex --version', {
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
      const os = await import('os');
      const path = await import('path');

      // Check ~/.codex/auth.json for stored credentials
      const authPath = path.join(os.homedir(), '.codex', 'auth.json');
      if (existsSync(authPath)) {
        const authData = JSON.parse(readFileSync(authPath, 'utf-8'));
        return !!(authData.access_token || authData.api_key || authData.refresh_token);
      }

      // Fallback: check OPENAI_API_KEY env var
      return !!process.env.OPENAI_API_KEY;
    } catch {
      return false;
    }
  }

  getCLIPath(frameworkPath: string): { path: string; version: string } {
    const localCodexPath = join(frameworkPath, 'orchestration/node_modules/.bin/codex');

    if (existsSync(localCodexPath)) {
      try {
        const version = execSync(`"${localCodexPath}" --version`, {
          encoding: 'utf-8',
        }).trim();

        const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          return { path: localCodexPath, version: versionMatch[1] };
        }
      } catch {
        // Fall through to global check
      }
    }

    try {
      const globalVersion = execSync('codex --version', { encoding: 'utf-8' }).trim();
      const versionMatch = globalVersion.match(/(\d+\.\d+\.\d+)/);

      if (versionMatch) {
        return { path: 'codex', version: versionMatch[1] };
      }

      throw new Error(`Could not determine Codex CLI version from: ${globalVersion}`);
    } catch (error) {
      throw new Error(
        `Codex CLI not found or version check failed.\n` +
          `  Local path checked: ${localCodexPath}\n` +
          `  Global 'codex' command: Not found\n\n` +
          `Install with: npm install -g @openai/codex\n` +
          `Or authenticate with: codex login\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  parseCLIOutput(stdout: string): string {
    // Codex --json outputs newline-delimited JSON events
    // Extract the final message content
    const lines = stdout.trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]);
        if (event.type === 'message' && event.content) {
          return event.content;
        }
      } catch {
        continue;
      }
    }
    // Fallback: return raw stdout
    return stdout;
  }

  detectRateLimit(stdout: string, stderr: string): RateLimitInfo | null {
    const isRateLimited =
      stderr.includes('429') ||
      stdout.includes('rate limit') ||
      stdout.includes('capacity') ||
      stderr.includes('rate limit');

    if (!isRateLimited) return null;

    return {
      isRateLimited: true,
      message:
        `RATE_LIMIT: Codex CLI usage limit reached.\n` +
        `Options:\n` +
        `  1. Wait for the 5-hour rate limit window to reset\n` +
        `  2. Set OPENAI_API_KEY environment variable for API key mode\n` +
        `  3. Upgrade to Pro (5x/20x) for higher limits`,
    };
  }

  getAuthErrorMessage(): string {
    return [
      'Codex CLI authentication required.',
      '',
      'Option 1: Use API Key',
      '  export OPENAI_API_KEY=sk-...',
      '',
      'Option 2: Authenticate Codex CLI (uses ChatGPT subscription)',
      '  codex login',
      '',
      'For more information:',
      '  https://developers.openai.com/codex/cli',
    ].join('\n');
  }

  getValidFrontmatterFields(): string[] {
    // Codex doesn't have a formal agent file format with frontmatter,
    // but our framework uses frontmatter for metadata
    return ['name', 'description', 'model'];
  }

  getInstructionFileMarkers(): { sectionStart: string; sectionEnd: string } {
    return {
      sectionStart: '# AGENTS.md Content',
      sectionEnd: '---',
    };
  }

  /**
   * Detect configuration from environment
   */
  static async detectConfig(): Promise<Partial<ProviderConfig>> {
    const hasAPIKey = !!process.env.OPENAI_API_KEY;
    if (hasAPIKey) {
      return {
        provider: Provider.CODEX,
        authMethod: AuthMethod.API_KEY,
        apiKeyEnvVar: 'OPENAI_API_KEY',
        llmProvider: 'openai',
      };
    }

    const provider = new CodexProvider();
    const isAvailable = await provider.isCLIAvailable();
    if (isAvailable) {
      const isAuth = await provider.isCLIAuthenticated();
      const version = await provider.getCLIVersion();
      return {
        provider: Provider.CODEX,
        authMethod: isAuth ? AuthMethod.CLI_SUBSCRIPTION : AuthMethod.NONE,
        cliVersion: version,
        llmProvider: 'openai',
      };
    }

    return {
      provider: Provider.CODEX,
      authMethod: AuthMethod.NONE,
      llmProvider: 'openai',
    };
  }
}
