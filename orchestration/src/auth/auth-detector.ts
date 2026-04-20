import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Authentication modes supported by the framework
 */
export enum AuthMode {
  /** Use API key with LangChain/DeepAgents (full control, tier-based models) */
  API_KEY = 'api_key',

  /** Use Claude CLI with subscription auth (Claude Pro/Max, TOS-compliant) */
  CLAUDE_CLI = 'claude_cli',

  /** Use Codex CLI with subscription auth (ChatGPT Plus/Pro/Enterprise) */
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

  /** Provider for API key mode (anthropic, openai, google) */
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
 * 1. API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
 * 2. Claude CLI with subscription authentication
 * 3. None (error state)
 *
 * @returns Authentication configuration
 *
 * @example
 * ```typescript
 * const authConfig = await detectAuthMode();
 *
 * if (authConfig.mode === AuthMode.API_KEY) {
 *   console.log(`Using API key for ${authConfig.provider}`);
 * } else if (authConfig.mode === AuthMode.CLAUDE_CLI) {
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

  // Priority 1: Check for API keys (respect PROVIDER preference for ordering)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const providerHint = process.env.PROVIDER?.toLowerCase();

  // If explicit provider is set and matching API key exists, prefer that
  if (providerHint === 'codex' || providerHint === 'openai') {
    if (openaiKey) {
      return { mode: AuthMode.API_KEY, provider: 'openai', hasAPIKey: true, ...baseConfig };
    }
  }
  if (providerHint === 'claude' || providerHint === 'anthropic') {
    if (anthropicKey) {
      return { mode: AuthMode.API_KEY, provider: 'anthropic', hasAPIKey: true, ...baseConfig };
    }
  }

  // Default API key priority (no explicit provider)
  if (anthropicKey) {
    return { mode: AuthMode.API_KEY, provider: 'anthropic', hasAPIKey: true, ...baseConfig };
  }

  if (openaiKey) {
    return { mode: AuthMode.API_KEY, provider: 'openai', hasAPIKey: true, ...baseConfig };
  }

  if (googleKey) {
    return { mode: AuthMode.API_KEY, provider: 'google', hasAPIKey: true, ...baseConfig };
  }

  // Priority 2: Explicit PROVIDER env var — STRICT (no fallback)
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
    if (!(await isCodexCLIAuthenticated())) {
      const localPath = resolveLocalCLIPath('codex');
      const codexCmd = localPath ? `"${localPath}"` : 'codex';
      throw new Error(
        `Provider 'codex' was requested but Codex CLI is not authenticated.\n\n` +
          `Please authenticate:\n` +
          `  ${codexCmd} login\n\n` +
          `Or use API key mode instead:\n` +
          `  export OPENAI_API_KEY="your-api-key-here"`,
      );
    }
    return {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasAPIKey: false,
      ...baseConfig,
    };
  }

  if (explicitProvider === 'claude' || explicitProvider === 'anthropic') {
    if (!hasClaudeCLI) {
      throw new Error(
        `Provider 'claude' was requested but Claude CLI is not installed.\n\n` +
          `Install with: npm install -g @anthropic-ai/claude-code\n` +
          `Or run: cd orchestration && pnpm install\n\n` +
          `Then authenticate: claude setup-token`,
      );
    }
    if (!(await isClaudeCLIAuthenticated())) {
      throw new Error(
        `Provider 'claude' was requested but Claude CLI is not authenticated.\n\n` +
          `Please authenticate: claude setup-token\n\n` +
          `Or use API key mode instead:\n` +
          `  export ANTHROPIC_API_KEY="your-api-key-here"`,
      );
    }
    return {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
      hasAPIKey: false,
      ...baseConfig,
    };
  }

  // Priority 3: Auto-detect CLI (check both, prefer whichever is authenticated)
  if (hasCodexCLI && (await isCodexCLIAuthenticated())) {
    return {
      mode: AuthMode.CODEX_CLI,
      provider: 'openai',
      hasAPIKey: false,
      ...baseConfig,
    };
  }

  if (hasClaudeCLI && (await isClaudeCLIAuthenticated())) {
    return {
      mode: AuthMode.CLAUDE_CLI,
      provider: 'anthropic',
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

/**
 * Check if Claude CLI is authenticated (has valid subscription or API key)
 *
 * This performs a lightweight check by attempting to get the version.
 * If the CLI is not authenticated, it will fail.
 */
export async function isClaudeCLIAuthenticated(): Promise<boolean> {
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
 * Check if Codex CLI is authenticated using `codex login --verify`
 * Exits 0 when logged in, non-zero otherwise.
 * Also accepts OPENAI_API_KEY as valid auth.
 */
export async function isCodexCLIAuthenticated(): Promise<boolean> {
  // API key is always valid auth for Codex
  if (process.env.OPENAI_API_KEY) return true;

  try {
    const localPath = resolveLocalCLIPath('codex');
    const cmd = localPath ? `"${localPath}" login --verify` : 'codex login --verify';
    execSync(cmd, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
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

  // Option 1: API Key (any provider)
  lines.push('Option 1: Use API Key (recommended for CI/CD and automation)');
  lines.push('  Set one of the following environment variables:');
  lines.push('  export ANTHROPIC_API_KEY=sk-ant-...');
  lines.push('  export OPENAI_API_KEY=sk-...');
  lines.push('  export GOOGLE_API_KEY=...');
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
    lines.push('  claude setup-token');
    lines.push('');
  } else {
    lines.push('Option 3: Install and authenticate Claude CLI');
    lines.push('  Visit: https://code.claude.com');
    lines.push('  Then run: claude setup-token');
    lines.push('');
  }

  lines.push('For more information, see:');
  lines.push('  - API Keys: https://platform.claude.com or https://platform.openai.com');
  lines.push('  - Claude CLI: https://code.claude.com/docs/en/authentication');
  lines.push('  - Codex CLI: https://developers.openai.com/codex/cli');

  return lines.join('\n');
}
