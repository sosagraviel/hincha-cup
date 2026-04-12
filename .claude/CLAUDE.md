# AI Agentic Framework

## Tech Stack

- **TypeScript** 5.9.3 (ESM modules, `"type": "module"`)
- **Node.js** 22 (Docker base image; no `.nvmrc` — use 20+ locally)
- **LangGraph** `@langchain/langgraph` ^1.2.3 — workflow orchestration
- **DeepAgents** ^1.8.4 — agent invocation (API key mode)
- **Commander** ^14.0.3 — CLI interface
- **Zod** ^4.3.6 — runtime validation
- **Handlebars** ^4.7.8 — template rendering
- **Vitest** ^4.1.0 — testing
- **Playwright** ^1.58.2 — E2E and visual testing
- **pnpm** workspaces

## Architecture Pattern

Two LangGraph `StateGraph` workflows, each organized into phases:

| Workflow | Entry | Phases | Pattern |
|---|---|---|---|
| `initialize-project` | `orchestration/src/cli/initialize.ts` | 6 (Phase 1 runs 4 analyzers in parallel) | Parallel → Sequential |
| `implement-ticket` | `orchestration/src/cli/implement.ts` | 11 sequential (Phase 0–10) | Sequential |

Agents communicate exclusively via **disk-first artifact files** under `.claude-temp/tickets/<TICKET_ID>/artifacts/`. No shared memory between agent invocations.

## File Placement Guide

| File Type | Location | Example |
|---|---|---|
| CLI entrypoints | `orchestration/src/cli/` | `implement.ts`, `initialize.ts` |
| LangGraph graphs | `orchestration/src/graphs/` | `implement-ticket.graph.ts` |
| Phase nodes (implement-ticket) | `orchestration/src/nodes/implement-ticket/` | `phase4-implementation.node.ts` |
| Phase nodes (initialize-project) | `orchestration/src/nodes/initialize-project/phase{N}/` | `phase1/structure-analyzer/` |
| Services (business logic) | `orchestration/src/services/` | `gap-questions.service.ts` |
| State schemas | `orchestration/src/state/schemas/` | `implement-ticket.schema.ts` |
| Zod validation schemas | `orchestration/src/schemas/` | `framework-config.schema.ts` |
| LLM factory | `orchestration/src/llm/llm-factory.ts` | — |
| Auth detection | `orchestration/src/auth/auth-detector.ts` | — |
| Hooks | `orchestration/src/hooks/` | `hook-registry.ts` |
| Utilities | `orchestration/src/utils/` | `logger.ts`, `retry.ts` |
| Unit tests | `orchestration/test/unit/` (mirrors `src/`) | `*.test.ts` |
| Integration tests | `orchestration/test/integration/` | `*.integration.test.ts` |
| Shell workflow scripts | `scripts/` | `implement-ticket.sh` |
| Skills library | `skills/<NNN>-<category>/<skill-name>/SKILL.md` | `skills/020-development-workflow/architect-agent/SKILL.md` |
| Skills config | `skills/skills.config.json` | — |
| Artifacts (runtime, gitignored) | `.claude-temp/tickets/<TICKET_ID>/artifacts/` | — |

## Essential Commands

| Task | Command |
|---|---|
| Build | `cd orchestration && pnpm build` |
| Type check | `cd orchestration && pnpm typecheck` |
| Lint | `cd orchestration && pnpm lint` |
| Format check | `cd orchestration && pnpm format` |
| Test (all) | `cd orchestration && pnpm test` |
| Test (unit only) | `cd orchestration && pnpm test:unit` |
| Run initialize-project | `cd orchestration && pnpm initialize -- -p <path> -f <framework-path>` |
| Run implement-ticket | `cd orchestration && pnpm implement -- -p <path> -f <framework-path> --ticket-id PROJ-123 --from-jira` |
| Sync framework resources | `cd orchestration && pnpm sync-framework-resources` |

## Import Conventions

```typescript
// LangGraph
import { StateGraph, END, START } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';

// Internal — always use .js extension for ESM
import { getLLMFactory } from '../llm/llm-factory.js';
import { ImplementTicketAnnotation } from '../state/schemas/implement-ticket.schema.js';
import { Logger } from '../utils/logger.js';
```

## Key Patterns

- **ESM only** — all imports require `.js` extension even for `.ts` source files
- **Disk-first idempotency** — each phase writes a `phase{N}/*-complete.json` marker; `--resume` detects last complete phase
- **Model tiers** — `sonnet` (default), `opus`, `haiku`; configured via `MODEL_TIER` env var
- **Auth detection order** — (1) `ANTHROPIC_API_KEY` env → LangChain ChatAnthropic; (2) Claude CLI `~/.claude` credentials → subprocess mode; (3) fail
- **Agent outputs** — LLM agents write raw JSON inside markdown fences; `validateAndParseAgentOutput()` extracts and validates
- **Skill invocation** — skills are invoked via the Claude Code `Skill(name, args: "...")` tool, NOT as slash commands
- **Artifact path** — always `.claude-temp/tickets/$TICKET_ID/artifacts/` (gitignored); never `.claude/artifacts/`

## Skills System

Skills live in `skills/<NNN>-<category>/<skill-name>/SKILL.md`. The `skills/skills.config.json` registry controls which skills are synced to target projects and their trigger conditions (`always` | `triggered` | `generated`). The Phase 5 `resources.node.ts` uses this config to generate `.claude/` configuration for target projects.