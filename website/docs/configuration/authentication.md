---
sidebar_position: 1
title: Authentication
description: Configure the framework to authenticate via Claude CLI or Codex CLI, using a subscription login or an API key
---

# Authentication

## Overview

Every agent invocation spawns a provider CLI as a subprocess. Pick a provider and authenticate it with either a subscription login or an API key — both auth sources funnel into the same execution path.

### Claude CLI (Anthropic)

- Reported as `AuthMode.CLAUDE_CLI`
- Subscription auth: `claude login` (Claude Pro/Max)
- API-key auth: export `ANTHROPIC_API_KEY` (forwarded into the spawned `claude` process)
- Enterprise gateway auth: route through Azure AI Foundry, AWS Bedrock, or Google Vertex AI — uses your cloud-provider credentials, no Anthropic account needed

### Codex CLI (OpenAI)

- Reported as `AuthMode.CODEX_CLI`
- Subscription auth: `codex login` (ChatGPT)
- API-key auth: export `OPENAI_API_KEY` (framework auto-runs `codex login --with-api-key`)

## Supported Providers

### Claude CLI (Anthropic)

Runs the bundled `claude` CLI as a subprocess.

**Auth sources** (either works):
- Claude Pro/Max subscription via `claude login`
- `ANTHROPIC_API_KEY` in the environment (forwarded to the spawned `claude` process)

**Setup**:

```bash
# Install Claude CLI (also bundled under orchestration/node_modules/.bin/)
npm install -g @anthropic-ai/claude-code

# Subscription path: log in with Claude Pro/Max
claude login

# Or API-key path: just export the key
export ANTHROPIC_API_KEY=sk-ant-api03-...

# Verify
claude --version
```

