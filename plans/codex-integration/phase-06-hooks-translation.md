# Phase 6: Hook & Settings Translation

## Objective

Create a translation layer that converts the framework's hook configurations between Claude's `settings.json` format and Codex's `hooks.json` format.

## Why This Phase Exists

The framework currently uses Claude's `settings.json` hook format for inline validation during agent execution (e.g., validating JSON output at the Stop hook). Each Phase 1 analyzer has a `settings.json` file with Stop hooks that run validation scripts. These hooks are critical for the retry-with-feedback loop.

Codex CLI has its own hook system (`hooks.json`) with similar lifecycle events but a different format. Without translation, Codex agent invocations would run without output validation, breaking the quality guarantee.

## Dependencies

- Phase 1 (Provider adapter interface)
- Phase 3 (Codex CLI invocation)

## Current Hook Usage Analysis

### Claude `settings.json` Format (current)

**Location:** `orchestration/src/nodes/initialize-project/phase1/*/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "structure-architecture-analyzer",
        "hooks": [
          {
            "type": "command",
            "command": "${FRAMEWORK_PATH}/orchestration/node_modules/.bin/tsx ${FRAMEWORK_PATH}/orchestration/src/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json.hook.ts"
          }
        ]
      }
    ]
  }
}
```

**How it's used:** In `cli-agent-impl.ts` line 233, the settings file is passed via `--settings <resolved-path>`. The `${FRAMEWORK_PATH}` placeholder is resolved at runtime (line 223-225).

### Codex `hooks.json` Format (target)

**Location:** Should be at `<project>/.codex/hooks.json` or passed via config

```json
{
  "hooks": [
    {
      "event": "Stop",
      "match": [{ "type": "tool_use", "tool_name_re": ".*" }],
      "handler": {
        "type": "command",
        "command": "/path/to/validate-analyzer-json.hook.ts"
      }
    }
  ]
}
```

**Key differences:**
- Claude: `hooks.Stop[].matcher` (string matching agent name)
- Codex: `hooks[].event` + `hooks[].match` (event type + tool/content matching)
- Claude: Hooks are per-settings-file, one file per analyzer
- Codex: Hooks are per-project or per-directory, single file
- Claude: `${FRAMEWORK_PATH}` placeholder in command
- Codex: No built-in placeholder system (must use absolute paths)

### Hook Wire Format Comparison

Both systems pass JSON to hook scripts via stdin and expect JSON back:

**Claude Stop hook stdin:**
```json
{
  "session_id": "...",
  "result": { "StopTool": { "reason": "...", "result": "..." } },
  "tool_name": "stop",
  "tool_input": { ... }
}
```

**Codex Stop hook stdin:**
```json
{
  "type": "Stop",
  "session_id": "...",
  "last_assistant_message": "...",
  "tool_calls": [...],
  "reason": "..."
}
```

**Claude Stop hook stdout (to continue/block):**
```json
{ "decision": "block", "reason": "Invalid JSON output" }
```

**Codex Stop hook stdout:**
```json
{ "action": "stop" }  // or { "action": "continue", "message": "..." }
```

## Steps

### Step 6.1: Create Hook Format Types

**File to create:** `orchestration/src/hooks/hook-formats.ts`

**Why:** Define the internal (framework) hook format and both provider formats.

```typescript
/**
 * Framework-internal hook definition (provider-agnostic)
 */
export interface FrameworkHook {
  event: 'Stop' | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit';
  matcher?: string; // Agent name or pattern
  command: string; // Command to execute (may contain ${FRAMEWORK_PATH})
}

/**
 * Claude settings.json hook format
 */
export interface ClaudeHookConfig {
  hooks: {
    [event: string]: Array<{
      matcher: string;
      hooks: Array<{
        type: 'command';
        command: string;
      }>;
    }>;
  };
}

/**
 * Codex hooks.json hook format
 */
export interface CodexHookConfig {
  hooks: Array<{
    event: string;
    match?: Array<{
      type: string;
      tool_name_re?: string;
    }>;
    handler: {
      type: 'command';
      command: string;
    };
  }>;
}
```

