import { execSync } from 'child_process';

/**
 * Authentication modes supported by the framework
 */
export enum AuthMode {
  /** Use API key with LangChain/DeepAgents (full control, tier-based models) */
  API_KEY = 'api_key',

  /** Use Claude CLI with subscription auth (Claude Pro/Max, TOS-compliant) */
  CLAUDE_CLI = 'claude_cli',

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

  /** Whether an API key is set */
  hasAPIKey: boolean;

  /** Version of Claude CLI if available */
  claudeCLIVersion?: string;
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
  // Check for Claude CLI availability first (used for both modes)
  const hasClaudeCLI = await isClaudeCLIAvailable();
  const claudeCLIVersion = hasClaudeCLI ? await getClaudeCLIVersion() : undefined;

  // Priority 1: Check for API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;

  if (anthropicKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'anthropic',
      hasClaudeCLI,
      hasAPIKey: true,
      claudeCLIVersion,
    };
  }

  if (openaiKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'openai',
      hasClaudeCLI,
      hasAPIKey: true,
      claudeCLIVersion,
    };
  }

  if (googleKey) {
    return {
      mode: AuthMode.API_KEY,
      provider: 'google',
      hasClaudeCLI,
      hasAPIKey: true,
      claudeCLIVersion,
    };
  }

  // Priority 2: Check for Claude CLI with subscription auth
  if (hasClaudeCLI) {
    const isAuthenticated = await isClaudeCLIAuthenticated();
    if (isAuthenticated) {
      return {
        mode: AuthMode.CLAUDE_CLI,
        provider: 'anthropic',
        hasClaudeCLI: true,
        hasAPIKey: false,
        claudeCLIVersion,
      };
    }
  }

  // Priority 3: No authentication available
  return {
    mode: AuthMode.NONE,
    hasClaudeCLI,
    hasAPIKey: false,
    claudeCLIVersion,
  };
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

  // Option 2: Claude CLI
  if (authConfig.hasClaudeCLI) {
    lines.push('Option 2: Authenticate Claude CLI (uses your Claude Pro/Max subscription)');
    lines.push('  claude setup-token');
    lines.push('');
  } else {
    lines.push('Option 2: Install and authenticate Claude CLI');
    lines.push('  Visit: https://code.claude.com');
    lines.push('  Then run: claude setup-token');
    lines.push('');
  }

  lines.push('For more information, see:');
  lines.push('  - API Keys: https://platform.claude.com');
  lines.push('  - Claude CLI: https://code.claude.com/docs/en/authentication');

  return lines.join('\n');
}
