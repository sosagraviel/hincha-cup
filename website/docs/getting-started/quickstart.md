---
sidebar_position: 2
title: Quickstart Guide
description: Get up and running with AI-powered development workflows. Automate the full cycle from idea to pull request.
---

# Quickstart Guide

Get up and running with AI-powered development workflows.

---

## Overview

Automate the full cycle: **Idea → Ticket → Implementation → Pull Request**

**Prerequisites**:
- Node.js v20+ (v22 recommended)
- Git repository
- Claude Code CLI installed

---

## Step 1: Setup

### Clone and Initialize

```bash
# Navigate to your project
cd your-project-directory

# Clone framework
git clone https://github.com/thisisqubika/qubika-agentic-framework.git

# Run automated initialization
./qubika-agentic-framework/scripts/initialize-project.sh
```

### Verify

```bash
cd ..  # Back to project root
ls .claude/

# Should see:
# CLAUDE.md - Project AI guide
# skills/ - AI knowledge
# agents/ - AI agents
# commands/ - Workflows
# framework-config.json - Config
```

---

## Step 2: Your First Automation

### Option A: Full Cycle (Idea → Ticket → PR)

**Create ticket**:

```bash
# In Claude Code, invoke the create-sdd-ticket skill with:
/create-sdd-ticket --from-input "Add dark mode toggle to settings page" --save-to-markdown "./specs/dark-mode.md"
```

**What happens**:
- Analyzes codebase for UI patterns
- Asks clarifying questions
- Generates complete ticket with acceptance criteria

**Implement**:

```bash
/implement-ticket --from-jira PROJ-123
```

**What happens**:
- Creates implementation plan
- Generates code with tests
- Runs quality checks
- Creates pull request

**Result**: Production-ready PR with working code, tests, and documentation.

### Option B: Just Implementation (Ticket → PR)

```bash
# Jira ticket
/implement-ticket --from-jira PROJ-456

# Markdown spec
/implement-ticket --from-markdown ./specs/feature.md
```

---

## Step 3: Review Results

### Generated Pull Request

```markdown
# Add Dark Mode Toggle

## Summary
- Added toggle component
- Implemented theme switching with persistence
- Updated components to respect theme

## Changes
- src/components/settings/DarkModeToggle.tsx
- src/contexts/ThemeContext.tsx
- tests/components/settings/DarkModeToggle.test.tsx

## Quality Gates
✅ TypeScript compilation
✅ Linting
✅ All tests passing
✅ 80%+ coverage
```

### Check Files

```bash
git status
npm test -- --coverage
ls src/**/*.test.tsx
```

---

## Step 4: Understanding

### Framework Analysis

During initialization:
1. Detected tech stack (TypeScript, React, Jest, etc.)
2. Analyzed code patterns (component structure, testing)
3. Generated project-specific AI config in `.claude/`

### AI-Powered Implementation

```mermaid
graph LR
    A[Ticket] --> B[Planning]
    B --> C[Implementation]
    C --> D[Testing]
    D --> E[Quality Gates]
    E --> F[PR]
```

**Phases**:
1. Planning - Analyze requirements, create plan
2. Implementation - Generate code following patterns
3. Testing - Unit, integration, E2E tests
4. Quality - Linting, type checking, coverage
5. PR - Commit, push, create pull request

### Generated Files

```
.claude/
├── CLAUDE.md - Project AI reference
├── skills/ - Codebase knowledge
├── agents/ - AI agents
└── commands/ - Available workflows
```

---

## Next Steps

### Try More Workflows

```bash
# Create multiple tickets by invoking the create-sdd-ticket skill with:
/create-sdd-ticket --from-input "Add CSV export" --save-to-markdown "./specs/export.md"
/create-sdd-ticket --from-input "Add search filtering" --save-to-markdown "./specs/search.md"

# Implement them
/implement-ticket --from-markdown ./specs/export.md
/implement-ticket --from-markdown ./specs/search.md
```

### Explore Advanced Features

- Custom model tiers (`MODEL_TIER=opus`)
- Visual regression testing (automatic for UI changes)
- Custom branch naming (`--branch feature/name`)
- Skip options (`--skip-tests`, `--skip-visual`, `--skip-pr`)

### Read Documentation

- [Implement Ticket Workflow](/docs/workflows/implement-ticket)
- [Create SDD Ticket Workflow](/docs/workflows/create-sdd-ticket)
- [Troubleshooting](/docs/getting-started/troubleshooting)

---

**Need Help?**

- Check artifacts: `.claude-temp/tickets/[TICKET-ID]/artifacts/`
- Enable debug: `export DEBUG=true`
- Review logs in console output

---

**Ready to automate development?** Start with a well-defined ticket.
