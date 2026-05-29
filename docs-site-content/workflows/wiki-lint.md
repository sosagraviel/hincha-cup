# Wiki Lint

Validate the LLM wiki for broken links, stale sources, and structural inconsistencies.

---

## What It Does

`/wiki-lint` runs two classes of checks over `docs/llm-wiki/wiki/`:

- **Structural checks** — machine-verifiable rules that fail the process on violation (broken wikilinks, dead source paths, missing frontmatter keys)
- **Semantic checks** — heuristic rules that warn but never fail (orphan pages, stale claims, cross-page contradictions)

The skill prints a summary, writes a JSON report and a Markdown report to the artifacts directory, and exits non-zero if any structural check fails.

---

## When to Use

Run `/wiki-lint` when:
- You edited wiki pages manually and want to confirm they are consistent
- `/wiki-refresh` reports structural failures and you need the full violation list
- CI requires a green lint gate before merging wiki changes
- You want a health snapshot of the wiki before a sprint planning session

`/wiki-refresh` runs lint automatically at the end of every refresh — you only need to call `/wiki-lint` directly for standalone checks or detailed diagnosis.

---

## How to Use

**Note**: Run this as a skill inside the AI CLI (Claude Code or Codex), not in a plain terminal.

### Basic Command

```bash
# Claude Code
/wiki-lint

# Codex CLI
$wiki-lint
```

### With Flags

```bash
# Claude Code
/wiki-lint --skip-semantic
/wiki-lint --changed-pages "wiki/ARCHITECTURE.md,wiki/services/auth.md"
/wiki-lint --artifacts-dir ./my-reports

# Codex CLI — same flags, '$' prefix
$wiki-lint --skip-semantic
$wiki-lint --changed-pages "wiki/ARCHITECTURE.md,wiki/services/auth.md"
```

---

## Flags

| Flag | Description |
|------|-------------|
| `--skip-semantic` | Skip semantic (warn-only) checks; structural checks always run |
| `--changed-pages <paths>` | Comma-separated wiki page paths to scope contradiction checks |
| `--artifacts-dir <path>` | Directory for lint report output (default: `.claude-temp/tickets/<id>/artifacts/lint/`) |

---

## Structural Checks (fail on violation)

These checks exit non-zero when they find a problem. Fix them before creating a PR.

| Rule | What it checks |
|------|---------------|
| `brokenWikilinks` | Every `[text](path)` in a wiki page resolves to an existing file |
| `deadSources` | Every `sources[].path` in frontmatter exists in the project tree or under `raw/` |
| `missingFrontmatter` | Every wiki page has `document_type`, `graph_version`, `generated_at`, `summary`, `sources`, and `confidence` |
| `legacy-raw-source` | Any `sources[].path` pointing under the removed `raw/analyzers/` or `raw/graph-stats/` directories is rejected — those subdirs no longer exist; valid source paths are under `raw/snapshots/`, `raw/external/`, or the project tree |
| `graphVersionMismatch` | Each page's `graph_version` matches the current SHA-256 of `.code-review-graph/graph.db` (warns; run `/wiki-refresh` to fix) |
| `graphCommitMismatch` | Each page's `graph_commit` is not behind the current HEAD (warns; run `/wiki-refresh --since <graph_commit>`) |

---

## Semantic Checks (warn only)

These checks never fail the process. They surface advisory information.

| Rule | What it warns about |
|------|---------------------|
| `orphans` | Pages with zero inbound wikilinks that are also absent from `index.md` navigation |
| `staleClaims` | Pages where all sources were last ingested more than 90 days ago and those source files have since changed |
| `dispatchBlind` | Symbols named in a wiki page that appear in the codebase but have zero callers in the graph |
| `contradictions` | Explicit factual conflicts across the changed-page set and their 1-hop linked pages (LLM-assisted check; skipped if no pages passed via `--changed-pages`) |

---

## Report Paths

After each run, two reports are written:

```
<artifacts-dir>/lint/wiki-lint-report.json   # machine-readable
<artifacts-dir>/lint/wiki-lint-report.md     # human-readable with sections
```

The Markdown report has three sections: `## Structural (fail)`, `## Semantic (warn)`, `## Stats`.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All structural checks passed (warnings may exist) |
| `1` | One or more structural checks failed |

Semantic warnings never influence the exit code.

---

## Examples

### Healthy wiki

```
$ /wiki-lint
0 structural failures, 2 semantic warnings, 14 pages scanned
Wiki is structurally consistent. See lint report for advisory warnings.
```

### Wiki with a broken link

```
$ /wiki-lint
1 structural failures, 0 semantic warnings, 14 pages scanned

Structural failures:
  brokenWikilinks  wiki/ARCHITECTURE.md  link points to wiki/services/auth-v2.md which does not exist

Suggested remediation:
  Run /wiki-refresh to regenerate pages with correct links, or fix the link manually and re-run /wiki-lint.
```

---

## Troubleshooting

### "docs/llm-wiki/wiki/ not found"

The lint service scans zero pages and returns a clean report. Run `/initialize-project` to create the wiki, then `/wiki-refresh` to populate it.

### "graphVersionMismatch warnings on every page"

Your code graph is ahead of the wiki. Run `/wiki-refresh` to regenerate stale pages.

### "contradiction check skipped"

The contradiction LLM check requires the `claude` CLI to be on PATH. In offline environments or CI runners without Claude CLI access, this check is skipped silently. All other checks still run.
