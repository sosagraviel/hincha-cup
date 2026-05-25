---
name: apply-pr-feedback
version: 1.0.0
last-updated: 2026-05-22
description: Applies GitHub PR review feedback to an existing branch through a wiki-aware and graph-aware 7-phase workflow. Use when a PR has a `CHANGES_REQUESTED` review and those changes must be pushed back to the same branch without opening a new PR. Scope-bounded: only addresses the requested feedback — never reimplements the ticket. Supports single-repo projects and multi-repo workspaces (one PR / one repo per invocation).
argument-hint: '--pr-number PR-NUMBER --branch BRANCH-NAME [--from-jira TICKET-ID] [--review-id REVIEW-ID] [--repo REPO-PATH] [--skip-tests]'
disable-model-invocation: true
---

# Apply PR Review Feedback (Codex)

Input: $ARGUMENTS

Apply the requested changes from a GitHub PR review to the existing branch through a wiki-aware and graph-aware 7-phase workflow. The PR is updated by `git push` — this skill never opens a new PR and never posts comments to Jira or GitHub.

## Execution Model — Codex-specific

**Codex does not spawn subagents programmatically.** You (the agent running this skill) execute every phase yourself, switching your operating persona by loading the corresponding role prompt from `{{CONFIG_DIR}}/agents/`:

- Implementation phase (Phase 3, and Phase 4 fixes): when the change is non-trivial (more than 3 files OR any item flagged `risk: high` in the plan), read `{{CONFIG_DIR}}/agents/<recommended-implementer>.md` — pick the file matching the project's primary stack (`implementer-typescript.md`, `implementer-python.md`, or `implementer-generic.md`) and follow it as your active role.

When a phase below says "apply the implementer role prompt", treat it as: read that file, internalise the instructions, and produce the artifact it specifies. Do not try to spawn it as a separate process. For trivial changes, apply edits directly without loading a role prompt.

## Flags

Parse the input for these flags:

- `--pr-number <PR-NUMBER>` — the PR number on GitHub (required).
- `--branch <BRANCH-NAME>` — the existing branch the PR points at (required).
- `--from-jira <TICKET-ID>` — fetch ticket context from Jira (e.g., `PROJ-123`). Optional but recommended when the ticket id is not derivable from the branch name.
- `--review-id <REVIEW-ID>` — specific review id to apply. Optional; when omitted, the skill resolves the most recent review with state `CHANGES_REQUESTED`.
- `--repo <REPO-PATH>` — absolute path to the target git repo. Optional; defaults to the current working directory. Required when invoked from a multi-repo workspace root.
- `--skip-tests` — skip the testing phase (dev/experimental only).

The skill derives `TICKET_ID` in this order: `--from-jira` value → ticket id extracted from `--branch` (e.g., `feature/PROJ-123-foo` → `PROJ-123`) → fallback `PR-<PR-NUMBER>`. The derived id is used purely for artifact pathing; it does not change behavior.

## CRITICAL: Graph-Aware and Wiki-Aware Requirements

Both the graph path AND the LLM wiki must be active before Phase 2 starts. This skill is lighter than `/implement-ticket` (the planner does not run end-to-end) but it still consults the wiki when feedback touches architecture and may issue targeted graph queries when feedback flags risk in shared utilities.

- `code-review-graph` MUST be built and MCP-accessible.
- This framework uses `.code-review-graph/graph.db` as the compatibility graph DB.
- The active Codex session MUST expose `mcp__code_graph__*` tools (register the `code_graph` MCP server in your Codex MCP settings and reload the session).
- The LLM wiki at `docs/llm-wiki/` MUST exist. `docs/llm-wiki/AGENTS.md` MUST be present (enforces that initialization ran for this provider). The three core wiki documents (`index.md`, `ARCHITECTURE.md`, `SERVICES.md` under `docs/llm-wiki/wiki/`) MUST each contain YAML frontmatter with at least `document_type`, `summary`, and `last_updated`.

