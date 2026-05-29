---
document_type: index
summary: >-
  Summary catalog for the ai-agentic-framework LLM wiki — one line per page,
  frontmatter inline.
last_updated: '2026-05-28T03:29:30.820Z'
related:
  - ARCHITECTURE.md
  - SERVICES.md
---
# ai-agentic-framework LLM Wiki

Summary catalog of every page in this wiki. Each line carries the page summary, document type, tags, and related pages — frontmatter inline so a single read of `index.md` serves Tier 1 retrieval.

## Architecture

- [ARCHITECTURE](ARCHITECTURE.md) — *architecture* — This project is a **monorepo** managed with **pnpm workspaces**. The two primary workspace packages are `orchestration` (the TypeScript CLI that drives multi... **Tags:** architecture, topology, typescript, langgraph, docusaurus.

## Services catalog

- [SERVICES](SERVICES.md) — *services* — Catalog of services detected in this project with links to service docs. **Tags:** services, catalog. **Related:** [[ARCHITECTURE]].

## Per-service docs

- [orchestration](services/orchestration.md) — *service* — `orchestration` is the TypeScript CLI at the heart of the Qubika Agentic Framework. It implements the framework's core developer workflows — `initialize-proj... **Tags:** service, typescript, cli, langgraph.
- [python-scripts](services/python-scripts.md) — *service* — The `python-scripts` service is a Python library/scripts collection located at `skills/040-integrations/mastering-confluence/scripts`. Its sole responsibilit... **Tags:** service, python, library.
- [website](services/website.md) — *service* — `website` is the human-readable documentation portal for the Qubika Agentic Framework. Built on Docusaurus 3.10.0, it publishes framework guides, skill refer... **Tags:** service, typescript, frontend, docusaurus.

## How agents should use this

- Start with this index. Read the 1–3 page bodies whose summaries match your question.
- Follow `**Related:**` `[[wikilinks]]` only when the matched pages reference them.
- Stop wikilink traversal at depth 2.
- If the wiki does not answer your question, fall back to graph MCP tools — never re-read the wiki cover-to-cover.
