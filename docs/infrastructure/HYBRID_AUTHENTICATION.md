# Hybrid Authentication Architecture

## Overview

Every agent invocation spawns a provider CLI as a subprocess. Pick a provider and authenticate it with either a subscription login or an API key — both auth sources funnel into the same execution path.

### Claude CLI (Anthropic)

- Reported as `AuthMode.CLAUDE_CLI`
- Subscription auth: `claude login` (Claude Pro/Max)
- API-key auth: export `ANTHROPIC_API_KEY` (forwarded into the spawned `claude` process)

### Codex CLI (OpenAI)

- Reported as `AuthMode.CODEX_CLI`
- Subscription auth: `codex login` (ChatGPT)
- API-key auth: export `OPENAI_API_KEY` (framework auto-runs `codex login --with-api-key`)

## Priority Order

The auth detector walks four steps in order (see `orchestration/src/auth/auth-detector.ts`):

```
1. Explicit PROVIDER env var (claude / anthropic | codex / openai) — STRICT, no fallback
   ↓ (if not set)
2. Provider API keys as CLI selectors:
     ANTHROPIC_API_KEY → Claude CLI
     OPENAI_API_KEY    → Codex CLI (auto-runs `codex login --with-api-key` if needed)
   ↓ (if no API key set)
3. Auto-detect any authenticated CLI: Claude CLI first, then Codex CLI
   ↓ (if neither is authenticated)
4. Error: No authentication available
```

`GOOGLE_API_KEY` is not supported for the moment — there is no supported Google CLI provider.

> **Important:** If `ANTHROPIC_API_KEY` is set, it takes precedence over any existing Claude CLI subscription authentication. Unset `ANTHROPIC_API_KEY` when you specifically want the framework to use your logged-in Claude CLI account.

When `OPENAI_API_KEY` is set, the framework selects Codex CLI and authenticates it automatically by running the equivalent of `printenv OPENAI_API_KEY | codex login --with-api-key`. Agent execution runs through the Codex CLI subprocess.

## Architecture Components

### 1. Auth Detector (`orchestration/src/auth/auth-detector.ts`)

Detects available authentication methods and returns configuration:

```typescript
import { detectAuthMode, AuthMode } from './auth/auth-detector.js';

const authConfig = await detectAuthMode();

// Returns:
{
  mode: AuthMode.CLAUDE_CLI | AuthMode.CODEX_CLI | AuthMode.NONE,
  provider?: 'anthropic' | 'openai',
  hasClaudeCLI: boolean,
  hasCodexCLI: boolean,
  hasAPIKey: boolean,
  claudeCLIVersion?: string,
  codexCLIVersion?: string
}
```

> `AuthMode.API_KEY` still exists in the enum but is deprecated and never selected automatically. `AgentFactory.createAgent` throws if it sees that mode.

**Detection Logic** (matches `auth-detector.ts`):
- `PROVIDER=claude|anthropic` → Claude CLI (must be installed and authenticated; accepts subscription or `ANTHROPIC_API_KEY`)
- `PROVIDER=codex|openai` → Codex CLI (must be installed; auto-runs `codex login --with-api-key` if `OPENAI_API_KEY` is set)
- `ANTHROPIC_API_KEY` set → Claude CLI
- `OPENAI_API_KEY` set → Codex CLI (auto-login via `ensureCodexAuthentication`)
- Otherwise: pick any authenticated CLI (Claude first, then Codex)
- Returns `NONE` if no authentication found

### 2. Agent Factory (`orchestration/src/utils/shared/agent-factory/agent-factory.ts`)

Creates agents using the appropriate CLI implementation:

```typescript
import { AgentFactory } from './utils/shared/agent-factory/agent-factory.js';

// Automatically detects auth mode
const factory = await AgentFactory.create();

// Create agent (dispatches to Claude CLI or Codex CLI based on the detected provider)
const agent = await factory.createAgent({
  agentName: 'planner',
  agentFile: 'planner.md',
  modelAlias: 'sonnet-latest',
  projectPath: '/path/to/project',
  frameworkPath: '/path/to/framework',
  timeout: 300000 // 5 minutes
});

// Invoke agent
const result = await agent.invoke({ input: 'Create a plan' });

// Returns:
{
  output: string,
  mode: AuthMode.CLAUDE_CLI | AuthMode.CODEX_CLI,
  executionTimeMs: number
}
```