If the graph DB, graph MCP tools, or the LLM wiki are missing, emit `failed` and STOP. Tell the user to rerun `/initialize-project` or resource sync so `.code-review-graph/graph.db`, `{{CONFIG_DIR}}/agents/*`, and `docs/llm-wiki/*` are regenerated, then restart Codex so the `code_graph` MCP server reconnects and `mcp__code_graph__*` tools become visible before retrying `/apply-pr-feedback`.

## CRITICAL: Artifact Path Enforcement

**ALL artifacts MUST be saved under:**

```
{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts/
```

**NEVER save artifacts to:**

- `{{CONFIG_DIR}}/artifacts/`
- `{{CONFIG_DIR}}/screenshots/`
- `{{CONFIG_DIR}}/decisions/`
- Any other location

Set and export the variable once at the start:

```bash
REPO="${REPO:-$(pwd)}"   # set from --repo or default to cwd
PR_NUMBER="<from --pr-number>"
TICKET_ID="<resolved-id>"
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
mkdir -p "$ARTIFACTS_DIR/pr/$PR_NUMBER/commits"
export ARTIFACTS_DIR
```

PR-specific work lands under `$ARTIFACTS_DIR/pr/<PR-NUMBER>/`. This keeps every review pass separate and reusable across iterations.

## Multi-Repository Awareness

The workspace may be a single git repo OR a parent folder containing multiple independent child git repos (each with its own GitHub remote). A single GitHub PR is always scoped to one repo, so this skill operates on one repo per invocation:

- In single-repo mode, omit `--repo`; the skill assumes the current working directory is the target repo.
- In multi-repo mode, pass `--repo <ABS-PATH>` pointing at the affected child repo. The skill targets that repo with `git -C <repo>` for every git operation and only re-runs tests inside that repo.

The LLM wiki and code graph remain workspace-scoped (one shared `docs/llm-wiki/` and `.code-review-graph/` at the workspace root).

## Progress Tracking (file-based)

Codex has no `TaskCreate` tool. Track phase progress by appending JSONL events to a progress file so state survives restarts and is observable from outside the session:

```
PROGRESS_FILE="{{TEMP_DIR}}/tickets/$TICKET_ID/progress.jsonl"
mkdir -p "$(dirname "$PROGRESS_FILE")"
```

Append one JSON record per phase transition, on its own line:

```json
{"phase": 2, "name": "Planning", "status": "in_progress", "ts": "<iso8601>"}
{"phase": 2, "name": "Planning", "status": "completed", "ts": "<iso8601>"}
```

Rules:

- Emit an `in_progress` record BEFORE starting each phase (phases 0, 1, 2, 3, 4, 5, 6).
- Emit a `completed` record ONLY after verifying the Expected outputs for that phase.
- For a phase skipped via flag, emit `{"phase": N, "status": "completed", "note": "Skipped via flag", "ts": "..."}`.
- Emit `{"phase": N, "status": "failed", "reason": "<why>", "ts": "..."}` and STOP if a Constraint is violated.
- Use this file (not memory) to decide whether a phase has been completed when resuming.

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase has emitted a `completed` record. For each phase: perform the Steps, verify the Expected outputs, then mark completed.

**Preflight marker check (Phase 1 onward):** at the start of every phase from Phase 1, assert `test -f "$ARTIFACTS_DIR/.preflight-ok"` exits 0. If the marker is missing, emit `failed` for that phase and return to Phase 0.

### Phase 0: Preflight (MANDATORY — Auto-bootstrap + Validation)

This phase has two parts. **Part A (auto-bootstrap) is mandatory and runs first.** Part B (defensive double-check) verifies that the bootstrap succeeded.

**Part A — auto-bootstrap.** Run the deterministic preflight before doing anything else:

```bash
bash "$FRAMEWORK_PATH/scripts/ensure-context.sh" --artifacts-dir "$ARTIFACTS_DIR"
```

What the script does (handled automatically):

- Auto-installs `uv` / `uvx` / `code-review-graph` via the framework's existing fallback chain.
- Builds the code graph if missing, incrementally updates it if the local commit moved, or no-ops if already at HEAD.
- Re-emits `.codex/config.toml`'s `[mcp_servers.code_graph]` block with this machine's local framework path. Compare-then-write — no-op when content already matches.
- Writes `$ARTIFACTS_DIR/.preflight-ok` carrying `{git_head, graph_sha, provider, preflight_ran_at}`.

