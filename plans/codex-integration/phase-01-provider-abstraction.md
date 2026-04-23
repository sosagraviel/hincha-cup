# Phase 1: Provider Abstraction Layer

## Objective

Create a clean abstraction layer that encapsulates all provider-specific behavior (Claude vs Codex) behind a unified interface. This is the foundation for all subsequent phases.

## Why This Phase Exists

Currently, provider-specific logic is scattered across 15+ files with hardcoded Claude references. Without a central abstraction, adding Codex support would mean duplicating conditional logic everywhere. The Provider abstraction centralizes all "what differs between providers" knowledge in one place, making the rest of the codebase provider-agnostic.

## Dependencies

- None (this is the foundation phase)

## Steps

### Step 1.1: Create Provider Enum and Types

**File to create:** `orchestration/src/providers/types.ts`

**Why:** Currently `AuthMode` in `auth-detector.ts` mixes authentication mode with provider identity. We need a clean separation: Provider (claude/codex) vs AuthMethod (cli/api-key).

```typescript
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
  /** Credentials storage path */
  credentialsPath: string;
}

/**
 * Provider-specific CLI flags and commands
 */
export interface ProviderCLIConfig {
  /** Flag to specify agent/system prompt file */
  agentFileFlag: string;
  /** Flag to specify model */
  modelFlag: string;
  /** Flag to bypass all permissions/approvals */
  bypassPermissionsFlag: string;
  /** Flag to specify tools restriction (null if not supported) */
  toolsFlag: string | null;
  /** Flag to specify session ID */
  sessionFlag: string;
  /** Flag/subcommand to resume session */
  resumeFlag: string;
  /** Flag to specify settings/config file */
  settingsFlag: string | null;
  /** Environment variable to skip confirmations */
  skipConfirmationsEnvVar: string | null;
  /** Non-interactive subcommand (e.g., 'exec' for codex, '-p' for claude) */
  nonInteractiveMode: string;
  /** Flag for JSON output */
  jsonOutputFlag: string;
}
```

### Step 1.2: Create Provider Adapter Interface

**File to create:** `orchestration/src/providers/provider-adapter.ts`

**Why:** This is the core abstraction. Each provider implements this interface, and the rest of the framework calls through it.

```typescript
import type { ProviderConfig, ProviderPaths, ProviderCLIConfig } from './types.js';

/**
 * Provider adapter interface
 *
 * Each provider (Claude, Codex) implements this interface to encapsulate
 * all provider-specific behavior. The framework interacts with providers
 * exclusively through this interface.
 */
export interface ProviderAdapter {
  /** Get provider configuration */
  getConfig(): ProviderConfig;

  /** Get provider-specific paths */
  getPaths(): ProviderPaths;

  /** Get CLI configuration (flags, subcommands) */
  getCLIConfig(): ProviderCLIConfig;

  /**
   * Build CLI arguments for spawning an agent subprocess
   * @param agentFilePath - Path to agent markdown file
   * @param model - Model name/alias
   * @param tools - Comma-separated tools list (optional)
   * @param sessionId - Session ID
   * @param isRetry - Whether this is a retry (use resume instead of new session)
   * @param settingsPath - Path to settings/hooks file (optional)
   * @returns Array of CLI arguments
   */
  buildCLIArgs(params: {
    agentFilePath: string;
    model: string;
    inputPrompt: string;
    tools?: string | null;
    sessionId: string;
    isRetry: boolean;
    settingsPath?: string;
  }): string[];

  /**
   * Build environment variables for the CLI subprocess
   * @param frameworkPath - Path to framework root
   * @returns Environment variables to set
   */
  buildEnvVars(frameworkPath: string): Record<string, string>;

  /**
   * Map model alias to CLI-compatible model name
   * @param modelAlias - Model alias from model-config.json (e.g., 'gpt5-latest')
   * @returns CLI model name (e.g., 'gpt-5.4' for codex, 'sonnet' for claude)
   */
  mapModelToCLI(modelAlias: string): string;

  /**
   * Check if the CLI binary is installed and available
   * @returns true if CLI is available
   */
  isCLIAvailable(): Promise<boolean>;

  /**
   * Get CLI version
   * @returns Version string or undefined
   */
  getCLIVersion(): Promise<string | undefined>;

  /**
   * Check if CLI is authenticated (subscription or API key)
   * @returns true if authenticated
   */
  isCLIAuthenticated(): Promise<boolean>;

  /**
   * Get the CLI binary path
   * @param frameworkPath - Framework root (for bundled CLI lookup)
   * @returns Object with path and version
   */
  getCLIPath(frameworkPath: string): { path: string; version: string };

  /**
   * Parse CLI output to extract the agent's response
   * Both CLIs may have different output formats
   * @param stdout - Raw stdout from CLI process
   * @returns Cleaned output string
   */
  parseCLIOutput(stdout: string): string;

  /**
   * Detect rate limiting from CLI output
   * @param stdout - Raw stdout
   * @param stderr - Raw stderr
   * @returns Rate limit info or null
   */
  detectRateLimit(stdout: string, stderr: string): {
    isRateLimited: boolean;
    resetTime?: string;
    message?: string;
  } | null;

  /**
   * Get user-friendly error message for missing authentication
   */
  getAuthErrorMessage(): string;

  /**
   * Get the set of valid frontmatter fields for this provider's agent files
   */
  getValidFrontmatterFields(): string[];

  /**
   * Translate a hook configuration from the framework's internal format
   * to the provider-specific format
   */
  translateHookConfig(frameworkHook: any): any;

  /**
   * Get the instruction file content section markers
   * Used by Phase 3 synthesis to know what to generate
   */
  getInstructionFileMarkers(): {
    sectionStart: string; // e.g., '# CLAUDE.md Content' or '# AGENTS.md Content'
    sectionEnd: string;
  };
}
```

