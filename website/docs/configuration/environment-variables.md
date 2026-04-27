---
sidebar_position: 4
title: Environment Variables
description: Complete reference for all environment variables
---

# Environment Variables

Complete reference for all environment variables used by the framework.

## Authentication

### API Keys

```bash
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI (GPT)
OPENAI_API_KEY=sk-...

# Google (Gemini)
GOOGLE_API_KEY=...
```

**Required**: At least one API key OR Claude CLI authentication

**Get API Keys**:
- [Anthropic API Keys](https://console.anthropic.com/settings/keys)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Google AI Studio](https://aistudio.google.com/app/apikey)

## Model Configuration

### NODE_ENV

**Description**: Environment preset that determines default models and tiers

**Required**: No

**Default**: `production`

**Valid Values**:
- `development` - Anthropic with fast tiers (cost-optimized)
- `development-openai` - OpenAI with fast tiers
- `development-gemini` - Google with fast tiers
- `staging` - Anthropic with standard tiers
- `staging-openai` - OpenAI with standard tiers
- `production` - Anthropic with tiered approach (default)
- `production-openai` - OpenAI with tiered approach
- `production-gemini` - Google with tiered approach

**Example**:
```bash
# Development with OpenAI
export NODE_ENV=development-openai

# Production with Anthropic (default)
export NODE_ENV=production
```

**Impact**:

| Environment | Provider | Fast Tier | Standard Tier | Advanced Tier |
|------------|----------|-----------|---------------|---------------|
| `development` | Anthropic | haiku-latest | sonnet-latest | opus-latest |
| `development-openai` | OpenAI | gpt5-mini | gpt5-latest | gpt5-latest |
| `production` | Anthropic | haiku-latest | sonnet-latest | opus-latest |

### Model Tier Selection

```bash
# Model tier (default: standard)
MODEL_TIER=standard  # standard | fast | advanced
```

**Description**: Global model tier override for all agents

**Tiers**:
- `fast`: Uses haiku-latest, gpt5-mini, or gemini-flash (cost-optimized)
- `standard`: Uses sonnet-latest, gpt5-latest, or gemini-latest (balanced)
- `advanced`: Uses opus-latest, gpt5-latest, or gemini-latest (quality-optimized)

### Agent-Specific Model Overrides

```bash
# Override specific agents
MODEL_PLANNER=opus-latest
MODEL_IMPLEMENTER=sonnet-latest
MODEL_REVIEWER=opus-latest
```

**Available Agents**:
- `planner`
- `implementer`
- `implementer-generic`
- `implementer-typescript`
- `implementer-python`
- `implementer-go`
- `implementer-java`
- `implementer-rust`
- `reviewer`
- `visual-verifier`

## MCP Server Configuration

### Atlassian (Jira + Confluence)

```bash
# Atlassian Cloud ID
ATLASSIAN_CLOUD_ID=abc123

# User email
ATLASSIAN_USER_EMAIL=you@company.com

# API token (generate at https://id.atlassian.com/manage/api-tokens)
ATLASSIAN_API_TOKEN=ATATT3xFfGF0...

# Domain (optional, for URL parsing)
JIRA_DOMAIN=yourcompany.atlassian.net
```

### GitHub

```bash
# Personal access token
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Required scopes:
# - repo (for PR creation)
# - read:org (for team access)
```

### Notion

```bash
# Notion API key
NOTION_API_KEY=secret_xxxxxxxxxxxx
```

### PostgreSQL

```bash
# Database connection URL
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Or individual components
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=dbname
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
```

## Debug and Development

### DEBUG

**Description**: Enable debug logging

**Required**: No

**Default**: `false`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
export DEBUG=true
```

**Impact**:
- Enables verbose logging
- Shows LLM request/response details
- Logs phase transitions
- Displays agent invocations

**Output**:
```
[DEBUG] Phase 2: Planning started
[DEBUG] Invoking planner agent with model: opus-latest
[DEBUG] Agent response: {...}
[DEBUG] Phase 2: Planning completed in 34.2s
```

### LOG_LEVEL

**Description**: Logging verbosity level

**Required**: No

**Default**: `info`

**Valid Values**: `error`, `warn`, `info`, `debug`, `trace`

**Example**:
```bash
export LOG_LEVEL=debug
```

**Impact**:

| Level | Logs |
|-------|------|
| `error` | Errors only |
| `warn` | Errors + warnings |
| `info` | Errors + warnings + info (default) |
| `debug` | All above + debug details |
| `trace` | All above + full traces |

### SAVE_ARTIFACTS

**Description**: Preserve workflow artifacts after completion

**Required**: No

**Default**: `false`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
export SAVE_ARTIFACTS=true
```

**Impact**:
- Keeps `.claude-temp/tickets/` after workflow completion
- Useful for debugging workflows
- Includes all phase outputs

**Artifacts saved**:
- `context.json` - Ticket context
- `plan.json` - Implementation plan
- `changes.json` - Code changes
- `test-results.json` - Test results
- `screenshots/` - Visual verification

## Project Configuration

### Paths

```bash
# Project path (absolute)
PROJECT_PATH=/absolute/path/to/your/project

# Framework path (absolute)
FRAMEWORK_PATH=/absolute/path/to/framework

# Workspace root (for monorepos)
WORKSPACE_ROOT=/path/to/monorepo
```

### Runtime Behavior

```bash
# Resume from last completed phase
RESUME=true

# Skip confirmation prompts
SKIP_CONFIRMATIONS=true
```

## Workflow Configuration

### Initialize Project

```bash
# Skip validation phase
SKIP_VALIDATION=false

# Force re-initialization
FORCE_INIT=false
```

### Implement Ticket

```bash
# Ticket ID (alternative to CLI arg)
TICKET_ID=PROJ-123

# Target branch for PR
TARGET_BRANCH=main
```

## Quality Gates

### COVERAGE_THRESHOLD

**Description**: Minimum code coverage percentage required

**Required**: No

**Default**: `80`

**Valid Values**: 0-100

**Example**:
```bash
# Require 90% coverage
export COVERAGE_THRESHOLD=90

# Disable coverage check
export COVERAGE_THRESHOLD=0
```

**Impact**:
- Phase 5 (Testing) fails if coverage below threshold
- Applies to statements, branches, and functions
- Can be overridden per test framework in config

### SKIP_TESTS

**Description**: Skip all testing in Phase 5

**Required**: No

**Default**: `false`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
export SKIP_TESTS=true
```

**Impact**:
- Phase 5 (Testing) marked as skipped
- No test generation or execution
- Faster workflow (not recommended for production)

**Warning**: Only use during prototyping or debugging

**Alternative**: Use `--skip-tests` flag on `/implement-ticket`

### SKIP_VISUAL_REGRESSION

**Description**: Skip visual regression testing in Phase 6

**Required**: No

**Default**: `false`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
export SKIP_VISUAL_REGRESSION=true
```

**Impact**:
- Phase 6 (Visual Verification) marked as skipped
- No screenshot comparison
- Faster workflow for non-visual changes

**Alternative**: Use `--skip-visual` flag on `/implement-ticket`

### SKIP_PR

**Description**: Skip PR creation in Phase 8

**Required**: No

**Default**: `false`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
export SKIP_PR=true
```

**Impact**:
- Phase 8 (PR Creation) marked as skipped
- Changes committed to branch only
- Useful for batch operations

**Alternative**: Use `--skip-pr` flag on `/implement-ticket`

## Performance and Timeouts

### AGENT_TIMEOUT

**Description**: Maximum time (ms) for agent execution

**Required**: No

**Default**: `300000` (5 minutes)

**Valid Values**: 60000-600000 (1-10 minutes)

**Example**:
```bash
# 10 minutes for complex planning
export AGENT_TIMEOUT=600000

# 2 minutes for fast iteration
export AGENT_TIMEOUT=120000
```

**Impact**:
- Applies to all agent invocations
- Throws error if exceeded
- Can be overridden per agent type

### PLANNER_TIMEOUT

**Description**: Specific timeout for planner agent

**Required**: No

**Default**: `300000` (5 minutes)

**Valid Values**: 60000-600000

**Example**:
```bash
# 10 minutes for architecture planning
export PLANNER_TIMEOUT=600000
```

**Used by**: Planner agent during Phase 2

### IMPLEMENTER_TIMEOUT

**Description**: Specific timeout for implementer agents

**Required**: No

**Default**: `600000` (10 minutes)

**Valid Values**: 60000-600000

**Example**:
```bash
# 15 minutes for large implementations
export IMPLEMENTER_TIMEOUT=900000
```

**Used by**: Implementer agents during Phase 4

## Workflow Customization

### BRANCH_PREFIX

**Description**: Prefix for auto-generated branch names

**Required**: No

**Default**: `feature/`

**Valid Values**: Any valid git branch prefix

**Example**:
```bash
export BRANCH_PREFIX=feat/
export BRANCH_PREFIX=task/
export BRANCH_PREFIX=dev/
```

**Impact**:
```bash
# Default: feature/PROJ-123-description
# With BRANCH_PREFIX=task/: task/PROJ-123-description
```

### COMMIT_MESSAGE_PREFIX

**Description**: Prefix for auto-generated commit messages

**Required**: No

**Default**: None

**Valid Values**: Any string (e.g., emoji, tag)

**Example**:
```bash
export COMMIT_MESSAGE_PREFIX="[PROJ]"
export COMMIT_MESSAGE_PREFIX="✨"
```

**Impact**:
```bash
# Default: "Implement user export feature"
# With prefix: "[PROJ] Implement user export feature"
```

### AUTO_PUSH

**Description**: Automatically push branches after commit

**Required**: No

**Default**: `true`

**Valid Values**: `true`, `false`, `1`, `0`

**Example**:
```bash
# Disable auto-push
export AUTO_PUSH=false
```

**Impact**:
- `true`: Automatically pushes after Phase 8 commit
- `false`: Commits locally only, manual push required

## Docker Runtime

### Container Configuration

```bash
# Docker image tag
DOCKER_IMAGE_TAG=1.0.0

# Container name
CONTAINER_NAME=claude-runtime

# Network mode
NETWORK_MODE=host  # host | bridge
```

### Resource Limits

```bash
# CPU cores
CPU_LIMIT=4
CPU_RESERVATION=2

# Memory (GB)
MEMORY_LIMIT=8
MEMORY_RESERVATION=4
```

## CI/CD Integration

### GitHub Actions

```bash
# GitHub token (auto-provided by Actions)
GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}

