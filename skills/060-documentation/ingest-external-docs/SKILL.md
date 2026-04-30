---
name: ingest-external-docs
description: Stage external descriptive docs (PDFs, Confluence/Notion exports, design docs, ADRs from outside the repo) under docs/llm-wiki/raw/external/ so the wiki-generator can absorb them into per-service docs and ARCHITECTURE.md on the next /wiki-refresh. Use when stakeholders provide context the codebase alone does not carry.
---

# Ingest External Docs

## Purpose

The LLM wiki is graph-grounded — it carries facts the analyzers can derive from
the codebase. But a real project also has **descriptive context that lives
outside the repo**: an architectural ADR in Confluence, a design doc in Notion,
a security review PDF, an investor-deck system diagram, a vendor's API spec
PDF. None of that is reachable from `git ls-files`.

This skill is the **export-first** ingestion path. It does NOT call out to
external APIs (no Confluence connector, no Notion fetch). The user exports the
external doc to a local file in any common format; this skill stages it under
`docs/llm-wiki/raw/external/` with a manifest entry; the wiki-generator picks
it up on the next `/wiki-refresh` and absorbs the content into the relevant
per-service docs and `ARCHITECTURE.md`.

This pattern matches the industry consensus (graphify, llm-wiki-agent,
Karpathy): **export, don't fetch**. Connectors break, deal with auth, and
expose the framework to data residency / compliance issues. A staged file is
auditable, diffable, and travels with the repo.

## When to Use

- The user provides a PDF / DOCX / markdown / image of design context the
  codebase analysis cannot surface (e.g. "the architecture diagram in our
  Confluence space")
- Stakeholders share investor decks, security audits, or vendor API specs
  whose content should inform planning and implementation
- An external ADR (Architecture Decision Record) lives outside the repo and
  the wiki should reference it
- A migration plan in Notion needs to flow into the per-service docs after the
  next wiki refresh

**Do NOT use** for:

- Code-derivable facts — the analyzers will extract those automatically
- Prescriptive content (rules, gotchas, multi-file checklists, testing
  conventions). Those live in the convention skills under
  `.claude/skills/code-conventions/`, `multi-file-workflows/`, and
  `testing-conventions/` — not in the wiki.
- Secrets / credentials — the staging directory is committed to the repo

## Inputs

This skill accepts:

1. **Source document path(s)**: Local file path(s) to the external doc(s).
   Common formats: `.pdf`, `.docx`, `.md`, `.txt`, `.png` / `.jpg` (diagrams).
2. **Subject hint** (optional): One of `architecture`, `service:<id>`,
   `integration`, `decision-record`, or a free-form tag — used by the
   wiki-generator to slot the absorbed content into the right page on the
   next refresh.
3. **Source URL** (optional): The external system's URL (Confluence page,
   Notion doc) — recorded in the manifest for provenance.

## Workflow

### Phase 1: Convert to markdown

Each input is converted to a UTF-8 markdown file under
`docs/llm-wiki/raw/external/`. The conversion strategy depends on the source
format:

- `.md` / `.txt`: copied verbatim with a minimal frontmatter wrapper.
- `.pdf` / `.docx`: converted to markdown via `markitdown` (Microsoft's
  open-source document-to-markdown tool — handles tables, headings, basic
  layout). Install with `pip install markitdown` if missing.
- `.png` / `.jpg` (diagrams or screenshots): copied as-is and an adjacent
  `.md` stub records the filename, the user-provided caption, and the subject
  hint. The wiki-generator will reference the image via a markdown image
  link rather than try to OCR it.

Each converted file lands at:

```
docs/llm-wiki/raw/external/<sha256-prefix>-<slugified-original-name>.md
```

The sha256 prefix (8 chars) makes the file content-addressable: the same
input always lands at the same path, so re-running this skill is idempotent.

### Phase 2: Add to the manifest

Append (or update) an entry in
`docs/llm-wiki/raw/external/manifest.json`:

```json
{
  "<sha256-prefix>-<slug>.md": {
    "original_filename": "Architecture Decision Record - Auth Migration.pdf",
    "source_url": "https://confluence.example.com/x/AbC123",
    "ingested_at": "2026-04-29T15:34:00.000Z",
    "subject": "service:auth",
    "content_sha256": "<full-sha256>"
  }
}
```

The manifest is the wiki-generator's discovery index — on the next refresh, it
walks every entry, reads each file, and slots the content into the indicated
subject (per-service doc, `ARCHITECTURE.md`, or a new "External References"
section).

### Phase 3: Tell the user what happens next

Report:

- The list of staged files with their content-addressed paths
- The subject each file was tagged with
- The next step: run `/wiki-refresh` to have the wiki-generator absorb the
  staged content into the relevant pages

## Framework Config

The opt-in framework-level flag `wiki.cache_external` in
`<project>/.claude/framework-config.json` controls whether external content
gets cached on disk under `docs/llm-wiki/raw/external/` (default `false`).
When `false`, this skill is a no-op and reports `external doc caching is
disabled — set wiki.cache_external=true in framework-config.json to enable`.

To enable:

```json
{
  "wiki": {
    "cache_external": true
  }
}
```

This is intentionally opt-in: the staged content is committed to the repo and
flows through code review like any other markdown change.

## Important Rules

1. **Export-first, never fetch.** This skill never calls Confluence / Notion /
   Google Docs APIs. The user exports; this skill stages.
2. **Content-addressed paths.** Filenames carry an 8-char sha256 prefix so the
   skill is idempotent and content can be deduplicated across runs.
3. **Manifest is the source of truth.** The wiki-generator reads
   `manifest.json`, not the directory listing — files dropped without a
   manifest entry are ignored on the next refresh.
4. **Descriptive, not prescriptive.** This is wiki content. If the user
   provides a doc that's actually a coding rulebook, redirect them to the
   convention skills.
5. **Respect `wiki.cache_external`.** If the flag is `false`, refuse to write
   anything and explain the flag.

## Success Criteria

- Each input file appears under `docs/llm-wiki/raw/external/<hash>-<slug>.md`
- `manifest.json` carries an entry per staged file with `original_filename`,
  `source_url` (when provided), `ingested_at`, `subject`, and
  `content_sha256`
- A clear "next step" message tells the user to run `/wiki-refresh`
- Re-running the skill on the same input is a no-op (same hash → same path)
- `wiki.cache_external=false` stops the skill before any disk writes
