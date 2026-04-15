---
sidebar_position: 3
title: Docker Runtime
description: Isolated Docker environment with pre-configured MCP servers and development tools
---

# Docker Runtime

Isolated Docker environment for running the framework across multiple projects with pre-configured MCP servers and development tools.

## Overview

The Docker runtime provides:
- ✅ **Claude Code CLI** pre-installed
- ✅ **All MCP servers** (Jira, GitHub, Confluence, Notion, PostgreSQL, Playwright)
- ✅ **Development tools** (Node.js, pnpm, Python, git, PostgreSQL client)
- ✅ **Project mounting** (your codebase as volume)
- ✅ **Credential management** (via .env file)
- ✅ **Network access** to localhost services

**Use Case**: Run the framework in a consistent environment across all company projects.

## Quick Start

### 1. Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Project already initialized with `.claude/` directory

### 2. Setup Credentials

```bash
cd docker/claude-runtime
cp .env.example .env
```

Edit `.env` with your actual credentials:

```bash
# Required
CLAUDE_API_KEY=sk-ant-api03-...
PROJECT_PATH=/absolute/path/to/your/project

# For Jira/Confluence integration
ATLASSIAN_CLOUD_ID=...
ATLASSIAN_USER_EMAIL=...
ATLASSIAN_API_TOKEN=...

# For GitHub integration
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
```

### 3. Launch Runtime

```bash
./scripts/run-claude.sh /path/to/your/project
```

This will:
1. Build the Claude runtime image (first time only)
2. Start the container with your project mounted
3. Drop you into an interactive bash shell

### 4. Use the Framework

Inside the container:

```bash
# Start Claude Code interactive session
claude-code run

# Initialize a new project
/initialize-project

# Implement a Jira ticket
/implement-ticket PROJ-123

# Create an SDD ticket by invoking the create-sdd-ticket skill
```

### 5. Stop Runtime

```bash
# Stop container (preserve volumes)
./scripts/stop-claude.sh

# Stop and remove volumes (clean slate)
./scripts/stop-claude.sh --volumes
```

## Configuration

### Environment Variables

All credentials are loaded from `.env` file.

#### Required Variables

```bash
# Claude API
CLAUDE_API_KEY=sk-ant-api03-...

# Project path (absolute)
PROJECT_PATH=/Users/you/projects/your-app
```

#### MCP Credentials (Optional)

```bash
# Atlassian (Jira + Confluence)
ATLASSIAN_CLOUD_ID=abc123
ATLASSIAN_USER_EMAIL=you@company.com
ATLASSIAN_API_TOKEN=ATATT3xFfGF0...

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Notion
NOTION_API_KEY=secret_xxxxxxxxxxxx
```

#### Project-Specific Variables

```bash
# Database (if project uses PostgreSQL)
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Redis (if project uses Redis)
REDIS_URL=redis://localhost:6379
```

### Resource Limits

Default limits (adjust in `docker-compose.yml`):
- **CPU**: 4 cores max, 2 cores reserved
- **Memory**: 8GB max, 4GB reserved

For smaller machines:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
    reservations:
      cpus: '1'
      memory: 2G
```

## Architecture

### Volume Mounts

| Host Path | Container Path | Purpose | Mode |
|-----------|----------------|---------|------|
| `${PROJECT_PATH}` | `/workspace` | Project codebase | Read-write |
| `~/.claude` | `/root/.claude` | Global Claude config | Read-only |
| `~/.gitconfig` | `/root/.gitconfig` | Git configuration | Read-only |
| `~/.ssh` | `/root/.ssh` | SSH keys for git | Read-only |

### Network Mode

**Host mode** (default): Container shares host's network stack.

**Benefits**:
- Access `localhost:5432` (PostgreSQL)
- Access `localhost:6379` (Redis)
- Access `localhost:3050` (Backend API)
- No port mapping needed

**Alternative**: Bridge mode (uncomment in `docker-compose.yml` if you need network isolation)

## Usage Examples

### Example 1: Initialize New Project

```bash
# Start runtime
./scripts/run-claude.sh ~/projects/new-app

# Inside container
claude-code run

