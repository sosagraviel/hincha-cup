---
sidebar_position: 1
title: Installation Guide
description: Install the AI Agentic Framework for your project with Node.js v20+, Git, and Claude Code CLI.
---

# Installation Guide

Install the AI Agentic Framework for your project.

---

## Prerequisites

**Required**:
- Node.js v20+ (v22 recommended)
- Git
- **One** of:
  - Claude Code CLI ([install](https://claude.ai/code))
  - Codex CLI — see [Codex CLI docs](https://developers.openai.com/codex/cli) (project is initialized for one provider at a time)

**Verify**:
```bash
node --version  # v20+
git --version

# Claude
claude --version

# Codex
codex --version
```

**Optional**:
- Docker (for isolation)
- GitHub CLI (`gh`) for PR workflows
- Jira integration

---

## Quick Installation

### 1. Clone Framework

```bash
cd your-project-directory
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
```

### 2. Initialize Project

```bash
# Auto-detect provider (defaults to claude if both are available)
./qubika-agentic-framework/scripts/initialize-project.sh

# Or pick explicitly
./qubika-agentic-framework/scripts/initialize-project.sh --provider claude
./qubika-agentic-framework/scripts/initialize-project.sh --provider codex
```

This script automatically:
- Installs dependencies
- Builds TypeScript
- Analyzes your project
- Generates `.claude/` (or `.codex/`) configuration

### 3. Verify

```bash
ls .claude/   # or .codex/ when provider=codex
# Should see: CLAUDE.md (or AGENTS.md), skills/, agents/, framework-config.json

# Test skill — Claude Code
/implement-ticket --help

# Test skill — Codex CLI
$implement-ticket --help
# (run /skills to confirm the skill is listed)
```

**Installation complete!**

---

## Authentication Setup

### Option 1: CLI login (Recommended)

```bash
# Claude Code
claude auth login
claude auth status

# Codex CLI
codex login
codex login status
```

### Option 2: API Key

```bash
# Claude
export ANTHROPIC_API_KEY=sk-ant-your-key
echo 'export ANTHROPIC_API_KEY=sk-ant-your-key' >> ~/.bashrc

# Codex
export OPENAI_API_KEY=sk-...
echo 'export OPENAI_API_KEY=sk-...' >> ~/.bashrc

source ~/.bashrc
```

---

## Configuration

### Generated Files

```
.claude/                           # or .codex/ when provider=codex
├── CLAUDE.md                      # project AI guide (AGENTS.md in Codex)
├── framework-config.json          # configuration
├── skills/                        # AI skills (also the invocation surface)
│   ├── project-context/
│   ├── create-sdd-ticket/
│   ├── implement-ticket/
│   └── mastering-[language]/
└── agents/                        # AI agents
    └── implementer-[language].md
```

### Environment Variables (Optional)

```bash
# Model tier
MODEL_TIER=opus  # opus, sonnet (default), haiku

# API key (if not using CLI auth)
ANTHROPIC_API_KEY=sk-ant-your-key   # Claude
OPENAI_API_KEY=sk-...               # Codex

# Debug
DEBUG=true
```

### Git Configuration

Add to `.gitignore`:

```gitignore
qubika-agentic-framework/
.claude-temp/
.claude-backups/
.codex-temp/
.codex-backups/

# Keep generated config
!.claude/
!.codex/
```

---

## Team Setup

### For Team Leads

```bash
# 1. Set up framework
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh

# 2. Commit generated config
git add .claude/   # or .codex/ if using Codex
git commit -m "Add AI Agentic Framework configuration"
git push
```

### For Team Members

```bash
# 1. Pull latest (includes .claude/ or .codex/ config)
git pull origin main

# 2. Clone framework
git clone https://github.com/thisisqubika/qubika-agentic-framework.git

# 3. Test the skill
/implement-ticket --help    # Claude Code
$implement-ticket --help    # Codex CLI  (use /skills to list available skills)
```

No additional installation needed — the generated config directory (`.claude/` or `.codex/`) is already committed.

---

## Troubleshooting

### "npm not found"
Install Node.js from https://nodejs.org/

### "TypeScript compilation failed"
Re-run initialization (handles build automatically):
```bash
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "No .claude (or .codex) directory"
Re-run with debug:
```bash
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "Skills not working"
1. Verify the config directory exists (`.claude/` for Claude Code, `.codex/` for Codex)
2. Restart the CLI
3. Check skill directories: `ls .claude/skills/` (or `ls .codex/skills/`)
4. In Codex, run `/skills` to confirm the skill is active in the session

### Debug Mode

```bash
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Next Steps

1. [Quickstart Guide](/docs/getting-started/quickstart) - First automation
2. [Implement Ticket](/docs/workflows/implement-ticket) - Ticket to PR
3. [Create Ticket](/docs/workflows/create-sdd-ticket) - Idea to ticket

---

**Installation complete!** Ready for AI-powered development.
