---
name: wiki-refresh
version: 1.0.0
last-updated: 2026-04-24
description: Incrementally refreshes docs/llm-wiki/ after code changes. Use when user says "$wiki-refresh", "refresh wiki", "update wiki", or after merging a feature branch. Detects changed files via git diff, computes the minimum affected page set, regenerates those pages, and updates CHANGELOG.md and log.md.
argument-hint: '[--since <sha>] [--force] [--pages <globs>] [--dry-run]'
user-invokable: true
disable-model-invocation: true
---

# Wiki Refresh (Codex)

Input: $ARGUMENTS

Refresh the LLM wiki at `docs/llm-wiki/` based on code changes since the last indexed commit.

## Execution Model — Codex-specific

Codex does not spawn subagents programmatically. Execute this skill yourself by following the phases below and invoking the shell wrapper directly. The shell wrapper delegates to the TypeScript orchestration CLI which runs the LangGraph workflow.

## Flags

Parse the input for these flags:
- `--since <sha>` — refresh pages affected since this git commit (overrides .state.json)
- `--force` — full regeneration regardless of .state.json
- `--pages <globs>` — comma-separated glob patterns to restrict which pages are refreshed
- `--dry-run` — print the planned refresh set without writing any files

## Phase 1: Preflight

Verify the project is ready for wiki refresh:

1. Check that `docs/llm-wiki/` exists. If missing, tell the user to run `$initialize-project` first.
2. Check that `docs/llm-wiki/wiki/` exists and contains at least one `.md` file.
3. Check that `.code-graph.db` exists in the project root.
4. Check that `AGENTS.md` exists at `docs/llm-wiki/AGENTS.md` (Codex schema document).
5. If `.state.json` does not exist and `--since` was not passed, inform the user that a full-tree refresh will run.

## Phase 2: Invoke the Refresh Workflow

Run the refresh via the shell wrapper:

```bash
./ai-agentic-framework/scripts/refresh-wiki.sh \
  --project-path "$(pwd)" \
  --provider codex \
  [--since <sha>] \
  [--force] \
  [--pages "<globs>"] \
  [--dry-run]
```

Or, if the orchestration CLI is available directly:

```bash
pnpm --filter orchestration refresh-wiki \
  --project-path "$(pwd)" \
  --provider codex \
  [FLAGS...]
```

Pass through any flags the user provided.

On `--dry-run`, the workflow prints the planned refresh set and exits without writing files. Present the plan to the user and ask whether to proceed.

## Phase 3: Surface Lint Report

After the workflow completes:

1. Print a summary: pages refreshed, CHANGELOG.md entries added, log.md entries added.
2. If structural lint failures were reported, highlight them clearly and tell the user to fix them before committing.
3. If only semantic warnings were reported, surface them as advisory information.
4. If lint is clean, confirm the wiki is consistent.

## Phase 4: Leave Changes Uncommitted

The workflow writes updated files but does NOT commit them. Tell the user:

```
Wiki diffs are ready to review. Commit when satisfied:

  git diff docs/llm-wiki/
  git add docs/llm-wiki/
  git commit -m "docs(wiki): refresh for <context>"
```

Do NOT run `git commit` or `git push` on behalf of the user. Leave that to them or to the Phase 8.5 automation in `$implement-ticket`.

## Error Handling

- If the code graph update fails, warn the user and continue with a stale graph.
- If the agent invoker fails for a specific page, report which page failed and continue with the rest.
- If structural lint failures block the .state.json write, tell the user which violations need fixing.