# User: /initialize-project
# Framework will:
# 1. Detect tech stack
# 2. Copy relevant skills
# 3. Generate agents
# 4. Configure MCPs
# 5. Create CLAUDE.md and project-context
```

### Example 2: Implement Jira Ticket

```bash
# Start runtime
./scripts/run-claude.sh ~/projects/existing-app

# Inside container
claude-code run

# User: /implement-ticket EV-456
# Framework will:
# 1. Fetch ticket from Jira
# 2. Analyze requirements
# 3. Create implementation plan
# 4. Implement code
# 5. Run tests
# 6. Create pull request
```

### Example 3: Multi-Project Workflow

```bash
# Terminal 1: Work on Project A
./scripts/run-claude.sh ~/projects/project-a

# Terminal 2: Work on Project B
./scripts/run-claude.sh ~/projects/project-b

# Each runs in isolated container with same tools
```

## Troubleshooting

### Container won't start

**Solutions**:
1. Check Docker is running: `docker ps`
2. Check .env file exists: `ls -la .env`
3. Validate PROJECT_PATH in .env is absolute path
4. Check logs: `docker-compose logs`

### Can't access localhost services

**Symptoms**: Connection refused to localhost:5432

**Solutions**:
1. Verify `network_mode: host` in docker-compose.yml
2. Check service is running on host: `pg_isready -h localhost -p 5432`
3. If using Docker Desktop on Mac, host networking may not work:
   - Use `host.docker.internal` instead of `localhost`
   - Update DATABASE_URL: `postgresql://user:pass@host.docker.internal:5432/db`

### Git operations fail

**Symptoms**: "Permission denied (publickey)" when git push

**Solutions**:
1. Ensure SSH keys mounted: Check `-v ~/.ssh:/root/.ssh:ro` in docker-compose.yml
2. Check SSH agent on host: `ssh-add -l`
3. Test from container: `docker exec -it claude-runtime ssh -T git@github.com`

### MCP server authentication fails

**Symptoms**: "401 Unauthorized" from Jira/GitHub MCP

**Solutions**:
1. Verify credentials in .env are correct
2. Test credentials manually:
   ```bash
   # Jira
   curl -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" \
     "https://api.atlassian.com/oauth/token/accessible-resources"

   # GitHub
   curl -H "Authorization: token $GITHUB_PERSONAL_ACCESS_TOKEN" \
     https://api.github.com/user
   ```
3. Check MCP configuration in project's `.claude/mcp.json`

## Security Considerations

### Credential Management

**DO**:
- ✅ Use `.env` file (gitignored)
- ✅ Mount SSH keys read-only
- ✅ Rotate API tokens regularly
- ✅ Use least-privilege tokens (only required scopes)

**DON'T**:
- ❌ Commit .env file to git
- ❌ Hardcode credentials in Dockerfile
- ❌ Share .env files across projects
- ❌ Use admin/root tokens

### Network Security

- Container uses host network (can access all localhost services)
- Be cautious with untrusted code execution
- Consider using bridge network mode for isolation if needed

### Volume Permissions

- Project mounted read-write (framework can modify code)
- Config files mounted read-only (framework can't modify credentials)
- Review git commits before pushing

## Advanced Usage

### Custom Dockerfile Modifications

To add project-specific tools:

```dockerfile
# Add to Dockerfile after line "Install MCP server dependencies"

# Install Ruby (for Ruby projects)
RUN apk add --no-cache ruby ruby-dev

# Install Java (for Java projects)
RUN apk add --no-cache openjdk17

# Install Go (for Go projects)
RUN apk add --no-cache go
```

Then rebuild: `docker-compose build --no-cache`

### Mounting Additional Volumes

To mount credentials or config files:

```yaml
# Add to docker-compose.yml volumes section
volumes:
  - ${HOME}/.aws:/root/.aws:ro          # AWS credentials
  - ${HOME}/.config/gcloud:/root/.config/gcloud:ro  # GCP credentials
  - ./custom-scripts:/scripts:ro        # Custom scripts
```

## See Also

- [Authentication](./authentication.md) - Configure API keys and Claude CLI
- [Environment Variables](./environment-variables.md) - Complete environment variable reference
- [Installation Guide](/docs/getting-started/installation.md) - Setup without Docker
