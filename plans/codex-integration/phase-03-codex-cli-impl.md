# Phase 3: Codex CLI Agent Implementation

## Objective

Create the Codex CLI subprocess spawning logic (equivalent to `cli-agent-impl.ts` for Claude) and update the agent factory to route to it.

## Why This Phase Exists

The `cli-agent-impl.ts` file is 325 lines of Claude-specific subprocess management: spawning `claude --agent <file>`, handling `--session-id`/`--resume`, parsing stdout, detecting rate limits, managing process lifecycle. Codex CLI has completely different invocation patterns (`codex exec "prompt"`), different flags (`--yolo` instead of `--dangerously-skip-permissions`), and different output formats. We need a parallel implementation for Codex.

## Dependencies

- Phase 1 (Provider adapter interface)
- Phase 2 (Codex CLI detection and auth)

## Current State Analysis

### How Claude CLI is invoked (`cli-agent-impl.ts`)

```
claude --agent <file> --model <model> [--tools <list> | --dangerously-skip-permissions]
       [--session-id <id> | --resume <id>] [--settings <file>]

stdin: prompt text (via file descriptor)
env: CLAUDE_SKIP_CONFIRMATIONS=1, FRAMEWORK_PATH=<path>
```

### How Codex CLI must be invoked

```
codex exec "<prompt>" --model <model> --yolo --json
      -o <output-file> [--skip-git-repo-check]

stdin: not used (prompt is CLI argument)
env: FRAMEWORK_PATH=<path>
```

**Key differences:**
1. **No `--agent` flag**: Codex reads AGENTS.md from directory hierarchy, not a specified file
2. **Prompt as argument**: Codex takes prompt as positional arg to `exec`, not stdin
3. **No `--tools` flag**: Codex manages tool permissions via `--sandbox` modes
4. **Session management**: Codex manages sessions internally; `codex resume` is a separate subcommand
5. **Output format**: Codex `--json` outputs newline-delimited JSON events, not raw text
6. **Agent context**: Must write a temporary AGENTS.md to inject agent instructions

## Steps

### Step 3.1: Create Codex CLI Implementation

**File to create:** `orchestration/src/utils/shared/agent-factory/codex-cli-agent-impl.ts`

**Why:** Parallel to `cli-agent-impl.ts` but for Codex CLI invocation patterns.

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { AuthMode } from '../../../auth/auth-detector.js';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';
import type { Agent, AgentConfig, AgentInvokeInput, AgentInvokeResult } from './types.js';
import { getAgentAction } from './agent-utils.js';
import { getCodexCLIPath, getCodexCLIModelForAgent } from './codex-cli-utils.js';

// Track active processes (same pattern as cli-agent-impl.ts)
const activeCodexProcesses: Set<ChildProcess> = new Set();
const activeCodexInvocations: Map<number, (reason: Error) => void> = new Map();
let codexInvocationCounter = 0;
let isCodexAborting = false;

export function abortAllCodexInvocations() { /* same pattern as Claude */ }
export function killAllActiveCodexProcesses() { /* same pattern as Claude */ }

/**
 * Create agent using Codex CLI (subscription mode)
 */