### Step 6.2: Create Hook Translator

**File to create:** `orchestration/src/hooks/hook-translator.ts`

**Why:** Central translation logic between framework hooks and provider-specific formats.

```typescript
import { Provider } from '../providers/types.js';
import type { FrameworkHook, ClaudeHookConfig, CodexHookConfig } from './hook-formats.js';

/**
 * Translate framework hooks to provider-specific format
 */
export function translateHooksToProvider(
  hooks: FrameworkHook[],
  provider: Provider,
  frameworkPath: string,
): string {
  // Resolve ${FRAMEWORK_PATH} in all commands
  const resolvedHooks = hooks.map(hook => ({
    ...hook,
    command: hook.command.replace(/\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g, frameworkPath),
  }));

  switch (provider) {
    case Provider.CLAUDE:
      return JSON.stringify(toClaudeFormat(resolvedHooks), null, 2);
    case Provider.CODEX:
      return JSON.stringify(toCodexFormat(resolvedHooks), null, 2);
  }
}

function toClaudeFormat(hooks: FrameworkHook[]): ClaudeHookConfig {
  const result: ClaudeHookConfig = { hooks: {} };

  for (const hook of hooks) {
    if (!result.hooks[hook.event]) {
      result.hooks[hook.event] = [];
    }
    result.hooks[hook.event].push({
      matcher: hook.matcher || '.*',
      hooks: [{ type: 'command', command: hook.command }],
    });
  }

  return result;
}

function toCodexFormat(hooks: FrameworkHook[]): CodexHookConfig {
  return {
    hooks: hooks.map(hook => ({
      event: hook.event,
      ...(hook.matcher ? {
        match: [{ type: 'tool_use', tool_name_re: '.*' }]
      } : {}),
      handler: {
        type: 'command' as const,
        command: hook.command,
      },
    })),
  };
}
```

### Step 6.3: Create Hook Response Adapter

**File to create:** `orchestration/src/hooks/hook-response-adapter.ts`

**Why:** The existing hook scripts (like `validate-analyzer-json.hook.ts`) output Claude-format responses. When running under Codex, we need an adapter that wraps these scripts and translates the response.

**Approach:** Create a generic hook wrapper script that:
1. Receives Codex-format input on stdin
2. Translates to Claude-format input
3. Invokes the actual hook script
4. Translates the Claude-format output to Codex-format

```typescript
/**
 * Hook wrapper for Codex CLI
 *
 * This script adapts between Codex hook wire format and the framework's
 * existing hook scripts (which expect Claude format).
 *
 * Usage: tsx hook-response-adapter.ts <actual-hook-script> [args...]
 * Stdin: Codex hook JSON
 * Stdout: Codex-compatible hook response JSON
 */

// Read Codex-format input
const codexInput = JSON.parse(await readStdin());

// Translate to Claude format
const claudeInput = {
  session_id: codexInput.session_id,
  result: {
    StopTool: {
      reason: codexInput.reason || 'task_completed',
      result: codexInput.last_assistant_message || '',
    }
  },
  tool_name: 'stop',
};

// Invoke actual hook script
const hookResult = await runHookScript(process.argv[2], JSON.stringify(claudeInput));

// Translate Claude response to Codex format
const claudeResponse = JSON.parse(hookResult);
const codexResponse = {
  action: claudeResponse.decision === 'block' ? 'continue' : 'stop',
  ...(claudeResponse.reason ? { message: claudeResponse.reason } : {}),
};

process.stdout.write(JSON.stringify(codexResponse));
```

### Step 6.4: Update CLI Agent Implementation to Use Hook Translation

**File to modify:** `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts`

**Why:** Currently the settings file is read, `${FRAMEWORK_PATH}` is resolved, and passed via `--settings`. This logic should be extracted to work with either provider.

