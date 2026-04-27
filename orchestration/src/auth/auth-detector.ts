import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { ensureCodexAuthentication } from './codex-auth.js';

/**
 * Authentication modes supported by the framework
 */
export enum AuthMode {
  /** Deprecated: LangChain/DeepAgents API-key mode is no longer selected automatically */
  API_KEY = 'api_key',

  /** Use Claude CLI with subscription auth (Claude Pro/Max, TOS-compliant) */
  CLAUDE_CLI = 'claude_cli',

  /** Use Codex CLI with subscription auth or OPENAI_API_KEY-backed CLI auth */
  CODEX_CLI = 'codex_cli',

  /** No authentication available */
  NONE = 'none',
}

/**
 * Authentication configuration detected by the system
 */
export interface AuthConfig {
  /** Selected authentication mode */
  mode: AuthMode;

  /** Provider selected for CLI execution (anthropic, openai) */
  provider?: string;

  /** Whether Claude CLI is available on the system */
  hasClaudeCLI: boolean;

  /** Whether Codex CLI is available on the system */
  hasCodexCLI: boolean;

  /** Whether an API key is set */
  hasAPIKey: boolean;

  /** Version of Claude CLI if available */
  claudeCLIVersion?: string;

  /** Version of Codex CLI if available */
  codexCLIVersion?: string;
}

/**
 * Detect available authentication methods and select the best option
 *
 * Priority order:
 * 1. Explicit PROVIDER (claude/codex)
 * 2. Provider API keys as CLI provider selectors (ANTHROPIC_API_KEY, OPENAI_API_KEY)
 * 3. Claude CLI with subscription authentication
 * 4. Codex CLI with subscription authentication
 * 5. None (error state)
 *
 * @returns Authentication configuration
 *
 * @example
 * ```typescript
 * const authConfig = await detectAuthMode();
 *
 * if (authConfig.mode === AuthMode.CLAUDE_CLI) {
 *   console.log('Using Claude CLI with subscription');
 * } else {
 *   throw new Error('No authentication available');
 * }
 * ```
 */