export async function createCodexCLIAgentImpl(
  config: AgentConfig,
  codexCLIVersion: string,
): Promise<Agent> {
  const llmFactory = getLLMFactory();
  const modelInfo = llmFactory.getModelInfo(config.agentName);
  const codexCLI = getCodexCLIPath(config.frameworkPath);

  return {
    invoke: async (input: AgentInvokeInput): Promise<AgentInvokeResult> => {
      const { randomUUID } = await import('crypto');
      const sessionId = config.resumeSessionId || randomUUID();

      const action = getAgentAction(config.agentName);
      const authInfo = `Auth: Subscription, Provider: openai, Model: ${modelInfo.alias}, Cli: codex, CliVersion: v${codexCLI.version}`;

      logger.trackConcurrentAgentStart(config.agentName, config.agentName, `${action} (${authInfo})`);

      const startTime = Date.now();

      try {
        const { output } = await invokeCodexCLI(
          config.agentName,
          input.inputPrompt,
          config.projectPath,
          config.agentFilePath,
          config.frameworkPath,
          config.timeout,
          sessionId,
          !!config.resumeSessionId,
          config.settingsPath,
        );

        const executionTimeMs = Date.now() - startTime;
        logger.trackConcurrentAgentSucceed(config.agentName, `Completed in ${(executionTimeMs / 1000).toFixed(1)}s`);

        return { output, sessionId, mode: AuthMode.CODEX_CLI, executionTimeMs };
      } catch (error: unknown) {
        const executionTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.trackConcurrentAgentFail(config.agentName, `Failed after ${(executionTimeMs / 1000).toFixed(1)}s`);
        throw new Error(`Codex CLI execution failed after ${executionTimeMs}ms: ${errorMessage}`);
      }
    },

    getInfo: () => ({ agentName: config.agentName, mode: AuthMode.CODEX_CLI }),
  };
}
```

### Step 3.2: Implement `invokeCodexCLI()` Core Function

**File:** Same as Step 3.1

**Why:** This is the most complex part - translating our agent invocation model to Codex CLI's patterns.

**Critical design decisions:**

1. **Agent context injection**: Since Codex doesn't have `--agent`, we must:
   - Read the agent markdown file
   - Create a temporary AGENTS.md in the working directory that includes the agent's instructions
   - Or: Prepend agent instructions to the prompt passed to `codex exec`

   **Decision: Prepend to prompt.** Writing AGENTS.md is risky because:
   - The project might already have an AGENTS.md
   - Codex discovers AGENTS.md from git root, not just CWD
   - Cleanup failure would leave artifacts

2. **Output parsing**: Codex `--json` outputs newline-delimited JSON events:
   ```json
   {"type":"message","content":"..."}
   {"type":"tool_use","name":"shell","input":"..."}
   {"type":"message","content":"final answer..."}
   ```
   We need to extract the final message content.

3. **Output file**: Use `-o <file>` flag to capture the last message cleanly.

```typescript
async function invokeCodexCLI(
  agentName: string,
  inputPrompt: string,
  projectPath: string,
  agentFilePath: string,
  frameworkPath: string,
  timeout: number = 300000,
  sessionId: string,
  isRetry: boolean = false,
  settingsPath?: string,
): Promise<{ output: string; sessionId: string }> {
  if (isCodexAborting) {
    throw new Error('SIGINT: Workflow interrupted by user (CTRL+C)');
  }

  return new Promise(async (resolve, reject) => {
    const invocationId = codexInvocationCounter++;
    activeCodexInvocations.set(invocationId, reject);

    // Create temp directory for this invocation
    const tempDir = path.join(projectPath, '.codex-temp', agentName, sessionId);
    await mkdir(tempDir, { recursive: true });

    // Read agent file and prepend its content to the prompt
    const agentContent = fs.readFileSync(agentFilePath, 'utf-8');

    // Strip frontmatter from agent content (Codex doesn't understand it)
    const agentBody = agentContent.replace(/^---[\s\S]*?---\n?/, '');

    // Combine agent instructions + input prompt
    const fullPrompt = `${agentBody}\n\n---\n\n${inputPrompt}`;

    // Output file for capturing last message
    const outputFile = path.join(tempDir, 'output.txt');

    const codexCLI = getCodexCLIPath(frameworkPath);
    const model = getCodexCLIModelForAgent(agentName, frameworkPath);

    // Build Codex CLI arguments
    const cliArgs = [
      'exec',
      fullPrompt,
      '--model', model,
      '--yolo',  // Bypass all approvals and sandboxing
      '-o', outputFile,  // Capture last message to file
      '--skip-git-repo-check',
    ];

    // If we have a hooks config, pass it via --config
    // (Codex uses config.toml, not settings.json)
    // Hook translation happens in Phase 6

    let timeoutId: NodeJS.Timeout;
    const codexProcess = spawn(codexCLI.path, cliArgs, {
      cwd: projectPath,
      env: {
        ...process.env,
        FRAMEWORK_PATH: frameworkPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    activeCodexProcesses.add(codexProcess);

    const cleanup = () => {
      activeCodexInvocations.delete(invocationId);
      clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      codexProcess.kill('SIGTERM');
      reject(new Error(`Codex CLI timeout after ${timeout}ms`));
    }, timeout);

    let stdout = '';
    let stderr = '';

    codexProcess.stdout?.on('data', (data) => { stdout += data.toString(); });
    codexProcess.stderr?.on('data', (data) => { stderr += data.toString(); });

    codexProcess.on('close', async (code) => {
      activeCodexProcesses.delete(codexProcess);
      cleanup();

      if (code === 0) {
        // Read output from file (more reliable than parsing JSON stream)
        let output = '';
        try {
          output = await readFile(outputFile, 'utf-8');
        } catch {
          // Fallback to stdout parsing if output file not created
          output = parseCodexJsonOutput(stdout);
        }
        resolve({ output, sessionId });
      } else {
        // Check for rate limiting
        const isRateLimit = stderr.includes('429') ||
                            stdout.includes('rate limit') ||
                            stdout.includes('capacity');

        let errorMessage = `Codex CLI exited with code ${code}`;
        if (isRateLimit) {
          errorMessage = `RATE_LIMIT: Codex CLI usage limit reached.\n` +
            `Options:\n` +
            `  1. Wait for the 5-hour rate limit window to reset\n` +
            `  2. Set OPENAI_API_KEY environment variable for API key mode\n` +
            `  3. Upgrade to Pro (5x/20x) for higher limits\n\n` +
            `To switch to API key mode:\n` +
            `  export OPENAI_API_KEY="your-api-key"`;
        }
        errorMessage += `\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;
        reject(new Error(errorMessage));
      }
    });

    codexProcess.on('error', (error) => {
      cleanup();
      reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });
  });
}

/**
 * Parse Codex JSON output stream to extract final message content
 */
function parseCodexJsonOutput(jsonStream: string): string {
  const lines = jsonStream.trim().split('\n').filter(Boolean);
  // Find last message-type event
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]);
      if (event.type === 'message' && event.content) {
        return event.content;
      }
    } catch {
      continue; // Skip non-JSON lines
    }
  }
  // Fallback: return all stdout
  return jsonStream;
}
```

### Step 3.3: Create Codex CLI Utils

**File to create:** `orchestration/src/utils/shared/agent-factory/codex-cli-utils.ts`

**Why:** Parallel to `cli-utils.ts` but for Codex-specific path resolution and model mapping.

```typescript
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getLLMFactory } from '../../../llm/llm-factory.js';
import { logger } from '../../logger.js';

/**
 * Get the Codex CLI model name from the agent name based on model-config.json
 */
export function getCodexCLIModelForAgent(agentName: string, frameworkPath: string): string {
  try {
    const configPath = path.join(frameworkPath, 'orchestration/config/model-config.json');
    const factory = getLLMFactory(configPath);
    const modelInfo = factory.getModelInfo(agentName);

    // Map from alias to Codex CLI model name
    // Codex CLI accepts full model IDs: "gpt-5.4", "gpt-5.4-mini", "o3", "o4-mini"
    const alias = modelInfo.alias;
    if (alias.includes('gpt5-latest') || alias === 'gpt5-latest') return 'gpt-5.4';
    if (alias.includes('gpt5-mini') || alias === 'gpt5-mini') return 'gpt-5.4-mini';

    // For non-OpenAI models configured in OpenAI tier, default to gpt-5.4
    console.warn(`Warning: Unable to map alias '${alias}' to Codex model. Defaulting to 'gpt-5.4'.`);
    return 'gpt-5.4';
  } catch (error) {
    console.warn(`Warning: Failed to get model for agent '${agentName}'. Defaulting to 'gpt-5.4'.`);
    return 'gpt-5.4';
  }
}

/**
 * Get path to Codex CLI binary
 */
export function getCodexCLIPath(frameworkPath: string): { path: string; version: string } {
  // Check local bundled Codex CLI
  const localCodexPath = path.join(frameworkPath, 'orchestration/node_modules/.bin/codex');

  if (fs.existsSync(localCodexPath)) {
    try {
      const version = execSync(`"${localCodexPath}" --version`, { encoding: 'utf-8' }).trim();
      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        return { path: localCodexPath, version: versionMatch[1] };
      }
    } catch (error) {
      logger.warn(`Local Codex CLI found but version check failed: ${error}`);
    }
  }

  // Fallback: global codex
  try {
    const globalVersion = execSync('codex --version', { encoding: 'utf-8' }).trim();
    const versionMatch = globalVersion.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      logger.warn(`Using global Codex CLI v${versionMatch[1]}`);
      return { path: 'codex', version: versionMatch[1] };
    }
    throw new Error(`Could not determine Codex CLI version from: ${globalVersion}`);
  } catch (error) {
    throw new Error(
      `Codex CLI not found or version check failed.\n` +
      `  Local path checked: ${localCodexPath}\n` +
      `  Global 'codex' command: Not found\n` +
      `\n` +
      `Install with: npm install -g @openai/codex\n` +
      `Or authenticate with: codex login\n` +
      `\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
```

### Step 3.4: Update Agent Factory

**File to modify:** `orchestration/src/utils/shared/agent-factory/agent-factory.ts`

**Why:** The factory currently only routes between `API_KEY` and `CLAUDE_CLI`. It must also handle `CODEX_CLI`.

```typescript
import { createCodexCLIAgentImpl, abortAllCodexInvocations, killAllActiveCodexProcesses } from './codex-cli-agent-impl.js';

export class AgentFactory {
  // ... existing code ...

  static abortAllInvocations = () => {
    abortAllInvocations(); // Claude
    abortAllCodexInvocations(); // Codex
  };

  static killAllActiveProcesses = () => {
    killAllActiveProcesses(); // Claude
    killAllActiveCodexProcesses(); // Codex
  };

  async createAgent(config: AgentConfig): Promise<Agent> {
    if (this.authConfig.mode === AuthMode.API_KEY) {
      if (!this.authConfig.provider) {
        throw new Error('Provider is required for API_KEY mode');
      }
      return createDeepAgentImpl(config, this.authConfig.provider);
    } else if (this.authConfig.mode === AuthMode.CLAUDE_CLI) {
      if (!this.authConfig.claudeCLIVersion) {
        throw new Error('Claude CLI version is required for CLAUDE_CLI mode');
      }
      return createCLIAgentImpl(config, this.authConfig.claudeCLIVersion);
    } else if (this.authConfig.mode === AuthMode.CODEX_CLI) {       // NEW
      if (!this.authConfig.codexCLIVersion) {                        // NEW
        throw new Error('Codex CLI version is required for CODEX_CLI mode');
      }
      return createCodexCLIAgentImpl(config, this.authConfig.codexCLIVersion);
    } else {
      throw new Error(getAuthErrorMessage(this.authConfig));
    }
  }
}
```

### Step 3.5: Update Agent Validator for Codex

**File to modify:** `orchestration/src/utils/shared/agent-factory/agent-validator.ts`

**Why:** Codex CLI doesn't recognize Claude-specific frontmatter fields like `hooks`, `mcpServers`, `skills`. The validator should warn based on target provider.

Add a parameter or use a factory-level provider setting to determine which field set to validate against.

For now, make the validation more lenient - only warn on truly unknown fields, not provider-specific ones:

```typescript
// Add Codex-specific valid fields
const CODEX_SPECIFIC_FIELDS = [
  'name',
  'description',
  'model',
  // Codex doesn't have a formal agent file format,
  // but our framework uses frontmatter for metadata
];

// Combined set for framework validation (union of all providers)
const ALL_VALID_FIELDS = [...new Set([...VALID_CLI_FIELDS, ...CODEX_SPECIFIC_FIELDS, ...FRAMEWORK_FIELDS])];
```

### Step 3.6: Update Types

**File to modify:** `orchestration/src/utils/shared/agent-factory/types.ts`

**Why:** The `AgentInvokeResult` currently returns `AuthMode` which doesn't have `CODEX_CLI`. After Phase 2 adds it to `AuthMode`, this will work automatically. Just ensure the type is correct.

Also add to `AgentConfig`:
```typescript
export interface AgentConfig {
  // ... existing fields ...
  /** Target provider (inferred from auth mode if not specified) */
  provider?: 'claude' | 'codex';
}
```

## Files Created/Modified

| Action | File | Why |
|--------|------|-----|
| CREATE | `orchestration/src/utils/shared/agent-factory/codex-cli-agent-impl.ts` | Codex CLI subprocess management |
| CREATE | `orchestration/src/utils/shared/agent-factory/codex-cli-utils.ts` | Codex CLI path detection, model mapping |
| MODIFY | `orchestration/src/utils/shared/agent-factory/agent-factory.ts` | Add CODEX_CLI routing |
| MODIFY | `orchestration/src/utils/shared/agent-factory/agent-validator.ts` | Relax validation for multi-provider |
| MODIFY | `orchestration/src/utils/shared/agent-factory/types.ts` | Add provider field |

## Acceptance Criteria

1. `createCodexCLIAgentImpl()` successfully spawns Codex CLI with correct flags
2. Agent instructions from `.md` files are correctly injected into Codex prompt
3. Codex JSON output is correctly parsed to extract final response
4. Rate limit detection works for Codex-specific patterns
5. Process cleanup (abort, kill) works for Codex processes
6. Agent factory correctly routes to Codex impl when `AuthMode.CODEX_CLI` detected
7. Output file (`-o` flag) is used for reliable output capture

## Notes for Implementer

- Codex `exec` takes the prompt as a positional argument, not stdin. The prompt may be very long (agent instructions + input). If it exceeds shell argument limits, write it to a file and use shell input redirection.
- Codex `--json` output is newline-delimited JSON events. The `-o` flag writes only the final message text to a file, which is more reliable for parsing.
- Codex doesn't have `--session-id`. Sessions are auto-managed. For retry, use `codex resume --last` or track the session ID from the Codex sessions directory.
- The `--yolo` flag is equivalent to `--dangerously-skip-permissions` + `--sandbox danger-full-access`. This gives full filesystem and network access.
- Codex `--skip-git-repo-check` is important because the project working directory may not be a git repo (or might be a worktree).
- Test with a simple prompt first: `codex exec "echo hello" --yolo --json` to verify the basic flow works.