### Step 1.3: Implement Claude Provider Adapter

**File to create:** `orchestration/src/providers/claude-provider.ts`

**Why:** Extract all existing Claude-specific logic from scattered files into one cohesive implementation.

This implementation should move logic from:
- `cli-utils.ts` lines 11-38 (`getCLIModelForAgent`) -> `mapModelToCLI()`
- `cli-utils.ts` lines 50-116 (`getClaudeCLIPath`) -> `getCLIPath()`
- `cli-agent-impl.ts` lines 198-251 (CLI arg building) -> `buildCLIArgs()`
- `auth-detector.ts` lines 126-202 (auth checks) -> `isCLIAvailable()`, `isCLIAuthenticated()`
- `agent-validator.ts` lines 90-113 (valid fields) -> `getValidFrontmatterFields()`

**Key implementation details:**

```typescript
export class ClaudeProvider implements ProviderAdapter {
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
      nonInteractiveMode: '-p',  // claude -p "prompt"
      jsonOutputFlag: '--output-format json',
    };
  }

  mapModelToCLI(modelAlias: string): string {
    if (modelAlias.includes('sonnet')) return 'sonnet';
    if (modelAlias.includes('opus')) return 'opus';
    if (modelAlias.includes('haiku')) return 'haiku';
    return 'sonnet'; // default
  }

  buildCLIArgs(params): string[] {
    const args = ['--agent', params.agentFilePath, '--model', params.model];
    if (params.tools) {
      args.push('--tools', params.tools);
    } else {
      args.push('--dangerously-skip-permissions');
    }
    args.push(...(params.isRetry
      ? ['--resume', params.sessionId]
      : ['--session-id', params.sessionId]));
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

  // ... remaining methods extract from existing code
}
```

### Step 1.4: Implement Codex Provider Adapter

**File to create:** `orchestration/src/providers/codex-provider.ts`

**Why:** This is the core new code - the Codex-specific implementation.

**Key implementation details:**

```typescript
export class CodexProvider implements ProviderAdapter {
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
      agentFileFlag: null, // Codex doesn't have --agent; uses AGENTS.md discovery
      modelFlag: '--model',
      bypassPermissionsFlag: '--yolo',
      toolsFlag: null, // Codex manages tools internally
      sessionFlag: null, // Codex manages sessions internally
      resumeFlag: 'resume', // codex resume <id>
      settingsFlag: '--config', // codex --config key=value
      skipConfirmationsEnvVar: null, // Use --yolo instead
      nonInteractiveMode: 'exec', // codex exec "prompt"
      jsonOutputFlag: '--json',
    };
  }

  mapModelToCLI(modelAlias: string): string {
    // Map from our aliases to Codex CLI model names
    if (modelAlias.includes('gpt5-latest') || modelAlias.includes('gpt5')) return 'gpt-5.4';
    if (modelAlias.includes('gpt5-mini')) return 'gpt-5.4-mini';
    if (modelAlias.includes('codex')) return 'gpt-5.3-codex';
    return 'gpt-5.4'; // default
  }

  buildCLIArgs(params): string[] {
    // Codex uses: codex exec "prompt" --model gpt-5.4 --yolo --json -o output.txt
    // The agent file content must be passed via AGENTS.md in the working directory
    // or injected into the prompt itself
    const args = [
      'exec',
      params.inputPrompt,
      '--model', params.model,
      '--yolo', // Bypass approvals for automated execution
      '--json', // Structured output for parsing
      '--skip-git-repo-check', // Don't require git repo
    ];
    return args;
  }

  buildEnvVars(frameworkPath: string): Record<string, string> {
    return {
      FRAMEWORK_PATH: frameworkPath,
    };
  }

  // Codex has different rate limit detection patterns
  detectRateLimit(stdout: string, stderr: string) {
    const isRateLimited = stdout.includes('rate limit') ||
                          stdout.includes('capacity') ||
                          stderr.includes('429');
    if (!isRateLimited) return null;
    return {
      isRateLimited: true,
      message: 'Codex CLI rate limit reached. Wait for the 5-hour window to reset, ' +
               'or set OPENAI_API_KEY for API key mode (billed per-token).',
    };
  }

  // ... remaining methods
}
```

