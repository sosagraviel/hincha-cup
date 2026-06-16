---
document_type: service
summary: >-
  The orchestration service is a TypeScript CLI application that implements a
  five-phase LangGraph workflow to analyze source-code projects and generate
  projec...
last_updated: '2026-06-13T19:05:02.079Z'
tags:
  - service
  - typescript
  - cli
  - langgraph
service_id: orchestration
---
# Orchestration Service

## Purpose

The orchestration service is a TypeScript CLI application that implements a five-phase LangGraph workflow to analyze source-code projects and generate project-context artifacts. It inspects directory structures, identifies frameworks and languages, detects code patterns and conventions, and synthesizes CLAUDE.md instruction files, skill documents, and LLM-wiki markdown for analyzed projects. The service runs as a stateless CLI tool invoked from the command line; it does not expose HTTP routes or persistent runtime services.

## Public API / Surface

The orchestration service exposes three CLI commands:

- `initialize` — Main workflow entry point that runs the full five-phase analysis and synthesis pipeline on a target project directory.
- `aggregate-metrics` — Collects and summarizes metrics from previous workflow runs.
- `initialize-project.graph` — LangGraph state machine available for programmatic composition and streaming execution via the LangGraph runtime.

## Internal Architecture

The service follows a layered LangGraph architecture:

**Phase Nodes** live in `orchestration/src/nodes/initialize-project/{phase}/` and represent discrete workflow steps. Each node is a StateGraph-compatible runnable that reads `ProjectState`, invokes LLM tools via Claude or Gemini APIs, and returns enriched state for the next phase.

**Service Layer** in `orchestration/src/services/{domain}/` contains reusable business logic (project inspection, file-system traversal, analysis consolidation) that nodes instantiate and call. Services do not import nodes, preventing circular coupling.

**Hook Validators** in `orchestration/src/nodes/initialize-project/{phase}/hooks/` run after each node completes, extracting and verifying critical findings (service list, detected frameworks, file placements) before state propagates downstream. This prevents hallucination cascades.

**Prompt Templates** in `orchestration/src/nodes/initialize-project/{phase}/{feature}/prompts/` define LLM agent instructions as markdown files, decoupling prompt content from TypeScript code.

All imports use absolute paths via `@orchestration/...`; relative imports are forbidden at package boundaries.

## Request Lifecycle (Initialize-Project Workflow)

The workflow flows sequentially through five phases, each reading and enriching a shared `ProjectState` object:

1. **Phase 1 (structure-analyzer)** — File-system traversal discovers project layout, identifies services, detects languages, frameworks, and CI/CD automation.
2. **Phase 2 (code-patterns-analyzer)** — Language-specific code inspection extracts conventions, testing patterns, authentication strategies, and architectural idioms.
3. **Phase 3 (skills-generator)** — Synthesizes SKILL.md documents for code-conventions, multi-file-workflows, and testing-conventions based on discovered patterns.
4. **Phase 4 (context-generation)** — Assembles CLAUDE.md with curated tech stack, file-placement rules, essential commands, and architecture narrative.
5. **Phase 5 (wiki-generation)** — Produces ARCHITECTURE.md and per-service wiki pages for the project's internal LLM knowledge base.

Nodes invoke Claude or Google Gemini APIs via LangChain abstraction layers, validate outputs via hook validators, and pass enriched state downstream. All analysis is stateless and file-system local.

## Data Layer

The orchestration service is read-only at the file-system level: it inspects project directories, parses manifests (package.json, go.mod, pyproject.toml, .csproj), and reads source code to extract patterns. It produces three classes of artifacts written to disk:

- **CLAUDE.md** — Main instruction file for the analyzed project.
- **SKILL.md documents** — Skill cards for code-conventions, testing-conventions, multi-file-workflows.
- **LLM-wiki markdown** — Service-specific documentation and ARCHITECTURE.md for the project's knowledge base.

No persistent database, cache, or runtime state is maintained by the orchestration service.

## Configuration

(not determined by analysis)

## Integrations

The orchestration service integrates with two LLM providers:

- **Anthropic Claude** (via @anthropic-ai/claude-code@^2.1.116) — Primary LLM for agentic analysis and text generation across all five phases.
- **Google Gemini** (via @langchain/google-genai@^2.1.26) — Secondary LLM for fallback or specialized language pattern detection.

LLM calls are orchestrated via LangChain abstraction layers (`ChatAnthropic`, `ChatGoogleGenerativeAI`), allowing swappable model backends. The service reads no external APIs; all analysis is file-system local.

## Service-Specific Patterns

**LangGraph Node Structure** — Phase nodes export both a stateless runnable function and a graph-builder function to support composition and isolated testing.

**Service Injection** — Business logic is instantiated within node functions and passed as arguments, not imported statically. This decouples nodes from service implementations and enables mock injection in tests.

**Hook Validators** — After each phase node executes, a hook validator runs synchronously, extracting and verifying critical fields. Missing data triggers errors before state propagates downstream, preventing hallucination cascades.

**Prompt Templates as Markdown** — LLM agent prompts are stored as `.md` files in `prompts/` directories, allowing non-engineers to review and adjust LLM behavior without recompilation.

**Type-First Service Classes** — Services expose public methods with explicit input/output types and are instantiated per node invocation. Nodes call services; services never import nodes, enforcing acyclic coupling.
