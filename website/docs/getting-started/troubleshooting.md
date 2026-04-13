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
ls .claude/  # Should show CLAUDE.md, skills/, agents/

# 2. Restart Claude Code

# 3. Re-initialize if needed
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "Command not found"

```bash
# Check .claude directory
ls .claude/commands/

# Should show: implement-ticket.md, create-sdd-ticket.md

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

### Initialization Failures

```bash
# Re-run with debug
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh 2>&1 | tee init.log

# Check disk space (need 1GB+)
df -h .

# Clean and retry
rm -rf .claude-temp/
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Workflow Issues

### Implement Ticket

**"Ticket not found"**:
```bash
# Verify ticket ID format
/implement-ticket --from-jira PROJ-123  # Correct
/implement-ticket --from-jira proj123   # Incorrect

# For local files, verify path
ls -la ./specs/feature.md
```

**"Planning timeout"**:
```bash
# Use higher capability model
MODEL_TIER=opus /implement-ticket --from-jira PROJ-123

# Break down large tickets
```

**"Tests failing"**:
```bash
# Command automatically retries up to 3 times
# Check specific errors in output
git diff HEAD

# Artifacts preserved for debugging
ls .claude-temp/tickets/PROJ-123/artifacts/
```

### Create Ticket

**"Too many gap questions"**:
```bash
# Provide more detailed input
/create-sdd-ticket --from-input "Add CSV export button with async processing and email notification" --save-to-markdown ./specs/export.md
```

**"Generic ticket"**:
```bash
# Add context and constraints
/create-sdd-ticket --from-input "Users can't find specific users in 500+ list. Add search by name/email using existing patterns" --save-to-markdown ./specs/search.md
```

### Quality Gates

**Linting/Type Checking**:
```bash
# Auto-handled by /implement-ticket command
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
/implement-ticket --from-jira PROJ-123 --skip-visual
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

### API Key

```bash
# Verify
echo $ANTHROPIC_API_KEY | cut -c1-10  # Should start with 'sk-ant-api'
```

### Jira Integration

```bash
# Check Jira MCP configured in Claude Code
# Test connection:
curl -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_URL/rest/api/2/myself"
```

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
# Use faster model for simple tasks
MODEL_TIER=haiku /implement-ticket --from-jira PROJ-123

# Higher capability for complex tasks
MODEL_TIER=opus /implement-ticket --from-jira PROJ-123
```

---

## Debug Mode

### Enable Logging

```bash
export DEBUG=true
/implement-ticket --from-jira PROJ-123
```

### Inspect Artifacts

```bash
# Check artifacts (always preserved)
ls -la .claude-temp/tickets/PROJ-123/artifacts/

# View phase outputs
cat .claude-temp/tickets/PROJ-123/artifacts/phase*-complete.json
```

### Useful Commands

```bash
# Validate config
cat .claude/framework-config.json | jq .

# Test setup
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Getting Help

### Self-Diagnosis Checklist

- [ ] Node.js v20+ installed
- [ ] Claude Code CLI working
- [ ] Framework cloned
- [ ] `.claude/` directory exists
- [ ] Authentication working
- [ ] Disk space available (1GB+)
- [ ] Commands visible in Claude Code

### Information to Gather

**Environment**:
```bash
node --version
npm --version
claude --version
```

**Framework version**:
```bash
cd qubika-agentic-framework
git rev-parse HEAD
```

**Error output**:
```bash
export DEBUG=true
/implement-ticket --from-jira PROJ-123 2>&1 | tee error.log
```

**Configuration**:
```bash
cat .claude/framework-config.json
ls -la .claude/
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

# Clean old artifacts weekly
find .claude-temp -name "*.json" -mtime +7 -delete

# Verify setup quarterly
./scripts/initialize-project.sh
```

### Tips

1. Keep tickets focused
2. Update context after major changes (re-run initialize)
3. Use production workflows
4. Commit `.claude/` directory
5. Test in staging first

---

**Still having issues?** Join #ai-agentic-framework Slack for support.
