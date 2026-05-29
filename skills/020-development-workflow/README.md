# Development Workflow Skills

Skills for managing development workflows, planning, version control, and code implementation.

## Skills in this group

- **create-sdd-ticket**: Generate specification-driven development (SDD) tickets with intelligent gap detection
- **implement-ticket**: End-to-end ticket implementation with stack-agnostic testing, visual verification, and automated documentation updates
- **mastering-git-cli**: Expertise for all git operations — branches, commits, merges, rebases, worktrees, conflict resolution
- **skill-creator**: Create new skills, modify existing ones, and measure skill performance via evals
- **wiki-refresh**: Incrementally refresh `docs/llm-wiki/` after code changes; runs as Phase 8.5 of `/implement-ticket`

> Planning and implementation are not separate skills any more. The `planner`
> agent (created by `/initialize-project` Phase 5 from
> `agents/templates/planner.template.md`) produces the implementation plan
> inline as Phase 3 of `/implement-ticket`; the generated `implementer-{lang}`
> agents execute it as Phase 5. The legacy `analyze-requirements`,
> `architect-agent`, and `code-implementation` skills were removed in the
> 2026-04-30 flow-cleanup pass.
