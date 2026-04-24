---
sidebar_position: 1
title: Authentication
description: Configure API key or Claude CLI authentication for AI providers
---

# Authentication

The framework supports two authentication modes for flexibility across development scenarios.

## Authentication Modes

### Mode 1: API Key (Recommended for Production)

Uses direct API keys with DeepAgents.js for programmatic access.

**Supported Providers**:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)

**Best For**:
- CI/CD pipelines
- Automation workflows
- Programmatic access
- Multi-provider switching

**Setup**:

```bash
# Anthropic (recommended)
export ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google
export GOOGLE_API_KEY=...
```

**Get API Keys**:
- [Anthropic API Keys](https://console.anthropic.com/settings/keys)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Google AI Studio](https://aistudio.google.com/app/apikey)

### Mode 2: Claude CLI (Subscription-Based)

Uses Claude CLI with subscription authentication for interactive development.

**Supported**: Claude Pro/Max subscription

**Best For**:
- Interactive development
- Unlimited usage (subscription-based)
- TOS-compliant usage
- No API key management

**Setup**:

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-cli

# Or via homebrew (macOS)
brew install claude-cli

# Authenticate
claude setup-token

# Verify
claude --version
```

**Documentation**: [Claude CLI Authentication](https://code.claude.com/docs/en/authentication)

## Priority Order

The system automatically selects the best available authentication:

```
1. API Keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)
   ↓ (if none set)
2. Claude CLI (claude command with subscription)
   ↓ (if not available)
3. Error: No authentication available
```

**API keys take priority** because they provide more control over model selection and cost optimization.

:::important
If `ANTHROPIC_API_KEY` is set, it takes precedence over any existing Claude CLI subscription authentication. Unset `ANTHROPIC_API_KEY` when you specifically want the framework to use your logged-in Claude CLI account.
:::

## Switching Between Modes

```bash
# Use API key mode (priority)
export ANTHROPIC_API_KEY=sk-ant-...
pnpm initialize -- -p /path/to/project

# Use Claude CLI mode (remove API keys)
unset ANTHROPIC_API_KEY
claude setup-token
pnpm initialize -- -p /path/to/project
```

## Environment Variables

Required environment variables per provider:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI
OPENAI_API_KEY=sk-...

# Google
GOOGLE_API_KEY=...

# Optional: Model tier selection
MODEL_TIER=standard  # standard | fast | advanced | openai | gemini
```

## Error Handling

### No Authentication Available

If no authentication is configured, you'll see:

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

### Invalid API Key

Test your API key:

```bash
# Test Anthropic API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":1024,"messages":[{"role":"user","content":"test"}]}'
```

### Claude CLI Not Authenticated

Re-authenticate Claude CLI:

```bash
# Re-authenticate
claude setup-token

# Test CLI
claude --help
```

## Performance Comparison

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

## Best Practices

### 1. Use API Keys for Production

```bash
# CI/CD environments
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
pnpm initialize -- -p /path/to/project
```

### 2. Use Claude CLI for Development

```bash
# Local development
claude setup-token
pnpm initialize -- -p /path/to/project
```

### 3. Never Commit API Keys

```bash
# .env (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# .env.example (committed for documentation)
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
```

## Troubleshooting

### Check Authentication Status

```bash
# Check API keys
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Check Claude CLI
claude --version
```

### Re-authenticate

```bash
# API Key: Update environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Claude CLI: Re-run setup
claude setup-token
```

## See Also

- [Provider Switching](./provider-switching.md) - Switch between Anthropic, OpenAI, and Google
- [Environment Variables](./environment-variables.md) - Complete environment variable reference
- [Docker Runtime](./docker.md) - Containerized authentication setup
