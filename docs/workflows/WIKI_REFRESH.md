# wiki-refresh Workflow

Incremental refresh of `docs/llm-wiki/` after code changes.

**Version**: 1.0.0
**Skill file**: `skills/020-development-workflow/wiki-refresh/SKILL.claude.md` / `SKILL.codex.md`
**CLI**: `scripts/refresh-wiki.sh` / `pnpm --filter orchestration refresh-wiki`

---

## Architecture

The refresh workflow is a 9-node sequential LangGraph pipeline:

```
read_state → compute_diff → code_graph_update → compute_refresh_set
→ refresh_pages → write_changelog → write_log → run_lint → update_state
```

| Node | Responsibility |
|------|---------------|
| `read_state` | Reads `docs/llm-wiki/.state.json`; resolves `since_commit` |
| `compute_diff` | `git diff <since_commit>..HEAD --name-only`; populates `changed_files` |
| `code_graph_update` | `code-review-graph update`; falls back to full rebuild on `--force` or missing DB |
| `compute_refresh_set` | Builds reverse index `sources[].path → page`; expands 1-hop wikilinks; queries graph communities; caps at `max_pages` (default 20) |
| `refresh_pages` | Parallel agent invocations — one per page in refresh set; diff-aware merge (only paragraphs with changed source chunks) |
| `write_changelog` | Appends `## [Unreleased]` block to `CHANGELOG.md` with Changed/Added/Removed entries |
| `write_log` | Appends one structured entry to `log.md` |
| `run_lint` | Calls `lintLlmWiki()` service; collects `LintReport` |
| `update_state` | Writes `.state.json` only if structural lint passes |

Short-circuit: when `compute_diff` produces zero `changed_files`, the graph skips to `write_log` (no-op refresh).

---

## State Schema

Defined in `orchestration/src/state/schemas/wiki-refresh.schema.ts` (`WikiRefreshAnnotation`):

| Field | Type | Description |
|-------|------|-------------|
| `project_path` | `string` | Absolute path to target project |
| `framework_path` | `string` | Absolute path to this framework |
| `since_commit` | `string?` | Git SHA to diff from; read from `.state.json` when absent |
| `force` | `boolean` | Skip `.state.json` and rebuild everything |
| `pages_filter` | `string[]?` | Glob patterns to restrict refresh scope |
| `dry_run` | `boolean` | Plan only; no files written |
| `changed_files` | `string[]` | Output of `compute_diff` |
| `refresh_set` | `string[]` | Pages selected for regeneration |
| `generated_pages` | `GeneratedWikiFile[]` | Pages the agent produced |
| `lint_report` | `LintReport?` | Structural + semantic lint results |
| `errors` | `string[]` | Non-fatal errors from any node |
| `current_phase` | `string` | Current node name (debug/logging) |
| `hints` | `WikiDeltaHint[]` | Implementer-supplied page suggestions (from `--hints`); unioned with diff-driven set in `compute_refresh_set` |

### WikiDeltaHint shape

```ts
{
  file_path: string;       // source file relative to project root
  suggested_page: string;  // wiki page relative to docs/llm-wiki/wiki/
  action: 'add' | 'update' | 'deprecate';
  reason: string;          // ≤120 chars
}
```

---

## CLI Flags

```bash
scripts/refresh-wiki.sh \
  --project-path <abs-path>    # required
  --framework-path <abs-path>  # required
  --since <sha>                # diff base; overrides .state.json
  --force                      # full regeneration
  --pages <globs>              # comma-separated glob patterns
  --dry-run                    # print plan, no writes
  --hints <path>               # JSONL file of Wiki Delta Hints from the implementer
```

---

## Disk Changes

On a successful (non-dry-run) run:

- `docs/llm-wiki/wiki/*.md` — regenerated pages only (pages outside the refresh set are untouched)
- `docs/llm-wiki/CHANGELOG.md` — appended `## [Unreleased]` section
- `docs/llm-wiki/log.md` — one new append-only entry
- `docs/llm-wiki/.state.json` — `last_indexed_commit` updated (only when structural lint passes)

Changes are left uncommitted. `/implement-ticket` Phase 8.5 stages and commits them with `docs(wiki): refresh for <TICKET-ID>`.

---

## Integration Points

- **`/implement-ticket` Phase 8.5** — calls `refresh-wiki` automatically with `--since <branch-base>`. Structural lint failures block PR creation.
- **`/wiki-lint`** — called at the end of every refresh by the `run_lint` node. Results determine whether `.state.json` is written.
- **`code-review-graph update`** — called by `code_graph_update` node; falls back to full `build` on non-zero exit.

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Code graph update exits non-zero | Warn; continue refresh with existing graph data |
| Agent fails for a specific page | Log page name; continue with remaining pages |
| Structural lint failures | `.state.json` not written; user must resolve violations and re-run |
| `changed_files` empty | Short-circuit; `log.md` records zero-page no-op |

---

## Skill Invocation

| Provider | Command |
|----------|---------|
| Claude Code | `/wiki-refresh [--since <sha>] [--force] [--pages <globs>] [--dry-run] [--hints <path>]` |
| Codex CLI | `$wiki-refresh [--since <sha>] [--force] [--pages <globs>] [--dry-run] [--hints <path>]` |

---

**See also**:
- `skills/020-development-workflow/wiki-refresh/SKILL.claude.md`
- `orchestration/src/graphs/wiki-refresh.graph.ts`
- `orchestration/src/state/schemas/wiki-refresh.schema.ts`
- [WIKI_LINT.md](WIKI_LINT.md)
