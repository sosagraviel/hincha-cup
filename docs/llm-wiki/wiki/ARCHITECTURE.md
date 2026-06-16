---
document_type: architecture
summary: >-
  qubika-agentic-framework is a **monorepo** managed with **pnpm workspaces**
  (version 10.2.1). It contains three top-level service directories:
  `orchestration` (LangGraph CLI core), `website` (static Docusaurus
  documentation), and `gritogol` (Vite + React + Firebase client app,
  npm-managed independently of the pnpm workspace).
last_updated: '2026-06-16T00:00:00.000Z'
tags:
  - architecture
  - topology
  - typescript
  - langgraph
  - docusaurus
  - firebase
  - react
---
# Monorepo / Repository Shape

qubika-agentic-framework is a **monorepo** managed with **pnpm workspaces** (version 10.2.1). It contains three top-level service directories: `orchestration` (the LangGraph CLI core), `website` (static Docusaurus documentation), and `gritogol` (a Vite + React + TypeScript client backed by Firebase). The `gritogol/` package is managed independently with npm and is not part of the pnpm workspace.

The repository structure places all source code at the root level, with service directories at:
- `orchestration/` — LangGraph CLI and business logic (287 TypeScript files)
- `website/` — Docusaurus documentation site (8 files)
- `gritogol/` — Vite + React + Firebase client app (npm-managed, independent of pnpm workspace)

A further category of directories contains integration test fixtures (`orchestration/test/integration/initialize-project/projects/`) that serve as sample projects for testing the framework's analysis capabilities.

| Workspace | Type | Language | Role | Files |
|-----------|------|----------|------|-------|
| orchestration | CLI | TypeScript 5.9.3 | Project-analysis engine and code-generation orchestration | 287 |
| website | Frontend | TypeScript 6.0.2 | Docusaurus documentation site; static assets | 8 |
| gritogol | Client app | TypeScript (Vite + React) | Firebase-backed soccer highlight app (Auth, Firestore, Storage, Functions) | npm |

## Service Inventory

The project contains three production services plus supporting test utilities:

**[[orchestration]]** (TypeScript CLI, LangGraph 1.2.3)
A stateless command-line tool that reads a source-code project from disk, analyzes its structure and patterns through a five-phase LangGraph workflow, and writes generated artifacts (CLAUDE.md, skill documents, wiki markdown). The orchestration service does not expose a persistent API or server; it is invoked as a CLI process. It uses Vitest for both unit and integration testing.

**[[website]]** (TypeScript, Docusaurus 3.10.0)
A static documentation site built with Docusaurus and deployed to GitHub Pages. It serves as the public-facing documentation for the framework, containing getting-started guides, architecture explanations, and configuration references. The website contains no server-side logic and no persistent runtime port.

**[[gritogol]]** (TypeScript, Vite + React + Firebase)
A soccer highlight client app (GritoGol) that allows users to record and share goal celebration videos. It is a Vite + React + TypeScript SPA backed by Firebase (Auth with Google Sign-In, Firestore for structured data, Cloud Storage for raw video blobs, Cloud Functions for video moderation and live scores sync). Organized with the client source under `gritogol/src/` and Cloud Functions under `gritogol/functions/`. Uses React Router v6 with six flat routes: `/`, `/impacto`, `/perfil`, `/estado/:id`, `/ganadores`, `/admin`. The package is managed with npm and is independent of the pnpm workspace.

## Service Communication

The three services do not communicate with each other at runtime. The orchestration service reads and writes the file system; the website is a static site; gritogol is a standalone Firebase app. All inter-service data flow is one-way:
- The orchestration service generates documentation and skill files that can be committed to a project's repository.
- The website is built and deployed independently from orchestration on a separate schedule.
- The gritogol app communicates only with Firebase backend services (Auth, Firestore, Cloud Storage, Cloud Functions) — no communication with orchestration or website.

The orchestration service's only external communication is with LLM APIs (Claude, Google Generative AI) via LangChain abstraction layers (`ChatAnthropic`, `ChatGoogleGenerativeAI`). These calls occur within individual LangGraph nodes during project analysis.

## External Integrations

**Anthropic Claude API** — LangChain's `ChatAnthropic` integration (`@langchain/anthropic` ^1.3.24) is used throughout the orchestration service to invoke Claude for code analysis, pattern detection, and artifact generation. The integration is transparent to calling code; each LangGraph node receives a configured LLM instance via dependency injection.

**Google Generative AI** — LangChain's `ChatGoogleGenerativeAI` integration (`@langchain/google-genai` ^2.1.26) provides fallback or secondary LLM capabilities.

**GitHub** — The project is version-controlled on GitHub with CI/CD workflows defined in `.github/workflows/`. (Specific CI commands are not determined by analysis due to preToolUse hook restrictions.)

## Authentication & Authorisation

(not determined by analysis)

## Request Lifecycle

The core request lifecycle is the **initialize-project** workflow, triggered by the user invoking the `orchestration` CLI. The workflow is a five-phase LangGraph orchestration:

1. **Phase 1 (Structure Analyzer)** — File-system traversal and project-structure discovery. The orchestration service walks the source project's directory tree, identifies service boundaries, detects package managers, framework metadata, and automation (CI/CD, scripts).

2. **Phase 2 (Code-Patterns Analyzer)** — Language- and framework-specific code inspection. Each LangGraph node invokes Claude to detect conventions, testing patterns, authentication mechanisms, and architectural idioms specific to the discovered technologies.

