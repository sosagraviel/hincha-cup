import { execFileSync, spawnSync } from 'child_process';

export interface CodexAuthenticationResult {
  authenticated: boolean;
  attemptedApiKeyLogin: boolean;
  apiKeyLoginSucceeded: boolean;
  error?: string;
}

/**
 * Ensure Codex CLI is authenticated.
 *
 * If OPENAI_API_KEY is set and `codex login status` fails, this attempts the
 * non-interactive API-key login flow by passing the key through stdin. The key
 * must never be interpolated into a shell command.
 */
export function ensureCodexAuthentication(
  codexPath: string,
  apiKey = process.env.OPENAI_API_KEY,
): CodexAuthenticationResult {
  if (checkCodexAuthentication(codexPath)) {
    return { authenticated: true, attemptedApiKeyLogin: false, apiKeyLoginSucceeded: false };
  }

  if (!apiKey) {
    return { authenticated: false, attemptedApiKeyLogin: false, apiKeyLoginSucceeded: false };
  }

  const loginResult = spawnSync(codexPath, ['login', '--with-api-key'], {
    input: `${apiKey}\n`,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (loginResult.error) {
    return {
      authenticated: false,
      attemptedApiKeyLogin: true,
      apiKeyLoginSucceeded: false,
      error: loginResult.error.message,
    };
  }

  if (loginResult.status !== 0) {
    return {
      authenticated: false,
      attemptedApiKeyLogin: true,
      apiKeyLoginSucceeded: false,
      error: `codex login --with-api-key exited with code ${loginResult.status ?? 'unknown'}`,
    };
  }

  const authenticated = checkCodexAuthentication(codexPath);
  return {
    authenticated,
    attemptedApiKeyLogin: true,
    apiKeyLoginSucceeded: authenticated,
    error: authenticated ? undefined : 'codex login status still failed after API-key login',
  };
}

/**
 * Check if Codex CLI is authenticated by running `codex login status`.
 */
export function checkCodexAuthentication(codexPath: string): boolean {
  try {
    execFileSync(codexPath, ['login', 'status'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
