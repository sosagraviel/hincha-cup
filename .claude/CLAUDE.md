# AI Agentic Framework

## Project Description

This framework is **shared infrastructure** that ships to every developer at a 15+ year software factory. It is currently installed on **6000+ developer machines** across **20+ active projects**, and is on track to reach **600+ projects** — every line of code here runs in thousands of local environments and shapes how the entire engineering organization works with AI agents.

**Non-negotiables when writing code in this repo:**

1. **Production-ready, always.** There is no "it works on my machine," no TODOs left for later, no commented-out code, no half-wired features behind a flag that nobody will flip. Every PR that merges is assumed to be deployed to 6000+ machines the moment it lands on `development`. Treat every change like it has that blast radius — because it does.

2. **Automate everything.** Manual steps do not scale to 600 projects. If a human has to remember to run something, copy a file, edit a config, or "just this once" do X, it will break in production within a week. If you find yourself writing docs that say "developers should run …", stop and automate it instead. Scripts, hooks, skills, and orchestration nodes are the delivery mechanism — not README instructions.

3. **Usage must be trivially simple.** Our users are busy engineers across dozens of stacks. The surface we expose to them (slash commands, skills, CLI scripts) must work with zero ceremony: sensible defaults, clear errors, idempotent reruns, no required flags for the happy path. Complexity belongs inside the framework; simplicity belongs at the edge the developer touches.

4. **Documentation stays current — automatically.** Both in-repo `README.md` files and the public GitHub Pages site must reflect the code that exists today. Out-of-date docs on 6000 machines is worse than no docs. When you change behavior, update the docs in the same PR, and prefer doc-generation pipelines over hand-maintained prose whenever the source of truth can be derived from code, schemas, or skill frontmatter.

**Target project diversity — the framework must be stack-agnostic.**

The framework does not get to assume anything about the shape of the repo it lands in. Real target projects include, among many others:

- Multi-repo microservice architectures (each service in its own repository)
- Monorepos with a single backend + single frontend
- Monorepos containing many microservices (same language, mixed languages)
- Single-repo single-service projects
- Monorepos with multiple backends in different languages sharing one tree
- Serverless repositories with functions in multiple runtimes (Node, Python, Go, Java, .NET, etc.)
- Legacy codebases with stacks that predate modern tooling (older PHP, .NET Framework, Java 8, Python 2-era layouts, Rails, etc.)
- Mixed modern + legacy in the same organization, sometimes in the same repo

Because of this, **never hardcode stack assumptions** (language, build tool, package manager, test runner, directory layout, service boundaries). The Phase 1 analyzers exist precisely to discover the shape of each project at runtime; downstream phases and generated agents/skills must consume that discovered profile (`framework-config.json`, `by_service` maps, stack profile) rather than assuming a structure. When adding a feature, ask: *"Does this work on a 2011 PHP monolith the same way it works on a 2026 Bun + TypeScript serverless project?"* If not, make it configurable, make it discovered, or gate it on detected capability — do not hardcode.

**Why this matters for agents working in this repo:**

When you (or any downstream agent) are asked to add a feature, fix a bug, or extend a skill here, every decision should be filtered through the four rules above plus the diversity constraint. If a proposed approach would require a human step, lock the framework to one stack, leave docs stale, or ship anything less than production quality, reject that approach and find one that does not. The cost of a shortcut is multiplied by 6000.

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

Two LangGraph workflows live in `orchestration/`:

- **`initialize-project`** — 6-phase pipeline: Phase 1 (4 parallel analyzers) → Phase 2 (consolidation) → Phase 3 (synthesis) → Phase 4 (context generation + wiki generation) → Phase 5 (resources + agent generation) → Phase 6 (validation).
- **`wiki-refresh`** — incremental refresh of `docs/llm-wiki/` triggered by `/implement-ticket` Phase 8.5 and on demand via `pnpm --filter orchestration refresh-wiki`.

The active **`implement-ticket`** entry point is the **skill** at
`skills/020-development-workflow/implement-ticket/SKILL.{claude,codex}.md`
— directly invokable via the Skill tool (frontmatter
`user-invokable: true` + `disable-model-invocation: true`). It runs as
instructions Claude Code (or Codex CLI) follows phase by phase; there is
no LangGraph orchestration involved. The previous orchestration
`implement-ticket` graph + 11 phase nodes + CLI were deleted in the
2026-04-30 flow-cleanup pass — they were marked WIP and never used.

Agents run as Claude CLI subprocesses (`cli-agent-impl.ts`) in CLI auth mode, or as in-process DeepAgents (`deep-agent-impl.ts`) in API key mode. Auth mode is auto-detected at runtime via `auth-detector.ts`.

All phase outputs are persisted to `.claude-temp/initialize-project/phase1-outputs/` before being returned to LangGraph state (disk-first idempotency pattern).

Per-attempt debug artifacts (prompts, outputs, stdout/stderr, native transcripts, rendered HTML) are always written under `.<provider>-temp/<workflow>/debug/runs/<runId>/`. See `services/framework/debug-store/` for the store and `services/framework/transcripts/` for transcript capture/rendering. `--debug` is a verbosity knob; capture is always on. `--keep-runs <n>` (default 10) controls retention.

## File Placement Guide

