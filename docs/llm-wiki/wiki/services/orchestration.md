---
document_type: service
summary: >-
  `orchestration` is the TypeScript CLI at the heart of the Qubika Agentic
  Framework. It implements the framework's core developer workflows —
  `initialize-proj...
last_updated: '2026-05-28T03:29:30.820Z'
tags:
  - service
  - typescript
  - cli
  - langgraph
service_id: orchestration
---
# Orchestration

## Purpose

`orchestration` is the TypeScript CLI at the heart of the Qubika Agentic Framework. It implements the framework's core developer workflows — `initialize-project`, `create-sdd-ticket`, and `implement-ticket` — as resumable, stateful directed graphs using LangGraph 1.2.3. Its primary responsibilities are: analyzing a target repository's structure deterministically, invoking LLM sub-agents to synthesize framework artifacts (`.claude/CLAUDE.md`, skill definitions, the `docs/llm-wiki/` knowledge base), and persisting graph state across interrupted invocations via an embedded SQLite checkpoint store. It has no HTTP server and no persistent runtime process — it runs as a CLI command and exits.

---

## Public API / Surface

The service exposes two CLI entry points:

| Entry point | File | Purpose |
|---|---|---|
| `initialize` | `orchestration/src/cli/initialize.ts` | Bootstrap a target project; runs the multi-phase `initialize-project` graph |
| `aggregate-metrics` | `orchestration/src/cli/aggregate-metrics.ts` | Aggregate token usage metrics from prior skill runs |

Skills are invoked by name from within an agent session:

| Skill | Claude Code | Codex CLI |
|---|---|---|
| Bootstrap project | `/initialize-project` | `$initialize-project` |
| Create SDD ticket | `/create-sdd-ticket` | `$create-sdd-ticket` |
| Implement ticket | `/implement-ticket` | `$implement-ticket` |

The `initialize-project.sh` script accepts `--provider claude|codex` (auto-detected from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` when omitted) and `--ignore <path>` (additive to `.gitignore`; repeatable or comma-separated).

---

## Internal Architecture

Source lives entirely under `orchestration/src/`, organized into four layers:

- **`cli/`** — Commander-based entry points; parse flags and delegate to the graph builder.
- **`nodes/{skill}/{phase}/{feature}/`** — LangGraph node functions, one directory per feature. Hooks (subprocess validators) live in `hooks/` subdirectories within each feature.
- **`services/`** — Stateful service classes for cross-cutting concerns: `GapQuestionsService`, `inspectProject` (project inspection bridge), transcript capture, token-usage emission, debug-store.
- **`utils/shared/`** — Cross-cutting utilities: `agent-factory/` (wraps Claude CLI, Codex CLI, and DeepAgent subprocess invocations), `attempt-recorder`, `prompt-loader`, and Zod-based schema helpers.

The highest-degree architectural hubs are `contextGenerationNode` (phase 4), `normaliseWorkspaceTool` (phase 4 helper), `validationNode` (phase 6), `consolidationNode` (phase 2), and `invokeCLI` (agent factory). Changes to any of these have broad blast radius across the graph.

---

## Request Lifecycle

A typical `initialize-project` invocation flows through these steps:

1. **CLI entry** (`orchestration/src/cli/initialize.ts:main`) — Commander parses flags and delegates to the orchestration graph.
2. **Auth detection** (`orchestration/src/auth/auth-detector.ts:detectAuthMode`) — Six-level priority chain probes `PROVIDER` env var, cloud gateway vars, API keys, then stored CLI subscription credentials.
3. **Graph build & agent validation** (`orchestration/src/utils/shared/agent-factory/agent-factory.ts:AgentFactory.createAgent`) — Validates agent frontmatter, resolves allow/deny permission rules, selects CLI implementation.
4. **Phase 0 — deterministic analysis** — Walks the target repository's file tree and manifest files without any LLM call; produces provenance-tagged analyzer slices consumed by later phases.
5. **Phase 1–3 — LLM synthesis** — Nodes invoke Claude CLI or Codex CLI subprocesses (`invokeCLI` / `invokeCodexCLI`); JSONL output is streamed and parsed. SQLite checkpoint written after each node.
6. **Phase 4 — context generation** (`contextGenerationNode`) — Synthesizes analyzer slices into `.claude/CLAUDE.md` and skill definition files.
7. **Phase 6 — validation** (`validationNode`) — Stop-hook validators run as subprocesses, checking service-completeness and output schema contracts; rejects incomplete outputs before they propagate.
8. **Token metrics & transcript capture** — `emitTokenUsage` writes sidecar files; `locateClaudeTranscript` scans `~/.claude/projects` or Codex rollout dir for the JSONL transcript.
9. **Checkpoint persist** (`attempt-recorder.ts:beginAttemptRecorder`) — Merges agent output metadata into LangGraph state; SQLite checkpoint finalized.

---

## Data Layer

