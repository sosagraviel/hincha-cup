# Claude Code Runtime Environment

**Purpose**: Isolated Docker environment for running Claude Code across multiple projects with pre-configured MCP servers and development tools.

> **Provider note**: the shipped runtime targets Claude Code. To run Codex CLI in the same pattern, install the `codex` binary in the Dockerfile and mount `OPENAI_API_KEY` / `~/.codex` in place of the Claude equivalents — everything else (project mount, MCP servers, host networking) works unchanged. The framework itself is provider-agnostic.

**Version**: 1.0.0
**Last Updated**: 2026-03-02

---

## Overview

This Docker runtime provides:
- ✅ **Claude Code CLI** pre-installed
- ✅ **All MCP servers** (Jira, GitHub, Confluence, Notion, PostgreSQL, Playwright, Pencil)
- ✅ **Development tools** (Node.js, pnpm, Python, git, PostgreSQL client)
- ✅ **Project mounting** (your codebase as volume)
- ✅ **Credential management** (via .env file)
- ✅ **Network access** to localhost services (PostgreSQL, Redis, etc.)

**Use Case**: Run Claude Code in a consistent environment across all 1000+ company projects.

---

## Quick Start

### 1. Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Project already initialized with `.claude/` directory (or `.codex/` if using Codex)

### 2. Setup Credentials

```bash
cd docker/claude-runtime
cp .env.example .env
```

Edit `.env` with your actual credentials:
```bash
# Required — pick one depending on provider
CLAUDE_API_KEY=sk-ant-api03-...        # Claude Code
# OPENAI_API_KEY=sk-...                # Codex CLI

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

### 4. Use Claude Code

Inside the container:

```bash
# Start your provider's interactive session
claude-code run   # Claude Code
# codex           # Codex CLI (if installed in the image)

# Initialize a new project (shell script, not a skill)
./qubika-agentic-framework/scripts/initialize-project.sh

# Implement a Jira ticket
/implement-ticket PROJ-123    # Claude Code
$implement-ticket PROJ-123    # Codex CLI

# Create an SDD ticket
/create-sdd-ticket            # Claude Code
$create-sdd-ticket            # Codex CLI
```

### 5. Stop Runtime

```bash
# Stop container (preserve volumes)
./scripts/stop-claude.sh

# Stop and remove volumes (clean slate)
./scripts/stop-claude.sh --volumes
```

---

## Architecture

### Directory Structure

```
docker/claude-runtime/
├── Dockerfile              # Claude runtime image definition
├── docker-compose.yml      # Orchestration configuration
├── .env.example           # Credential template
├── .env                   # Your actual credentials (gitignored)
├── README.md              # This file
└── scripts/
    ├── run-claude.sh      # Launch runtime
    └── stop-claude.sh     # Stop runtime
```

### Image Layers

**Base**: `node:22.14-alpine` (lightweight Node.js)

**Layer 1 - System Tools**:
- bash, git, curl, jq
- PostgreSQL client
- Python 3 + pip
- SSH client
- CA certificates

**Layer 2 - Package Managers**:
- pnpm 10.2.1 (global)

**Layer 3 - Claude Code**:
- @anthropic/claude-code (when available)

**Layer 4 - MCP Servers**:
- @modelcontextprotocol/server-atlassian
- @modelcontextprotocol/server-github
- @modelcontextprotocol/server-google-sheets
- @modelcontextprotocol/server-postgres
- @modelcontextprotocol/server-playwright
- @modelcontextprotocol/server-notion
- @modelcontextprotocol/server-pencil

**Layer 5 - Development Tools**:
- Playwright browsers (Chromium)
- Python tools (ruff, black, mypy, pytest)

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

---

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

#### MCP Credentials (Optional, based on project needs)

```bash
# Atlassian (Jira + Confluence)
ATLASSIAN_CLOUD_ID=abc123
ATLASSIAN_USER_EMAIL=you@company.com
ATLASSIAN_API_TOKEN=ATATT3xFfGF0...

# GitHub
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx

# Google Sheets
GOOGLE_SHEETS_CREDENTIALS=/root/.config/google-sheets/credentials.json

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

---

## Usage Examples

### Example 1: Initialize New Project

```bash
# Start runtime
./scripts/run-claude.sh ~/projects/new-app

# Inside container
claude-code run   # or `codex`

# Run: ./qubika-agentic-framework/scripts/initialize-project.sh
# The framework will:
# 1. Detect tech stack
# 2. Copy relevant skills
# 3. Generate agents
# 4. Configure MCPs
# 5. Create CLAUDE.md (or AGENTS.md) and project-context
```

### Example 2: Implement Jira Ticket

```bash
# Start runtime
./scripts/run-claude.sh ~/projects/existing-app

# Inside container
claude-code run   # or `codex`

# User: /implement-ticket EV-456    (Claude)
# User: $implement-ticket EV-456    (Codex)
# The agent will:
# 1. Fetch ticket from Jira
# 2. Analyze requirements
# 3. Create implementation plan
# 4. Implement code
# 5. Run tests
# 6. Create pull request
```

### Example 3: Create SDD Ticket

```bash
# Inside container
claude-code run   # or `codex`

# User: /create-sdd-ticket    (Claude)
# User: $create-sdd-ticket    (Codex)
# User: "We need password reset for users"
# The agent:
# - Asks clarifying questions
# - User answers
# - Generates a complete INVEST ticket
# - Creates the ticket in Jira
```

### Example 4: Multi-Project Workflow

```bash
# Terminal 1: Work on Project A
./scripts/run-claude.sh ~/projects/project-a

# Terminal 2: Work on Project B
./scripts/run-claude.sh ~/projects/project-b

# Each runs in isolated container with same tools
```

---

## Troubleshooting

