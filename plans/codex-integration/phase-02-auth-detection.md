# Phase 2: Auth & Detection

## Objective

Extend the authentication detection system to support Codex CLI alongside Claude CLI, and update preflight checks to validate either provider's setup.

## Why This Phase Exists

Currently, `auth-detector.ts` only knows about Claude CLI (`which claude`, `claude auth status`, `~/.claude/.credentials.json`). Preflight checks in `preflight-checks.ts` only validate Claude CLI installation and authentication. Without updating these, the framework cannot detect or validate a Codex installation.

## Dependencies

- Phase 1 (Provider types and interfaces)

## Current State Analysis

### `orchestration/src/auth/auth-detector.ts`
- `AuthMode` enum: `API_KEY`, `CLAUDE_CLI`, `NONE`
- `detectAuthMode()`: Checks API keys first, then Claude CLI
- `isClaudeCLIAvailable()`: Runs `which claude`
- `isClaudeCLIAuthenticated()`: Runs `claude --help` + checks `~/.claude/.credentials.json`
- `hasClaudeCredentials()`: Platform-specific credential check

### `orchestration/src/utils/preflight-checks.ts`
- `runPreflightChecks()`: Checks Node.js, npm, Claude CLI, .gitignore
- `checkClaudeAuthentication()`: Runs `claude auth status` and parses JSON
- Returns `PreflightResult` with `claudeVersion` and `authMode`

## Steps

### Step 2.1: Update AuthMode Enum

**File to modify:** `orchestration/src/auth/auth-detector.ts`

**Why:** The current enum has `CLAUDE_CLI` which is provider-specific. We need to either:
- Add `CODEX_CLI` as a separate mode, OR
- Generalize to `CLI` and use the provider adapter to know which CLI

**Decision: Add `CODEX_CLI` mode** because the two CLIs have very different invocation patterns and we need to know which one to use.

```typescript
export enum AuthMode {
  API_KEY = 'api_key',
  CLAUDE_CLI = 'claude_cli',
  CODEX_CLI = 'codex_cli',   // NEW
  NONE = 'none',
}
```

### Step 2.2: Update AuthConfig Interface

**File to modify:** `orchestration/src/auth/auth-detector.ts`

**Why:** Need to track Codex CLI availability alongside Claude CLI.

```typescript
export interface AuthConfig {
  mode: AuthMode;
  provider?: string;           // 'anthropic', 'openai', 'google'
  hasClaudeCLI: boolean;
  hasCodexCLI: boolean;        // NEW
  hasAPIKey: boolean;
  claudeCLIVersion?: string;
  codexCLIVersion?: string;    // NEW
}
```

### Step 2.3: Add Codex CLI Detection Functions

**File to modify:** `orchestration/src/auth/auth-detector.ts`

**Why:** Need to detect Codex CLI installation and authentication status.

Add these functions:

```typescript
/**
 * Check if Codex CLI is installed and available in PATH
 */
export async function isCodexCLIAvailable(): Promise<boolean> {
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

/**
 * Check if Codex CLI is authenticated
 * Codex stores credentials in ~/.codex/auth.json or OS keyring
 */
export async function isCodexCLIAuthenticated(): Promise<boolean> {
  try {
    // Codex doesn't have an 'auth status' command like Claude.
    // Best approach: check if auth.json exists and has valid tokens
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    const authPath = path.join(os.homedir(), '.codex', 'auth.json');
    if (fs.existsSync(authPath)) {
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      // Check for OAuth tokens or API key configuration
      return !!(authData.access_token || authData.api_key || authData.refresh_token);
    }

    // Also check OPENAI_API_KEY as fallback
    return !!process.env.OPENAI_API_KEY;
  } catch {
    return false;
  }
}
```

### Step 2.4: Update `detectAuthMode()` Function

**File to modify:** `orchestration/src/auth/auth-detector.ts`

**Why:** Must include Codex CLI in the detection chain.

Update the detection priority:
1. API keys (ANTHROPIC_API_KEY -> Claude API, OPENAI_API_KEY -> OpenAI API, GOOGLE_API_KEY -> Google API)
2. Explicit PROVIDER env var
3. Codex CLI with subscription auth
4. Claude CLI with subscription auth
5. None

```typescript
export async function detectAuthMode(): Promise<AuthConfig> {
  const hasClaudeCLI = await isClaudeCLIAvailable();
  const claudeCLIVersion = hasClaudeCLI ? await getClaudeCLIVersion() : undefined;
  const hasCodexCLI = await isCodexCLIAvailable();
  const codexCLIVersion = hasCodexCLI ? await getCodexCLIVersion() : undefined;

  // Check for explicit provider override
  const explicitProvider = process.env.PROVIDER?.toLowerCase();

  // Priority 1: API keys
  if (process.env.ANTHROPIC_API_KEY) {
    return { mode: AuthMode.API_KEY, provider: 'anthropic', hasClaudeCLI, hasCodexCLI, hasAPIKey: true, claudeCLIVersion, codexCLIVersion };
  }
  if (process.env.OPENAI_API_KEY) {
    return { mode: AuthMode.API_KEY, provider: 'openai', hasClaudeCLI, hasCodexCLI, hasAPIKey: true, claudeCLIVersion, codexCLIVersion };
  }
  if (process.env.GOOGLE_API_KEY) {
    return { mode: AuthMode.API_KEY, provider: 'google', hasClaudeCLI, hasCodexCLI, hasAPIKey: true, claudeCLIVersion, codexCLIVersion };
  }

  // Priority 2: Explicit provider preference for CLI mode
  if (explicitProvider === 'codex' || explicitProvider === 'openai') {
    if (hasCodexCLI && await isCodexCLIAuthenticated()) {
      return { mode: AuthMode.CODEX_CLI, provider: 'openai', hasClaudeCLI, hasCodexCLI, hasAPIKey: false, claudeCLIVersion, codexCLIVersion };
    }
  }
  if (explicitProvider === 'claude' || explicitProvider === 'anthropic') {
    if (hasClaudeCLI && await isClaudeCLIAuthenticated()) {
      return { mode: AuthMode.CLAUDE_CLI, provider: 'anthropic', hasClaudeCLI, hasCodexCLI, hasAPIKey: false, claudeCLIVersion, codexCLIVersion };
    }
  }

  // Priority 3: Auto-detect CLI (prefer Codex if both available, as per company subscription)
  // Note: This priority can be configured. Default: prefer the one that's authenticated.
  if (hasCodexCLI && await isCodexCLIAuthenticated()) {
    return { mode: AuthMode.CODEX_CLI, provider: 'openai', hasClaudeCLI, hasCodexCLI, hasAPIKey: false, claudeCLIVersion, codexCLIVersion };
  }
  if (hasClaudeCLI && await isClaudeCLIAuthenticated()) {
    return { mode: AuthMode.CLAUDE_CLI, provider: 'anthropic', hasClaudeCLI, hasCodexCLI, hasAPIKey: false, claudeCLIVersion, codexCLIVersion };
  }

  return { mode: AuthMode.NONE, hasClaudeCLI, hasCodexCLI, hasAPIKey: false, claudeCLIVersion, codexCLIVersion };
}
```

