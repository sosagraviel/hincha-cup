# AI Agentic Framework

## Tech Stack

- **TypeScript** ~5.9.3 — primary language
- **Node.js** 22 — runtime (Docker: `node:22-slim`)
- **pnpm** 10.2.1 — package manager (monorepo with single `orchestration/` workspace)
- **LangGraph** ^1.2.3 — workflow orchestration (StateGraph with parallel + sequential nodes)
- **@langchain/anthropic** ^1.3.24 — Claude model integration
- **@langchain/openai** ^1.3.0 — OpenAI model integration
- **@langchain/google-genai** ^2.1.26 — Gemini model integration
- **Zod** ^4.3.6 — runtime validation for all state transitions and agent output schemas
- **Handlebars** ^4.7.8 — agent/command template rendering in Phase 5
- **Commander** ^14.0.3 — CLI entry points
- **Vitest** ^4.1.0 — unit and integration testing
- **ESLint + Prettier + Husky** — linting, formatting, pre-commit hooks
- **Playwright** ^1.58.2 — visual regression testing in implement-ticket Phase 6
- **SQLite** via `@langchain/langgraph-checkpoint-sqlite` — workflow checkpointing (MemorySaver in dev)
- **gray-matter** ^4.0.3 — frontmatter parsing for agent `.md` files
- **DeepAgents** ^1.8.4 — in-process agent execution in API key mode

## Architecture

Two LangGraph workflows:

- **`initialize-project`** — 6-phase pipeline: Phase 1 (4 parallel analyzers) → Phase 2 (consolidation) → Phase 3 (synthesis) → Phase 4 (context generation) → Phase 5 (resources + agent generation) → Phase 6 (validation)
- **`implement-ticket`** — 11-phase sequential pipeline: preflight → context → planning → environment → implementation → testing → visual → docs → PR → review → cleanup

Agents run as Claude CLI subprocesses (`cli-agent-impl.ts`) in CLI auth mode, or as in-process DeepAgents (`deep-agent-impl.ts`) in API key mode. Auth mode is auto-detected at runtime via `auth-detector.ts`.

All phase outputs are persisted to `.claude-temp/initialize-project/phase1-outputs/` before being returned to LangGraph state (disk-first idempotency pattern).

**Note**: The orchestration `implement-ticket` workflow is work-in-progress and not currently in use. The `/implement-ticket` command is the active implementation (though it needs improvements). Unless explicitly specified otherwise, "implement-ticket" refers to the command.

## File Placement Guide

| File Type | Location Pattern | Notes |
|-----------|-----------------|-------|
| CLI entry points | `orchestration/src/cli/*.ts` | `initialize.ts`, `implement.ts` — Commander.js |
| LangGraph workflow graphs | `orchestration/src/graphs/*.graph.ts` | Defines node topology and edges |
| LangGraph state schemas | `orchestration/src/state/schemas/*.schema.ts` | Zod + LangGraph `Annotation`; custom reducers for parallel Phase 1 |
| Phase 1 analyzer nodes | `orchestration/src/nodes/initialize-project/phase1/**/*.node.ts` | 4 nodes run in parallel |
| Phase 1 analyzer prompts | `orchestration/src/nodes/initialize-project/phase1/**/prompts/*.md` | `agent.md` + `execution-instructions.md` per analyzer |
| Phase 1 shared prompt builder | `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` | Assembles excluded-dirs + project-path + output-format + execution-instructions tags |
| Phase 2–6 nodes | `orchestration/src/nodes/initialize-project/phase[2-6]/**/*.ts` | Consolidation → synthesis → generation → resources → validation |
| Implement-ticket nodes | `orchestration/src/nodes/implement-ticket/phase[0-10].node.ts` | Sequential 11-phase pipeline |
| Phase 1 output schemas | `orchestration/src/schemas/phase1-agent-outputs.schema.ts` | Schema registry with `getSchemaForAgent()` lookup |
| Stack profile schema | `orchestration/src/schemas/stack-profile.schema.ts` | Service-centric; output to `framework-config.json` by Phase 4 |
| Business logic services | `orchestration/src/services/**/*.service.ts` | Grouped under `implement-ticket/` and `framework/` |
| Agent factory | `orchestration/src/utils/shared/agent-factory/` | `cli-agent-impl.ts` vs `deep-agent-impl.ts` selected by auth-detector |
| Stop hooks | `orchestration/src/nodes/**/hooks/*.ts` | Inline JSON validation during Claude CLI sessions |
| Agent templates | `agents/templates/*.template.md` | Handlebars for planner, implementer-\*, visual-verifier |
| Skills library | `skills/**/*.md` | Copied to target projects; trigger-matched in Phase 5 |
| Unit tests | `orchestration/test/unit/**/*.test.ts` | Mirrors `src/` structure; no live Claude CLI needed |
| Integration tests | `orchestration/test/integration/**/*.integration.test.ts` | Require live Claude CLI |
| Test fixtures | `orchestration/test/fixtures/automation-projects/` | npm-project, makefile-project, mixed-project, minimal-project |

## CRITICAL: Framework Development

- ✅ ALWAYS modify in root: `skills/`, `agents/templates/`, `commands/`
- ❌ NEVER edit `.claude/` (auto-generated, will be overwritten)
- User must manually sync after changes (agent must NOT run sync command)

## Git Workflow

- ✅ ALWAYS branch from `development` and target `development` for PRs
- ❌ NEVER branch from or target `main` unless explicitly instructed

## Essential Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build | `pnpm --filter orchestration build` |
| Unit tests | `pnpm --filter orchestration test:unit` |
| Lint | `pnpm --filter orchestration lint` |
| Format check | `pnpm --filter orchestration format:check` |
| Typecheck | `pnpm --filter orchestration typecheck` |
| Run initialize-project | `./scripts/initialize-project.sh <project-path>` |
| Run implement-ticket | `./scripts/implement-ticket.sh <ticket-id>` |
| Sync framework resources | `./scripts/sync-framework-resources.sh` |

## Key Conventions

- **Disk-first idempotency**: every phase persists its output to `.claude-temp/` before returning LangGraph state. Nodes check for disk output to gate re-execution — never trust state alone.
- **Schema registry pattern**: `getSchemaForAgent(agentName)` dispatches to the correct Zod schema by `agent_name` literal value. Stop hooks use the same registry.
- **Retry with feedback**: `retryWithEnhancedFeedback()` wraps all agent invocations (max 5 attempts, exponential backoff). Each failed attempt is logged to `<outputPath>.attempt-N.json`.
- **Parallel Phase 1**: custom `merge` reducers (not last-write-wins) for `phase1_analysis` and `retry_tracking` maps so parallel node updates don't overwrite each other.
- **Agent file resolution**: `getFrameworkAgentPath(frameworkPath, agentFile)` resolves agent `.md` files from framework root `agents/` directory, not the node's local `prompts/agent.md`.
- **Settings per analyzer**: each Phase 1 analyzer has its own `settings.json` passed as `settingsPath` to `AgentFactory.createAgent()`.
- **`services` array deprecation**: Analyzers 02 and 03 now use `by_service` maps keyed by service ID. Analyzer 01 (`structure-architecture-analyzer`) is the single source of truth for service discovery.