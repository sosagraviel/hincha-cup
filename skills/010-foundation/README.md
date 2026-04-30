# 010 - Foundation Skills

**Priority**: ⭐⭐⭐⭐⭐ HIGHEST
**Usage**: Project bootstrap and isolated task setup

## Purpose

Foundation skills establish the baseline workspace for new work — either by bootstrapping a project's Claude Code configuration or by isolating ongoing work into its own environment.

## Skills in This Group

### start-task
**Purpose**: Enable parallel development by creating isolated git worktrees per task

**What it does**:
- Creates an isolated git worktree per ticket so multiple tasks can run in parallel
- Auto-detects free ports and copies the `.claude/` configuration into the worktree
- Sets up environment isolation so concurrent tickets don't clash

**When to use**:
- Starting a new ticket while other work is already in progress
- Running multiple `/implement-ticket` workflows in parallel
- Keeping long-running experiments separate from your main branch

---

## Related Artifacts (Not Static Skills)

The following foundation-level capabilities are implemented as orchestration pipelines / generated output rather than static skill folders:

- **`initialize-project`**: Implemented as the TypeScript orchestration CLI (see `orchestration/src/graphs/initialize-project.graph.ts`). Run via `./scripts/initialize-project.sh <project-path>`. Produces `.claude/CLAUDE.md` plus three prescriptive convention skills plus a graph-grounded LLM wiki tailored to the target codebase.
- **`code-conventions`** / **`multi-file-workflows`** / **`testing-conventions`**: Generated per project by `initialize-project`'s Phase 3 synthesis. Live in each target project's `.claude/skills/<name>/SKILL.md` (or `.codex/skills/<name>/SKILL.md` on Codex) — not reusable skill folders in this repo. Together they replace the legacy monolithic `project-context` skill, splitting it along a strict descriptive/prescriptive line:
  - **`code-conventions`** — gotchas with WRONG/CORRECT examples, naming rules, error handling, data-layer patterns
  - **`multi-file-workflows`** — ordered checklists for cross-cutting changes (add endpoint, add entity, etc.)
  - **`testing-conventions`** — what to mock and what not, fixture conventions, coverage expectations, example test code
- **Architectural narrative**: The descriptive prose section emitted by Phase 3 synthesis. Persisted to `.<provider>-temp/initialize-project/architectural-narrative.md` and consumed by the Phase 4b wiki-generator to produce `docs/llm-wiki/wiki/ARCHITECTURE.md` and per-service docs. Not a skill — descriptive content lives in the wiki, not in a skill body.

## Workflow

### Starting a New Task in Parallel
```
1. Run start-task
   → Creates isolated worktree + copies .claude config
   → Auto-detects ports for isolated services

2. Switch to the worktree
   → Begin work without impacting other active tickets
```

## Related Groups

- **020 - Development Workflow**: Run `implement-ticket`, `analyze-requirements`, and other daily workflow skills inside the worktree created by `start-task`.