**Critical note about Codex CLI agent file handling:**

Codex CLI does NOT have a `--agent` flag like Claude Code. Instead, it reads `AGENTS.md` files from the directory hierarchy. For our framework to work with Codex, we have two approaches:

1. **Write a temporary AGENTS.md** in the project working directory before spawning Codex
2. **Inject agent instructions directly into the prompt** via `codex exec`

**Decision: Use approach 1 (temporary AGENTS.md)** because:
- It's closer to how Codex is designed to work
- The AGENTS.md file can contain the full agent context (skills, tools, instructions)
- It respects Codex's directory-based discovery pattern
- We can clean up the temp file after execution

### Step 1.5: Create Provider Factory

**File to create:** `orchestration/src/providers/provider-factory.ts`

**Why:** Central factory to resolve and create the appropriate provider based on environment detection.

```typescript
import { Provider, AuthMethod, type ProviderConfig } from './types.js';
import { ClaudeProvider } from './claude-provider.js';
import { CodexProvider } from './codex-provider.js';
import type { ProviderAdapter } from './provider-adapter.js';

/**
 * Factory to create the appropriate provider adapter
 *
 * Detection priority:
 * 1. Explicit PROVIDER env var (claude/codex) - overrides auto-detection
 * 2. API keys (ANTHROPIC_API_KEY -> claude, OPENAI_API_KEY -> codex)
 * 3. CLI detection (which claude / which codex)
 * 4. Error state
 */
export class ProviderFactory {
  /**
   * Auto-detect and create the appropriate provider
   */
  static async detect(): Promise<ProviderAdapter> {
    // Check explicit provider override
    const explicitProvider = process.env.PROVIDER?.toLowerCase();
    if (explicitProvider === 'codex' || explicitProvider === 'openai') {
      return new CodexProvider(await CodexProvider.detectConfig());
    }
    if (explicitProvider === 'claude' || explicitProvider === 'anthropic') {
      return new ClaudeProvider(await ClaudeProvider.detectConfig());
    }

    // Auto-detect from environment
    // API keys take priority
    if (process.env.OPENAI_API_KEY) {
      return new CodexProvider({ provider: Provider.CODEX, authMethod: AuthMethod.API_KEY, ... });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return new ClaudeProvider({ provider: Provider.CLAUDE, authMethod: AuthMethod.API_KEY, ... });
    }

    // CLI detection
    const codexProvider = new CodexProvider();
    if (await codexProvider.isCLIAvailable() && await codexProvider.isCLIAuthenticated()) {
      return codexProvider;
    }

    const claudeProvider = new ClaudeProvider();
    if (await claudeProvider.isCLIAvailable() && await claudeProvider.isCLIAuthenticated()) {
      return claudeProvider;
    }

    throw new Error(getMultiProviderAuthError());
  }

  /**
   * Create provider by explicit name
   */
  static create(provider: Provider): ProviderAdapter {
    switch (provider) {
      case Provider.CLAUDE: return new ClaudeProvider();
      case Provider.CODEX: return new CodexProvider();
    }
  }
}
```

### Step 1.6: Create Provider Index

**File to create:** `orchestration/src/providers/index.ts`

```typescript
export { Provider, AuthMethod, type ProviderConfig, type ProviderPaths, type ProviderCLIConfig } from './types.js';
export { type ProviderAdapter } from './provider-adapter.js';
export { ClaudeProvider } from './claude-provider.js';
export { CodexProvider } from './codex-provider.js';
export { ProviderFactory } from './provider-factory.js';
```

## Files Created/Modified

| Action | File | Why |
|--------|------|-----|
| CREATE | `orchestration/src/providers/types.ts` | Core type definitions for provider abstraction |
| CREATE | `orchestration/src/providers/provider-adapter.ts` | Interface that all providers implement |
| CREATE | `orchestration/src/providers/claude-provider.ts` | Extract existing Claude logic into adapter |
| CREATE | `orchestration/src/providers/codex-provider.ts` | New Codex CLI implementation |
| CREATE | `orchestration/src/providers/provider-factory.ts` | Auto-detection and creation factory |
| CREATE | `orchestration/src/providers/index.ts` | Barrel exports |

## Acceptance Criteria

1. `ProviderFactory.detect()` correctly identifies Claude CLI, Codex CLI, and API key modes
2. `ClaudeProvider` passes all existing behavior (regression-safe)
3. `CodexProvider` correctly maps models, builds CLI args, and detects auth
4. Both providers implement the full `ProviderAdapter` interface
5. No changes to existing files in this phase (pure additions)

## Notes for Implementer

- Do NOT modify any existing files in this phase. This is purely additive.
- The `ClaudeProvider` implementation should extract logic from existing files but not change them yet. The migration happens in Phase 3.
- For Codex model mapping, reference `model-config.json` which already has `gpt5-latest` and `gpt5-mini` aliases.
- The `PROVIDER` env var is new and gives explicit control. Without it, auto-detection kicks in.
- Keep the existing `AuthMode` enum working until Phase 2 migrates callers.
