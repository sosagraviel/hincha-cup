---
sidebar_position: 3
title: Troubleshooting Guide
description: Common issues and solutions for the AI Agentic Framework, including installation, workflow, and authentication problems.
---

# Troubleshooting Guide

Common issues and solutions for the AI Agentic Framework.

---

## Quick Fixes

### Framework Not Working

```bash
# 1. Verify setup
ls .claude/   # or .codex/ when using Codex. Should show CLAUDE.md/AGENTS.md, skills/, agents/

# 2. Restart the CLI (Claude Code or Codex)

# 3. Re-initialize if needed
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "Skill not found"

```bash
# Check available skills on disk
ls .claude/skills/   # or .codex/skills/

# Should include: implement-ticket, create-sdd-ticket

# In Codex, list skills loaded in the current session:
/skills

# Re-initialize if missing
./qubika-agentic-framework/scripts/initialize-project.sh
```

### TypeScript Compilation Errors

```bash
# Re-run initialization (handles build)
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Installation Issues

### Prerequisites Missing

**Node.js**:
```bash
# Check version
node --version  # Must be v20+

# Install via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

**Claude Code CLI**:
```bash
claude --version
# If not found, install from https://claude.ai/code
```

**Codex CLI**:
```bash
codex --version
# If not found, see https://developers.openai.com/codex/cli
```

### Initialization Failures

```bash
# Re-run with debug
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh 2>&1 | tee init.log

# Check disk space (need 1GB+)
df -h .

# Clean and retry
rm -rf .claude-temp/   # use .codex-temp/ when provider=codex
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Syncing Framework Resources

> For normal updates (pulling the latest skills/agents into your project), see the
> [Updating the Framework](/docs/guides/updating-the-framework) guide. This section covers
> errors you may hit while syncing.

### `sync-framework-resources` fails with `ERR_MODULE_NOT_FOUND`

You added a new skill and ran `sync-framework-resources` (without re-initializing), and the
script failed with an error like:

```text
> orchestration@1.0.0 sync-framework-resources
> tsx src/scripts/sync-framework-resources.ts

Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ora' imported from
  .../orchestration/src/utils/logger.ts
```

**Why it happens**:

- `sync-framework-resources` runs `tsx` directly with **no dependency-install step**, so it
  assumes a working install in `orchestration/`.
- Your `orchestration/node_modules/` is stale. The missing package (`ora` in the example above)
  **is** declared as a dependency, but it can't be resolved at runtime — typically because it
  was newly added by a recent framework release that your local install predates.

**Fix — 2 commands**:

```bash
# 1. Refresh orchestration dependencies
cd qubika-agentic-framework/orchestration && pnpm install

# 2. Re-run the sync
./qubika-agentic-framework/scripts/sync-framework-resources.sh
```

**Do I need to re-initialize?** No. A full re-init is not required for this — and re-init would
not wipe your `.claude/skills/` directory anyway. `pnpm install` + re-running sync is enough.

> **Note**: Hand-added skills with non-colliding names survive both sync and re-init.
> Framework-managed resources are tracked in `framework-config.json`, and user-modified ones are
> automatically skipped on sync — so syncing won't clobber your local changes.

---

## Workflow Issues

### Implement Ticket

**"Ticket not found"**:
```bash
# Verify ticket ID format (Claude shown; swap '/' for '$' in Codex)
/implement-ticket --from-jira PROJ-123  # Correct
/implement-ticket --from-jira proj123   # Incorrect

# For local files, verify path
ls -la ./specs/feature.md
```

**"Planning timeout"**:
```bash
# Use higher capability model
MODEL_TIER=opus /implement-ticket --from-jira PROJ-123    # Claude Code
MODEL_TIER=opus $implement-ticket --from-jira PROJ-123    # Codex CLI

# Break down large tickets
```

**"Tests failing"**:
```bash
# The skill automatically retries up to 3 times
# Check specific errors in output
git diff HEAD

# Artifacts preserved for debugging (.claude-temp/ in Claude, .codex-temp/ in Codex)
ls .claude-temp/tickets/PROJ-123/artifacts/
```

### Create Ticket

**"Too many gap questions"**:
```bash
# Provide more detailed input
/create-sdd-ticket --from-input "Add CSV export button with async processing and email notification" --save-to-markdown ./specs/export.md   # Claude Code
$create-sdd-ticket --from-input "Add CSV export button with async processing and email notification" --save-to-markdown ./specs/export.md   # Codex CLI
```

**"Generic ticket"**:
```bash
# Add context and constraints
/create-sdd-ticket --from-input "Users can't find specific users in 500+ list. Add search by name/email using existing patterns" --save-to-markdown ./specs/search.md   # Claude Code
$create-sdd-ticket --from-input "Users can't find specific users in 500+ list. Add search by name/email using existing patterns" --save-to-markdown ./specs/search.md   # Codex CLI
```

### Quality Gates

**Linting/Type Checking**:
```bash
# Auto-handled by the /implement-ticket skill
# Manual check if needed:
npm run lint:fix
npx tsc --noEmit
```

**Test Coverage**:
```bash
# Auto-validated (80%+ required)
npm test -- --coverage
```

### Visual Regression

**False positives**:
```bash
# Skip for backend changes
/implement-ticket --from-jira PROJ-123 --skip-visual   # Claude Code
$implement-ticket --from-jira PROJ-123 --skip-visual   # Codex CLI
```

