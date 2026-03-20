# Hybrid Authentication Architecture

## Overview

The AI Agentic Framework supports **two authentication modes** to provide flexibility for different development scenarios:

1. **API Key Mode** (Mode 1): Uses DeepAgents.js with direct API keys
   - Supports: Anthropic, OpenAI, Google
   - Best for: CI/CD, automation, programmatic access
   - Requires: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`

2. **Claude CLI Mode** (Mode 2): Uses Claude CLI with subscription authentication
   - Supports: Claude Pro/Max subscription
   - Best for: Interactive development, TOS-compliant usage
   - Requires: Claude CLI installed and authenticated

## Priority Order

The authentication system automatically selects the best available mode:

```
1. API Keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
   ↓ (if none set)
2. Claude CLI (claude command with authentication)
   ↓ (if not available)
3. Error: No authentication available
```

**API keys take priority** because they provide more control over model selection and cost optimization.

## Architecture Components

### 1. Auth Detector (`src/auth/auth-detector.ts`)

Detects available authentication methods and returns configuration:

```typescript
import { detectAuthMode, AuthMode } from './auth/auth-detector.js';

const authConfig = await detectAuthMode();

// Returns:
{
  mode: AuthMode.API_KEY | AuthMode.CLAUDE_CLI | AuthMode.NONE,
  provider?: 'anthropic' | 'openai' | 'google',
  hasClaudeCLI: boolean,
  hasAPIKey: boolean,
  claudeCLIVersion?: string
}
```

**Detection Logic**:
- Checks for `ANTHROPIC_API_KEY` → API key mode (anthropic)
- Checks for `OPENAI_API_KEY` → API key mode (openai)
- Checks for `GOOGLE_API_KEY` → API key mode (google)
- Checks for Claude CLI availability → Claude CLI mode
- Returns NONE if no authentication found

### 2. Hybrid Agent Factory (`src/agents/agent-factory-hybrid.ts`)

Creates agents using the appropriate authentication mode:

```typescript
import { HybridAgentFactory } from './agents/agent-factory-hybrid.js';

// Automatically detects auth mode
const factory = await HybridAgentFactory.create();

// Create agent (uses detected auth mode)
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
  mode: AuthMode.API_KEY | AuthMode.CLAUDE_CLI,
  executionTimeMs: number
}
```

## Usage Examples

### Example 1: Automatic Mode Selection

```typescript
// No configuration needed - automatically detects best mode
const factory = await HybridAgentFactory.create();
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

### Example 2: Switching Between Modes

```bash
# Use API key mode (priority)
export ANTHROPIC_API_KEY=sk-ant-...
npm run orchestrate:init

# Use Claude CLI mode (if no API key)
unset ANTHROPIC_API_KEY
claude setup-token  # Authenticate CLI
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

// Timeout is implemented using Promise.race()
// Will throw error if agent takes longer than timeout
```

## API Key Mode Implementation

Uses **DeepAgents.js** with LangChain models:

```typescript
// Create LLM model
const llmFactory = getLLMFactory();
const model = await llmFactory.createModel('sonnet-latest', {
  agent: 'planner',
  phase: 'planning'
});

// Create DeepAgent
const agent = await createDeepAgent({
  model: model,
  systemPrompt: agentInstructions,
  tools: []
});

// Invoke with timeout
const timeout = 300000;
const agentPromise = agent.invoke({
  messages: [{ role: 'user', content: input }]
});

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
});

const result = await Promise.race([agentPromise, timeoutPromise]);
```

**Features**:
- ✅ Provider-agnostic (Anthropic, OpenAI, Google)
- ✅ Tier-based model selection (fast/standard/advanced)
- ✅ Custom timeout via Promise.race()
- ✅ Full LangChain ecosystem access

## Claude CLI Mode Implementation

Uses **Claude Code CLI** via child process:

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

## Environment Setup

### API Key Mode Setup

```bash
# Option 1: Anthropic (recommended)
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OpenAI
export OPENAI_API_KEY=sk-...

# Option 3: Google
export GOOGLE_API_KEY=...
```

Get API keys:
- Anthropic: https://console.anthropic.com/settings/keys
- OpenAI: https://platform.openai.com/api-keys
- Google: https://aistudio.google.com/app/apikey

### Claude CLI Mode Setup

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-cli

# Or via homebrew (macOS)
brew install claude-cli

# Authenticate
claude setup-token

# Verify installation
claude --version
```

Documentation: https://code.claude.com/docs/en/authentication

## Error Handling

### No Authentication Available

If no authentication is available, the system throws an error with instructions:

```
❌ No authentication available

