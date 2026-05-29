# Documentation Skills

Skills for producing supporting technical documentation artifacts such as diagrams, design docs, and externally-authored context that flows into the LLM wiki.

## Skills in this group

- **design-doc-mermaid**: Create architectural diagrams, flowcharts, sequence diagrams, and entity-relationship diagrams using Mermaid syntax for technical documentation.
- **ingest-external-docs**: Stage external descriptive docs (PDFs, Confluence / Notion exports, ADRs from outside the repo) under `docs/llm-wiki/raw/external/` so the wiki-generator absorbs them into per-service docs and `ARCHITECTURE.md` on the next `/wiki-refresh`. Export-first — no external API connectors. Opt-in via the `wiki.cache_external` flag in `<project>/.claude/framework-config.json`.