export async function detectAuthMode(): Promise<AuthConfig> {
  // Check CLI availability for both providers
  const hasClaudeCLI = await isClaudeCLIAvailable();
  const claudeCLIVersion = hasClaudeCLI ? await getClaudeCLIVersion() : undefined;
  const hasCodexCLI = await isCodexCLIAvailable();
  const codexCLIVersion = hasCodexCLI ? await getCodexCLIVersion() : undefined;

  const baseConfig = { hasClaudeCLI, hasCodexCLI, claudeCLIVersion, codexCLIVersion };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Priority 1: Explicit PROVIDER env var — STRICT (no fallback)
  const explicitProvider = process.env.PROVIDER?.toLowerCase();

  if (explicitProvider === 'codex' || explicitProvider === 'openai') {
    if (!hasCodexCLI) {
      const frameworkPath = process.env.FRAMEWORK_PATH || '.';
      throw new Error(
        `Provider 'codex' was requested but Codex CLI is not installed.\n\n` +
          `The framework bundles Codex CLI locally. Install dependencies:\n` +
          `  cd ${frameworkPath}/orchestration && pnpm install\n\n` +
          `Then authenticate the local CLI:\n` +
          `  "${frameworkPath}/orchestration/node_modules/.bin/codex" login`,
      );
    }
    const authResult = ensureCodexCLIAuthentication();
    if (!authResult.authenticated) {
      const localPath = resolveLocalCLIPath('codex');
      const codexCmd = localPath ? `"${localPath}"` : 'codex';
      const apiKeyLoginFailure = authResult.attemptedApiKeyLogin
        ? `\n\nAutomatic Codex API-key login failed${authResult.error ? `: ${authResult.error}` : '.'}\n` +
          `You can retry manually:\n` +
          `  printenv OPENAI_API_KEY | ${codexCmd} login --with-api-key`
        : '';
      throw new Error(
        `Provider 'codex' was requested but Codex CLI is not authenticated.\n\n` +
          `Please authenticate:\n` +
          `  ${codexCmd} login\n\n` +
          `If you have OPENAI_API_KEY set, the framework will attempt API-key login automatically.` +
          apiKeyLoginFailure,
      );
    }
    return {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasAPIKey: !!openaiKey,
      ...baseConfig,
    };
  }

  if (explicitProvider === 'claude' || explicitProvider === 'anthropic') {
    if (!hasClaudeCLI) {
      throw new Error(
        `Provider 'claude' was requested but Claude CLI is not installed.\n\n` +
          `Install with: npm install -g @anthropic-ai/claude-code\n` +
          `Or run: cd orchestration && pnpm install\n\n` +
          `Then authenticate: claude login`,
      );
    }
    if (!anthropicKey && !(await isClaudeCLIAuthenticated())) {
      throw new Error(
        `Provider 'claude' was requested but Claude CLI is not authenticated.\n\n` +
          `Please authenticate: claude login\n\n` +
          `Or set ANTHROPIC_API_KEY before running the framework.`,
      );
    }
    return {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
      hasAPIKey: !!anthropicKey,
      ...baseConfig,
    };
  }

  // Priority 2: Provider API keys select the matching CLI implementation.
  if (anthropicKey) {
    if (!hasClaudeCLI) {
      throw new Error(
        `ANTHROPIC_API_KEY is set, but Claude CLI is not installed.\n\n` +
          `Install with: npm install -g @anthropic-ai/claude-code\n` +
          `Or run: cd orchestration && pnpm install`,
      );
    }

    return {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
      hasAPIKey: true,
      ...baseConfig,
    };
  }

  if (openaiKey) {
    if (!hasCodexCLI) {
      const frameworkPath = process.env.FRAMEWORK_PATH || '.';
      throw new Error(
        `OPENAI_API_KEY is set, but Codex CLI is not installed.\n\n` +
          `The framework bundles Codex CLI locally. Install dependencies:\n` +
          `  cd ${frameworkPath}/orchestration && pnpm install\n\n` +
          `Then authenticate with the key in your environment:\n` +
          `  "${frameworkPath}/orchestration/node_modules/.bin/codex" login`,
      );
    }

    const authResult = ensureCodexCLIAuthentication();
    if (!authResult.authenticated) {
      const localPath = resolveLocalCLIPath('codex');
      const codexCmd = localPath ? `"${localPath}"` : 'codex';
      throw new Error(
        `OPENAI_API_KEY is set, but Codex CLI is not authenticated.\n\n` +
          `Automatic Codex API-key login failed${authResult.error ? `: ${authResult.error}` : '.'}\n\n` +
          `You can retry manually:\n` +
          `  printenv OPENAI_API_KEY | ${codexCmd} login --with-api-key`,
      );
    }

    return {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasAPIKey: true,
      ...baseConfig,
    };
  }

  // GOOGLE_API_KEY is intentionally ignored: there is no supported Google CLI provider.

  // Priority 3: Auto-detect CLI (Claude first, then Codex)
  if (hasClaudeCLI && (await isClaudeCLIAuthenticated())) {
    return {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
      hasAPIKey: false,
      ...baseConfig,
    };
  }

  if (hasCodexCLI && (await isCodexCLIAuthenticated())) {
    return {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasAPIKey: false,
      ...baseConfig,
    };
  }

  // Priority 4: No authentication available
  return { mode: AuthMode.NONE, hasAPIKey: false, ...baseConfig };
}

/**
 * Get the resolved path to a CLI binary, checking local bundled first, then global.
 * Returns the path if found, null if not.
 */
function resolveLocalCLIPath(binaryName: string): string | null {
  const frameworkPath = process.env.FRAMEWORK_PATH;
  if (frameworkPath) {
    const localPath = join(frameworkPath, 'orchestration/node_modules/.bin', binaryName);
    if (existsSync(localPath)) {
      return localPath;
    }
  }
  return null;
}

/**
 * Check if Claude CLI is installed and available in PATH
 */