**If the script exits non-zero, emit `failed` and STOP.** Surface its output verbatim. Failure marker `$ARTIFACTS_DIR/.preflight-failed` carries `{reason, git_head, ran_at}`.

**Part B — defensive double-check.**

Steps:

- `git -C "$REPO" status --porcelain` returns empty (working tree clean).
- `git -C "$REPO" rev-parse --abbrev-ref HEAD` equals `<--branch value>`. If not, emit `failed` and STOP — never `git checkout`/`switch` on the user's behalf.
- `gh auth status` succeeds and `(cd "$REPO" && gh repo view --json nameWithOwner)` resolves.
- If `--from-jira` was passed, Jira MCP is available.
- `.code-review-graph/graph.db` exists at the workspace root.
- The active Codex session exposes `mcp__code_graph__*` tools.
- `docs/llm-wiki/AGENTS.md` exists (confirms initialization ran for the Codex provider).
- `docs/llm-wiki/wiki/{index,ARCHITECTURE,SERVICES}.md` exist with YAML frontmatter containing `document_type`, `summary`, and `last_updated`.

Expected outputs: `$ARTIFACTS_DIR/.preflight-ok` exists; git is clean in the target repo; current branch matches `--branch`; tools available; graph DB present; graph MCP tools visible; LLM wiki present and well-formed.

Constraint: If `ensure-context.sh` exits non-zero, emit `failed` and STOP. If any defensive assertion fails despite a fresh marker, delete the marker and rerun Part A once; if it still fails, emit `failed` and STOP.

### Phase 1: Context Reading

Produce a single canonical artifact at `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` so every later phase reads from one path.

Steps:

- Resolve `TICKET_ID` per the Flags rule and confirm it.
- If `--from-jira <TICKET-ID>`: invoke `/fetch-ticket-context` (the skill writes the ticket body to `$ARTIFACTS_DIR/context/ticket-context.md` — reference that path from `review-context.md`, do not duplicate the body).
- Fetch PR metadata:
  ```bash
  REPO_SLUG=$(cd "$REPO" && gh repo view --json nameWithOwner -q .nameWithOwner)
  gh -R "$REPO_SLUG" pr view "$PR_NUMBER" \
    --json title,body,headRefName,baseRefName,reviews,reviewThreads,files,url \
    > "$ARTIFACTS_DIR/pr/$PR_NUMBER/pr.json"
  ```
- Resolve the target review:
  - If `--review-id` was provided, use that id.
  - Otherwise, pick the most recent review whose `state == "CHANGES_REQUESTED"` from `pr.json.reviews`.
- Fetch the review's inline comments:
  ```bash
  gh api --paginate "repos/$REPO_SLUG/pulls/$PR_NUMBER/reviews/$REVIEW_ID/comments" \
    > "$ARTIFACTS_DIR/pr/$PR_NUMBER/inline-comments.json"
  ```
- Read the diff of files referenced by the review against the PR's base branch.
- If `docs/analysis/<TICKET_ID>.md` exists, read it into context.
- Write `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` with sections: `## Ticket Context` (path reference), `## PR Metadata` (url, title, headRefName, baseRefName), `## Target Review` (review id, author, state, body), `## Inline Comments` (each with `path:line — author: body`), `## Affected Files Diff`, `## Existing Analysis Memo` (path reference if present).

Expected outputs: `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` exists and contains the sections above; `pr.json` and `inline-comments.json` saved next to it.

Constraint: If no `CHANGES_REQUESTED` review exists and `--review-id` was not provided, emit `failed` and STOP with `No actionable CHANGES_REQUESTED review on PR #<PR-NUMBER>`. This phase does NOT plan changes — Phase 2 owns that.

### Phase 2: Planning

Produce `$ARTIFACTS_DIR/pr/<PR-NUMBER>/feedback-plan.md` with `Scope`, `Wiki Evidence`, `Graph Evidence`, and `Out-of-scope rejections` sections.

Steps:

