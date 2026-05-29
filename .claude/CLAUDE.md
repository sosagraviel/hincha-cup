# Qubika Agentic Framework

## Tech Stack

- **LangGraph** — framework (orchestration)
- **Docusaurus** — framework (website)
- **pnpm workspaces** — workspace tool

## File Placement Guide

| What | Where |
| ---- | ----- |
| LangGraph node | `orchestration/src/nodes/{skill}/{phase}/{feature}/` |
| Node hook | `orchestration/src/nodes/{skill}/{phase}/{feature}/hooks/{name}.hook.ts` |
| Shared utility | `orchestration/src/utils/shared/{name}.ts` |
| Unit test | `orchestration/test/unit/{mirrors-src-path}/{name}.test.ts` |
| Skill definition | `.claude/skills/{slug}/SKILL.md` |
| Skill implementation | `skills/{category}/{feature}/` |
| Shell automation script | `scripts/{name}.sh` |
| Generated LLM wiki | `docs/llm-wiki/` (auto-generated — do not edit) |
| Docusaurus page | `website/docs/{section}/{name}.md` |

### Shared vs Local Rules

- All TypeScript source lives under `orchestration/src/`; website content lives under `website/docs/`
- No shared package exists — cross-cutting utilities live in `orchestration/src/utils/shared/`
- Skill definitions (`.claude/skills/`) are separate from skill implementations (`skills/`)

## Directory Structure

```
project/
├── orchestration/   LangGraph cli
└── website/   Docusaurus frontend
```

## Essential Commands

| Action | Command | Description |
| ------ | ------- | ----------- |
| Setup | `./scripts/initialize-project.sh` | Bootstrap script. |
| Start dev environment | `./scripts/code-review-graph-mcp.sh` | Dev-server launcher. |
| Run tests | `./scripts/lint-wiki.sh` | Test runner. |
| Build (_root) | `pnpm -r build` | — |
| Run linters (_root) | `pnpm -r lint` | — |
| Run type-checker (_root) | `pnpm -r typecheck` | — |

### Per-service commands (low-level)

> Prefer the wrapper above when present; these run a single service in isolation and may not start dependent services.

| Service | Start dev environment | Run tests |
| ------- | --- | --- |
| _root | `pnpm -F orchestration initialize` | `pnpm -r test` |

## Services & Ports

| Service | Type | Port | Role |
| ------- | ---- | ---- | ---- |
| orchestration | cli | — (CLI — no runtime) | LangGraph cli |
| website | frontend | 3000 | Docusaurus frontend |
| redis | cache+queue | — (SaaS or remote — accessed via REDIS_URL environment variable; no localhost port configured in docker-compose or inspection hints) | redis |
| sqlite | database | — (Embedded file-based database — SQLite has no network port; accessed via @langchain/langgraph-checkpoint-sqlite using DATABASE_URL file path) | sqlite |

<!-- LLM_WIKI_START -->
## LLM Wiki
- Router (entry point): `docs/llm-wiki/CLAUDE.md` — decision table, tier discipline, available graph tools. **Read this first.**
- Index (summary catalog): `docs/llm-wiki/wiki/index.md` — one line per page; pick the 1–3 pages whose summaries match your question.
- Graph-backed docs: generated from .code-review-graph/graph.db with wiki-generator synthesis.
- Before broad code changes: load the router → match the index → read only the matched pages. Stop wikilink traversal at depth 2. Fall back to graph MCP tools only if the wiki does not answer.
<!-- LLM_WIKI_END -->

<!-- GRAPH_DISCIPLINE_START -->
## Graph navigation discipline

Top-down, never breadth-first. Graph MCP tools have strict per-result token caps; unbounded calls overflow silently. The full discipline (lean defaults, drill-in budgets, forbidden tools, spill-protocol HARD-FAILURE semantics) lives in the wiki router at `docs/llm-wiki/CLAUDE.md` (or `AGENTS.md` on Codex). Read it before issuing graph queries; do NOT improvise tool parameters from prior knowledge.
<!-- GRAPH_DISCIPLINE_END -->
