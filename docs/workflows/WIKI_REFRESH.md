# wiki-refresh Workflow

Incremental, AI-driven refresh of `docs/llm-wiki/` after code changes.

**Version**: 2.2.0
**Skill file**: `skills/020-development-workflow/wiki-refresh/SKILL.md` (unified — same file for both providers; runtime-neutral termination wording)
**Invocation**: `/wiki-refresh` (Claude Code) or `$wiki-refresh` (Codex CLI)

> The previous LangGraph-based `wiki-refresh` pipeline was removed in the 2026-05 simplify pass. The current implementation is a single markdown skill that both Claude Code and Codex CLI execute directly — no graph, no node DAG, no schema annotation. The skill is the source of truth; this page is a summary.

---

## What the skill does

The skill executes eight sequential phases:

1. **Read wiki state.** Loads `docs/llm-wiki/.state.json` — a per-repo map of last-indexed commits plus `last_refresh_at`.
2. **Enumerate repos at HEAD.** Detects single-repo (workspace root contains `.git/`) or multi-repo (workspace contains child dirs each with `.git/`) and reads `git rev-parse HEAD` for each.
3. **Build evidence pack.** For each repo whose recorded commit differs from current HEAD, captures `git log --oneline`, `git diff --stat`, `git diff --name-only`, and sampled hunks from the top 3–5 largest-diff files.
4. **Read the routing table.** Loads `docs/llm-wiki/wiki/index.md` verbatim — one line per page with summary / document_type / tags / related inline.
5. **Identify affected pages (AI judgment).** Assembles a prompt containing the index, the per-repo evidence pack, and a hardcoded **high-level-only conservatism rule**, then asks the LLM to return strict JSON listing pages to `update` vs. `skip`, plus advisory `suggestions` for potential new services.
6. **Update each affected page.** Re-reads the page, applies a per-page downgrade guard (skips if the page is silent on the area the diff touched), then surgically patches the body with minimal diff. Frontmatter `summary` / `tags` / `related` only change when the page's overall identity actually shifted. Index.md is patched in sync if those fields changed.
7. **Write `.state.json` (and optionally commit).** Bumps every repo's entry to its current HEAD on full success. When `--commit` is passed, commits `docs/llm-wiki/**` with `docs(wiki): refresh` (or `docs(wiki): refresh for <TICKET-ID>` with `--ticket`). When the wiki lives outside a git repo (multi-repo workspace where the parent is untracked), writes `wiki-diff.md` + `wiki-warning.txt` under `--artifacts-dir <path>/wiki/` instead.
8. **Summary.** Prints `Updated:`, `Skipped:` (with reasons, including step-6 downgrades), `Suggestions:` (with `/wiki-add-service <name>` hints when applicable), `Commit:` (SHA + message when one was produced), and a `(dry-run — no changes made)` note when `--dry-run` was passed.

---

## Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Run phases 1–5 only. No page edits, no `.state.json` write, no commit. Wins over `--commit`. |
| `--commit` | After phase 7, commit `docs/llm-wiki/**` changes. Default message: `docs(wiki): refresh`. |
| `--ticket <ID>` | Only meaningful with `--commit`. Appends ` for <ID>` to the commit message: `docs(wiki): refresh for <ID>`. |
| `--artifacts-dir <path>` | Only meaningful with `--commit`. When the wiki lives outside a git repo, writes the diff manifest + warning to `<path>/wiki/` for the caller (e.g. `/implement-ticket` Phase 9) to embed in PR bodies. |

No-flag invocation (ad-hoc usage) runs phases 1–8 but leaves changes uncommitted in the working tree for the user to inspect.

---

## Conservatism rule (the "what gets touched" guardrail)

Step 5's prompt embeds this rule verbatim:

> The wiki documents **high-level architecture only**. Mark a page `update` ONLY when the diff changes a fact at that abstraction level: the existence or role of a service, its tech stack or version pin, its ports, its public API surface, its cross-cutting infrastructure (db / auth / queue / storage / LLM clients), its top-level directory layout, its authentication or authorization model, its deployment target, or another fact the page already records at that altitude. Mark `skip` for: implementation refactors, internal renames, new private helpers, new tests, bug fixes that don't change the public contract, formatting / style changes, dependency bumps that don't move a documented version pin, and any change confined to function bodies. When in doubt, prefer `skip` — a wiki page that already reads correctly should not be rewritten. "No change" is a successful outcome.

Step 6 then re-confirms per page: if the page is silent on the area the diff touched, downgrade `update` to `skip` (recorded as `downgraded_to_skip` in the summary). Step 6 never invents new sections.

---

## State file (`docs/llm-wiki/.state.json`)

Single-repo shape:

```json
{
  "repos": { ".": "<sha>" },
  "last_refresh_at": "<iso>"
}
```

Multi-repo shape (one entry per child git repo):

```json
{
  "repos": {
    "cm-ai-api": "<sha>",
    "cm-delivery-tool": "<sha>"
  },
  "last_refresh_at": "<iso>"
}
```

State is bumped to current HEADs all-or-nothing on success. Any page-update failure aborts before phase 7, leaving state untouched so the next run retries from the same baseline.

---

## Integration with `/implement-ticket`

Phase 8.5 invokes the skill with all three flags:

```
/wiki-refresh --commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR
```

The skill is invoked AFTER Phase 8.4 (Implementation Commit), so the per-repo HEAD already contains the ticket's implementation. The skill produces its own follow-up commit on `docs/llm-wiki/**` when the wiki is git-tracked, or writes `$ARTIFACTS_DIR/wiki/wiki-warning.txt` for Phase 9 to embed in PR bodies otherwise.

Phase 8.5 STOPs `/implement-ticket` when the skill reports a hard error:

- `.state.json` missing → `/initialize-project` was never run.
- LLM JSON malformed after one retry.
- Page update failed (Edit error, file missing).
- `--commit` and the wiki repo's pre-commit hook failed.

"Potential new service detected" suggestions are advisory only — Phase 8.5 surfaces them in PR bodies; the user runs `/wiki-add-service <name>` separately.

---

## Failure modes (skill exit codes)

| Condition | Behavior |
|-----------|----------|
| `.state.json` missing | Exit non-zero with `wiki not initialized — run /initialize-project first`. |
| Malformed LLM JSON after one retry | Exit non-zero; print the malformed response. |
| Page update fails | Exit non-zero. `.state.json` NOT advanced — next run retries from the same baseline. |
| `--commit` and pre-commit hook fails | Exit non-zero; surface hook output. `.state.json` is left written so a manual `git commit` can finish the job. |

---

**See also**:
- `skills/020-development-workflow/wiki-refresh/SKILL.md` — full skill body (unified across both providers).
- [IMPLEMENT_TICKET.md](IMPLEMENT_TICKET.md) — where Phase 8.4 + 8.5 + 9 fit in the 14-phase workflow.