export async function isClaudeCLIAvailable(): Promise<boolean> {
  if (resolveLocalCLIPath('claude')) return true;

  try {
    execSync('which claude', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Claude CLI version string
 */
export async function getClaudeCLIVersion(): Promise<string | undefined> {
  try {
    const localPath = resolveLocalCLIPath('claude');
    const cmd = localPath ? `"${localPath}" --version` : 'claude --version';
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if Claude CLI is authenticated (has valid subscription or API key)
 *
 * This performs a lightweight check by attempting to get the version.
 * If the CLI is not authenticated, it will fail.
 */
export async function isClaudeCLIAuthenticated(): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY) return true;

  try {
    // Try a simple command that requires authentication
    // Using --version should work without auth, but we can try a more specific check
    execSync('claude --help', {
      stdio: 'ignore',
      timeout: 5000,
    });

    // If we got here, Claude CLI is installed
    // Now check if credentials exist
    return await hasClaudeCredentials();
  } catch {
    return false;
  }
}

/**
 * Check if Claude CLI has stored credentials
 *
 * Credentials are stored in:
 * - macOS: Keychain
 * - Linux/Windows: ~/.claude/.credentials.json
 */
async function hasClaudeCredentials(): Promise<boolean> {
  try {
    const os = process.platform;

    if (os === 'darwin') {
      // macOS: Check keychain
      // Note: We can't directly query keychain without prompting user
      // Instead, we'll assume if CLI is installed, credentials are set
      return true;
    } else {
      // Linux/Windows: Check credentials file
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
      return fs.existsSync(credentialsPath);
    }
  } catch {
    return false;
  }
}

/**
 * Check if Codex CLI is installed (local bundled or global)
 */
export async function isCodexCLIAvailable(): Promise<boolean> {
  // Check local bundled first
  if (resolveLocalCLIPath('codex')) return true;

  // Check global
  try {
    execSync('which codex', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Codex CLI version string
 */
export async function getCodexCLIVersion(): Promise<string | undefined> {
  try {
    const localPath = resolveLocalCLIPath('codex');
    const cmd = localPath ? `"${localPath}" --version` : 'codex --version';
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if Codex CLI is authenticated using `codex login status`
 * Exits 0 when logged in, non-zero otherwise.
 */
export async function isCodexCLIAuthenticated(): Promise<boolean> {
  return ensureCodexCLIAuthentication().authenticated;
}

function ensureCodexCLIAuthentication() {
  const localPath = resolveLocalCLIPath('codex');
  const codexPath = localPath ?? 'codex';
  return ensureCodexAuthentication(codexPath);
}

/**
 * Get a user-friendly error message for missing authentication
 */
export function getAuthErrorMessage(authConfig: AuthConfig): string {
  const lines = [
    '❌ No authentication available',
    '',
    'Please choose one of the following options:',
    '',
  ];

  // Option 1: API keys as CLI provider authentication/selection
  lines.push('Option 1: Use a provider CLI with an API key in the environment');
  lines.push('  Set one of the following environment variables before running the CLI:');
  lines.push('  export ANTHROPIC_API_KEY=sk-ant-...');
  lines.push('  export OPENAI_API_KEY=sk-...');
  lines.push('');

  // Option 2: Codex CLI
  if (authConfig.hasCodexCLI) {
    lines.push('Option 2: Authenticate Codex CLI (uses your ChatGPT subscription)');
    lines.push('  codex login');
    lines.push('');
  } else {
    lines.push('Option 2: Install and authenticate Codex CLI');
    lines.push('  npm install -g @openai/codex');
    lines.push('  codex login');
    lines.push('');
  }

  // Option 3: Claude CLI
  if (authConfig.hasClaudeCLI) {
    lines.push('Option 3: Authenticate Claude CLI (uses your Claude Pro/Max subscription)');
    lines.push('  claude login');
    lines.push('');
  } else {
    lines.push('Option 3: Install and authenticate Claude CLI');
    lines.push('  Visit: https://code.claude.com');
    lines.push('  Then run: claude login');
    lines.push('');
  }

  lines.push('For more information, see:');
  lines.push('  - API Keys: https://platform.claude.com or https://platform.openai.com');
  lines.push('  - Claude CLI: https://code.claude.com/docs/en/authentication');
  lines.push('  - Codex CLI: https://developers.openai.com/codex/cli');

  return lines.join('\n');
}