| File Type | Location Pattern | Notes |
|-----------|-----------------|-------|
| CLI entry points | `orchestration/src/cli/*.ts` | `initialize.ts`, `refresh-wiki.ts`, `lint-wiki.ts`, `aggregate-metrics.ts` — Commander.js |
| LangGraph workflow graphs | `orchestration/src/graphs/*.graph.ts` | Two graphs: `initialize-project.graph.ts`, `wiki-refresh.graph.ts` |
| LangGraph state schemas | `orchestration/src/state/schemas/*.schema.ts` | Zod + LangGraph `Annotation`; custom reducers for parallel Phase 1 |
| Phase 1 analyzer nodes | `orchestration/src/nodes/initialize-project/phase1/**/*.node.ts` | 4 nodes run in parallel |
| Phase 1 analyzer prompts | `orchestration/src/nodes/initialize-project/phase1/**/prompts/*.md` | `agent.md` + `execution-instructions.md` per analyzer |
| Phase 1 shared prompt builder | `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` | Assembles excluded-dirs + project-path + output-format + execution-instructions tags |
| Phase 2–6 nodes | `orchestration/src/nodes/initialize-project/phase[2-6]/**/*.ts` | Consolidation → synthesis → generation → resources → validation |
| Phase 1 output schemas | `orchestration/src/schemas/phase1-agent-outputs.schema.ts` | Schema registry with `getSchemaForAgent()` lookup |
| Stack profile schema | `orchestration/src/schemas/stack-profile.schema.ts` | Service-centric; output to `framework-config.json` by Phase 4 |
| Business logic services | `orchestration/src/services/**/*.service.ts` | Grouped under `framework/` and `graph-wiki/` |
| `implement-ticket` skill (active) | `skills/020-development-workflow/implement-ticket/SKILL.{claude,codex}.md` | The active 13-phase orchestrator. Invoked via the Skill tool — runs as instructions Claude/Codex follows; no LangGraph involvement. |
| Agent factory | `orchestration/src/utils/shared/agent-factory/` | `cli-agent-impl.ts` vs `deep-agent-impl.ts` selected by auth-detector |
| Debug store | `orchestration/src/services/framework/debug-store/` | Always-on per-attempt artifact capture: `.<provider>-temp/<workflow>/debug/runs/<runId>/<phaseId>/<agent>/attempt-<N>/<sessionId>/` |
| Transcript parsers + renderer | `orchestration/src/services/framework/transcripts/` | Claude JSONL + Codex rollout JSONL + DeepAgents synth → normalized events → self-contained HTML |
| Stop hooks | `orchestration/src/nodes/**/hooks/*.ts` | Inline JSON validation during Claude CLI sessions |
| Agent templates | `agents/templates/*.template.md` | Handlebars for planner, implementer-\*, visual-verifier |
| Skills library | `skills/**/*.md` | Copied to target projects; trigger-matched in Phase 5 |
| Unit tests | `orchestration/test/unit/**/*.test.ts` | Mirrors `src/` structure; no live Claude CLI needed |
| Integration tests | `orchestration/test/integration/**/*.integration.test.ts` | Require live Claude CLI |
| Test fixtures | `orchestration/test/fixtures/automation-projects/` | npm-project, makefile-project, mixed-project, minimal-project |

**Hard rule — test location.** All test files live under `orchestration/test/`. Do not create test trees anywhere else (no `<repo-root>/test/`, no `<repo-root>/tests/`, no per-package `test/` folders, no scratch `*.test.ts` files at any other path). The deprecated `<repo-root>/tests/` directory has been deleted; no PR may re-introduce it.

**Hard rule — no inline comments.** Comments inside function bodies are forbidden. Document via JSDoc on functions, classes, types, and exported constants only. Acceptable exceptions: ESLint/TypeScript pragmas (`// eslint-disable-next-line`, `// @ts-expect-error`), URL-only references, and `#!/usr/bin/env node` shebangs. If a piece of code seems to require an explanatory comment, refactor or rename — well-named identifiers should carry the explanation.

**Hard rule — no historical references in source.** Do not reference plans, phase numbers, dated audits, fix waves, or past incidents in source code, prompts, skills, or generated artifacts. History lives in commit messages and PR descriptions, never in the deployed code that ships to 6000+ machines.

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
| Run implement-ticket | Invoke `/implement-ticket` via the Skill tool (Claude Code or Codex CLI) — there is no shell entry point any more. |
| Sync framework resources | `./scripts/sync-framework-resources.sh` |

## Key Conventions

- **Disk-first idempotency**: every phase persists its output to `.claude-temp/` before returning LangGraph state. Nodes check for disk output to gate re-execution — never trust state alone.
- **Schema registry pattern**: `getSchemaForAgent(agentName)` dispatches to the correct Zod schema by `agent_name` literal value. Stop hooks use the same registry.
- **Retry with feedback**: `retryWithEnhancedFeedback()` wraps all agent invocations (max 5 attempts, exponential backoff). Each failed attempt is logged to `<outputPath>.attempt-N.json`.
- **Parallel Phase 1**: custom `merge` reducers (not last-write-wins) for `phase1_analysis` and `retry_tracking` maps so parallel node updates don't overwrite each other.
- **Agent file resolution**: `getFrameworkAgentPath(frameworkPath, agentFile)` resolves agent `.md` files from framework root `agents/` directory, not the node's local `prompts/agent.md`.
- **Settings per analyzer**: each Phase 1 analyzer has its own `settings.json` passed as `settingsPath` to `AgentFactory.createAgent()`.
- **`services` array deprecation**: Analyzers 02 and 03 now use `by_service` maps keyed by service ID. Analyzer 01 (`structure-architecture-analyzer`) is the single source of truth for service discovery.