Please choose one of the following options:

Option 1: Use API Key (recommended for CI/CD and automation)
  Set one of the following environment variables:
  export ANTHROPIC_API_KEY=sk-ant-...
  export OPENAI_API_KEY=sk-...
  export GOOGLE_API_KEY=...

Option 2: Install and authenticate Claude CLI
  Visit: https://code.claude.com
  Then run: claude setup-token

For more information, see:
  - API Keys: https://platform.claude.com
  - Claude CLI: https://code.claude.com/docs/en/authentication
```

### Timeout Handling

Both modes support custom timeouts:

```typescript
// API Key Mode: Promise.race() timeout
const timeout = 300000; // 5 minutes
const result = await Promise.race([
  agentPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), timeout)
  )
]);

// Claude CLI Mode: spawn timeout parameter
const claudeProcess = spawn('claude', [...], {
  timeout: 300000
});
```

Error message includes execution time:
```
DeepAgent execution failed after 301234ms: Timeout after 300000ms
Claude CLI execution failed after 301456ms: Process timeout
```

## Testing

### Unit Tests

All authentication detection and agent creation is tested:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- src/agents/agent-factory-hybrid.test.ts
```

**Test Coverage**:
- ✅ API key detection (Anthropic, OpenAI, Google)
- ✅ Claude CLI detection
- ✅ Priority order (API key > Claude CLI > None)
- ✅ Agent creation in both modes
- ✅ Timeout handling
- ✅ Error message generation

### Integration Testing

Test with real authentication:

```bash
# Test API key mode
export ANTHROPIC_API_KEY=sk-ant-...
npm test -- test/integration/

# Test Claude CLI mode
unset ANTHROPIC_API_KEY
claude setup-token
npm test -- test/integration/
```

## Performance Characteristics

### API Key Mode

**Pros**:
- Fast startup (no process spawn overhead)
- Direct LangChain integration
- Full control over model selection
- Parallel execution support

**Cons**:
- Requires API key management
- Cost per API call

### Claude CLI Mode

**Pros**:
- No API key needed
- Subscription-based (unlimited usage)
- TOS-compliant
- Built-in rate limiting

**Cons**:
- Process spawn overhead (~50-100ms)
- Less control over model selection
- Sequential execution (one process at a time)

## Migration Path

### Existing Code Compatibility

The hybrid architecture is **fully backward compatible** with existing Phase 1 nodes:

```typescript
// Before (still works)
const agent = await createAgentFromMarkdown({
  agentName: 'planner',
  agentFile: 'planner.md',
  modelAlias: 'sonnet-latest',
  projectPath: '/path/to/project',
  frameworkPath: '/path/to/framework'
});

// After (same interface, auto-detects mode)
const result = await agent.invoke({ input: 'Create plan' });
```

**No changes required** to existing node implementations!

### Gradual Adoption

Teams can adopt gradually:
1. Start with Claude CLI mode (easiest setup)
2. Add API keys when ready for production
3. System automatically switches to API key mode

## Troubleshooting

### Issue: "No authentication available"

**Solution**:
1. Check API keys: `echo $ANTHROPIC_API_KEY`
2. Check Claude CLI: `claude --version`
3. Authenticate Claude CLI: `claude setup-token`

### Issue: "DeepAgent execution failed"

**Possible Causes**:
- Invalid API key
- Network connectivity
- Model unavailable
- Timeout too short

**Solution**:
```bash
# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":1024,"messages":[{"role":"user","content":"test"}]}'
```

### Issue: "Claude CLI exited with code 1"

**Possible Causes**:
- Not authenticated
- Permission denied
- Invalid agent file

**Solution**:
```bash
# Re-authenticate
claude setup-token

# Test CLI
claude --help
```

## Best Practices

### 1. Use API Keys for Production

```bash
# CI/CD environments
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
npm run orchestrate:init
```

### 2. Use Claude CLI for Development

```bash
# Local development
claude setup-token
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
   - Try API key mode first
   - Fallback to Claude CLI if API fails
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

- [DeepAgents.js Documentation](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [LangChain Models](https://docs.langchain.com/oss/javascript/models/overview)
- [Claude CLI Documentation](https://code.claude.com/docs/en/authentication)
- [Anthropic API](https://docs.anthropic.com/en/api/getting-started)
- [OpenAI API](https://platform.openai.com/docs/introduction)
- [Google AI Studio](https://ai.google.dev/)
