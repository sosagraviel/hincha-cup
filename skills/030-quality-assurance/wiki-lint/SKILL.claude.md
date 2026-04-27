---
name: wiki-lint
version: 1.0.0
last-updated: 2026-04-24
description: Runs structural and semantic lint checks over docs/llm-wiki/wiki/. Use when user says "/wiki-lint", "lint wiki", "check wiki", or before committing wiki changes. Structural failures (broken links, dead sources, missing frontmatter) exit non-zero. Semantic warnings (orphans, stale claims, contradictions) are advisory.
argument-hint: '[--skip-semantic] [--changed-pages <paths>] [--artifacts-dir <path>]'
user-invokable: true
disable-model-invocation: true
---

# Wiki Lint

Input: $ARGUMENTS

Run structural and semantic lint checks over the LLM wiki at `docs/llm-wiki/wiki/`.

## Flags

Parse the input for these flags:
- `--skip-semantic` — skip semantic (warn-only) checks; structural checks always run
- `--changed-pages <paths>` — comma-separated wiki page paths for contradiction checks
- `--artifacts-dir <path>` — directory for lint report output (JSON + Markdown)

## Phase 1: Preflight

Verify the project is ready for wiki lint:

1. Check that `docs/llm-wiki/` exists. If missing, tell the user to run `/initialize-project` first.
2. Check that `docs/llm-wiki/wiki/` exists and contains at least one `.md` file. If missing, the lint service will report zero pages scanned (not an error).
3. Check that `CLAUDE.md` exists at `docs/llm-wiki/CLAUDE.md` (Claude schema document).

## Phase 2: Invoke the Lint CLI

Run the lint check via the shell wrapper:

```bash
./ai-agentic-framework/scripts/lint-wiki.sh \
  --project-path "$(pwd)" \
  [--skip-semantic] \
  [--changed-pages "<paths>"] \
  [--artifacts-dir "<path>"]
```

Or, if the orchestration CLI is available directly:

```bash
pnpm --filter orchestration lint-wiki \
  --project-path "$(pwd)" \
  [FLAGS...]
```

Pass through any flags the user provided.

## Phase 3: Print Summary

After the CLI completes, the tool prints one summary line to stdout:

```
X structural failures, Y semantic warnings, Z pages scanned
```

Present this to the user. Then:

1. If there are **structural failures**, list each one clearly with the rule name, page path, and message.
2. If there are only **semantic warnings**, surface them as advisory information — they do not block commits.
3. If both are zero, confirm the wiki is consistent.

## Phase 4: Remediation Hint

If there were structural failures:

```
One or more structural checks failed. Suggested remediation:
- Run /wiki-refresh to regenerate pages with correct frontmatter, updated links,
  and current sources[].
- Fix any manually-authored wikilinks that point to deleted or renamed pages.
- After fixing, re-run /wiki-lint to confirm the violations are resolved.
```

If the wiki is clean, no further action is needed.

## Error Handling

- If `docs/llm-wiki/wiki/` does not exist, the lint service scans zero pages and returns a clean report. Inform the user the wiki directory is empty.
- If the graph DB is absent, graph-version and graph-commit mismatch checks are skipped. This is not an error.
- If the MCP server is unreachable, the dispatch-blind check is skipped with a single warning in the stats. This is expected in offline environments.
- If the contradiction LLM call fails (e.g. Claude CLI not available), that check is skipped silently for each page pair. Only available when `claude` CLI is on PATH.
