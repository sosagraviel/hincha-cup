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
- Claude Code CLI ([install](https://claude.ai/code))

**Verify**:
```bash
node --version  # v20+
git --version
claude --version
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
./qubika-agentic-framework/scripts/initialize-project.sh
```

This script automatically:
- Installs dependencies
- Builds TypeScript
- Analyzes your project
- Generates `.claude/` configuration

### 3. Verify

```bash
ls .claude/
# Should see: CLAUDE.md, skills/, agents/, commands/, framework-config.json

# Test command (in Claude Code):
/implement-ticket --help
```

**Installation complete!**

---

## Authentication Setup

### Option 1: Claude Code CLI (Recommended)

```bash
claude auth login
claude auth status
```

### Option 2: API Key

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key

# Add to shell profile
echo 'export ANTHROPIC_API_KEY=sk-ant-your-key' >> ~/.bashrc
source ~/.bashrc
```

---

## Configuration

### Generated Files

```
.claude/
├── CLAUDE.md - Project AI guide
├── framework-config.json - Configuration
├── skills/ - AI skills
│   ├── project-context/
│   └── mastering-[language]/
├── agents/ - AI agents
│   └── implementer-[language].md
└── commands/ - Workflows
    ├── implement-ticket.md
    └── create-sdd-ticket.md
```

### Environment Variables (Optional)

```bash
# Model tier
MODEL_TIER=opus  # opus, sonnet (default), haiku

# API key (if not using Claude Code auth)
ANTHROPIC_API_KEY=sk-ant-your-key

# Debug
DEBUG=true
```

### Git Configuration

Add to `.gitignore`:

```gitignore
qubika-agentic-framework/
.claude-temp/
.claude-backups/

# Keep generated config
!.claude/
```

---

## Team Setup

### For Team Leads

```bash
# 1. Set up framework
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh

# 2. Commit generated config
git add .claude/
git commit -m "Add AI Agentic Framework configuration"
git push
```

### For Team Members

```bash
# 1. Pull latest (includes .claude/ config)
git pull origin main

# 2. Clone framework
git clone https://github.com/thisisqubika/qubika-agentic-framework.git

# 3. Test (in Claude Code)
/implement-ticket --help
```

No additional installation needed - `.claude/` configuration is already committed.

---

## Troubleshooting

### "npm not found"
Install Node.js from https://nodejs.org/

### "TypeScript compilation failed"
Re-run initialization (handles build automatically):
```bash
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "No .claude directory"
Re-run with debug:
```bash
export DEBUG=true
./qubika-agentic-framework/scripts/initialize-project.sh
```

### "Commands not working in Claude Code"
1. Verify `.claude/` exists
2. Restart Claude Code
3. Check command files: `ls .claude/commands/`

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
