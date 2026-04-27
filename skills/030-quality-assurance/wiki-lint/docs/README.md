# Wiki Lint Skill

Structural and semantic lint checks for the LLM wiki at `docs/llm-wiki/wiki/`.

## What it checks

### Structural (fail — non-zero exit)

| Rule | Description |
|------|-------------|
| `broken-wikilinks` | Every `[text](path)` and `[[wikilink]]` target must resolve to an existing file. External `http(s)://` links and anchor-only `#section` links are skipped. |
| `dead-sources` | Every entry in `sources[].path` (frontmatter) must exist in the project tree or under `docs/llm-wiki/raw/`. |
| `missing-frontmatter` | Every page must have all six required keys: `document_type`, `graph_version`, `generated_at`, `summary`, `sources`, `confidence`. |
| `graph-version-mismatch` | Page `graph_version` must match `sha256(.code-graph.db)`. Classified as **semantic warn** — stale between builds is expected. |
| `graph-commit-mismatch` | Page `graph_commit` must match `git rev-parse HEAD`. Classified as **semantic warn** — run `/wiki-refresh` to fix. |

### Semantic (warn — zero exit)

| Rule | Description |
|------|-------------|
| `orphans` | Pages with zero inbound wikilinks AND not referenced in `wiki/index.md` navigation. |
| `stale-claims` | Pages where `max(sources[].ingested_at) < HEAD - 90 days` AND at least one source was modified more recently than `last_verified`. |
| `dispatch-blind` | Backtick symbols (`` `SymbolName` ``) outside code blocks that have 0 callers in the graph but ≥3 lexical grep matches in the project. Requires MCP server reachable. |
| `contradictions` | LLM-detected explicit factual conflicts between changed pages and their 1-hop backlinks. Requires `--changed-pages` and Claude CLI on PATH. |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No structural failures (semantic warnings are advisory only) |
| `1` | One or more structural failures |
| `130` | Interrupted by SIGINT/SIGTERM |

## Usage examples

```bash
# Full check (structural + semantic)
./scripts/lint-wiki.sh

# Structural-only (fast CI gate)
./scripts/lint-wiki.sh --skip-semantic

# Scoped contradiction check after a ticket merge
./scripts/lint-wiki.sh \
  --changed-pages "docs/llm-wiki/wiki/ARCHITECTURE.md,docs/llm-wiki/wiki/services/auth.md"

# Specific project
./scripts/lint-wiki.sh --project-path /path/to/my-project

# Machine-readable output
./scripts/lint-wiki.sh --skip-semantic --json-only
# prints: "X structural failures, Y semantic warnings, Z pages scanned"
```

## Reports

The service writes two report files to `<artifacts-dir>/lint/` (default: `<project-path>/.claude-temp/wiki-lint/lint/`):

- `wiki-lint-report.json` — full JSON report with `structural[]`, `semantic[]`, and `stats`.
- `wiki-lint-report.md` — human-readable Markdown with `## Structural (fail)`, `## Semantic (warn)`, `## Stats`.

## Integration

- `/wiki-refresh` runs `/wiki-lint` at the end of every refresh cycle. If structural failures are found, `.state.json` is NOT updated, preventing the broken commit from becoming the new baseline.
- `/implement-ticket` Phase 8.5 invokes `/wiki-refresh --since <branch-base>` which in turn runs this lint check. Structural failures block PR creation.