1. Read `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md`.
2. Read `docs/llm-wiki/AGENTS.md` (router for the Codex provider) and `docs/llm-wiki/wiki/index.md`. Match the files affected by the review against the index to identify the 0–2 most relevant pages; read their bodies only if a comment touches architecture or a documented contract. Cite paths under `Wiki Evidence`.
3. Targeted graph fallback: when a comment asks to change a shared utility, a public API, or a function with many callers, call `mcp__code_graph__get_impact_radius_tool` ONCE with lean defaults (`detail_level: "minimal"`, `limit: 20`, `include_members: false`, `include_source: false`). `mcp__code_graph__get_architecture_overview_tool` is forbidden — response cannot be bounded; follow the graph navigation discipline in `<project>/.codex/AGENTS.md`. Cite results under `Graph Evidence`.
4. For every planned change, link it to a specific inline comment or to the review body. Items the review raised but that the agent intentionally will not act on go under `Out-of-scope rejections` with a one-line reason.

Expected outputs: `$ARTIFACTS_DIR/pr/<PR-NUMBER>/feedback-plan.md` exists and contains `Scope`, `Wiki Evidence`, `Graph Evidence`, `Out-of-scope rejections`; every planned change traces back to a specific inline comment or review body item.

Constraint: Do not plan a reimplementation. Do not plan changes outside the scope of the review feedback. Do not import unrelated cleanup. If a comment is ambiguous and a load-bearing decision depends on its meaning, ask the user rather than guessing.

### Phase 3: Implementation

Steps:

- Apply only the changes planned in Phase 2.
- Respect prior decisions recorded in `docs/analysis/<TICKET_ID>.md` that are still `Status: ACTIVE`.
- Routing:
  - **Non-trivial** (more than 3 files OR any item flagged `risk: high` in the plan): apply the implementer role prompt by reading `{{CONFIG_DIR}}/agents/<recommended-implementer>.md` (`implementer-typescript.md` / `implementer-python.md` / `implementer-generic.md`). Internalise the role and produce the edits per the plan. Capture the completion summary at `$ARTIFACTS_DIR/pr/<PR-NUMBER>/implementer-summary.md`.
  - **Trivial** (≤3 files, no `risk: high`): apply edits directly without loading a role prompt.
- Hard rules — re-call ban:
  - Do NOT re-read full wiki page bodies whose relevant excerpts are already inlined in the plan's `Wiki Evidence` section.
  - Do NOT re-run any graph query the plan already documents in `Graph Evidence`. Reuse those findings.
- Follow project conventions from `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}`.
- If `docs/analysis/<TICKET_ID>.md` exists, append a new entry to its `Historical Feedback And Decisions` section recording the review id, date, summary of feedback, and the resolution. Do NOT create that file if it does not already exist.

Expected outputs: code changes applied; every modified file matches the plan; no unrelated diffs; when the implementer role was applied, `$ARTIFACTS_DIR/pr/<PR-NUMBER>/implementer-summary.md` exists.

Constraint: After implementation, run `git -C "$REPO" diff --name-only` and verify every modified path appears in the plan's `Scope`. If a file outside scope was touched, emit `failed` and STOP.

### Phase 4: Testing

If `--skip-tests` flag: emit `completed` with `note: "Skipped via flag"` and continue.

Otherwise:

- **Resolve the test command from `framework-config.json::stack_profile.command_catalog`** — look up `run_tests`, `run_unit_tests`, `run_integration_tests`, `run_e2e`. The first entry of each operation array is the highest-tier candidate (wrapper → readme → package_manager → ci). Prefer the wrapper (`make tests`, `just test`, `task test`, `./scripts/test.sh`) over per-service package-manager commands when both exist — wrappers orchestrate dependent services that raw `pnpm test` / `npm test` / `pytest` invocations may silently skip.
- Only fall back to auto-detection (Jest, Pytest, Vitest, Playwright) when the catalog has NO entry for the relevant operation.
- Run the suites that cover the files touched by Phase 3. A full-suite run is optional; targeted runs are preferred for review fixes.

If tests fail: re-apply the implementer role prompt with the failing test output and fix, OR fix inline if trivial. Max 3 fix iterations.

