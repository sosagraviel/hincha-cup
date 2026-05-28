---
document_type: service
summary: >-
  `website` is the human-readable documentation portal for the Qubika Agentic
  Framework. Built on Docusaurus 3.10.0, it publishes framework guides, skill
  refer...
last_updated: '2026-05-28T03:29:30.820Z'
tags:
  - service
  - typescript
  - frontend
  - docusaurus
service_id: website
---
# Website

## Purpose

`website` is the human-readable documentation portal for the Qubika Agentic Framework. Built on Docusaurus 3.10.0, it publishes framework guides, skill references, and architectural documentation as a static site served on port 3000. It does not process framework artifacts at runtime — content is authored in MDX/Markdown under `website/docs/` and compiled to a static bundle during the build step. The orchestration package is its sole producer of narrative context but shares no network boundary or runtime coupling with it.

## Public API / Surface

The website exposes no programmatic API. Its public surface is the rendered static site:

| Entry point | Description |
|---|---|
| `http://localhost:3000` | Dev server root (Docusaurus hot-reload) |
| `website/docs/{section}/{name}.md` | Authoring location for human-facing docs pages |
| `docs/llm-wiki/` | Auto-generated LLM wiki (produced by orchestration; do not edit manually) |

A CI workflow at `.github/workflows/deploy-docs.yml` handles production deployment; the exact deployment target is (not determined by analysis).

## Internal Architecture

The site follows the standard Docusaurus v3 layout:

- **`website/src/components/`** — reusable React components (e.g., `HomepageFeatures/`) built as typed functional components with CSS Modules.
- **`website/src/pages/`** — top-level page routes rendered by Docusaurus's file-based router.
- **`website/docs/`** — MDX/Markdown content tree; the majority of site content lives here rather than in compiled React code.
- **`website/docusaurus.config.*`** — site-wide Docusaurus configuration (plugins, navbar, footer, theme).
- **`website/package.json`** — isolated dependency manifest; the workspace tool is pnpm but this package uses npm as its declared package manager.

There is no server-side rendering pipeline, no API layer, and no background worker — Docusaurus outputs a fully pre-rendered static bundle at build time.

## Request Lifecycle (or Job Lifecycle)

Because this is a static site there is no runtime request lifecycle. The build-time pipeline is:

1. **Content authoring** — docs pages are written as MDX/Markdown in `website/docs/{section}/`.
2. **Component composition** — React components in `website/src/components/` are imported by pages or MDX files.
3. **Docusaurus build** (`pnpm -r build`) — Docusaurus compiles MDX, bundles React components, and emits a static `build/` directory.
4. **Serve** — in development, `docusaurus start` serves the hot-reload dev server on port 3000; in production, the static bundle is deployed via the `deploy-docs.yml` workflow.

During `pnpm -F orchestration initialize`, the orchestration CLI writes `docs/llm-wiki/` content; those files are picked up by the next Docusaurus build automatically because they fall inside the `docs/` tree.

## Data Layer

The website has no persistent data store. It holds no database, cache, or queue connection.

Content is stored as files:

| Location | Role |
|---|---|
| `website/docs/` | Authored MDX/Markdown pages |
| `docs/llm-wiki/` | Auto-generated wiki pages (written by orchestration, read by Docusaurus at build time) |

## Configuration

(no environment variables consumed)

The Docusaurus configuration is static (`website/docusaurus.config.*`) and does not read runtime environment variables beyond what Docusaurus itself injects during the build (e.g., `NODE_ENV`). No service-specific env vars are declared in the upstream analysis.

## Integrations

The website has no inbound webhooks or outbound API calls at runtime. Its only integration is build-time:

- **[[orchestration]]** — the orchestration CLI writes `docs/llm-wiki/` pages as a side-effect of the `initialize-project` skill. Those files are co-located in the monorepo and consumed by the next Docusaurus build. There is no network call between the two services.
- **GitHub Actions** (`.github/workflows/deploy-docs.yml`) — CI/CD pipeline triggers a production build and deployment on merge; the deployment target is (not determined by analysis).

## Service-Specific Patterns

**Functional React components with typed props.** UI components follow a single pattern: a TypeScript interface defines the props shape, the component is a plain function destructuring that interface, and layout uses Docusaurus's `clsx` utility for conditional class composition. No class components, no Redux, no context providers are observed.

**CSS Modules for component-scoped styles.** Each component imports a collocated `styles` object from a `.module.css` file; class names are referenced as `styles.featureName` rather than global strings.

**MDX-first content model.** The bulk of the site is authored in MDX/Markdown rather than compiled React. React components appear at the edges (homepage features, custom layout wrappers) while documentation pages remain plain Markdown for maximum portability and ease of editing by non-frontend authors.

**No test suite.** The `package.json` test script echoes `'No tests yet'` and exits 0. Website components are not covered by automated tests.
