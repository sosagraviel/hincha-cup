---
name: wiki-ingest-external-docs
version: 1.0.0
last-updated: 2026-05-14
description: Stages external descriptive documents (PDFs, DOCX, HTML, Notion/Confluence exports, Google Drive files, GitHub issues, images) into docs/llm-wiki/raw/external/ following Karpathy's LLM-Wiki pattern — immutable raw/ layer, manifest-indexed, content-addressed. Export-first, never API-fetch. The skill validates the wiki.cache_external flag, converts the source to markdown, hashes and stages the file at a content-addressed path, extracts LLM metadata (subject, service, authoritativeness), updates the manifest and ingestion-state, then runs a lint-and-deconflict pass against existing wiki pages. After staging, /wiki-refresh consumes the manifest entries on the next run. Use when a user provides an external document that contains descriptive context the codebase alone cannot supply.
argument-hint: '<source-path-or-url> [--subject <hint>] [--repo <name>] [--global] [--dry-run]'
user-invokable: true
disable-model-invocation: false
---

# Wiki Ingest External Docs

Input: $ARGUMENTS

Stage an external document into `docs/llm-wiki/raw/external/` so that `/wiki-refresh` absorbs its descriptive context into the relevant wiki pages on the next run.

## Flags

Parse `$ARGUMENTS`:

- `<source-path-or-url>` — required. Local file path or HTTP URL.
- `--subject <hint>` — optional keyword hint (e.g. `auth`, `service:payments`, `rfc`).
- `--repo <name>` — in a multi-repo workspace, explicitly target the named child repo.
- `--global` — write to `docs/llm-wiki/global/raw/external/`.
- `--dry-run` — run Phases 1–4 only; emit `[dry-run]` prefix on each action, write nothing.

## Execution model (Codex CLI)

Codex CLI executes this skill as a sequence of shell commands and sub-agent invocations. Sub-agents are invoked with `$skill` syntax. All multi-turn interactions must be non-interactive (use flags, not prompts) unless the Codex session is explicitly interactive.

For multi-repo ambiguity without `--repo` or `--global`, Codex CLI must abort with exit code 1 and the message: `Cannot auto-detect target repo. Pass --repo <name> or --global.`

## Contract

- **Export-first, never API-fetch.** MCP tools export content; this skill stages what they export.
- **Content-addressed paths.** SHA-256 prefix makes every staging idempotent.
- **Manifest is the discovery index.** `wiki-refresh` reads `manifest.json`.
- **Opt-in only.** `wiki.cache_external: true` must be in `framework-config.json`.
- **Descriptive content only.** Redirect prescriptive content to the convention skills.

## Sequential phases

Execute in order. Emit `failed` and stop on any unrecoverable error.

### Phase 1: Validate flag

```bash
python3 -c "
import json, sys
cfg = json.load(open('.claude/framework-config.json'))
enabled = cfg.get('wiki', {}).get('cache_external', False)
sys.exit(0 if enabled else 1)
" || { echo 'External doc caching is disabled. Set wiki.cache_external: true in .claude/framework-config.json to enable.'; exit 0; }
```

If the flag is absent or false, emit the message and exit 0.

### Phase 2: Resolve source

Determine source type and target staging directory.

```bash
SOURCE="$1"
STAGING_DIR="docs/llm-wiki/raw/external"

if [[ "$*" == *"--global"* ]]; then
  STAGING_DIR="docs/llm-wiki/global/raw/external"
  mkdir -p "$STAGING_DIR"
elif [[ "$*" == *"--repo "* ]]; then
  REPO=$(echo "$*" | grep -oP '(?<=--repo )\S+')
  STAGING_DIR="$REPO/docs/llm-wiki/raw/external"
else
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "Cannot auto-detect target repo. Pass --repo <name> or --global."
    exit 1
  }
  STAGING_DIR="$REPO_ROOT/docs/llm-wiki/raw/external"
fi

mkdir -p "$STAGING_DIR"
```

Source type detection by file extension or URL pattern (same table as SKILL.claude.md). For Notion, Confluence, Drive URLs: export via MCP tools before passing to Phase 3.