3. **Phase 3 (Skills Generator)** — Synthesis of reusable skill documents based on discovered patterns. This phase produces code-conventions, testing-conventions, and multi-file-workflows skill documents.

4. **Phase 4 (Context Generation)** — Assembly of the main CLAUDE.md instruction file with curated tech stack, file-placement guidance, essential commands, and architectural summary.

5. **Phase 5 (Wiki Generation)** — Production of ARCHITECTURE.md and per-service documentation for the project's internal LLM wiki.

Each phase is a LangGraph node that:
- Reads the current project state (`ProjectState` object managed by LangGraph).
- Invokes Claude to perform analysis or synthesis.
- Validates findings via hook validators (post-node verification steps).
- Writes enriched state for the next phase.

The workflow is deterministic within each phase; LLM output is parsed and validated before propagation to downstream phases, preventing cascading hallucinations.

## Data Architecture

The orchestration service uses **in-memory state management** via LangGraph's `ProjectState` object. All project context—discovered services, detected frameworks, parsed code patterns, generated artifacts—flows through the `ProjectState` as it traverses the five-phase workflow. The state is:
- **Initialized** at the start of the workflow with the user-provided source project path.
- **Enriched** by each phase (structure discovery adds services, code-patterns phase adds detected conventions, etc.).
- **Validated** by hook validators after each node before proceeding downstream.
- **Serialized and written** at the end as artifact files (CLAUDE.md, skills, wikis) back to the source project directory.

No persistent databases, caches, or message queues are used. The orchestration service is stateless across invocations.

## Deployment Topology

**Orchestration CLI** — Deployed as a TypeScript/Node.js CLI binary distributed to developer machines. Invoked on-demand by users; does not run as a persistent service. No ingress ports or network endpoints.

**Website** — Built from TypeScript source to static HTML/CSS/JS assets and deployed to GitHub Pages. Updated asynchronously from orchestration service changes; no persistent runtime port.

**GritoGol (`gritogol/`)** — Vite SPA deployed to Firebase Hosting (Spark plan). Backed by Firebase Auth (Google Sign-In + anonymous), Firestore (Native mode), Cloud Storage (`videos-crudos/` bucket), and Cloud Functions v2 (`onVideoSubido` Storage trigger for video moderation; `syncCopaScores` HTTP function for live Copa scores sync from api-football.com). The full local dev stack runs via Docker Compose (`make start`) which starts three containers: Firebase emulators, a seed container, and the Vite web server. Cloud Functions deployed from `gritogol/functions/` using the Firebase CLI.

**Integration Test Fixtures** — Three sample projects (mini-microservices, mini-monorepo, mini-serverless) are embedded in the test directory and used by the integration test suite to validate the orchestration engine. These are not production services.

## Local Development

Local development is bootstrapped via shell scripts:

- **`./scripts/initialize-project.sh`** — Full environment setup; installs pnpm dependencies, configures Node.js, and initializes the project.
- **`./scripts/setup-code-graph.sh`** — Prepares the code-graph infrastructure for analysis (setup).
- **`./scripts/ensure-context.sh`** — Development utility to ensure context is available.
- **`./scripts/sync-framework-resources.sh`** — Synchronizes framework resources during development.
- **`./scripts/code-review-graph-mcp.sh`** — Launches a development server for the code-review-graph MCP.

Unit and integration tests are run via pnpm:
- `pnpm --filter orchestration test:unit` — Runs Vitest unit tests.
- `pnpm --filter orchestration test:integration` — Runs Vitest integration tests against the sample fixtures.

Type checking and linting:
- `pnpm --filter orchestration typecheck` — TypeScript type checking.
- `pnpm --filter orchestration lint` — Code linting.

## Automation & CI

**Automation Interface** — The project uses shell scripts as the primary automation interface. Eight shell scripts are defined in `scripts/`:
- Setup: `initialize-project.sh`, `setup-code-graph.sh`
- Development: `sync-framework-resources.sh`, `ensure-context.sh`, `code-review-graph-mcp.sh`
- Testing: `lint-wiki.sh`, `security-check.sh`, `verify-mcp-payload.sh`

**CI Provider** — GitHub Actions (`.github/workflows/`). Two main workflows are defined:
- `ci.yml` — Primary continuous integration workflow.
- `deploy-docs.yml` — Documentation deployment workflow for GitHub Pages.

(Specific commands run by each workflow are not determined by analysis due to preToolUse hook restrictions.)

**Build Tool** — pnpm workspaces with per-service package.json scripts. All build, test, and lint commands are invoked via pnpm with the `--filter orchestration` flag to target the CLI service.

## Coupling Hotspots

The following are high-coupling hubs and bridges in the codebase, identified by structural analysis:

**Hubs** (high centrality, many dependents):
- `orchestration/src/graphs/initialize-project.graph.ts` (LangGraph graph, score 9) — The main workflow orchestrator that composes all five phases.
- `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.ts` (LangGraph node, score 8) — The entry point to project analysis; outputs foundational service and structure discovery.
- `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts` (LangGraph node, score 7) — Synthesizes skill documents and verifies findings.

**Bridges** (cross-phase connectors, medium centrality):
- `orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts` (LangGraph node, score 5) — Assembles the main CLAUDE.md context file.
- `orchestration/src/nodes/initialize-project/phase2/question-consolidator/question-consolidator.node.ts` (LangGraph node, score 5) — Consolidates code-pattern questions before synthesis.
- `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` (Utility, score 6) — Shared prompt construction for multiple phases.

These nodes and utilities are the primary refactoring risk points; changes to their interfaces or output shape will propagate through downstream phases.
