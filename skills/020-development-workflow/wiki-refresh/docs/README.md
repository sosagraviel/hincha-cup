# Wiki Refresh Skill

Incrementally refreshes `docs/llm-wiki/` after code changes using the minimum possible set of LLM calls.

## When to Use

- After merging a feature branch that touched service code
- Before creating a PR when wiki pages may be stale
- After renaming, adding, or removing services
- As part of `implement-ticket` Phase 8.5 (automated)

## How It Works

1. Reads `docs/llm-wiki/.state.json` to find the last indexed commit
2. Runs `git diff <last_commit>..HEAD --name-only` to find changed files
3. Scans every wiki page's `sources[]` frontmatter to build a reverse index
4. Expands the affected set by one hop of wikilinks
5. Regenerates only those pages using the wiki-generator agent
6. Appends structured entries to `CHANGELOG.md` and `log.md`
7. Runs a lint check (structural + semantic)
8. Writes updated `.state.json` if lint passes

All generated files are left uncommitted for review.

## Usage (Claude Code)

```
/wiki-refresh
/wiki-refresh --since HEAD~3
/wiki-refresh --force
/wiki-refresh --dry-run
/wiki-refresh --pages "wiki/services/auth,wiki/ARCHITECTURE"
```

## Usage (Codex CLI)

```
$wiki-refresh
$wiki-refresh --since HEAD~3
$wiki-refresh --force
$wiki-refresh --dry-run
```

## Shell Wrapper

```bash
./ai-agentic-framework/scripts/refresh-wiki.sh [OPTIONS]
./ai-agentic-framework/scripts/refresh-wiki.sh --help
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WIKI_REFRESH_MAX_PAGES` | `20` | Maximum pages to refresh in a single run |

## Output Files

All writes are inside `docs/llm-wiki/` and are left uncommitted:

| File | Description |
|------|-------------|
| `wiki/**/*.md` | Refreshed wiki pages |
| `CHANGELOG.md` | New Added/Changed/Removed section |
| `log.md` | New append-only entry |
| `.state.json` | Updated `last_indexed_commit` (only if lint passes) |

## Related Skills

- `/initialize-project` — full wiki generation (first run)
- `/wiki-lint` — standalone lint check (Phase E)
- `/implement-ticket` — uses `/wiki-refresh` in Phase 8.5