### Phase 3: Clean and convert

```bash
bash scripts/clean_and_convert.sh "$SOURCE" "$SOURCE_TYPE" "$TMPDIR"
CONVERTED="$(ls $TMPDIR/*.md 2>/dev/null | head -1)"
[[ -z "$CONVERTED" ]] && { echo "Conversion failed."; exit 1; }
```

For image sources: use Codex vision capability to describe the image as markdown. If the image is an architecture diagram, produce a Mermaid block.

### Phase 4: Hash and stage

```bash
python3 scripts/hash_and_stage.py \
  --input "$CONVERTED" \
  --staging-dir "$STAGING_DIR" \
  --slug "$(basename "$SOURCE" | sed 's/\.[^.]*$//' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')" \
  --source-uri "$SOURCE" \
  --source-type "$SOURCE_TYPE"
```

Prints the staged path on stdout. If `--dry-run`, prints `[dry-run] Would stage: <path>` and stops here.

### Phase 5: Extract metadata

Invoke `$wiki-ingest-external-docs/agents/extract-metadata` sub-agent with the staged file content and subject hint. The agent returns JSON. On failure, retry once; on second failure use defaults.

Patch the staged file frontmatter with the extracted values.

### Phase 6: Update manifest

```bash
python3 scripts/update_manifest.py \
  --manifest-path "$STAGING_DIR/manifest.json" \
  --staged-path "$STAGED_PATH" \
  --source-uri "$SOURCE" \
  --source-type "$SOURCE_TYPE" \
  --content-sha256 "$SHA256" \
  --subject-keywords "$SUBJECT_KEYWORDS" \
  --describes-service "$DESCRIBES_SERVICE" \
  --describes-files "" \
  --authoritativeness "$AUTHORITATIVENESS" \
  --source-of-truth "false"
```

### Phase 7: Update ingestion state

```bash
python3 scripts/update_state.py \
  --state-path "$(dirname "$STAGING_DIR")/../.ingestion-state.json" \
  --source-uri "$SOURCE" \
  --content-hash "$SHA256" \
  --staged-path "$STAGED_PATH"
```

Add `--global` flag when operating on the global tree.

### Phase 8: Lint and deconflict

Invoke `$wiki-ingest-external-docs/agents/lint-and-deconflict` sub-agent. On `severity: "block"` output, print the lint JSON and exit non-zero.

### Phase 9: Report

Print:

```
Staged: <staged-path>
Source: <source>
Type:   <source-type>
Subject: <keywords>
Service: <describes_service or —>
Authoritativeness: <value>
SHA-256: <hash>
Lint: <none | N warnings | BLOCKED>

Next step: run /wiki-refresh to absorb this document into the wiki.
```

## Frontmatter contract

Every staged markdown file carries this YAML frontmatter:

```yaml
---
source_uri: <original URL or absolute path>
source_type: pdf | notion | confluence | gh-issue | docx | html | image | markdown | ...
ingested_at: <ISO 8601 timestamp>
last_verified: <ISO 8601 timestamp>
content_sha256: <full sha256 hex>
authoritativeness: rfc | runbook | code-derivative | vendor-doc | meeting-note
source_of_truth: false
subject: [auth, sessions, oauth]
describes_service: payments
describes_files: []
---
```

## Failure modes

- `wiki.cache_external` absent or false → no-op + clear message. Exit 0.
- Source file not found → abort, exit non-zero.
- Conversion tool missing and no fallback → surface installer hint, abort.
- `extract-metadata` fails twice → use defaults, warn in report.
- Lint severity `block` → print lint output, exit non-zero.
- Non-interactive multi-repo ambiguity → abort, exit non-zero.

## Differences from SKILL.claude.md

- All sub-agent invocations use `$skill-name` Codex syntax.
- Multi-repo ambiguity always aborts (no interactive prompt in Codex CLI).
- Shell pipeline examples are written for Bash; adjust for the active Codex shell.
- MCP tool calls use Codex's tool-call format (`mcp__<server>__<tool>`).
