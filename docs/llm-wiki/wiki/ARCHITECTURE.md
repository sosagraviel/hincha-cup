---
document_type: architecture
summary: >-
  This project is a **monorepo** managed with **pnpm workspaces**. The two
  primary workspace packages are `orchestration` (the TypeScript CLI that drives
  multi...
last_updated: '2026-05-28T03:29:30.820Z'
tags:
  - architecture
  - topology
  - typescript
  - langgraph
  - docusaurus
---
# Architecture

## Monorepo / Repository Shape

This project is a **monorepo** managed with **pnpm workspaces**. The two primary workspace packages are `orchestration` (the TypeScript CLI that drives multi-phase AI agent workflows) and `website` (a Docusaurus documentation site). A top-level `skills/` directory holds versioned prompt templates organised by category (foundation, development-workflow, QA, integrations, language-frameworks, documentation, infrastructure, cloud-platforms). The `docs/` directory contains internal architecture guides and reference material. The `docker/` directory provides a runtime container environment for the Claude agent. The `scripts/` directory holds shell automation scripts that wrap pnpm commands for common developer operations.

The orchestration package follows a deterministic-first, phase-based architecture: Phase 0 walks the project tree without invoking any LLM, producing provenance-tagged analyzer outputs that later phases consume. LLM agents act as synthesizers over pre-computed views rather than free-form investigators, a pattern enforced by stop-hook validators on every analyzer output.

| Workspace / Directory | Role |
| --------------------- | ---- |
| `orchestration/` | TypeScript CLI — LangGraph multi-phase agent workflows |
| `website/` | Docusaurus frontend — documentation site |
| `skills/` | Versioned prompt templates (not a compiled package) |
| `docs/` | Internal architecture, guides, reference docs |
| `docker/` | Agent runtime container infrastructure |
| `scripts/` | Shell automation wrappers |

---

## Service Inventory

The structure analyzer recognized the following real services. Infrastructure dependencies (Redis, SQLite) are listed separately because they are not first-class workspace packages.

| ID | Type | Language | Port | Role |
| -- | ---- | -------- | ---- | ---- |
| [[orchestration]] | CLI | TypeScript 5.9.3 | — (no runtime) | LangGraph multi-phase agent orchestration |
| [[website]] | Frontend | TypeScript 6.0.2 | 3000 | Docusaurus documentation site |
| redis | Cache + queue | — | — (SaaS/remote via `REDIS_URL`) | Backing store for LangGraph state |
| sqlite | Database | — | — (embedded file) | Checkpoint persistence via `DATABASE_URL` |

The root workspace manifest (`package.json`) and the `mastering-confluence-scripts` Python library were identified by the analyzer but marked as non-real services and are excluded from the table above.

---

## Service Communication

There is no HTTP or RPC boundary between the two TypeScript workspace packages. The orchestration CLI and the website are independently executed — the CLI runs as a command-line process while the website is a static build served by a web server.

| Source | Target | Protocol | Notes |
| ------ | ------ | -------- | ----- |
| orchestration | sqlite | Embedded library (`@langchain/langgraph-checkpoint-sqlite`) | LangGraph writes and reads checkpoints via `DATABASE_URL` file path |
| orchestration | redis | TCP / Redis protocol via `REDIS_URL` | Used as a backing store for LangGraph graph state; accessed as SaaS or remote instance |
| orchestration | LLM provider (Claude / Codex) | HTTPS | Invoked via `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; provider auto-detected at init time |

No direct orchestration-to-website communication path was found. The website consumes content from `docs/` and `docs/llm-wiki/` as static files at build time only.

---

## External Integrations

| Vendor / API | In-repo client path | Auth mechanism | Environments |
| ------------ | ------------------- | -------------- | ------------ |
| Anthropic Claude API | `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts` | `ANTHROPIC_API_KEY` environment variable | All |
| OpenAI / Codex API | `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts` | `OPENAI_API_KEY` environment variable | All |
| Redis (SaaS/remote) | LangGraph adapter (indirect) | `REDIS_URL` connection string | All |
| GitHub Actions CI | `.github/workflows/ci.yml`, `.github/workflows/deploy-docs.yml` | GitHub repository secrets | CI only |

No Stripe, Auth0, Sentry, or other third-party SaaS integrations were detected by the analyzer.

---

## Authentication & Authorisation

The Qubika Agentic Framework is a developer CLI tool, not a multi-user web service. There is no user authentication layer, session lifecycle, or role-permission registry in the conventional sense.

Provider selection at initialization time functions as the sole "auth" boundary: the bootstrap script detects whether `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set and writes the corresponding provider configuration to `.claude/` or `.codex/`. Every subsequent LLM call uses the ambient environment variable; no token minting, refresh, or session management occurs within the framework itself.

The website is a public static documentation site with no authentication requirements.

---

## Request Lifecycle

### CLI invocation: `initialize-project`

This is the primary execution path in the orchestration service.

1. Developer runs `./scripts/initialize-project.sh` (or `pnpm -F orchestration initialize`). The shell script resolves arguments and delegates to the TypeScript CLI entry point at `orchestration/src/cli/initialize.ts`.
2. **Phase 0 — deterministic project walk.** `inspectProject` (`orchestration/src/services/framework/project-inspection/inspector.service.ts`) traverses the file tree, identifies workspaces and manifest files, and produces a structured `stack_profile` with no LLM involvement.
3. **Phase 1 — structure analysis.** Stop-hook validators (including `validateNeedsVerificationProse`) assert that the analyzer output is complete before advancing. If the service inventory is incomplete, the workflow halts and reports the gap.
4. **Phase 2 — question consolidation.** `consolidationNode` (`phase2/question-consolidator/question-consolidator.node.ts`) merges open questions from multiple analyzers into a deduplicated set for the user.
5. **Phase 3 — synthesis.** `trimSynthesisInput` (`phase3/helpers/trim-synthesis-input.ts`) prepares a token-budget-aware slice of analyzer output for the LLM synthesizer.
6. **Phase 4 — context generation.** `contextGenerationNode` (`phase4/context-generation.node.ts`) and `normaliseWorkspaceTool` (`phase4/helpers/workspace-tool-normalizer.ts`) produce the final CLAUDE.md / CODEX.md and the LLM wiki pages under `docs/llm-wiki/`.
7. **Phase 6 — validation.** `validationNode` (`phase6/validation.node.ts`) performs a final schema contract check on all outputs before the workflow terminates.

Throughout every phase, LangGraph writes the current `AgentState` as a checkpoint to SQLite so the workflow can be resumed on failure.

### CLI invocation: `implement-ticket`

A 13-phase workflow triggered by `/implement-ticket <TICKET-ID>` (Claude Code) or `$implement-ticket <TICKET-ID>` (Codex CLI). Phase 8.5 of this workflow auto-refreshes `docs/llm-wiki/` before PR creation. The detailed per-phase breakdown is (not determined by analysis) beyond what the structure analyzer captured.

---

## Data Architecture

LangGraph `AgentState` is the central in-flight data structure. Each graph node receives the full state object and returns a partial update; LangGraph merges updates before advancing to the next node. This means there is no explicit message-passing protocol between phases — state transitions are mediated entirely by the LangGraph runtime.

**SQLite** (accessed via `@langchain/langgraph-checkpoint-sqlite` using a `DATABASE_URL` file path) is the only persistent data store. It holds LangGraph checkpoints — serialized snapshots of `AgentState` at each phase boundary. There is no hand-rolled relational schema; the checkpoint adapter owns all table definitions. Local development uses a local SQLite file on disk; no migration tooling beyond what the adapter provides was detected.

**Redis** (accessed via `REDIS_URL`) serves as a backing store for LangGraph graph state in environments where it is configured. No queue-based messaging between services was identified.

The website has no persistent data store. The `docs/llm-wiki/` directory functions as a generated static artifact written by the orchestration CLI and consumed by the Docusaurus build.

---

## Deployment Topology

| Target | Service hosted | Deploy trigger |
| ------ | -------------- | -------------- |
| GitHub Actions CI | orchestration (lint, typecheck, test) | Push / PR to repository (`.github/workflows/ci.yml`) |
| GitHub Actions (docs deploy) | website | Push to default branch (`.github/workflows/deploy-docs.yml`) |

The orchestration CLI is not deployed as a long-running service. It runs on developer machines and in CI as an ephemeral process. Specific cloud deployment targets (Cloud Run, Lambda, Kubernetes, etc.) were not determined by analysis — the workflow files exist but their command contents were not captured.

---

## Local Development

A developer starting from scratch runs the bootstrap script once:

```
./scripts/initialize-project.sh
```

This writes `.claude/` (for Claude Code) or `.codex/` (for Codex CLI) configuration and generates the initial `docs/llm-wiki/`. The script accepts `--provider claude|codex` (auto-detected from API keys when omitted) and `--ignore <path>` to exclude fixture directories from analysis.

To start the code-review-graph MCP server used by the framework's graph-aware review features:

```
./scripts/code-review-graph-mcp.sh
```

The website runs on **port 3000** (standard Docusaurus dev server). No docker-compose file was detected for local orchestration of multiple services simultaneously. Redis is accessed as a SaaS or remote instance via `REDIS_URL`; no local Redis container configuration was found. SQLite is file-based and requires no local server.

---

## Automation & CI

The primary automation interface is a set of **shell scripts** in `scripts/`. There is no Makefile, Justfile, or Taskfile; pnpm workspace scripts (`pnpm -r build`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`) cover per-package operations.

| Script | Purpose |
| ------ | ------- |
| `scripts/initialize-project.sh` | One-time bootstrap (writes `.claude/`/`.codex/`, generates wiki) |
| `scripts/setup-code-graph.sh` | Full local environment bootstrap for code-graph tooling |
| `scripts/code-review-graph-mcp.sh` | Starts the code-review-graph MCP dev server |
| `scripts/lint-wiki.sh` | Validates generated wiki pages (runs as test suite) |
| `scripts/verify-mcp-payload.sh` | Validates MCP payload schema |
| `scripts/sync-framework-resources.sh` | Syncs framework resources (purpose not fully determined by analysis) |
| `scripts/ensure-context.sh` | Ensures context files are present (purpose not fully determined by analysis) |
| `scripts/security-check.sh` | Security scan (purpose not fully determined by analysis) |

**CI provider: GitHub Actions.** Two workflows are present:

- `.github/workflows/ci.yml` — runs on push/PR; exact steps not determined by analysis.
- `.github/workflows/deploy-docs.yml` — deploys the Docusaurus website; exact trigger not determined by analysis.

---

## Coupling Hotspots

The following nodes were identified as architectural hotspots by the code-graph coupling analysis. Hub nodes have the highest total degree (changes carry the largest blast radius); bridge nodes sit on the shortest paths between many node pairs (failures here disconnect multiple regions).

### Hub nodes

- `orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts::contextGenerationNode` (Function, score 207)
- `orchestration/src/nodes/initialize-project/phase4/helpers/workspace-tool-normalizer.ts::normaliseWorkspaceTool` (Function, score 162)
- `orchestration/src/nodes/initialize-project/phase6/validation.node.ts::validationNode` (Function, score 159)
- `orchestration/src/nodes/initialize-project/phase2/question-consolidator/question-consolidator.node.ts::consolidationNode` (Function, score 145)
- `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts::invokeCLI` (Function, score 117)

### Bridge nodes

- `orchestration/src/services/framework/project-inspection/inspector.service.ts::inspectProject` (Function, score 0.003093)
- `orchestration/src/nodes/initialize-project/phase3/helpers/trim-synthesis-input.ts::trimSynthesisInput` (Function, score 0.002554)
- `orchestration/src/nodes/initialize-project/phase1/shared/needs-verification-quality.ts::validateNeedsVerificationProse` (Function, score 0.00235)

`contextGenerationNode` is the single highest-risk node in the codebase: it sits at the junction of every analyzer output and is responsible for writing the final CLAUDE.md and wiki artifacts. `invokeCLI` is the shared LLM call site used across all phases, making it a transitive dependency of nearly every node that touches an AI provider.
