---
sidebar_position: 1
title: Skills Reference
description: Complete reference for invokable skills (commands) and the auto-loaded skills catalog in the Qubika Agentic Framework
---

# Skills Reference

The framework exposes its workflows and knowledge as **skills**. There are two kinds, and this page covers both:

- **Invokable skills (commands)** — the things you *type* (`/implement-ticket`, `/create-pr`, `/start-task`, …). These are the framework's most important skills, with explicit flags and arguments. Native Claude/Codex slash-commands are no longer shipped by the framework — every workflow is now a skill.
- **Catalog skills** — reusable knowledge modules (language idioms, framework patterns, testing strategies) that **auto-load by context** instead of being invoked by hand. The framework copies only the ones relevant to your detected tech stack.

> **Project setup is a script, not a skill.** Bootstrap a project once with `./scripts/initialize-project.sh`. It detects the tech stack, generates `.claude/` (CLAUDE.md, stack-specific skills, custom agents), builds the code graph, and scaffolds `docs/llm-wiki/`. See the [Project Structure reference](./project-structure.md) for the full generated tree. Everything below assumes this has run.

---

## Invoking Skills

Each provider uses a different prefix to invoke a skill:

| Provider      | Invocation syntax       | List available skills |
| ------------- | ----------------------- | --------------------- |
| Claude Code   | `/skill-name [args]`    | Auto-discovered       |
| Codex CLI     | `$skill-name [args]`    | `/skills`             |

In Codex, run `/skills` at any time to see the skills currently available in the session — useful when troubleshooting why a skill isn't firing. Skills themselves are identical between providers — only the prefix and the generated config directory (`.claude/` vs `.codex/`) differ.

All examples below show the Claude form first and the Codex equivalent alongside. The arguments and behavior are identical — only the prefix changes.

---

## Quick Navigation

