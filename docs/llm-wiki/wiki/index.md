---
document_type: index
summary: >-
  Summary catalog for the qubika-agentic-framework LLM wiki — one line per page,
  frontmatter inline.
last_updated: '2026-06-13T19:05:02.079Z'
related:
  - ARCHITECTURE.md
  - SERVICES.md
---
# qubika-agentic-framework LLM Wiki

Summary catalog of every page in this wiki. Each line carries the page summary, document type, tags, and related pages — frontmatter inline so a single read of `index.md` serves Tier 1 retrieval.

## Architecture

- [ARCHITECTURE](ARCHITECTURE.md) — *architecture* — qubika-agentic-framework is a **monorepo** managed with **pnpm workspaces** (version 10.2.1). Three top-level service directories: `orchestration` (LangGraph CLI core), `website` (Docusaurus docs), `gritogol` (Vite + React + Firebase client, npm-managed). **Tags:** architecture, topology, typescript, langgraph, docusaurus, firebase, react.

## Services catalog

- [SERVICES](SERVICES.md) — *services* — Catalog of services detected in this project with links to service docs. **Tags:** services, catalog. **Related:** [[ARCHITECTURE]].

## Per-service docs

- [gritogol](services/gritogol.md) — *service* — Vite + React SPA where soccer fans record and share short "festejo" video clips when their team scores, backed by Firebase Auth, Firestore, Cloud Storage, and Cloud Functions v2. **Tags:** service, typescript, react, firebase, vite. **Related:** [[ARCHITECTURE]], [[SERVICES]].
- [javascript-scripts](services/javascript-scripts.md) — *service* — The javascript-scripts service is the automation and development orchestration layer for the monorepo. It provides shell-based entry points for environment s... **Tags:** service, javascript, library.
- [orchestration](services/orchestration.md) — *service* — The orchestration service is a TypeScript CLI application that implements a five-phase LangGraph workflow to analyze source-code projects and generate projec... **Tags:** service, typescript, cli, langgraph.
- [python-scripts](services/python-scripts.md) — *service* — Python Scripts is a library service within the monorepo that provides shared Python utilities and automation scripts. (not determined by analysis) **Tags:** service, python, library.
- [website](services/website.md) — *service* — The website service is a static documentation site built with Docusaurus and deployed via GitHub Pages. It serves as the public-facing knowledge base for the... **Tags:** service, typescript, frontend, docusaurus.

## How agents should use this

- Start with this index. Read the 1–3 page bodies whose summaries match your question.
- Follow `**Related:**` `[[wikilinks]]` only when the matched pages reference them.
- Stop wikilink traversal at depth 2.
- If the wiki does not answer your question, fall back to graph MCP tools — never re-read the wiki cover-to-cover.