## Usage Examples

### Example 1: Automatic Provider Selection

```typescript
// No configuration needed - automatically detects which provider CLI to use
const factory = await AgentFactory.create();
console.log(`Using ${factory.getAuthConfig().mode} mode`);

const agent = await factory.createAgent({
  agentName: 'planner',
  agentFile: 'planner.md',
  modelAlias: 'sonnet-latest',
  projectPath: process.cwd(),
  frameworkPath: process.env.FRAMEWORK_PATH!
});

const result = await agent.invoke({
  input: 'Create implementation plan'
});
```

### Example 2: Switching Providers

```bash
# Claude CLI with API key
export ANTHROPIC_API_KEY=sk-ant-...
npm run orchestrate:init

# Claude CLI with subscription (unset the key first)
unset ANTHROPIC_API_KEY
claude login
npm run orchestrate:init

# Codex CLI with API key (auto-runs `codex login --with-api-key`)
export OPENAI_API_KEY=sk-...
npm run orchestrate:init

# Codex CLI with ChatGPT subscription
unset OPENAI_API_KEY
codex login
npm run orchestrate:init

# Force a specific provider regardless of which keys are set
export PROVIDER=codex   # or PROVIDER=claude
npm run orchestrate:init
```

### Example 3: Timeout Configuration

```typescript
const agent = await factory.createAgent({
  agentName: 'implementer-typescript',
  agentFile: 'implementer-typescript.md',
  modelAlias: 'sonnet-latest',
  projectPath: '/path/to/project',
  frameworkPath: '/path/to/framework',
  timeout: 600000 // 10 minutes for implementers
});

// Timeout is enforced via the underlying CLI spawn timeout
// Will throw error if the CLI process runs longer than timeout
```

## API Key Handling

When an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is present, the framework does **not** execute agents in-process. Instead, it selects the matching provider CLI and lets the CLI itself consume the key:

- **`ANTHROPIC_API_KEY`** is forwarded via the spawned `claude` subprocess environment. Claude CLI reads it natively.
- **`OPENAI_API_KEY`** is consumed by `ensureCodexAuthentication()` in `orchestration/src/auth/codex-auth.ts`, which pipes the key into `codex login --with-api-key` over stdin (the key is never interpolated into a shell command). After the login succeeds, the agent runs through the normal Codex CLI subprocess flow.

This keeps both auth sources (subscription login and API key) on the same execution path: a CLI subprocess. There is no longer a separate in-process LangChain / DeepAgents path at runtime.

## CLI Subprocess Implementation

Every agent invocation spawns the matching provider CLI. The Claude path lives in `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts`; the Codex path lives in `codex-cli-agent-impl.ts` and uses an analogous spawn pattern with one notable difference: Codex supports an internal validation/retry loop within a single session for self-correction before the framework falls back to an external retry.

Claude CLI invocation looks like this:

```typescript
const claudeProcess = spawn('claude', [
  '--agent', agentName,
  '--dangerously-skip-permissions'
], {
  cwd: projectPath,
  env: {
    ...process.env,
    CLAUDE_SKIP_CONFIRMATIONS: '1'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send prompt to stdin
if (claudeProcess.stdin) {
  claudeProcess.stdin.write(prompt);
  claudeProcess.stdin.end();
}

// Collect stdout and stderr
let stdout = '';
let stderr = '';

if (claudeProcess.stdout) {
  claudeProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });
}

if (claudeProcess.stderr) {
  claudeProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });
}

// Handle completion
claudeProcess.on('close', (code) => {
  if (code === 0) {
    resolve(stdout);
  } else {
    reject(new Error(`Claude CLI exited with code ${code}`));
  }
});
```

**Features**:
- ✅ Subscription-based authentication (Claude Pro/Max)
- ✅ TOS-compliant usage
- ✅ Built-in timeout via spawn timeout
- ✅ Automatic error handling