**Documentation**: [Claude CLI Authentication](https://code.claude.com/docs/en/authentication)

#### Enterprise gateways (Foundry / Bedrock / Vertex)

For organizations that consume Claude through a cloud-provider deployment instead of Anthropic accounts, the framework recognizes the standard Claude CLI gateway env vars. Set them and **no `claude login` or `ANTHROPIC_API_KEY` is required** — auth is handled by the cloud provider's credentials.

```bash
# Azure AI Foundry
export CLAUDE_CODE_USE_FOUNDRY=1
export ANTHROPIC_FOUNDRY_RESOURCE=<your-foundry-resource-name>

# AWS Bedrock
export CLAUDE_CODE_USE_BEDROCK=1
# (plus your normal AWS_* credentials)

# Google Vertex AI
export CLAUDE_CODE_USE_VERTEX=1
# (plus your normal GOOGLE_APPLICATION_CREDENTIALS)
```

The Claude CLI subprocess inherits these vars and routes requests through the gateway instead of `api.anthropic.com`. The framework's auth detector recognizes the same flags so it won't block on a missing API key.

### Codex CLI (OpenAI)

Runs the bundled `codex` CLI as a subprocess.

**Auth sources** (either works):
- ChatGPT subscription via `codex login`
- `OPENAI_API_KEY` in the environment — the framework auto-runs the equivalent of `printenv OPENAI_API_KEY | codex login --with-api-key` for you

**Setup**:

```bash
# Install Codex CLI (also bundled under orchestration/node_modules/.bin/)
npm install -g @openai/codex

# Subscription path: log in with ChatGPT
codex login

# Or API-key path: just export the key — auto-login runs on first use
export OPENAI_API_KEY=sk-...

# Verify
codex --version
codex login status
```

**Documentation**: [Codex CLI](https://developers.openai.com/codex/cli)

**Get API Keys**:
- [Anthropic API Keys](https://console.anthropic.com/settings/keys)
- [OpenAI API Keys](https://platform.openai.com/api-keys)

## Priority Order

The auth detector walks five steps in order:

```
1. Explicit PROVIDER env var (claude / anthropic | codex / openai) — STRICT, no fallback
   ↓ (if not set)
2. Claude gateway env (Foundry / Bedrock / Vertex):
     CLAUDE_CODE_USE_FOUNDRY=1 + ANTHROPIC_FOUNDRY_RESOURCE → Claude CLI via Azure
     CLAUDE_CODE_USE_BEDROCK=1                              → Claude CLI via AWS
     CLAUDE_CODE_USE_VERTEX=1                               → Claude CLI via GCP
   ↓ (if no gateway flags set)
3. Provider API keys as CLI selectors:
     ANTHROPIC_API_KEY → Claude CLI
     OPENAI_API_KEY    → Codex CLI (auto-runs `codex login --with-api-key` if needed)
   ↓ (if no API key set)
4. Auto-detect any authenticated CLI: Claude CLI first, then Codex CLI
   ↓ (if neither is authenticated)
5. Error: No authentication available
```

`GOOGLE_API_KEY` is intentionally ignored — there is no supported Google CLI provider.

:::important
If `ANTHROPIC_API_KEY` is set, it takes precedence over any existing Claude CLI subscription authentication. Unset `ANTHROPIC_API_KEY` when you specifically want the framework to use your logged-in Claude CLI account.
:::

When `OPENAI_API_KEY` is set, the framework selects Codex CLI and authenticates it automatically by running the equivalent of `printenv OPENAI_API_KEY | codex login --with-api-key`. Agent execution still runs through the Codex CLI subprocess, not LangChain or DeepAgents.

## Switching Providers

```bash
# Claude CLI with API key
export ANTHROPIC_API_KEY=sk-ant-...
pnpm initialize -- -p /path/to/project

# Claude CLI with subscription (clear the key first)
unset ANTHROPIC_API_KEY
claude login
pnpm initialize -- -p /path/to/project

# Codex CLI with API key (auto-runs `codex login --with-api-key`)
export OPENAI_API_KEY=sk-...
pnpm initialize -- -p /path/to/project

# Codex CLI with ChatGPT subscription
unset OPENAI_API_KEY
codex login
pnpm initialize -- -p /path/to/project

# Force a specific provider regardless of which keys are set
export PROVIDER=codex   # or PROVIDER=claude
pnpm initialize -- -p /path/to/project
```

## Configuring via `~/.claude/settings.json`

Any env var listed above can also live in the `env` block of your Claude CLI settings file at `~/.claude/settings.json`. The framework reads this file at startup and applies the block to its own process before auth detection runs, so settings.json is the single source of truth — no need to also export the vars in your shell.

```json
{
  "env": {
    "CLAUDE_CODE_USE_FOUNDRY": "1",
    "ANTHROPIC_FOUNDRY_RESOURCE": "your-foundry-resource"
  }
}
```

Precedence: explicit shell exports always win over settings.json — the framework never overwrites a value that's already in `process.env`.

## Environment Variables

Provider selection variables:

```bash
# Anthropic → selects Claude CLI
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI → selects Codex CLI (auto-login)
OPENAI_API_KEY=sk-...

# Optional: pin a provider explicitly (overrides API-key-based detection)
PROVIDER=claude   # or PROVIDER=codex

# Claude enterprise gateways (mutually exclusive — pick one)
CLAUDE_CODE_USE_FOUNDRY=1
ANTHROPIC_FOUNDRY_RESOURCE=your-foundry-resource

CLAUDE_CODE_USE_BEDROCK=1   # plus standard AWS_* credentials
CLAUDE_CODE_USE_VERTEX=1    # plus GOOGLE_APPLICATION_CREDENTIALS
```

## Error Handling

### No Authentication Available

If no authentication is configured, you'll see:

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

Option 4: Route Claude through a cloud-provider gateway
  Azure AI Foundry:
    export CLAUDE_CODE_USE_FOUNDRY=1
    export ANTHROPIC_FOUNDRY_RESOURCE=<your-foundry-resource>
  AWS Bedrock:
    export CLAUDE_CODE_USE_BEDROCK=1
  Google Vertex AI:
    export CLAUDE_CODE_USE_VERTEX=1
  (Auth uses your Azure / AWS / GCP credentials — no Anthropic account needed.)

For more information, see:
  - API Keys: https://platform.claude.com or https://platform.openai.com
  - Claude CLI: https://code.claude.com/docs/en/authentication
  - Codex CLI: https://developers.openai.com/codex/cli
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

### CLI Not Authenticated

Re-authenticate the CLI you're using:

```bash
# Claude CLI
claude login
claude --help

# Codex CLI — retry the API-key login the framework runs internally
printenv OPENAI_API_KEY | codex login --with-api-key
codex login status

# Or log in with your ChatGPT subscription instead
codex login
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

The Codex CLI implementation runs an internal validation/retry loop within a single session before the framework-level retry kicks in, which often hides transient errors from the outer pipeline.

## Best Practices

### 1. Use API Keys for CI/CD

```bash
# Anthropic / Claude CLI in CI
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
pnpm initialize -- -p /path/to/project

# OpenAI / Codex CLI in CI (auto-runs `codex login --with-api-key`)
export OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
pnpm initialize -- -p /path/to/project
```

### 2. Use Subscription Login for Local Development

```bash
# Anthropic
claude login
pnpm initialize -- -p /path/to/project

# OpenAI
codex login
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

# Check installed CLIs
claude --version
codex --version

# Check Codex login state
codex login status
```

### Re-authenticate

```bash
# Update API keys
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...

# Or re-run subscription login
claude login
codex login
```

## See Also

- [Provider Switching](./provider-switching.md) - Switch between Anthropic (Claude CLI) and OpenAI (Codex CLI)
- [Environment Variables](./environment-variables.md) - Complete environment variable reference
- [Docker Runtime](./docker.md) - Containerized authentication setup