**Screenshot failures**:
```bash
npx playwright install
```

---

## Authentication Issues

### Claude Code

```bash
# Re-authenticate
claude auth logout
claude auth login
claude auth status
```

### Codex CLI

```bash
# Re-authenticate
codex logout
codex login
codex login status
```

### API Key

```bash
# Verify
echo $ANTHROPIC_API_KEY | cut -c1-10  # Claude: should start with 'sk-ant-api'
echo $OPENAI_API_KEY    | cut -c1-10  # Codex:  should start with 'sk-'
```

### Jira Integration

```bash
# Check Jira MCP configured in the provider's config (Claude Code or Codex)
# Test connection:
curl -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_URL/rest/api/2/myself"
```

---

## MCP Connection Issues

A skill that depends on an MCP server (e.g. Atlassian/Jira) will **pause and stop** if the server is
not connected or authenticated. You'll see a message like the one below, asking you to run `/mcp` and
authenticate before the workflow can continue:

![Claude Code prompting for MCP authentication when fetching a Jira ticket](/img/mcp/mcp-auth-prompt.png)

In the screenshot, `/implement-ticket --from-jira AIDM-783` cannot fetch the ticket because the
Atlassian MCP connection is not authenticated. Follow the steps below to fix it.

### Step 1 — Authenticate via `/mcp`

```bash
# In the Claude Code session, run:
/mcp

# Select the failing server (e.g. "claude.ai Atlassian") and complete the browser auth flow.
# Then re-run your original command:
/implement-ticket --from-jira AIDM-783
```

### Step 2 — Verify the server is connected

```bash
# List configured MCP servers and their connection status
claude mcp list
```

### Step 3 — (Re)add the server if it's missing

If the server doesn't appear in the list, add it manually, then re-authenticate with `/mcp`:

```bash
# Example: add the Atlassian MCP over HTTP transport
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp

# Then authenticate the freshly added server
/mcp
```

### Step 4 — Still failing?

```bash
# Remove and re-add the server, then restart the CLI
claude mcp remove atlassian
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp

# Confirm network access to the MCP endpoint
curl -I https://mcp.atlassian.com/v1/mcp
```

> MCP server **configuration** (env vars, additional servers) is documented in
> [Environment Variables → MCP Server Configuration](../configuration/environment-variables.md).

---

## Performance Issues

### Slow Initialization

```bash
# Monitor with debug
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh | tee init.log

# Check resources
df -h
free -h
```

### Slow Implementation

```bash
# Claude Code — faster / more capable
MODEL_TIER=haiku /implement-ticket --from-jira PROJ-123
MODEL_TIER=opus  /implement-ticket --from-jira PROJ-123

# Codex CLI — same flags, '$' prefix
MODEL_TIER=haiku $implement-ticket --from-jira PROJ-123
MODEL_TIER=opus  $implement-ticket --from-jira PROJ-123
```

---

## Debug Mode

### Enable Logging

```bash
export DEBUG=true

/implement-ticket --from-jira PROJ-123    # Claude Code
$implement-ticket --from-jira PROJ-123    # Codex CLI
```

### Inspect Artifacts

```bash
# Artifacts are always preserved. Use .claude-temp/ in Claude, .codex-temp/ in Codex.
ls -la .claude-temp/tickets/PROJ-123/artifacts/

# View phase outputs
cat .claude-temp/tickets/PROJ-123/artifacts/phase*-complete.json
```

### Useful Commands

```bash
# Validate config
cat .claude/framework-config.json | jq .   # or .codex/framework-config.json

# Test setup
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Getting Help

### Self-Diagnosis Checklist

- [ ] Node.js v20+ installed
- [ ] Claude Code **or** Codex CLI working
- [ ] Framework cloned
- [ ] `.claude/` (or `.codex/`) directory exists
- [ ] Authentication working
- [ ] Disk space available (1GB+)
- [ ] Skills visible in the CLI (`/skills` in Codex; auto-discovered in Claude)

### Information to Gather

**Environment**:
```bash
node --version
npm --version
claude --version   # if using Claude Code
codex --version    # if using Codex CLI
```

**Framework version**:
```bash
cd qubika-agentic-framework
git rev-parse HEAD
```

**Error output**:
```bash
export DEBUG=true
/implement-ticket --from-jira PROJ-123 2>&1 | tee error.log   # Claude Code
$implement-ticket --from-jira PROJ-123 2>&1 | tee error.log   # Codex CLI
```

**Configuration**:
```bash
cat .claude/framework-config.json   # or .codex/framework-config.json
ls -la .claude/                     # or .codex/
```

### Support Channels

1. Framework documentation
2. Team Slack: #ai-agentic-framework
3. GitHub Issues

---

## Best Practices

### Preventive Maintenance

```bash
# Update framework monthly
cd qubika-agentic-framework
git pull origin main

# Clean old artifacts weekly (use .codex-temp/ for Codex)
find .claude-temp -name "*.json" -mtime +7 -delete

# Verify setup quarterly
./scripts/initialize-project.sh
```

### Tips

1. Keep tickets focused
2. Update context after major changes (re-run initialize)
3. Use production workflows
4. Commit the generated config directory (`.claude/` or `.codex/`)
5. Test in staging first

---

**Still having issues?** Join #ai-agentic-framework Slack for support.