# Custom secrets
ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
JIRA_API_TOKEN=${{ secrets.JIRA_API_TOKEN }}
```

### Environment Detection

```bash
# CI environment detection (auto-set by CI systems)
CI=true
GITHUB_ACTIONS=true
```

## Security

### Secrets Management

```bash
# Never commit these to git!
# Add to .env (gitignored)

# API keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Tokens
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
ATLASSIAN_API_TOKEN=ATATT...
```

### .env File Template

Create `.env.example` for documentation (safe to commit):

```bash
# API Keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here

# MCP Servers
ATLASSIAN_CLOUD_ID=your_cloud_id_here
ATLASSIAN_USER_EMAIL=your_email_here
ATLASSIAN_API_TOKEN=your_token_here

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here

# Project
PROJECT_PATH=/absolute/path/to/project
```

## Loading Environment Variables

### From .env File

```bash
# Create .env file
cp .env.example .env

# Edit with your values
nano .env

# Framework auto-loads .env in project root
```

### From Shell

```bash
# Export manually
export ANTHROPIC_API_KEY=sk-ant-...
export MODEL_TIER=advanced

# Run command
pnpm implement -- --ticket-id PROJ-123
```

### From npm Scripts

```json
{
  "scripts": {
    "implement:advanced": "MODEL_TIER=advanced pnpm implement",
    "implement:fast": "MODEL_TIER=fast pnpm implement"
  }
}
```

## Validation

### Required Variables Check

The framework validates required variables on startup:

```bash
# Minimum required
ANTHROPIC_API_KEY or OPENAI_API_KEY or GOOGLE_API_KEY
# OR Claude CLI authenticated