## Provider Setup

Pick the provider you want to use; either auth source (subscription or API key) is valid. The framework bundles both CLIs under `orchestration/node_modules/.bin/`, but you can also install them globally.

### Claude CLI (Anthropic)

```bash
# Install
npm install -g @anthropic-ai/claude-code

# Auth — pick one:
claude login                              # subscription (Claude Pro/Max)
export ANTHROPIC_API_KEY=sk-ant-...       # API key (forwarded to the spawned `claude` process)

# Verify
claude --version
```

Documentation: https://code.claude.com/docs/en/authentication

### Codex CLI (OpenAI)

```bash
# Install
npm install -g @openai/codex

# Auth — pick one:
codex login                               # subscription (ChatGPT)
export OPENAI_API_KEY=sk-...              # API key — framework auto-runs `codex login --with-api-key`

# Verify
codex --version
codex login status
```

Documentation: https://developers.openai.com/codex/cli

`GOOGLE_API_KEY` is intentionally ignored — there is no supported Google CLI provider.

### Forcing a Provider

`PROVIDER=claude` or `PROVIDER=codex` short-circuits detection and pins the framework to a specific CLI. If the requested CLI isn't installed or authenticated, detection fails fast with an actionable error rather than silently falling back.

## Error Handling

### No Authentication Available

If no authentication is available, the system throws an error with instructions (text emitted by `getAuthErrorMessage` in `auth-detector.ts`):

```
❌ No authentication available

Please choose one of the following options:

Option 1: Use a provider CLI with an API key in the environment
  Set one of the following environment variables before running the CLI:
  export ANTHROPIC_API_KEY=sk-ant-...
  export OPENAI_API_KEY=sk-...

Option 2: Authenticate Codex CLI (uses your ChatGPT subscription)
  codex login

Option 3: Authenticate Claude CLI (uses your Claude Pro/Max subscription)
  claude login

For more information, see:
  - API Keys: https://platform.claude.com or https://platform.openai.com
  - Claude CLI: https://code.claude.com/docs/en/authentication
  - Codex CLI: https://developers.openai.com/codex/cli
```

### Timeout Handling

Both CLI implementations support custom timeouts via the `spawn` timeout parameter:

```typescript
const claudeProcess = spawn('claude', [...], {
  timeout: 300000
});

// Codex CLI uses the same approach
const codexProcess = spawn('codex', [...], {
  timeout: 300000
});
```

Error messages include execution time, e.g. `Claude CLI execution failed after 301456ms: Process timeout`.

## Testing

### Unit Tests

Authentication detection and agent creation are covered by unit tests:

```bash
# Run all unit tests
pnpm --filter orchestration test:unit

# Auth detector specifically
pnpm --filter orchestration test:unit -- auth/auth-detector.test.ts
```

**Test Coverage**:
- ✅ API-key-as-CLI-selector detection (Anthropic, OpenAI)
- ✅ Claude CLI and Codex CLI availability detection
- ✅ Priority order (`PROVIDER` > API keys > authenticated CLI > error)
- ✅ Codex auto-login via `ensureCodexAuthentication`
- ✅ Agent creation for both providers
- ✅ Timeout handling
- ✅ Error message generation

### Integration Testing

Test with real authentication:

```bash
# Anthropic via API key (Claude CLI provider)
export ANTHROPIC_API_KEY=sk-ant-...
pnpm --filter orchestration test -- test/integration/

# OpenAI via API key (Codex CLI provider, auto-login)
unset ANTHROPIC_API_KEY
export OPENAI_API_KEY=sk-...
pnpm --filter orchestration test -- test/integration/

# Subscription auth (no API keys set)
unset ANTHROPIC_API_KEY OPENAI_API_KEY
claude login   # or: codex login
pnpm --filter orchestration test -- test/integration/
```

## Performance Characteristics

Every agent invocation spawns a provider CLI subprocess, so both providers share the same performance profile.

**Pros**:
- Subscription auth available — no API-key billing required for local development
- TOS-compliant when used with Claude Pro/Max or ChatGPT subscriptions
- Built-in rate limiting and rotation handled by the provider CLI