### Issue: Container won't start

**Symptoms**: `docker-compose up` fails

**Solutions**:
1. Check Docker is running: `docker ps`
2. Check .env file exists: `ls -la .env`
3. Validate PROJECT_PATH in .env is absolute path
4. Check logs: `docker-compose logs`

---

### Issue: Can't access localhost services (PostgreSQL, Redis)

**Symptoms**: Connection refused to localhost:5432

**Solutions**:
1. Verify `network_mode: host` in docker-compose.yml
2. Check service is running on host: `pg_isready -h localhost -p 5432`
3. If using Docker Desktop on Mac, host networking may not work:
   - Use `host.docker.internal` instead of `localhost`
   - Update DATABASE_URL: `postgresql://user:pass@host.docker.internal:5432/db`

---

### Issue: Git operations fail (permission denied)

**Symptoms**: "Permission denied (publickey)" when git push

**Solutions**:
1. Ensure SSH keys mounted: Check `-v ~/.ssh:/root/.ssh:ro` in docker-compose.yml
2. Check SSH agent on host: `ssh-add -l`
3. Test from container: `docker exec -it claude-runtime ssh -T git@github.com`

---

### Issue: MCP server authentication fails

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
3. Check MCP configuration in project's `.claude/mcp.json` (or `.codex/mcp.json` on Codex)

---

### Issue: Out of disk space

**Symptoms**: "no space left on device"

**Solutions**:
1. Clean up Docker: `docker system prune -a`
2. Remove unused images: `docker image prune -a`
3. Remove stopped containers: `docker container prune`
4. Check disk usage: `docker system df`

---

### Issue: Python/Node version mismatch

**Symptoms**: "Module not found" or version errors

**Solutions**:
1. Rebuild image with correct versions in Dockerfile:
   ```dockerfile
   FROM node:20.10-alpine  # Change Node version
   RUN pip3 install python==3.11  # Change Python version
   ```
2. Rebuild: `docker-compose build --no-cache`

---

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

---

### Mounting Additional Volumes

To mount credentials or config files:

```yaml
# Add to docker-compose.yml volumes section
volumes:
  - ${HOME}/.aws:/root/.aws:ro          # AWS credentials
  - ${HOME}/.config/gcloud:/root/.config/gcloud:ro  # GCP credentials
  - ./custom-scripts:/scripts:ro        # Custom scripts
```

---

### Using with CI/CD

Example GitHub Actions workflow:

```yaml
name: Claude Code Integration

on: [pull_request]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Claude Runtime
        run: |
          cd docker/claude-runtime
          docker-compose build

      - name: Run Code Quality Check
        env:
          CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
          PROJECT_PATH: ${{ github.workspace }}
        run: |
          cd docker/claude-runtime
          docker-compose run claude-runtime claude-code run /code-quality-check
```

---

### Multi-Project Orchestration

To manage multiple projects simultaneously, create a `projects.yml`:

```yaml
# docker/multi-project.yml
version: '3.9'

services:
  claude-project-a:
    extends:
      file: claude-runtime/docker-compose.yml
      service: claude-runtime
    container_name: claude-project-a
    volumes:
      - /path/to/project-a:/workspace:rw

  claude-project-b:
    extends:
      file: claude-runtime/docker-compose.yml
      service: claude-runtime
    container_name: claude-project-b
    volumes:
      - /path/to/project-b:/workspace:rw
```

Then:
```bash
docker-compose -f docker/multi-project.yml up -d
docker exec -it claude-project-a bash
docker exec -it claude-project-b bash
```

---

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
- ❌ Share .env files across projects (use project-specific .env)
- ❌ Use admin/root tokens (use scoped tokens)

### Network Security

- Container uses host network (can access all localhost services)
- Be cautious with untrusted code execution
- Consider using bridge network mode for isolation if needed

### Volume Permissions

- Project mounted read-write (Claude can modify code)
- Config files mounted read-only (Claude can't modify credentials)
- Review git commits before pushing

---

## Performance Optimization

### Build Cache

To speed up builds, use BuildKit:
```bash
export DOCKER_BUILDKIT=1
docker-compose build
```

### Layer Caching

Dockerfile is optimized for layer caching:
- System dependencies (rarely change) → cached
- MCP servers (occasionally change) → cached
- Project code (frequently changes) → mounted, not in image

### Resource Allocation

For heavy workloads (large monorepos), increase limits:
```yaml
deploy:
  resources:
    limits:
      cpus: '8'
      memory: 16G
```

---

## Maintenance

### Updating MCP Servers

```bash
# Rebuild with latest MCP versions
docker-compose build --no-cache --pull

# Or update specific package in Dockerfile
RUN npm install -g @modelcontextprotocol/server-github@latest
```

### Updating Base Image

```dockerfile
# Update Node version
FROM node:22.15-alpine  # New version
```

Then rebuild:
```bash
docker-compose build --no-cache --pull
```

### Cleaning Up

```bash
# Remove stopped containers
docker-compose down

# Remove volumes (cache)
docker-compose down -v

# Remove image
docker rmi claude-runtime:1.0.0

# Full cleanup
docker system prune -a --volumes
```

---

## Version History

- **1.0.0** (2026-03-02): Initial Docker runtime with MCP servers and development tools

---

## References

- Docker Docs: https://docs.docker.com/
- Docker Compose Docs: https://docs.docker.com/compose/
- Claude Code MCP: https://github.com/anthropics/mcp
- Atlassian MCP: https://github.com/modelcontextprotocol/servers/tree/main/src/atlassian
- GitHub MCP: https://github.com/modelcontextprotocol/servers/tree/main/src/github

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Docker logs: `docker-compose logs`
3. Contact AI team leads
4. Open issue in company's internal support channel