Expected outputs: all relevant tests pass, OR phase correctly skipped via `--skip-tests`.

Constraint: If tests still fail after 3 iterations, emit `failed` and STOP.

### Phase 5: Quality

Steps:

- Resolve lint and format commands from `framework-config.json::stack_profile.command_catalog` (`run_lint`, `run_format`). Fall back to auto-detection only when the catalog has no entry.
- Run lint; apply trivial auto-fixes (`--fix`, format-on-save equivalent).
- Re-run lint to confirm a clean state.

Expected outputs: no lint or format errors in the files touched by Phase 3.

Constraint: None.

### Phase 6: Commit and Push

Steps:

- Verify with `git -C "$REPO" status --porcelain` that no files outside the plan's `Scope` are modified. If a stray file appears, emit `failed` and STOP — never silently commit it.
- Stage only the planned files:
  ```bash
  git -C "$REPO" add -- <file1> <file2> ...
  ```
  Never `git add .` / `-A` / `-a`.
- Commit:
  ```bash
  git -C "$REPO" commit -m "fix($TICKET_ID): address review #$REVIEW_ID on PR #$PR_NUMBER" \
    -m "$(cat <<'EOF'
  - <comment 1 summary>
  - <comment 2 summary>
  EOF
  )"
  ```
  Do not skip hooks (`--no-verify` is forbidden).
- Record the new SHA:
  ```bash
  git -C "$REPO" rev-parse HEAD > "$ARTIFACTS_DIR/pr/$PR_NUMBER/commits/$(basename "$REPO").sha"
  ```
- Push:
  ```bash
  git -C "$REPO" push origin "$BRANCH"
  ```
  The PR is updated automatically by the push. Never create a new PR. Never post comments to Jira or GitHub.

Expected outputs: one new commit on `<branch>` with the message format above; SHA recorded under `$ARTIFACTS_DIR/pr/<PR-NUMBER>/commits/<repo-basename>.sha`; branch successfully pushed to `origin`.

Constraint: If a pre-commit hook fails, surface output verbatim and emit `failed` — never `--no-verify`. The commit did not happen; investigate the hook failure rather than retrying. If `git push` fails with non-fast-forward, emit `failed` and STOP — never `--force` without explicit user consent.

## Error Handling

If a phase fails:

- Emit a `failed` record to `$PROGRESS_FILE` with a `reason`.
- Do NOT mark the phase as completed.
- Report which phase failed and why.
- Phase 0 failure: stop immediately.
- Phase 1 failure (no `CHANGES_REQUESTED` review found and no `--review-id`): stop and report.
- Phase 2 failure (cannot derive a scoped plan from the review): stop and report.
- Phase 3 failure (stray file modifications detected): stop and report; user must clean the working tree before retrying.
- Phase 4 failure after 3 fix iterations: stop and report.
- Phase 6 failure (pre-commit hook, non-fast-forward push): stop and report — never bypass.
- Other phases: attempt to recover once, then stop if still failing.

## Skills and Role Prompts Used

- `/fetch-ticket-context` — Phase 1 (Jira tickets only).
- `mcp__code_graph__get_impact_radius_tool` — Phase 2 (at most one call, only when the review touches shared utilities or public APIs).
- `implementer-<stack>` role prompt — Phase 3 and Phase 4 (fixes); applied only for non-trivial changes. Picked from the project's primary stack (`implementer-typescript` / `implementer-python` / `implementer-generic`).

## Prerequisites

- Project initialized with `/initialize-project`.
- `code-review-graph` built and MCP-accessible.
- `.code-review-graph/graph.db` exists at the workspace root.
- Codex session has the `code_graph` MCP server registered and `mcp__code_graph__*` tools visible.
- LLM wiki exists at `docs/llm-wiki/` with `docs/llm-wiki/AGENTS.md` present and the three core wiki documents well-formed.
- Git: the target repo is on `--branch` with a clean working tree, and `origin` is reachable.
- `gh` CLI installed and authenticated against the target GitHub remote.
- For `--from-jira`: Jira MCP configured.
- A review with state `CHANGES_REQUESTED` exists on PR `--pr-number`, or a specific `--review-id` is passed.
