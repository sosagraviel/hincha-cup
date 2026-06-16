---
document_type: service
summary: >-
  The javascript-scripts service is the automation and development orchestration
  layer for the monorepo. It provides shell-based entry points for environment
  s...
last_updated: '2026-06-13T19:05:02.079Z'
tags:
  - service
  - javascript
  - library
service_id: javascript-scripts
---
# Javascript Scripts

## Purpose

The javascript-scripts service is the automation and development orchestration layer for the monorepo. It provides shell-based entry points for environment setup, development workflows, testing, and validation tasks. These scripts coordinate the pnpm workspaces, invoke TypeScript tooling, and manage CI/CD integration.

## Public API / Surface

The service exposes eight shell script entry points:

- **initialize-project.sh** — Full local environment bootstrap including dependencies, code generation, and sample project setup.
- **setup-code-graph.sh** — Configures and initializes the code analysis graph infrastructure.
- **sync-framework-resources.sh** — Synchronizes framework resources and templates across workspaces during development.
- **lint-wiki.sh** — Validates and lints the generated wiki documentation and Markdown assets.
- **security-check.sh** — Runs security-focused validation and vulnerability scanning.
- **verify-mcp-payload.sh** — Validates MCP (Model Context Protocol) payload structure and correctness.
- **ensure-context.sh** — Ensures development context and prerequisites are present before execution.
- **code-review-graph-mcp.sh** — Launches the development server for the code-review-graph MCP service.

## Internal Architecture

The scripts act as thin orchestration wrappers around pnpm workspace tasks. They coordinate the `orchestration` and `website` packages through workspace filters (`pnpm --filter`), abstracting the underlying task structure and reducing friction for developers. Each script typically chains multiple sub-tasks: environment validation, package operations, and post-processing (output formatting, artifact staging).

## Request Lifecycle

1. **User invokes script** from the project root.
2. **Script validates prerequisites** (Node version, pnpm availability, required environment variables).
3. **Script invokes pnpm commands** targeting specific workspaces (e.g., `pnpm --filter orchestration build`).
4. **Sub-tasks execute** in sequence (TypeScript compilation, linting, test execution, artifact generation).
5. **Output is formatted and staged** for consumption (wiki markdown written to docs/, exit codes propagated).

## Data Layer

The scripts do not own persistent data stores. They manage transient artifacts: compiled output in `orchestration/dist/`, generated wiki pages in `docs/llm-wiki/`, and test reports. State is scoped to the local filesystem and environment.

## Configuration

The documented commands bound to npm-style task names are:

- `dev` — Launch with `tsx` for rapid iteration.
- `build` — Run `pnpm --filter orchestration build`.
- `lint` — Run `pnpm --filter orchestration lint`.
- `typecheck` — Run `pnpm --filter orchestration typecheck`.
- `test:unit` — Run `pnpm --filter orchestration test:unit`.
- `test:integration` — Run `pnpm --filter orchestration test:integration`.

Environment variables are consumed from the shell environment and `.env` files at the monorepo root; specific required variables are (not determined by analysis).

## Integrations

The scripts depend on and invoke:

- **pnpm** (10.2.1) — Package manager and workspace coordinator.
- **Node.js** (22) — JavaScript runtime.
- **TypeScript** (~5.9.3) — Type checking and compilation.
- **Vitest** — Unit and integration test execution.
- [[orchestration]] — Primary LangGraph service orchestrated via pnpm filters.
- [[website]] — Documentation site built via Docusaurus.
- **GitHub Actions** (.github/workflows/) — CI/CD integration (commands not determined by analysis).

## Service-Specific Patterns

The scripts follow a semantic naming scheme: `{action}-{component}.sh` (e.g., `lint-wiki.sh`). They are categorized by purpose: setup (initialize, configure), dev (sync, ensure, launch), and validation (lint, security, verify). Each script is idempotent where possible and emits structured output for shell pipelines and CI/CD consumption. Error handling is delegated to set -e semantics and exit code propagation.