| Part | What it covers |
| ---- | -------------- |
| [Part 1 — Invokable Skills (Commands)](#part-1--invokable-skills-commands) | The skills you type, with full flag tables |
| [Part 2 — Skills Catalog](#part-2--skills-catalog) | Auto-loaded knowledge modules selected by stack |

**Invokable skills at a glance:**

| Skill | Purpose |
| ----- | ------- |
| [`/create-sdd-ticket`](#create-sdd-ticket) | Generate a specification-driven development ticket |
| [`/implement-ticket`](#implement-ticket) | Full feature implementation, planning → PR |
| [`/create-pr`](#create-pr) | Create a GitHub PR with artifacts |
| [`/pr-reviewer`](#pr-reviewer) | Review a GitHub PR |
| [`/apply-pr-feedback`](#apply-pr-feedback) | Apply requested PR review changes |
| [`/security-review`](#security-review) | Hybrid SAST + LLM security analysis |
| [`/wiki-refresh`](#wiki-refresh) | Incremental refresh of the LLM wiki |
| [`/wiki-add-service`](#wiki-add-service) | Add a new service-doc wiki page |
| [`/start-task`](#task-management) · [`/end-task`](#task-management) · [`/list-tasks`](#task-management) · [`/switch-task`](#task-management) | Parallel task worktrees |

---

# Part 1 — Invokable Skills (Commands)

These are the skills you invoke directly. After project setup, call them via the Skill tool using your provider's prefix.

## Ticket Creation

### `/create-sdd-ticket`

Generate a specification-driven development (SDD) ticket from an idea, an existing Jira ticket, or a markdown draft.

**Purpose**: Produces an implementation-ready ticket with gap detection, INVEST validation, and BDD scenarios — then optionally persists it to Jira or markdown.

**Usage**:
```bash
# Claude Code
/create-sdd-ticket --from-input "Add CSV export for users" --save-to-jira <board-url> --project-key PROJ

# Codex CLI
$create-sdd-ticket --from-input "Add CSV export for users" --save-to-jira <board-url> --project-key PROJ
```

**Available Flags**:

| Flag | Description |
|------|-------------|
| `--from-input "..."` | Generate from a plain-text description |
| `--from-jira <KEY-OR-URL>` | Refine an existing Jira ticket into an SDD ticket |
| `--from-markdown <PATH>` | Generate from a markdown draft |
| `--save-to-jira <BOARD-URL>` | Create the ticket on a Jira board (pair with `--project-key`) |
| `--save-to-markdown [PATH]` | Write the ticket to a markdown file |

Input modes (`--from-*`) are mutually exclusive; output modes (`--save-to-*`) select where the ticket lands.

---

## Feature Development

### `/implement-ticket`

Full feature implementation workflow from planning to pull request.

**Purpose**: Implements a ticket end-to-end through a wiki-aware and graph-aware **14-phase** SDLC workflow. Supports both single-repo projects and multi-repo workspaces (a parent folder containing N independent child git repos).

**Phases**:
| # | Phase | # | Phase |
|---|-------|---|-------|
| 0 | Preflight (auto-bootstrap + validation) | 8 | Documentation update |
| 1 | Context gathering | 8.4 | Implementation commit |
| 2 | Wiki context preload | 8.5 | Wiki refresh |
| 3 | Planning (planner agent) | 9 | PR creation |
| 4 | Environment setup | 10 | Review loop |
| 5 | Implementation (implementer agent) | 11 | Cleanup |
| 6 | Testing | | |
| 7 | Visual verification | | |

> Requires an active code graph (`.code-review-graph/graph.db` + `code_graph` MCP server) and an initialized LLM wiki (`docs/llm-wiki/`). If either is missing, the skill stops and asks you to re-run setup / resource sync.

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

Input modes (`--from-*`) are mutually exclusive.

**Example**:
```bash
# Claude Code
/implement-ticket --from-jira PROJ-123 --skip-visual

# Codex CLI
$implement-ticket --from-jira PROJ-123 --skip-visual
```

---

## Pull Requests

### `/create-pr`

Create a GitHub pull request with comprehensive artifacts.

**Purpose**: Creates a production-ready PR with code changes, test results, coverage reports, and screenshots for frontend changes. Single-repo only; for multi-repo workspaces, `/implement-ticket` Phase 9 delegates to `/repo-fanout-pr`.

**Usage**:
```bash
# Claude Code
/create-pr [JIRA-KEY]

# Codex CLI
$create-pr [JIRA-KEY]
```

**Requirements**: changes committed, tests passing, on a feature branch.

**Includes**: code-change summary, test results, coverage report, screenshots (frontend), and a link to the original ticket when available.

**Output**: returns the PR URL.

---

### `/pr-reviewer`

Review a GitHub pull request through a deterministic-glue + specialist-agent pipeline.

**Purpose**: Produces a structured PR review. Auto-invoked by `/implement-ticket` Phase 10, and also usable directly. Supports single-repo and multi-repo modes.

**Usage**:
```bash
# Claude Code
/pr-reviewer --pr-url <URL> --jira-key PROJ-123

# Codex CLI
$pr-reviewer --pr-url <URL> --jira-key PROJ-123
```

**Available Flags**:

| Flag | Description |
|------|-------------|
| `--pr-url <URL>` | PR to review |
| `--jira-key <KEY>` | Associated Jira ticket for context |
| `--mode automated\|manual` | Reviewer mode |
| `--repos <abs1>,<abs2>,...` | Multi-repo: explicit repo paths |
| `--aggregate` | Combine per-repo results into one report |

---

### `/apply-pr-feedback`

Apply requested PR review changes back to the same branch.

**Purpose**: When a PR has a `CHANGES_REQUESTED` review, addresses exactly the requested feedback and pushes to the existing branch — without opening a new PR. Scope-bounded: never reimplements the ticket. Operates on one PR / one repo per invocation.

**Usage**:
```bash
# Claude Code
/apply-pr-feedback --pr-number 42 --branch feature/PROJ-123

# Codex CLI
$apply-pr-feedback --pr-number 42 --branch feature/PROJ-123
```

**Available Flags**:

| Flag | Description |
|------|-------------|
| `--pr-number <N>` | PR number to address (required) |
| `--branch <NAME>` | Branch to push fixes to (required) |
| `--from-jira <TICKET-ID>` | Pull ticket context |
| `--review-id <ID>` | Target a specific review |
| `--repo <PATH>` | Repo path (multi-repo) |
| `--skip-tests` | Skip testing after applying changes |

---

## Security

### `/security-review`

Hybrid SAST + LLM-adjudicator security analysis across all detected languages.

**Purpose**: Emits per-repo SARIF 2.1.0, structured JSON, and a human-readable report. Triggered by `/implement-ticket` Phase 10, and also usable standalone or in multi-repo mode.

**Usage**:
```bash
# Claude Code
/security-review --pr-url <URL> --jira-key PROJ-123

# Codex CLI
$security-review --pr-url <URL> --jira-key PROJ-123
```

**Available Flags**:

| Flag | Description |
|------|-------------|
| `--pr-url <URL>` | PR to analyze |
| `--jira-key <KEY>` | Associated Jira ticket for context |
| `--repos <abs1>,<abs2>,...` | Multi-repo: explicit repo paths |
| `--baseline <path>` | Suppress findings already present in a baseline |
| `--aggregate` | Combine per-repo results into one report |

---

## Documentation & Wiki

### `/wiki-refresh`

AI-driven incremental refresh of the LLM wiki (`docs/llm-wiki/`).

**Purpose**: Diffs each repo against the last-indexed commit recorded in `docs/llm-wiki/.state.json`, uses `wiki/index.md` as a routing table to identify pages whose **high-level** facts drifted, and surgically edits only those pages. Conservative by design (architecture-level facts only — refactors, renames, and bug fixes are skipped), multi-repo aware, and idempotent (reports "wiki is fresh" with no AI spend when nothing changed). Auto-invoked by `/implement-ticket` Phase 8.5.

Default behavior is write-only: page edits and `.state.json` are left uncommitted. State is advanced to current HEADs all-or-nothing, only when every page update succeeds.

**Usage**:
```bash
# Claude Code
/wiki-refresh
/wiki-refresh --dry-run
/wiki-refresh --commit --ticket PROJ-123

# Codex CLI
$wiki-refresh
$wiki-refresh --dry-run
$wiki-refresh --commit --ticket PROJ-123
```

**Available Flags**:

| Flag | Description |
|------|-------------|
| `--dry-run` | Identify affected pages without writing anything (wins over `--commit`) |
| `--commit` | Commit changed files under `docs/llm-wiki/**` as `docs(wiki): refresh` |
| `--ticket <ID>` | With `--commit`, append ` for <ID>` to the commit message |
| `--artifacts-dir <path>` | With `--commit`, when the wiki lives outside a git repo, write the diff manifest + warning for the caller (e.g. PR bodies) |

**Note**: never creates new pages. If a diff suggests a new service deserves a page, it surfaces a one-line suggestion — run `/wiki-add-service <name>` separately.

---

### `/wiki-add-service`

Create a new service-doc page under `docs/llm-wiki/wiki/services/`.

**Purpose**: Adds a wiki page for a service that exists in the project but has none yet. Validates the service is real (cross-referenced against `framework-config.json::by_service` or the project's directory structure) and refuses otherwise. Use when `/wiki-refresh` surfaces a "potential new service detected" suggestion.

**Usage**:
```bash
# Claude Code
/wiki-add-service payments

# Codex CLI
$wiki-add-service payments
```

---

## Task Management

Parallel development commands using git worktrees for isolated task environments. These lifecycle commands (`/end-task`, `/list-tasks`, `/switch-task`) are provided by the `start-task` skill.

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

**Output**: Lists all active tasks with task ID, branch name, worktree path, assigned ports, URLs, and creation date.

---

### `/switch-task`

Navigate to task worktree.

**Purpose**: Quickly switch between active tasks.

**Usage**:
```bash
# Claude Code
eval $(/switch-task <TASK-ID>)

# Codex CLI
eval $($switch-task <TASK-ID>)

# Changes directory to: ../<project>-tasks/<TASK-ID>
```

---

## Prerequisites

### All Invokable Skills
- Project bootstrapped with `./scripts/initialize-project.sh` (generates `.claude/`, the code graph, and the LLM wiki)
- Git repository configured

### Jira-backed Skills
- Jira MCP configured in `.claude/mcp.json`
- Valid Jira credentials

### GitHub-backed Skills
- GitHub MCP or `gh` CLI configured
- Push access to remote repository

### Testing Phases
- Test framework detected and configured
- Tests passing in current state

---

## Common Workflows

### Start New Feature

```bash
# Claude Code
/start-task PROJ-123                     # 1. Create task worktree
eval $(/switch-task PROJ-123)            # 2. Navigate to worktree
/implement-ticket --from-jira PROJ-123   # 3. Implement ticket
/end-task PROJ-123                       # 4. Clean up when done

# Codex CLI
$start-task PROJ-123
eval $($switch-task PROJ-123)
$implement-ticket --from-jira PROJ-123
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
# Run quality gates directly
pnpm -r lint
pnpm -r typecheck
pnpm -r test

# Then review and open the PR
/security-review --pr-url <URL>   # Static + LLM security analysis
/create-pr                        # If passing, create PR
```

---

## Error Handling

### Skill Not Found
```
❌ Error: Skill not available

Run ./scripts/initialize-project.sh first to set up the framework (.claude/, code graph, LLM wiki).
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

## Best Practices (Invokable Skills)

1. **Set up first**: Run `./scripts/initialize-project.sh` once per project (or when the stack changes significantly)
2. **Use worktrees for parallel work**: Leverage `/start-task` / `$start-task` for multiple tickets
3. **Let the framework plan**: Don't skip planning phases in `/implement-ticket` / `$implement-ticket`
4. **Create SDD tickets**: Use `/create-sdd-ticket` / `$create-sdd-ticket` for clear specifications
5. **Keep the wiki fresh**: `/implement-ticket` runs `/wiki-refresh` automatically; run it manually after large out-of-band changes
6. **Clean up worktrees**: Use `/end-task` / `$end-task` when done to free resources
7. **Troubleshoot in Codex**: Run `/skills` to see which skills are active in the current session

---

# Part 2 — Skills Catalog

Beyond the invokable skills above, the framework ships a catalog of reusable knowledge modules that **auto-load by context**. The framework automatically copies only the skills relevant to your tech stack.

## What Are Skills?

Skills are markdown documents containing:
- Best practices and patterns
- Framework-specific knowledge
- Testing strategies
- Common solutions to recurring problems

**Key Benefits**:
- Agents receive only relevant information (70-85% context reduction)
- Consistent implementation patterns across features
- Stack-specific knowledge without manual configuration
- Automatic skill selection based on project detection

---

## Foundation Skills

Core skills that provide project understanding and initialization capabilities.

### Convention skills

`/initialize-project` synthesizes three **convention skills** from analysis of your actual code. They carry the *prescriptive* knowledge agents need ("how do we do things here"); the *descriptive* knowledge ("what the system is") lives in the [LLM wiki](../architecture/code-graph-and-wiki.md).

| Skill | Captures |
| ----- | -------- |
| `code-conventions` | Coding rules, naming, error handling, data-layer patterns, gotchas (WRONG/CORRECT examples) |
| `multi-file-workflows` | Ordered checklists for cross-cutting changes |
| `testing-conventions` | What to mock, fixture rules, coverage expectations, example tests |

**Generated by**: `/initialize-project`

**Used by**: All agents (universal — auto-loaded)

**Location**: `.claude/skills/{code-conventions,multi-file-workflows,testing-conventions}/SKILL.md` (or under `.codex/skills/`)

See the [Project Structure reference](./project-structure.md) for the full generated layout.

---

### initialize-project

**Purpose**: Analyzes codebase and sets up framework configuration.

**Actions**:
- Stack detection (languages, frameworks, tools)
- Skill copying based on detected technologies
- Agent generation with appropriate skill mappings
- CLAUDE.md creation

**Command**: `/initialize-project`

**Output**: Complete `.claude/` (or `.codex/`) directory with project-specific configuration

**Auto-loads**: During initialization workflow only

---

## Workflow Skills

Skills that orchestrate development workflows and automate processes. The user-invokable ones are documented in full (flags, usage) in [Part 1](#part-1--invokable-skills-commands); this section covers how they slot into the agent workflow.

### implement-ticket

**Purpose**: Full feature implementation workflow from planning to PR.

> **Invokable** — see [`/implement-ticket`](#implement-ticket) in Part 1 for usage, flags, and the full 14-phase table.

**Used by**: All implementation agents during ticket workflow

**Auto-loads**: When the `implement-ticket` skill is invoked

---

### fetch-ticket-context

**Purpose**: Retrieves ticket details from issue trackers.

**Supports**:
- Jira (with MCP integration)
- GitHub Issues
- Linear

**Command**: `/fetch-ticket-context <TICKET_ID>`

**Output**: Structured ticket context for planning agents

**Auto-loads**: During Phase 1 of implement-ticket workflow

---

### code-quality-check

**Purpose**: Automated quality verification across all gates.

**Checks**:
- Lint errors (ESLint, Pylint, etc.)
- Type errors (TypeScript, mypy, etc.)
- Test failures (Jest, Pytest, etc.)
- Coverage gaps (aim for 80%+)

**Command**: `/code-quality-check`

**Time**: 1-3 minutes

**Auto-loads**: During the testing phase of the implement-ticket workflow

---

### create-pr

**Purpose**: Creates GitHub pull request with comprehensive artifacts.

> **Invokable** — see [`/create-pr`](#create-pr) in Part 1 for usage and requirements.

**Used by**: The implement-ticket workflow during PR creation

**Auto-loads**: During the PR creation phase of the implement-ticket workflow

---

## Language Skills

Language-specific patterns, idioms, and best practices.

### mastering-typescript

**Purpose**: TypeScript patterns, type safety, and modern features.

**Contains**:
- Type definitions and interfaces
- Generic patterns
- Decorators and metadata
- Async/await patterns
- Module organization

**Copied when**: `tsconfig.json` detected in project

**Used by**: 
- `implementer-typescript`
- `tester-unit-typescript`
- `planner` (if TypeScript is primary language)

**Auto-loads**: For all TypeScript file operations

---

### mastering-python-skill

**Purpose**: Python patterns, type hints, and Pythonic idioms.

**Contains**:
- Type hints and annotations
- Async/await patterns
- Decorators and context managers
- Package organization
- Testing with pytest

**Copied when**: `pyproject.toml` or `requirements.txt` detected

**Used by**:
- `implementer-python`
- `tester-unit-python`
- `planner` (if Python is primary language)

**Auto-loads**: For all Python file operations

---

### mastering-go

**Purpose**: Go idioms, patterns, and concurrency.

**Contains**:
- Goroutines and channels
- Error handling patterns
- Interface design
- Package organization
- Testing strategies

**Copied when**: `go.mod` detected in project

**Used by**:
- `implementer-go`
- `tester-unit-go`
- `planner` (if Go is primary language)

**Auto-loads**: For all Go file operations

---

### Other Language Skills

The framework supports 8+ languages with dedicated skills:

- **Java**: Spring patterns, Maven/Gradle, JUnit testing
- **Rust**: Ownership patterns, error handling, cargo conventions
- **Ruby**: Rails patterns, gems, RSpec testing
- **PHP**: Laravel patterns, Composer, PHPUnit
- **C#**: .NET patterns, NuGet, xUnit testing

Each language skill auto-loads when files of that language are being modified.

---

## Framework Skills

Framework-specific patterns and best practices.

### react-frontend

**Purpose**: React component design, hooks, and state management.

**Contains**:
- Component patterns (functional, class)
- Hooks usage (useState, useEffect, custom)
- State management (Context, Redux)
- Performance optimization
- Testing with React Testing Library

**Copied when**: `react` detected in `package.json`

**Used by**: `implementer-typescript` (frontend operations)

**Auto-loads**: For React component files (`.tsx`, `.jsx`)

---

### atomic-design-react

**Purpose**: Atomic Design methodology for React component libraries.

**Contains**:
- Atoms (buttons, inputs, labels)
- Molecules (form groups, cards)
- Organisms (forms, navigation)
- Templates (layouts)
- Pages (complete views)

**Copied when**: React + component library structure detected

**Used by**: `implementer-typescript` (component library projects)

**Auto-loads**: When working in component directories

---

### nestjs-patterns

**Purpose**: NestJS backend architecture and patterns.

**Contains**:
- Controllers and routing
- Services and providers
- Guards and interceptors
- Decorators and metadata
- Testing with Jest

**Copied when**: `@nestjs/core` detected in `package.json`

**Used by**: `implementer-typescript` (backend operations)

**Auto-loads**: For NestJS module files

---

### Other Framework Skills

40+ frameworks supported, including:

**Frontend**:
- Vue.js - composition API, reactive patterns
- Angular - modules, services, dependency injection
- Svelte - reactive declarations, stores

**Backend**:
- Django - models, views, middleware
- FastAPI - async routes, dependency injection
- Express - middleware, routing patterns
- Spring Boot - annotations, beans, JPA

Each framework skill auto-loads when working with that framework's files.

---

## Testing Skills

Testing framework patterns and automation strategies.

### jest-coverage-automation

**Purpose**: Jest testing patterns and coverage automation.

**Contains**:
- Unit test patterns
- Integration test setup
- Mocking strategies (modules, functions, timers)
- Coverage configuration
- CI/CD integration

**Copied when**: `jest` detected in `package.json`

**Used by**:
- `tester-unit-typescript`
- `tester-e2e-typescript`

**Auto-loads**: During test generation and execution phases

---

### playwright-e2e-automation

**Purpose**: Playwright E2E testing patterns and automation.

**Contains**:
- Page object patterns
- Selector strategies
- Assertions and expectations
- Visual regression testing
- CI/CD setup

**Copied when**: `playwright` detected in `package.json`

**Used by**: `tester-e2e-typescript`

**Auto-loads**: During E2E test generation

---

### pytest-patterns

**Purpose**: Pytest testing patterns for Python projects.

**Contains**:
- Fixtures and parametrize
- Mocking with pytest-mock
- Coverage with pytest-cov
- Integration test patterns
- Async test patterns

**Copied when**: `pytest` detected in Python project

**Used by**: `tester-unit-python`

**Auto-loads**: During Python test generation

---

### Other Testing Skills

10+ test frameworks supported:

- **Vitest**: Modern Vite-native testing
- **Cypress**: E2E testing with time-travel
- **Go testing**: Table-driven tests, benchmarks
- **JUnit**: Java unit and integration testing
- **RSpec**: Ruby BDD testing

Each testing skill auto-loads when that test framework is detected.

---

## Infrastructure Skills

Infrastructure and deployment patterns.

### developing-with-docker

**Purpose**: Docker containerization and composition patterns.

**Contains**:
- Multi-stage builds
- Docker Compose patterns
- Networking and volumes
- Environment configuration
- Health checks

**Copied when**: `Dockerfile` or `docker-compose.yml` detected

**Used by**: All agents (when Docker is present)

**Auto-loads**: When working with Docker-related files

---

### mastering-aws-cdk

**Purpose**: AWS Cloud Development Kit infrastructure patterns.

**Contains**:
- Stack organization
- Construct patterns
- Deployment strategies
- Resource tagging
- Testing CDK code

**Copied when**: AWS CDK dependencies detected

**Used by**: 
- `planner` (for infrastructure changes)
- `implementer` (for CDK modifications)

**Auto-loads**: When working with CDK stack files

---

### Other Infrastructure Skills

- **AWS CLI**: AWS service automation
- **GCP**: Google Cloud Platform patterns
- **Firebase**: Firebase services and deployment
- **Kubernetes**: K8s manifests and Helm charts
- **Terraform**: Infrastructure as code

---

## Skill Selection Logic

The framework intelligently selects skills based on project detection.

### Detection Process

1. **Language Detection**:
   ```
   tsconfig.json exists → Copy mastering-typescript
   pyproject.toml exists → Copy mastering-python-skill
   go.mod exists → Copy mastering-go
   ```

2. **Framework Detection**:
   ```
   react in package.json → Copy react-frontend
   @nestjs/core in package.json → Copy nestjs-patterns
   django in requirements.txt → Copy django-patterns
   ```

3. **Test Framework Detection**:
   ```
   jest in package.json → Copy jest-coverage-automation
   playwright in package.json → Copy playwright-e2e-automation
   pytest in pyproject.toml → Copy pytest-patterns
   ```

4. **Infrastructure Detection**:
   ```
   Dockerfile exists → Copy developing-with-docker
   aws-cdk in package.json → Copy mastering-aws-cdk
   ```

### Monorepo Handling

For monorepos, the framework detects skills per workspace:

```
pnpm-workspace.yaml detected
→ For each workspace:
  → Detect languages → Copy language skills
  → Detect frameworks → Copy framework skills
  → Detect test frameworks → Copy testing skills
```

**Result**: Only skills relevant to YOUR stack are copied (typically 10-20 skills instead of 50+)

---

## Context Reduction

Intelligent skill linking reduces context by 70-85%:

| Agent | Without Framework | With Framework | Reduction |
|-------|-------------------|----------------|-----------|
| Planner | 22 skills | 7 skills | 68% |
| Implementer | 22 skills | 4 skills | 82% |
| Tester | 22 skills | 4 skills | 82% |
| Security | 22 skills | 3 skills | 86% |

**Benefit**: Agents receive only relevant information, improving accuracy and speed.

---

## Skill Auto-Loading

Skills auto-load based on context:

### Always Loaded
- `code-conventions`, `multi-file-workflows`, `testing-conventions` - Generated convention skills (universal project understanding)

### Triggered by Command
- `implement-ticket` - During `/implement-ticket` workflow
- `code-quality-check` - During `/code-quality-check` command

### Triggered by File Type
- `mastering-typescript` - When editing `.ts` or `.tsx` files
- `react-frontend` - When editing React components
- `jest-coverage-automation` - When generating or running tests

### Triggered by Phase
- `planner` - During Phase 3 (Planning)
- `implementer-{lang}` - During Phase 5 (Implementation)
- `tester-unit-{lang}` - During Phase 6 (Testing)

---

## Agent Skill Mapping

Different agent types receive different skill sets.

### Planner (Architecture-Aware)

Receives skills for all detected languages:

```yaml
skills:
  - code-conventions         # Convention skills (universal)
  - multi-file-workflows     # Convention skills (universal)
  - testing-conventions      # Convention skills (universal)
  - analyze-requirements     # Planning core
  - design-doc-mermaid       # Planning core
  - mastering-typescript     # All detected languages
  - mastering-python-skill   # All detected languages
  - developing-with-docker   # Infrastructure
```

**Why**: Needs full architecture awareness across all project languages.

---

### Implementer-TypeScript (Language-Specific)

Receives skills for TypeScript only:

```yaml
skills:
  - code-conventions         # Convention skills (universal)
  - multi-file-workflows     # Convention skills (universal)
  - testing-conventions      # Convention skills (universal)
  - mastering-typescript     # THIS language only
  - react-frontend           # Detected frontend framework
  - atomic-design-react      # React patterns
```

**Why**: Focused on TypeScript implementation, ignores Python/Go/etc.

---

### Tester-Unit-TypeScript (Testing-Specific)

Receives skills for TypeScript testing:

```yaml
skills:
  - code-conventions         # Convention skills (universal)
  - multi-file-workflows     # Convention skills (universal)
  - testing-conventions      # Convention skills (universal)
  - code-quality-check       # Quality core
  - mastering-typescript     # Language for tests
  - jest-coverage-automation # Detected test framework
```

**Why**: Focused on TypeScript testing with Jest.

---

## Custom Skills

You can add custom skills to your project:

1. Create skill file: `.claude/skills/custom-skill/SKILL.md` (or `.codex/skills/custom-skill/SKILL.md` on Codex)
2. Add skill to agent's skill list in `.claude/agents/` (or `.codex/agents/`)
3. Re-run `./qubika-agentic-framework/scripts/initialize-project.sh` to regenerate configuration

**Note**: Custom skills should focus on project-specific patterns not covered by framework skills.

---

## Best Practices (Catalog Skills)

1. **Trust the detection**: Let the framework select skills automatically
2. **Keep generated skills updated**: Re-run `./qubika-agentic-framework/scripts/initialize-project.sh` (or `/wiki-refresh`) after major changes
3. **Don't duplicate framework skills**: Use custom skills only for unique patterns
4. **Review generated skills**: Check `.claude/skills/` (or `.codex/skills/`) to see what was copied
5. **Leverage auto-loading**: Skills load automatically based on context

---

## Further Reading

- [Agents Reference](./agents.md) - Agents invoked during workflows and how they use skills
- [Project Structure](./project-structure.md) - Understanding the `.claude/` directory
- [Environment Variables](../configuration/environment-variables.md) - Configuration options