### Step 2.5: Update `getAuthErrorMessage()`

**File to modify:** `orchestration/src/auth/auth-detector.ts`

**Why:** Error messages need to include Codex CLI as an option.

Update to include:
- Option 1: API Keys (Anthropic, OpenAI, Google)
- Option 2: Codex CLI (if available, suggest `codex login`)
- Option 3: Claude CLI (if available, suggest `claude setup-token`)
- Option 4: Install either CLI

### Step 2.6: Update Preflight Checks

**File to modify:** `orchestration/src/utils/preflight-checks.ts`

**Why:** Preflight must validate Codex CLI when that's the detected provider.

**Changes needed:**

1. Update `PreflightResult` interface:
```typescript
export interface PreflightResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  nodeVersion?: string;
  npmVersion?: string;
  claudeVersion?: string;
  codexVersion?: string;           // NEW
  gitignoreUpdated?: boolean;
  authMode?: 'api_key' | 'claude_cli' | 'codex_cli' | 'none';  // Updated
  provider?: string;               // NEW: 'anthropic', 'openai', 'google'
}
```

2. Add Codex CLI detection to CHECK 5:
```typescript
// After existing Claude CLI checks...

// Check for Codex CLI
const localCodexPath = join(frameworkPath, 'orchestration/node_modules/.bin/codex');
if (existsSync(localCodexPath)) {
  try {
    const codexVersionOutput = execSync(`"${localCodexPath}" --version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    codexVersion = codexVersionOutput;

    // Check Codex authentication
    const isCodexAuth = await checkCodexAuthentication(localCodexPath);
    if (isCodexAuth) {
      authMode = 'codex_cli';
    }
  } catch (error) {
    // Fall through
  }
}
```

3. Add `checkCodexAuthentication()` function:
```typescript
async function checkCodexAuthentication(codexPath: string): Promise<boolean> {
  try {
    // Check ~/.codex/auth.json for stored credentials
    const os = await import('os');
    const authPath = join(os.homedir(), '.codex', 'auth.json');
    if (existsSync(authPath)) {
      const authData = JSON.parse(readFileSync(authPath, 'utf-8'));
      return !!(authData.access_token || authData.api_key || authData.refresh_token);
    }
    return false;
  } catch {
    return false;
  }
}
```

4. Update .gitignore entries based on detected provider:
```typescript
// Dynamic entries based on provider
const requiredEntries = ['.claude-temp', '.claude-backups', '.codex-temp', '.codex-backups', frameworkDirName];
```

### Step 2.7: Add `@openai/codex` as Framework Dependency

**File to modify:** `orchestration/package.json`

**Why:** Codex CLI should be bundled with the framework just like Claude Code is, so developers don't need a separate global install.

```json
{
  "dependencies": {
    "@openai/codex": "^1.0.0"
  }
}
```

This ensures `orchestration/node_modules/.bin/codex` is available after `pnpm install`.

## Files Modified

| Action | File | Why |
|--------|------|-----|
| MODIFY | `orchestration/src/auth/auth-detector.ts` | Add CodexCLI mode, detection functions |
| MODIFY | `orchestration/src/utils/preflight-checks.ts` | Add Codex CLI validation |
| MODIFY | `orchestration/package.json` | Add @openai/codex dependency |

## Acceptance Criteria

1. `detectAuthMode()` correctly identifies Codex CLI when installed and authenticated
2. `isCodexCLIAvailable()` returns true when `codex` binary exists
3. `isCodexCLIAuthenticated()` checks `~/.codex/auth.json` correctly
4. Preflight checks validate Codex CLI installation and auth
5. Error messages include Codex as an option
6. `PROVIDER=codex` env var forces Codex detection
7. Existing Claude CLI detection still works unchanged

## Notes for Implementer

- The Codex CLI npm package is `@openai/codex`. Install it alongside `@anthropic-ai/claude-code`.
- Codex CLI auth check is different from Claude: there's no `codex auth status` command. Check `~/.codex/auth.json` for tokens.
- On macOS, Codex may also store credentials in the OS keyring (controlled by `cli_auth_credentials_store` in config.toml). The file-based check is the reliable fallback.
- The `PROVIDER` env var is the explicit override mechanism. Without it, auto-detection runs through the priority chain.
- Keep backward compatibility: existing `AuthMode.CLAUDE_CLI` behavior must not change.