# For Jira integration
ATLASSIAN_CLOUD_ID
ATLASSIAN_USER_EMAIL
ATLASSIAN_API_TOKEN

# For GitHub integration
GITHUB_PERSONAL_ACCESS_TOKEN
```

### Validation Errors

```
❌ Missing required environment variable: ANTHROPIC_API_KEY

Please set one of the following:
  export ANTHROPIC_API_KEY=sk-ant-...
  export OPENAI_API_KEY=sk-...
  export GOOGLE_API_KEY=...

Or authenticate a provider CLI with a subscription:
  claude login        # Anthropic / Claude CLI
  codex login         # OpenAI / Codex CLI
```

## Example Configurations

### Development Setup

**Cost-optimized development**:

```bash
# .env.development
NODE_ENV=development
MODEL_TIER=fast
COVERAGE_THRESHOLD=70
DEBUG=true
SKIP_VISUAL_REGRESSION=true
LOG_LEVEL=debug
SAVE_ARTIFACTS=true
```

### Production Setup

**Quality-optimized production**:

```bash
# .env.production
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
COVERAGE_THRESHOLD=85
SKIP_VISUAL_REGRESSION=false
SAVE_ARTIFACTS=true
LOG_LEVEL=info
```

### CI/CD Setup

**Automated pipeline**:

```bash
# .env.ci
ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
NODE_ENV=production
COVERAGE_THRESHOLD=80
SKIP_VISUAL_REGRESSION=true
AUTO_PUSH=true
JIRA_API_TOKEN=${{ secrets.JIRA_TOKEN }}
DEBUG=false
```

### Multi-Provider Setup

**Different providers for different tasks**:

```bash
# .env.multi
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Claude for planning, OpenAI for implementation
MODEL_PLANNER=opus-latest
MODEL_IMPLEMENTER=gpt5-latest
MODEL_TESTER=haiku-latest
```

## Best Practices

### 1. Use .env File

```bash
# .env (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
MODEL_TIER=standard
```

### 2. Document in .env.example

```bash
# .env.example (committed)
ANTHROPIC_API_KEY=your_key_here
MODEL_TIER=standard
```

### 3. Separate Environments

```bash
# .env.development
MODEL_TIER=fast

# .env.production
MODEL_TIER=advanced
```

### 4. Never Commit Secrets

```bash
# .gitignore
.env
.env.local
.env.*.local
*.key
*.pem
```

### 5. Rotate Credentials Regularly

```bash
# Generate new API keys every 90 days
# Update .env with new keys
# Test before removing old keys
```

## Troubleshooting

### Check Current Values

```bash
# Print all environment variables
env | grep -E 'ANTHROPIC|OPENAI|MODEL|JIRA|GITHUB'

# Check specific variable
echo $ANTHROPIC_API_KEY
echo $MODEL_TIER
```

### Clear Cached Values

```bash
# Unset variables
unset ANTHROPIC_API_KEY
unset MODEL_TIER

# Re-source .env
source .env
```

### Test Configuration

```bash
# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-6","max_tokens":1024,"messages":[{"role":"user","content":"test"}]}'
```

## See Also

- [Authentication](./authentication.md) - Configure API keys and Claude CLI
- [Provider Switching](./provider-switching.md) - Switch between AI providers
- [Docker Runtime](./docker.md) - Containerized environment setup
