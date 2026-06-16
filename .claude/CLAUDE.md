# qubika-agentic-framework

## Tech Stack

- **Node.js** 22, **pnpm** 10.2.1, **TypeScript** ~5.9.3 — monorepo baseline
- **orchestration** (TypeScript) — LangGraph 1.2.3, @langchain/anthropic ^1.3.24, @langchain/core ^1.1.33, @anthropic-ai/claude-code ^2.1.116, @langchain/google-genai ^2.1.26
- **website** (TypeScript) — Docusaurus 3.10.0, @mdx-js/react ^3.0.0

## File Placement Guide

| File Type | Location Pattern | Example |
| --------- | ---------------- | ------- |
| LangGraph phase node | `orchestration/src/nodes/initialize-project/{phase}/{feature}.node.ts` | `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.ts` |
| Phase helper utility | `orchestration/src/nodes/initialize-project/{phase}/helpers/{helper}.ts` | `orchestration/src/nodes/initialize-project/phase4/helpers/workspace-tool-normalizer.ts` |
| Business logic service | `orchestration/src/services/{domain}/{feature}.service.ts` | `orchestration/src/services/framework/project-inspection/inspector.service.ts` |
| CLI entry point | `orchestration/src/cli/{command}.ts` | `orchestration/src/cli/initialize.ts` |
| Unit test | `orchestration/test/unit/{module}/{feature}.test.ts` | `orchestration/test/unit/services/framework/preflight-scripts.service.test.ts` |
| Hook validator | `orchestration/src/nodes/initialize-project/{phase}/hooks/{validator}.ts` | `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/hooks/validate-automation-discovery.ts` |
| LangGraph node prompt | `orchestration/src/nodes/initialize-project/{phase}/{feature}/prompts/{type}.md` | `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md` |
| Auth service | `orchestration/src/auth/{auth-service}.ts` | `orchestration/src/auth/auth-detector.ts` |

### Shared vs Local Rules

- All `orchestration/src/` code deploys to developer machines on merge — no half-wired code, no TODOs, no commented-out blocks.
- Test fixtures under `orchestration/test/integration/initialize-project/projects/` are isolated sample projects; never import from `orchestration/src/`.
- `website/` builds and deploys independently of `orchestration/`.

## Directory Structure

```
project/
├── orchestration/   LangGraph cli
│   └── test/integration/initialize-project/projects/
│       ├── mini-microservices/   gRPC microservices fixture
│       ├── mini-monorepo/   NestJS monorepo fixture
│       └── mini-serverless/   Firebase/Cloud Functions serverless fixture
└── website/   Docusaurus frontend
```

## Essential Commands

| Command | Description |
| ------- | ----------- |
| `./scripts/initialize-project.sh` | Setup script (full local-environment bootstrap). |
| `./scripts/code-review-graph-mcp.sh` | Dev-server launcher. |
| `./scripts/lint-wiki.sh` | Test runner. |
| `pnpm --filter orchestration build` | Build (_root) |
| `pnpm --filter orchestration lint` | Run linters (_root) |
| `pnpm --filter orchestration typecheck` | Run type-checker (_root) |
| `pnpm --filter orchestration test:unit` | Run unit tests (_root) |
| `pnpm --filter orchestration test:integration` | Run integration tests (_root) |

## Services & Ports

| Service | Type | Port | Role |
| ------- | ---- | ---- | ---- |
| orchestration | cli | — (CLI — no runtime) | LangGraph cli |
| website | frontend | — (Static documentation site built with Docusaurus and deployed as GitHub Pages; no persistent runtime port) | Docusaurus frontend |

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
