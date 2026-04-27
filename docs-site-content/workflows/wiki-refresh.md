# Wiki Refresh

Keep the LLM wiki in sync with your codebase after code changes.

---

## What It Does

`/wiki-refresh` detects which wiki pages are stale after a code change, regenerates only those pages using the updated code graph, and appends structured entries to `CHANGELOG.md` and `log.md`. It runs automatically as Phase 8.5 of every `/implement-ticket` run — you only need to call it manually after large refactors or when the preflight warns about staleness.

---

## When to Use

Run `/wiki-refresh` manually when:
- `/implement-ticket` Phase 0 warns that `graph_version` or `graph_commit` is stale in the wiki
- You merged a branch that the ticket workflow did not cover
- You refactored a service and want the wiki updated before the next ticket
- You want to confirm the wiki reflects the current codebase before a planning session

You do **not** need to run it after each `/implement-ticket` — Phase 8.5 does this automatically.

---

## How to Use

**Note**: Run this as a skill inside the AI CLI (Claude Code or Codex), not in a plain terminal.

### Basic Command

```bash
# Claude Code
/wiki-refresh

# Codex CLI
$wiki-refresh
```

### With Flags

```bash
# Claude Code
/wiki-refresh --since <git-sha>
/wiki-refresh --force
/wiki-refresh --pages "wiki/ARCHITECTURE.md,wiki/services/auth.md"
/wiki-refresh --dry-run

# Codex CLI — same flags, '$' prefix
$wiki-refresh --since <git-sha>
$wiki-refresh --force
$wiki-refresh --dry-run
```

---

## Flags

| Flag | Description |
|------|-------------|
| `--since <sha>` | Refresh only pages affected since this commit (overrides `.state.json`) |
| `--force` | Full regeneration of all pages regardless of `.state.json` |
| `--pages <globs>` | Comma-separated glob patterns to restrict which pages refresh |
| `--dry-run` | Print the planned refresh set without writing any files |

---

## What Changes on Disk

After a successful run, the following files are updated in `docs/llm-wiki/`:

- **`wiki/*.md`** — regenerated pages with updated content and refreshed frontmatter (`graph_version`, `graph_commit`, `last_verified`, `sources`)
- **`CHANGELOG.md`** — a new `## [Unreleased]` block with `### Changed`, `### Added`, and `### Removed` entries listing what changed
- **`log.md`** — one new append-only entry with the timestamp, commit range, number of pages touched, and lint status
- **`.state.json`** — `last_indexed_commit` bumped to current HEAD (written only when structural lint passes)

Pages that were not in the refresh set are left unchanged. The wiki changes are left uncommitted so you can review them before pushing.

---

## Examples

**Refresh pages touched since yesterday's merge**:
```bash
# Claude Code
/wiki-refresh --since abc1234

# Codex CLI
$wiki-refresh --since abc1234
```

**Preview what would refresh without writing files**:
```bash
# Claude Code
/wiki-refresh --dry-run

# Codex CLI
$wiki-refresh --dry-run
```

**Force full regeneration**:
```bash
# Claude Code
/wiki-refresh --force

# Codex CLI
$wiki-refresh --force
```

---

## Integration with `/implement-ticket` Phase 8.5

Every `/implement-ticket` run automatically calls `/wiki-refresh --since <branch-base>` as Phase 8.5, immediately before PR creation. If the refresh produces structural lint failures (broken links, dead sources, missing frontmatter), the PR is blocked until fixed. Semantic warnings are surfaced in the PR body as advisory information. If no pages were in the refresh set, Phase 8.5 is a no-op and the workflow continues.

---

## Troubleshooting

### "docs/llm-wiki/ not found"

Run `/initialize-project` first. The wiki directory is created during project initialization.

### "code graph update failed"

The skill continues with the existing graph data and warns you. The wiki pages still refresh from the stale graph. Re-run after fixing the graph issue.

### "Structural lint failures"

One or more pages have broken wikilinks, dead source paths, or missing required frontmatter. Run `/wiki-lint` for the full report, fix the issues, and re-run `/wiki-refresh`.