**Cons**:
- Process spawn overhead (~50–100ms per invocation)
- Less control over model selection than direct API calls
- Sequential execution per agent (one CLI process at a time, per agent)

**Codex-specific note**: the Codex CLI implementation in `codex-cli-agent-impl.ts` runs an internal validation/retry loop within a single session before the framework-level retry kicks in, which often hides transient errors from the outer pipeline.

## Adoption

Pick whichever CLI matches the provider you want to use, and either log in for the subscription path or set the matching API key:

1. Install the CLI you want — `claude` (Anthropic) or `codex` (OpenAI). Both are bundled under `orchestration/node_modules/.bin/` after `pnpm install`.
2. Authenticate: run `claude login` / `codex login` for subscription auth, **or** export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
3. Run the framework. If both CLIs are authenticated, set `PROVIDER=claude` or `PROVIDER=codex` to pin a choice.

## Troubleshooting

### Issue: "No authentication available"

**Solution**:
1. Check API keys: `echo $ANTHROPIC_API_KEY` / `echo $OPENAI_API_KEY`
2. Check installed CLIs: `claude --version`, `codex --version`
3. Authenticate one of them: `claude login` or `codex login`

### Issue: Claude CLI execution failed

**Possible Causes**:
- Invalid `ANTHROPIC_API_KEY`
- Network connectivity
- Model unavailable
- Timeout too short

**Solution**:
```bash
# Validate API key directly
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":1024,"messages":[{"role":"user","content":"test"}]}'

# Or re-authenticate the subscription path
claude login
```

### Issue: Codex CLI auto-login failed

If the framework reports `Automatic Codex API-key login failed`, the `codex login --with-api-key` step did not succeed.

**Solution**:
```bash
# Verify the CLI is installed and reachable
codex --version

# Retry the login manually (the framework runs the same command under the hood)
printenv OPENAI_API_KEY | codex login --with-api-key

# Confirm the resulting state
codex login status

# Inspect stored credentials if needed
ls -l ~/.codex/auth.json
```

### Issue: "Claude CLI exited with code 1"

**Possible Causes**:
- Not authenticated
- Permission denied
- Invalid agent file

**Solution**:
```bash
# Re-authenticate
claude login

# Test CLI
claude --help
```

## Best Practices

### 1. Use API Keys for CI/CD

```bash
# Anthropic / Claude CLI in CI
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
npm run orchestrate:init

# OpenAI / Codex CLI in CI (auto-runs `codex login --with-api-key`)
export OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
npm run orchestrate:init
```

### 2. Use Subscription Login for Local Development

```bash
# Anthropic
claude login
npm run orchestrate:init

# OpenAI
codex login
npm run orchestrate:init
```

### 3. Configure Timeouts Appropriately

```typescript
// Planning phase: 5 minutes
const planner = await factory.createAgent({
  timeout: 300000,
  ...
});

// Implementation phase: 10 minutes
const implementer = await factory.createAgent({
  timeout: 600000,
  ...
});
```

### 4. Handle Errors Gracefully

```typescript
try {
  const result = await agent.invoke({ input: prompt });
} catch (error) {
  if (error.message.includes('timeout')) {
    // Retry with longer timeout
  } else if (error.message.includes('API key')) {
    // Check authentication
  } else {
    // Other error handling
  }
}
```

## Future Enhancements

### Planned Features

1. **Automatic Retry with Fallback**:
   - Try the selected CLI first
   - Fallback to the other authenticated CLI if available
   - Transparent to caller

2. **Cost Tracking**:
   - Track API usage per agent
   - Report cost estimates
   - Budget alerts

3. **Multi-Provider Load Balancing**:
   - Round-robin between providers
   - Automatic failover
   - Cost optimization

4. **Caching Layer**:
   - Cache agent responses
   - Reduce API calls
   - Improve performance

## References

- [Claude CLI Documentation](https://code.claude.com/docs/en/authentication)
- [Codex CLI Documentation](https://developers.openai.com/codex/cli)
- [Anthropic API](https://docs.anthropic.com/en/api/getting-started)
- [OpenAI API](https://platform.openai.com/docs/introduction)
