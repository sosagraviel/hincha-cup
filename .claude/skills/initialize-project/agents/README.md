# Initialize Project Agents

This folder contains the specialized agents used by the `initialize-project` skill to perform parallel codebase analysis and architecture synthesis.

## Architecture Pattern

These agents follow a **Hierarchical Decomposition** pattern:
- 4 parallel **Worker Agents** (haiku) perform specialized analysis
- 1 **Architect Agent** (opus) synthesizes their findings into configuration files

## Agent Inventory

### Phase 1: Parallel Discovery (Worker Agents)

| # | Agent | Model | Purpose |
|---|-------|-------|---------|
| 01 | Structure & Architecture | haiku | Analyzes repo type, frameworks, architecture patterns, path aliases, database layer |
| 02 | Data Flows & Auth | haiku | Traces request lifecycle, auth pipeline, RBAC, real-time events, error handling |
| 03 | DevOps & Workflow | haiku | Documents commands, Docker setup, testing, linting, environment validation |
| 04 | Conventions & Patterns | haiku | Identifies naming conventions, non-obvious patterns, multi-file templates |

### Phase 2: Architecture Synthesis

| # | Agent | Model | Purpose |
|---|-------|-------|---------|
| 05 | Architect Synthesizer | opus | Consolidates all analysis into CLAUDE.md and project-context skill |

## Design Principles

1. **Parallelization**: Agents 01-04 run concurrently for speed
2. **Specialization**: Each agent has a focused domain to prevent overlap
3. **Evidence-based**: All agents report only what they find, never assume
4. **Flow-focused**: Prioritize documenting multi-file flows over static inventories

## Usage

These agents are invoked by the `initialize-project` skill. See `.claude/skills/01-foundation/initialize-project/SKILL.md` for the orchestration logic.
