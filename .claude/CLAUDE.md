# AI Agentic Framework

## Tech Stack

- Node.js >= 20 (Docker runtime: Node 22)
- TypeScript 5.9.3 (ESM modules — `"type": "module"` in package.json)
- LangGraph ^1.2.3 — stateful graph orchestration engine
- deepagents ^1.8.4 — sub-agent management (API key mode)
- @anthropic-ai/claude-code ^2.1.0 — Claude CLI subprocess (CLI auth mode)
- commander ^14.0.3 — CLI argument parsing
- vitest ^4.1.0 — test framework
- zod ^4.3.6 — schema validation
- handlebars ^4.7.8 — agent template rendering
- gray-matter ^4.0.3 — frontmatter parsing for skill/agent markdown files
- playwright ^1.58.2 — visual regression screenshot capture
- pixelmatch ^7.1.0 — pixel-level screenshot diffing
- eslint + @typescript-eslint — TypeScript-aware linting
- prettier + husky — code formatting and pre-commit hooks
- pnpm — package manager

## File Placement Guide

| File Type | Location Pattern | Example |
|-----------|-----------------|---------|
| CLI entry point | `orchestration/src/cli/*.ts` | `initialize.ts` |
| LangGraph graph definition | `orchestration/src/graphs/*.graph.ts` | `initialize-project.graph.ts` |
| Phase node (initialize-project) | `orchestration/src/nodes/initialize-project/phase{N}/**/*.node.ts` | `synthesis.node.ts` |
| Phase node (implement-ticket) | `orchestration/src/nodes/implement-ticket/phase*.node.ts` | `phase3-planning.node.ts` |
| Phase agent prompt | `orchestration/src/nodes/initialize-project/phase1/**/prompts/agent.md` | `agent.md` |
| Phase execution instructions | `orchestration/src/nodes/initialize-project/phase1/**/prompts/execution-instructions.md` | `execution-instructions.md` |
| Phase validator | `orchestration/src/nodes/initialize-project/phase{N}/validators/*.ts` | `validate-claude-md-content.ts` |
| Phase helper | `orchestration/src/nodes/initialize-project/phase{N}/helpers/*.ts` | `stack-profile-validator.ts` |
| Stop hook | `orchestration/src/nodes/initialize-project/phase{N}/hooks/*.hook.ts` | `validate-synthesis.hook.ts` |
| implement-ticket service | `orchestration/src/services/implement-ticket/*.service.ts` | `review-loop.service.ts` |
| Framework service | `orchestration/src/services/framework/*.service.ts` | `config-updater.service.ts` |
| Agent factory util | `orchestration/src/utils/shared/agent-factory/*.ts` | `agent-factory.ts` |
| State schema (Zod + LangGraph) | `orchestration/src/state/schemas/*.schema.ts` | `initialize-project.schema.ts` |
| Shared Zod schema | `orchestration/src/schemas/*.schema.ts` | `stack-profile.schema.ts` |
| Hook registry | `orchestration/src/hooks/*.ts` | `hook-registry.ts` |
| Unit test | `orchestration/test/unit/**/*.test.ts` | `synthesis.node.test.ts` |
| Integration test | `orchestration/test/integration/*.test.ts` | `initialize-project.integration.test.ts` |
| Skill definition | `skills/{NNN}-{category}/**/*.md` | `skills/010-dev-workflow/git/commit.md` |
| Agent template | `agents/templates/*.md` | `implementer.md` |
| Claude slash command | `commands/*.md` | `implement.md` |
| Docker config | `docker/claude-runtime/` | `Dockerfile`, `docker-compose.yml` |

## Directory Structure

```
orchestration/      # TypeScript CLI — only deployable package
  src/
    cli/            # initialize.ts, implement.ts — CLI entry points
    graphs/         # LangGraph StateGraph definitions
    nodes/
      initialize-project/  # phase1–phase6 nodes (6 phases)
      implement-ticket/    # phase0–phase10 nodes (11 phases)
    services/       # implement-ticket/ and framework/ support services
    state/schemas/  # Zod schemas + LangGraph Annotation definitions
    utils/shared/   # agent-factory, retry, enhanced-retry, prompt-loader
    hooks/          # hook-registry, base-hook
    schemas/        # stack-profile.schema.ts, ui-visual-testing.schema.ts
    auth/           # auth-detector.ts — API key vs CLI mode detection
  test/
    unit/           # ~44 test files, mirrors src/ structure
    integration/    # end-to-end workflow tests
skills/             # AI skill markdown definitions by category
agents/templates/   # Handlebars agent templates
commands/           # Claude slash command definitions
docker/             # Docker runtime for containerized execution
tests/              # Fixture projects for integration tests
```

## Essential Commands

| Task | Command |
|------|---------|
| Install deps | `cd orchestration && pnpm install` |
| Run all tests | `cd orchestration && pnpm test` |
| Run unit tests | `cd orchestration && pnpm test:unit` |
| Run integration tests | `cd orchestration && pnpm test:integration` |
| Build (compile) | `cd orchestration && pnpm build` |
| Type-check (no emit) | `cd orchestration && pnpm typecheck` |
| Lint code | `cd orchestration && pnpm lint` |
| Lint and auto-fix | `cd orchestration && pnpm lint:fix` |
| Check formatting | `cd orchestration && pnpm format` |
| Format code | `cd orchestration && pnpm format:fix` |
| Initialize a project | `cd orchestration && pnpm initialize -- --project-path <path>` |
| Implement a ticket | `cd orchestration && pnpm implement -- --ticket <id>` |
| Sync framework resources | `cd orchestration && pnpm sync-framework-resources` |
| Auth (API key mode) | `export ANTHROPIC_API_KEY="sk-..."` |
| Auth (CLI mode) | `orchestration/node_modules/.bin/claude /login` |

## CRITICAL: Framework Development

- ✅ ALWAYS modify in root: `skills/`, `agents/templates/`, `commands/`
- ❌ NEVER edit `.claude/` (auto-generated, will be overwritten)
- User must manually sync after changes (agent must NOT run sync command)

## Model Tiers

| Tier | Provider | Models |
|------|----------|--------|
| `fast` | Anthropic | claude-haiku-4-5-20251001 |
| `standard` (default) | Anthropic | claude-sonnet-4-6 |
| `advanced` | Anthropic | claude-opus-4-6 |
| `openai` | OpenAI | gpt-5.4-2026-03-05 / gpt-5.4-mini |
| `gemini` | Google | gemini-3.1-pro-preview / gemini-2.5-flash |

Set with: `MODEL_TIER=advanced pnpm initialize -- --project-path <path>`