The settings resolution logic (lines 216-240) should be refactored to:
1. Read the original settings file
2. Detect provider
3. Translate to the correct format if needed
4. Write temp file and pass via the appropriate flag

### Step 6.5: Update Codex CLI Implementation to Pass Hooks

**File to modify:** `orchestration/src/utils/shared/agent-factory/codex-cli-agent-impl.ts` (created in Phase 3)

**Why:** Codex needs hooks passed differently. Options:
1. Write a temporary `.codex/hooks.json` in the project directory
2. Enable hooks via `--config features.codex_hooks=true`

**Decision: Write temporary hooks.json** because:
- Codex reads `<repo>/.codex/hooks.json` automatically
- We can write it before spawning and clean up after
- No need to pass additional CLI flags

```typescript
// Before spawning codex:
if (settingsPath) {
  const frameworkHooks = parseClaudeSettingsToFrameworkHooks(settingsPath);
  const codexHooksJson = translateHooksToProvider(frameworkHooks, Provider.CODEX, frameworkPath);

  // Write temporary hooks file
  const codexHooksDir = path.join(projectPath, '.codex');
  await mkdir(codexHooksDir, { recursive: true });
  const codexHooksPath = path.join(codexHooksDir, 'hooks.json');
  await writeFile(codexHooksPath, codexHooksJson);

  // Note: wrap actual hook commands with the adapter
  // Each command becomes: tsx hook-response-adapter.ts <original-command>
}
```

### Step 6.6: Update Existing Settings.json Files

**Files to modify:**
- `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/settings.json`
- `orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/settings.json`
- `orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/settings.json`
- `orchestration/src/nodes/initialize-project/phase1/data-flows-analyzer/settings.json`

**Why:** These files use Claude-specific settings format. They should be converted to the framework-internal format, with runtime translation to the target provider.

**Alternative approach (simpler):** Keep the existing settings.json files as-is (they're Claude format) and add the translation layer only in the agent factory. This minimizes changes and maintains backward compatibility.

**Decision: Keep existing files as-is, add translation in agent factory.** The existing settings.json files are the source of truth. The Codex path reads them and translates on the fly.

## Files Created/Modified

| Action | File | Why |
|--------|------|-----|
| CREATE | `orchestration/src/hooks/hook-formats.ts` | Type definitions for all hook formats |
| CREATE | `orchestration/src/hooks/hook-translator.ts` | Framework <-> provider hook translation |
| CREATE | `orchestration/src/hooks/hook-response-adapter.ts` | Runtime adapter for Codex hook wire format |
| MODIFY | `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts` | Extract settings resolution logic |
| MODIFY | `orchestration/src/utils/shared/agent-factory/codex-cli-agent-impl.ts` | Add hook injection |

## Acceptance Criteria

1. Claude settings.json hooks are correctly translated to Codex hooks.json format
2. Hook response adapter correctly translates between wire formats
3. Existing Claude hook scripts (validate-analyzer-json.hook.ts) work unchanged
4. Codex agent invocations use translated hooks for output validation
5. Hook cleanup removes temporary files after invocation
6. The retry-with-feedback loop works with both providers

## Notes for Implementer

- Codex hooks are experimental (behind `features.codex_hooks = true` in config.toml). The wrapper may need to enable this feature flag.
- The hook response adapter must be a standalone executable script (shebang: `#!/usr/bin/env tsx`).
- Test the hook wire format by running a Codex session with `--yolo` and a simple stop hook to see the actual stdin format.
- If Codex hooks don't work reliably, consider an alternative approach: validate output AFTER the Codex process completes (post-execution validation) instead of inline hooks. This is less elegant but more reliable. The retry loop would still work - just validate-then-retry instead of hook-block-then-retry.
- The `validate-analyzer-json.hook.ts` script reads stdin, validates JSON, and outputs a decision. Its logic is provider-agnostic; only the wire format wrapper differs.
