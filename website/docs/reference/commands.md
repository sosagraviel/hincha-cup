---
sidebar_position: 1
title: Commands Reference
description: Complete reference for all available user-invokable skills in the Qubika Agentic Framework
---

# Commands Reference

The framework exposes its workflows as user-invokable skills. After project initialization, invoke them via the Skill tool. Native Claude/Codex slash-commands are no longer shipped by the framework — all workflows are now skills.

## Invoking Skills

Each provider uses a different prefix to invoke a skill:

| Provider      | Invocation syntax       | List available skills |
| ------------- | ----------------------- | --------------------- |
| Claude Code   | `/skill-name [args]`    | Auto-discovered       |
| Codex CLI     | `$skill-name [args]`    | `/skills`             |

In Codex, run `/skills` at any time to see the skills currently available in the session — useful when troubleshooting why a skill isn't firing.

All examples below show the Claude form first and the Codex equivalent alongside. The arguments and behavior are identical — only the prefix changes.

---

## Project Setup

### `/initialize-project`

One-time project setup that analyzes your codebase and generates framework configuration.

**Purpose**: Detects tech stack, analyzes patterns, and creates custom agents for your project.

**Actions**:
1. Detects tech stack (languages, frameworks, tools)
2. Analyzes codebase structure and patterns
3. Generates CLAUDE.md and project-context
4. Copies stack-specific skills
5. Creates custom agents

**Time**: ~2 minutes

**Usage**:
```bash
# Claude Code
/initialize-project

# Codex CLI
$initialize-project
```

**Output**: Creates `.claude/` directory with:
- `CLAUDE.md` - Quick reference guide
- `skills/` - Stack-specific skills
- `agents/` - Custom AI agents

**Run**: Once per project (or when stack changes significantly)

---

## Feature Development

### `/implement-ticket`

Full feature implementation workflow from planning to pull request.

**Purpose**: Implements a ticket end-to-end through 11 phases including planning, implementation, testing, and PR creation.

**Phases**:
1. Preflight validation
2. Context gathering
3. Planning (with planner agent)
4. Environment setup
5. Implementation (with implementer agent)
6. Testing
7. Visual verification
8. Documentation update
9. PR creation
10. Review loop
11. Cleanup

**Time**: 5-15 minutes per ticket

**Usage**:
```bash
# Claude Code
/implement-ticket --from-jira PROJ-123
/implement-ticket --from-markdown ./specs/feature.md
/implement-ticket --from-input "Add user export feature"

# Codex CLI
$implement-ticket --from-jira PROJ-123
$implement-ticket --from-markdown ./specs/feature.md
$implement-ticket --from-input "Add user export feature"
```

**Available Flags**:

| Flag | Description | Example |
|------|-------------|---------|
| `--from-jira <TICKET-ID>` | Implement from Jira ticket | `--from-jira PROJ-123` |
| `--from-markdown <PATH>` | Implement from markdown SDD ticket | `--from-markdown ./specs/feature.md` |
| `--from-input "description"` | Implement from plain text | `--from-input "Add export feature"` |
| `--skip-tests` | Skip testing phase | `--skip-tests` |
| `--skip-visual` | Skip visual verification phase | `--skip-visual` |
| `--skip-pr` | Skip PR creation (commit only) | `--skip-pr` |
| `--branch <NAME>` | Custom branch name | `--branch feature/custom-name` |

**Example**:
```bash
# Claude Code
/implement-ticket --from-jira PROJ-123 --skip-visual

# Codex CLI
$implement-ticket --from-jira PROJ-123 --skip-visual
```

---

## Quality Assurance

### `/code-quality-check`

Run all quality checks including linting, type checking, tests, and coverage.

**Purpose**: Automated code quality verification across all quality gates.

**Checks**:
- Linting (ESLint, Pylint, etc.)
- Type checking (TypeScript, mypy, etc.)
- Tests (Jest, Pytest, Vitest, etc.)
- Coverage (aim for 80%+)

**Time**: 1-3 minutes

**Usage**:
```bash
# Claude Code
/code-quality-check

# Codex CLI
$code-quality-check
```

**Output**: Pass/fail status with detailed error messages if any checks fail.

---

### `/create-pr`

Create GitHub pull request with comprehensive artifacts.

**Purpose**: Creates production-ready PR with code changes, test results, and coverage reports.

**Time**: ~30 seconds

**Usage**:
```bash
# Claude Code
/create-pr

# Codex CLI
$create-pr
```

**Requirements**:
- Git changes committed
- Tests passing
- On a feature branch

**Includes**:
- Code changes summary
- Test results
- Coverage report
- Screenshots (for frontend changes)
- Link to original ticket (if available)

**Output**: Returns PR URL

---

## Task Management

Parallel development commands using git worktrees for isolated task environments.

### `/start-task`

Create isolated git worktree for parallel task development.

**Purpose**: Work on multiple tickets in parallel without conflicts.

**Usage**:
```bash
# Claude Code
/start-task <TASK-ID> [branch-name]

# Codex CLI
$start-task <TASK-ID> [branch-name]
```