| Store | Technology | Access pattern |
|---|---|---|
| Workflow checkpoints | SQLite via `@langchain/langgraph-checkpoint-sqlite` | Embedded file at `DATABASE_URL` path; written after every node boundary |
| Async job queue / cache | Redis (SaaS or remote) | Accessed via `REDIS_URL`; decouples long-running task submission from execution |
| Token usage metrics | Local filesystem sidecar files | Written to an artifacts directory by `token-usage-emitter.ts` |
| Agent transcripts | JSONL files in `~/.claude/projects/` or Codex rollout dir | Located and parsed post-invocation by `capture.ts:locateClaudeTranscript` |

Orchestration owns no shared database schema — SQLite is used exclusively as a LangGraph checkpoint store keyed by thread/run ID.

---

## Configuration

| Variable | Effect |
|---|---|
| `PROVIDER` | Forces provider selection (`claude` or `codex`); overrides key-based auto-detection |
| `ANTHROPIC_API_KEY` | Selects Claude CLI with API-key auth |
| `OPENAI_API_KEY` | Selects Codex CLI with automatic `api-key login` |
| `CLAUDE_API_KEY` | Alternative key for Anthropic Claude Code SDK |
| `CLAUDE_CODE_USE_FOUNDRY` | Routes Claude through Azure AI Foundry gateway |
| `CLAUDE_CODE_USE_BEDROCK` | Routes Claude through AWS Bedrock gateway |
| `CLAUDE_CODE_USE_VERTEX` | Routes Claude through Google Vertex AI gateway |
| `DATABASE_URL` | File path for the SQLite checkpoint database |
| `REDIS_URL` | Connection string for the Redis cache/queue |
| `GCP_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` | Google Gemini / Vertex AI authentication |
| `ATLASSIAN_API_TOKEN` / `CONFLUENCE_URL` / `CONFLUENCE_USERNAME` | Confluence upload/download operations |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub API access for PR and repository operations |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | AWS cloud platform skills |
| `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` | Firebase platform skills |
| `NOTION_API_KEY` | Notion integration in skills |

---

## Integrations

**LLM providers** (one active per invocation, selected by auth detection):

- **Anthropic Claude** via `@anthropic-ai/claude-code` — default provider; also reachable through Azure AI Foundry, AWS Bedrock, or Google Vertex AI cloud gateways without an Anthropic account.
- **OpenAI / Codex** via `@langchain/openai` and `@openai/codex` — selected when `OPENAI_API_KEY` is set or Codex subscription credentials are present.
- **Google Gemini** via `@langchain/google-genai` — used when Vertex AI gateway is active.

**Infrastructure** (see [[sqlite]] and [[redis]] service docs):
- SQLite — embedded, no network; checkpoint durability for workflow resumption.
- Redis — external SaaS; async dispatch and deferred task execution.

**Third-party services** (consumed by skills at runtime):
- **Atlassian Confluence** (`atlassian-python-api`) — uploads/downloads documentation pages; requires `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `ATLASSIAN_API_TOKEN`.
- **GitHub** — PR review and repository operations via `GITHUB_PERSONAL_ACCESS_TOKEN`.
- **Playwright** (`playwright@^1.58.2`) — browser automation for UI validation workflows.
- **AWS, Firebase, Notion** — referenced in cloud-platform and integration skills.

---

## Service-Specific Patterns

**LangGraph node function** — the primary code unit. Every orchestration step is an `async function (state: XState, config: RunnableConfig): Promise<Partial<XState>>`. Nodes are registered via `graph.addNode()` before `graph.compile()`; nodes registered after compilation are silently dropped.

**Deterministic-first composer** — Phase 0 walks the project tree and emits provenance-tagged analyzer slices before any LLM call. Later phases receive these pre-computed views and synthesize rather than investigate. This prevents hallucinated project structure in LLM outputs.

**Hook-as-subprocess validator** — `validate-*.hook.ts` files are executed as child processes between phases. They perform JSON schema validation on phase outputs and terminate the graph with a non-zero exit code if the schema contract is violated, enforcing service-completeness before downstream synthesizers run.

**Agent factory with multi-provider dispatch** — `agent-factory.ts` selects among `cli-agent-impl.ts` (Claude), `codex-cli-agent-impl.ts` (OpenAI Codex), and `deep-agent-impl.ts` based on the resolved auth mode. All three share `attempt-recorder.ts` for metadata persistence and transcript capture.

**Skills as versioned markdown** — Skill definitions under `.claude/skills/*/SKILL.md` are markdown with YAML frontmatter (`name`, `description`, `disable-model-invocation`, `version`). They are inlined into agent context at runtime rather than compiled, keeping the skill interface stable across model version upgrades without changes to the TypeScript core.

**Zod v4 runtime validation** — schema contracts between phases are enforced with Zod throughout the pipeline, complementing the hook-level subprocess validators.