**Example**:
```bash
# Claude Code
/start-task PROJ-123

# Codex CLI
$start-task PROJ-123

# Creates worktree at: ../<project>-tasks/PROJ-123
# Branch: task/PROJ-123
```

**What it does**:
1. Creates git worktree in isolated directory
2. Auto-detects and assigns unique ports
3. Copies `.claude/` configuration
4. Creates environment files with updated ports
5. Sets up Docker isolation (if applicable)

**Output**: Displays worktree location, assigned ports, and next steps.

---

### `/end-task`

Clean up worktree after task completion.

**Purpose**: Remove worktree directory and free up resources.

**Usage**:
```bash
# Claude Code
/end-task <TASK-ID>

# Codex CLI
$end-task <TASK-ID>
```

**Example**:
```bash
# Claude Code
/end-task PROJ-123

# Codex CLI
$end-task PROJ-123
```

**Requirements**: Changes must be committed or PR created before cleanup.

---

### `/list-tasks`

View all active worktrees.

**Purpose**: See all tasks currently in progress.

**Usage**:
```bash
# Claude Code
/list-tasks

# Codex CLI
$list-tasks
```

**Output**: Lists all active tasks with:
- Task ID
- Branch name
- Worktree path
- Assigned ports
- URLs
- Creation date

---

### `/switch-task`

Navigate to task worktree.

**Purpose**: Quickly switch between active tasks.

**Usage**:
```bash
# Claude Code
/switch-task <TASK-ID>

# Codex CLI
$switch-task <TASK-ID>
```

**Example**:
```bash
# Claude Code
/switch-task PROJ-123

# Codex CLI
$switch-task PROJ-123

# Changes directory to: ../<project>-tasks/PROJ-123
```

---

## Prerequisites

### All Commands
- Project initialized with `/initialize-project` (Claude) / `$initialize-project` (Codex)
- Git repository configured

### Jira Commands
- Jira MCP configured in `.claude/mcp.json`
- Valid Jira credentials

### GitHub Commands
- GitHub MCP or `gh` CLI configured
- Push access to remote repository

### Testing Commands
- Test framework detected and configured
- Tests passing in current state

---

## Common Workflows

### Start New Feature

```bash
# Claude Code
/start-task PROJ-123                     # 1. Create task worktree
cd ../<project>-tasks/PROJ-123           # 2. Navigate to worktree
/implement-ticket --from-jira PROJ-123   # 3. Implement ticket
cd -                                     # 4. Return to main project
/end-task PROJ-123                       # 5. Clean up when done

# Codex CLI
$start-task PROJ-123
cd ../<project>-tasks/PROJ-123
$implement-ticket --from-jira PROJ-123
cd -
$end-task PROJ-123
```

### Create Ticket and Implement

```bash
# Claude Code
/create-sdd-ticket \
  --from-input "Add CSV export for users" \
  --save-to-jira <board-url> \
  --project-key PROJ
/implement-ticket --from-jira PROJ-124

# Codex CLI
$create-sdd-ticket \
  --from-input "Add CSV export for users" \
  --save-to-jira <board-url> \
  --project-key PROJ
$implement-ticket --from-jira PROJ-124
```

### Quality Check Before Merge

```bash
# Claude Code
/code-quality-check   # Run all quality checks
/create-pr            # If passing, create PR

# Codex CLI
$code-quality-check
$create-pr
```

---

## Error Handling

### Skill Not Found
```
❌ Error: Skill not available

Run /initialize-project (Claude) or $initialize-project (Codex) first to set up the framework.
In Codex, run /skills to list the skills currently available in the session.
```

### Missing Prerequisites
```
❌ Error: No authentication available for Jira

Configure Jira MCP in .claude/mcp.json
See: docs/configuration/jira-integration.md
```

### Validation Failures
```
❌ Preflight validation failed: Uncommitted changes

Commit or stash changes before running /implement-ticket (Claude) or $implement-ticket (Codex)
```

---

## Best Practices

1. **Always initialize first**: Run `/initialize-project` (Claude) or `$initialize-project` (Codex) once per project
2. **Use worktrees for parallel work**: Leverage `/start-task` / `$start-task` for multiple tickets
3. **Let the framework plan**: Don't skip planning phases in `/implement-ticket` / `$implement-ticket`
4. **Create SDD tickets**: Use `/create-sdd-ticket` / `$create-sdd-ticket` for clear specifications
5. **Run quality checks**: Always use `/code-quality-check` / `$code-quality-check` before creating PRs
6. **Clean up worktrees**: Use `/end-task` / `$end-task` when done to free resources
7. **Troubleshoot in Codex**: Run `/skills` to see which skills are active in the current session

---

## Further Reading

- [Skills Catalog](./skills-catalog.md) - Skills used by each command
- [Agents Reference](./agents.md) - Agents invoked during workflows
- [Project Structure](./project-structure.md) - Understanding `.claude/` directory
- [Environment Variables](../configuration/environment-variables.md) - Configuration options
