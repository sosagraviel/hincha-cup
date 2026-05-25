---
name: apply-pr-feedback
version: 1.0.0
last-updated: 2026-05-22
description: Applies GitHub PR review feedback to an existing branch. Use when a PR has a `CHANGES_REQUESTED` review and those changes must be pushed back to the same branch without opening a new PR. Scope-bounded: only addresses the requested feedback — never reimplements the ticket. Supports both single-repo projects and multi-repo workspaces (operating on one PR / one repo per invocation).
argument-hint: '--pr-number PR-NUMBER --branch BRANCH-NAME [--from-jira TICKET-ID] [--review-id REVIEW-ID] [--repo REPO-PATH] [--skip-tests]'
disable-model-invocation: true
---

# Apply PR Review Feedback

Input: $ARGUMENTS

Apply the requested changes from a GitHub PR review to the existing branch through a wiki-aware and graph-aware 7-phase workflow. The PR is updated by `git push` — this skill never opens a new PR and never posts comments to Jira or GitHub.

## Flags

Parse the input for these flags:

- `--pr-number <PR-NUMBER>` — the PR number on GitHub (required)
- `--branch <BRANCH-NAME>` — the existing branch the PR points at (required)
- `--from-jira <TICKET-ID>` — fetch ticket context from Jira (e.g., `PROJ-123`). Optional but recommended when the ticket id is not derivable from the branch name.
- `--review-id <REVIEW-ID>` — specific review id to apply. Optional; when omitted, the skill resolves the most recent review with state `CHANGES_REQUESTED`.
- `--repo <REPO-PATH>` — absolute path to the target git repo. Optional; defaults to the current working directory. Required when invoked from a multi-repo workspace root.
- `--skip-tests` — skip the testing phase (dev/experimental only)

The skill derives `TICKET_ID` in this order: `--from-jira` value → ticket id extracted from `--branch` (e.g., `feature/PROJ-123-foo` → `PROJ-123`) → fallback `PR-<PR-NUMBER>`. The derived id is used purely for artifact pathing; it does not change behavior.

## CRITICAL: Graph-Aware and Wiki-Aware Requirements

Both the graph path AND the LLM wiki must be active before Phase 2 starts. This skill is lighter than `/implement-ticket` (the planner does not run end-to-end) but it still consults the wiki when feedback touches architecture and may issue targeted graph queries when feedback flags risk in shared utilities.

- `code-review-graph` MUST be built and MCP-accessible. The framework uses `.code-review-graph/graph.db` as the compatibility graph DB.
- Project root `.mcp.json` MUST define `mcpServers.code_graph` so native Claude Code sessions can load graph tools.
- The active Claude Code session MUST expose `mcp__code_graph__*` tools. Agent frontmatter is only a subagent allowlist; it does not register the MCP server.
- The LLM wiki at `docs/llm-wiki/` MUST exist. `docs/llm-wiki/CLAUDE.md` MUST be present and the three core wiki documents (`index.md`, `ARCHITECTURE.md`, `SERVICES.md` under `docs/llm-wiki/wiki/`) MUST each contain YAML frontmatter with at least `document_type`, `summary`, and `last_updated`.

If any of the above is missing, STOP. Tell the user to rerun `/initialize-project` or resource sync so the graph DB, project `.mcp.json`, graph-aware agents, and `docs/llm-wiki/*` are regenerated. Then restart Claude Code in the project, approve the project MCP server if prompted, and verify `code_graph` with `/mcp` before retrying `/apply-pr-feedback`.

## CRITICAL: Artifact Path Enforcement

**ALL artifacts MUST be saved to the following deterministic structure:**

```
{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts/
```

**NEVER save artifacts to:**

- `{{CONFIG_DIR}}/artifacts/`
- `{{CONFIG_DIR}}/screenshots/`
- `{{CONFIG_DIR}}/decisions/`
- Any other location

When spawning agents or invoking skills, ALWAYS pass the `ARTIFACTS_DIR` variable:

```bash
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
export ARTIFACTS_DIR
```

The PR-specific work lands under `$ARTIFACTS_DIR/pr/<PR-NUMBER>/`. This keeps every review pass separate and reusable across iterations.

## Multi-Repository Awareness

The workspace may be a single git repo OR a parent folder containing multiple independent child git repos (each with its own GitHub remote). A single GitHub PR is always scoped to one repo, so this skill operates on one repo per invocation:

- In single-repo mode, omit `--repo`; the skill assumes the current working directory is the target repo.
- In multi-repo mode, pass `--repo <ABS-PATH>` pointing at the affected child repo. The skill targets that repo with `git -C <repo>` for every git operation and only re-runs tests inside that repo.

The LLM wiki and code graph remain workspace-scoped (one shared `docs/llm-wiki/` and `.code-review-graph/` at the workspace root). Phase 2 consults them; Phase 4 (testing) runs only in the affected repo.

## CRITICAL: Task Tracking Setup

BEFORE starting any phase work, you MUST create the full task list using `TaskCreate`. This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 7 tasks first, then set up dependencies, then begin Phase 0.

Create each task using `TaskCreate` with these exact values:

1. Phase 0: Preflight (Auto-bootstrap + Validation)
   subject: "Phase 0: Preflight (Auto-bootstrap + Validation)"
   activeForm: "Running deterministic preflight (auto-bootstrap + validation)"
   Steps: (a) Run `bash $FRAMEWORK_PATH/scripts/ensure-context.sh --artifacts-dir "$ARTIFACTS_DIR"` — auto-installs `uv`/`uvx`/`code-review-graph` if missing, builds or updates the graph, re-emits `.mcp.json`, and writes `$ARTIFACTS_DIR/.preflight-ok`. (b) If the script exits non-zero, STOP and surface its output verbatim. (c) Defensive double-check: working tree of the target repo is clean, `HEAD` matches `--branch`, `gh` CLI is authenticated, Jira MCP is available when `--from-jira` is used, `.code-review-graph/graph.db` exists, project root `.mcp.json` has `mcpServers.code_graph`, `mcp__code_graph__*` tools visible in this session, `docs/llm-wiki/CLAUDE.md` exists, `docs/llm-wiki/wiki/{index,ARCHITECTURE,SERVICES}.md` exist with valid YAML frontmatter.
   Expected outputs: `$ARTIFACTS_DIR/.preflight-ok` exists, git is clean in the target repo, current branch is `--branch`, tools available, graph DB present, MCP config present, graph tools visible, LLM wiki present and well-formed.
   Constraint: If `ensure-context.sh` exits non-zero, STOP and surface its output. If any defensive assertion fails despite a fresh marker, delete the marker, rerun `ensure-context.sh` once; if it still fails, STOP.

2. Phase 1: Context Reading
   subject: "Phase 1: Context Reading"
   activeForm: "Reading PR review context"
   Steps: Resolve `TICKET_ID` per the rule in the Flags section, fetch Jira context via `/fetch-ticket-context` when `--from-jira` is set, read PR via `gh pr view <PR-NUMBER> --json title,body,headRefName,baseRefName,reviews,reviewThreads,files,url`, resolve the target review (by `--review-id` if provided, otherwise the most recent `CHANGES_REQUESTED` review across `reviews`), fetch inline comments via `gh api repos/<owner>/<repo>/pulls/<PR-NUMBER>/reviews/<REVIEW-ID>/comments` (resolve `<owner>/<repo>` from `gh repo view --json nameWithOwner -q .nameWithOwner` inside the target repo), read the diff for files touched by the review, read any existing `docs/analysis/<TICKET_ID>.md` memo. Persist everything to `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md`.
   Expected outputs: `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` exists and includes ticket context (if any), PR metadata, the target review body, every inline comment with `path:line` and author, and the diff hunks for affected files.
   Constraint: If no `CHANGES_REQUESTED` review is found and `--review-id` was not provided, STOP and report `No actionable CHANGES_REQUESTED review on PR #<PR-NUMBER>`.

3. Phase 2: Planning
   subject: "Phase 2: Planning"
   activeForm: "Planning feedback changes"
   Steps: Read `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md`. Read `docs/llm-wiki/CLAUDE.md` (router) and `docs/llm-wiki/wiki/index.md` (index) to identify any wiki pages relevant to the files touched by the review; expand at most 2 page bodies. Targeted graph fallback only when the review touches a shared utility or public API surface: `mcp__code_graph__get_impact_radius_tool` (at most one call). Produce `$ARTIFACTS_DIR/pr/<PR-NUMBER>/feedback-plan.md` containing: (1) `Scope` — files and the specific comments each file addresses; (2) `Wiki Evidence` — wiki pages consulted (paths only) or `none`; (3) `Graph Evidence` — graph queries run or `none`; (4) `Out-of-scope rejections` — items in the review that the agent intentionally will NOT address, with reason (e.g. `redesigns the auth flow — outside this review's stated scope`). Forbidden: planning a reimplementation, rewriting unrelated code, importing changes not requested by the review.
   Expected outputs: `$ARTIFACTS_DIR/pr/<PR-NUMBER>/feedback-plan.md` exists with the four sections above; every planned change traces back to a specific inline comment or review body item.
   Constraint: STOP if any planned change cannot be traced to the resolved review. The skill never reopens scope unilaterally.

4. Phase 3: Implementation
   subject: "Phase 3: Implementation"
   activeForm: "Applying feedback changes"
   Steps: Apply only the changes listed in `feedback-plan.md`. Respect prior decisions recorded in `docs/analysis/<TICKET_ID>.md` (when present) that are still `Status: ACTIVE`. For non-trivial changes (more than 3 files OR any item flagged `risk: high` in the plan), spawn the planner-recommended implementer via `Task(subagent_type: "implementer-{lang}", prompt: ...)` using the plan path and the review-context path; otherwise apply changes inline. Do not modify files unrelated to the feedback. Append a `Historical Feedback And Decisions` entry to `docs/analysis/<TICKET_ID>.md` ONLY when that file already exists.
   Expected outputs: code changes applied; every modified file matches the plan; no unrelated diffs; if `implementer-{lang}` was spawned, its completion summary is captured under `$ARTIFACTS_DIR/pr/<PR-NUMBER>/implementer-summary.md`.
   Constraint: STOP if `git -C <repo> diff --name-only` shows a file outside the plan's `Scope`.

5. Phase 4: Testing
   subject: "Phase 4: Testing"
   activeForm: "Running tests"
   Steps: If `--skip-tests` is set, mark completed as "Skipped via flag". Otherwise resolve the test command from `framework-config.json::stack_profile.command_catalog` (prefer wrapper tier — `make`, `just`, `task`, `./scripts/`); fall back to auto-detected runner (Jest, Pytest, Vitest, Playwright) only if the catalog has no entry. Run the relevant suites for the files touched by Phase 3. If a test fails, fix it and re-run; max 3 fix iterations.
   Expected outputs: all relevant tests pass, OR phase correctly skipped via `--skip-tests`.
   Constraint: If tests still fail after 3 fix iterations, STOP and report. Do not proceed.

6. Phase 5: Quality
   subject: "Phase 5: Quality"
   activeForm: "Running quality checks"
   Steps: Resolve lint and format commands from `framework-config.json::stack_profile.command_catalog` (`run_lint`, `run_format`); fall back to auto-detected runner when the catalog has no entry. Run lint, apply trivial auto-fixes (`--fix` flag, format-on-save equivalent), then re-run lint to confirm a clean state.
   Expected outputs: no lint or format errors in the files touched by Phase 3.
   Constraint: None.

7. Phase 6: Commit and Push
   subject: "Phase 6: Commit and Push"
   activeForm: "Committing and pushing changes"
   Steps: Verify with `git -C <repo> status --porcelain` that no files outside the plan's `Scope` are modified. Stage only the planned files with `git -C <repo> add -- <files>` (never `git add .` / `-A` / `-a`). Commit with a message of the form `fix(<TICKET_ID>): address review #<REVIEW-ID> on PR #<PR-NUMBER>` and a body summarizing the comments addressed. Run `git -C <repo> push origin <branch>`. Do not skip hooks. Do not create a new PR. Do not post comments to Jira or GitHub.
   Expected outputs: one new commit on `<branch>` with the message format above; SHA recorded under `$ARTIFACTS_DIR/pr/<PR-NUMBER>/commits/<repo-basename>.sha`; branch successfully pushed to `origin`.
   Constraint: If a pre-commit hook fails, surface the output verbatim and STOP — never `--no-verify`. If `git push` fails with non-fast-forward, STOP and report; never `--force` without explicit user consent.

After creating all 7 tasks, use `TaskUpdate` to chain dependencies:

- Task 2 addBlockedBy [Task 1]
- Task 3 addBlockedBy [Task 2]
- Task 4 addBlockedBy [Task 3]
- Task 5 addBlockedBy [Task 4]
- Task 6 addBlockedBy [Task 5]
- Task 7 addBlockedBy [Task 6]

### Task Status Rules

- Use `TaskUpdate` to mark a task `in_progress` BEFORE starting any work on that phase.
- Use `TaskUpdate` to mark a task `completed` ONLY after verifying the Expected outputs listed above.
- NEVER mark a task completed if expected outputs are missing, required agents were not spawned, or errors occurred.
- If a phase is skipped via flag, mark it completed with description "Skipped via flag".

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase is marked completed. For each phase, follow the Steps and verify Expected outputs listed above.

**Preflight marker check (Phase 1 onward):** at the start of every phase from Phase 1, assert `test -f "$ARTIFACTS_DIR/.preflight-ok"` exits 0. If the marker is missing, return to Phase 0 and rerun the preflight.

### Phase 0: Preflight (MANDATORY — Auto-bootstrap + Validation)

This phase has two parts. **Part A (auto-bootstrap) is mandatory and runs first.** Part B (defensive double-check) verifies that the bootstrap succeeded.

**Part A — auto-bootstrap.** Set the environment and run the deterministic preflight:

```bash
REPO="${REPO:-$(pwd)}"   # set from --repo or default to cwd
PR_NUMBER="<from --pr-number>"
TICKET_ID="<resolved-id>"
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
mkdir -p "$ARTIFACTS_DIR/pr/$PR_NUMBER/commits"
bash "$FRAMEWORK_PATH/scripts/ensure-context.sh" --artifacts-dir "$ARTIFACTS_DIR"
```

If the script exits non-zero, STOP and surface its output verbatim. Failure marker `$ARTIFACTS_DIR/.preflight-failed` carries `{reason, git_head, ran_at}`.

**Part B — defensive double-check.** With the preflight marker present:

- `git -C "$REPO" status --porcelain` returns empty (working tree clean).
- `git -C "$REPO" rev-parse --abbrev-ref HEAD` equals `<--branch value>`. If not, STOP — never `git checkout`/`switch` on the user's behalf.
- `gh auth status` succeeds and `gh repo view --json nameWithOwner` resolves inside `$REPO`.
- If `--from-jira` was passed, Jira MCP is available.
- `.code-review-graph/graph.db` exists at the workspace root.
- Project root `.mcp.json` contains `mcpServers.code_graph`.
- `/mcp` shows `code_graph` connected or `mcp__code_graph__*` tools are visible in this session.
- `docs/llm-wiki/CLAUDE.md` and `docs/llm-wiki/wiki/{index,ARCHITECTURE,SERVICES}.md` exist and start with YAML frontmatter containing `document_type`, `summary`, and `last_updated`.

CRITICAL: If any Part B assertion fails despite a present `.preflight-ok` marker, treat the marker as stale: delete it and rerun Part A. If the assertion still fails after a fresh Part A, STOP and report the inconsistency.

CONTINUE WITH Phase 1.

### Phase 1: Context Reading

Produce a single canonical artifact at `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` so every later phase reads from one path.

- Resolve `TICKET_ID` per the Flags rule and confirm it.
- If `--from-jira <TICKET-ID>`: MUST invoke `/fetch-ticket-context` (the skill writes the ticket body to `$ARTIFACTS_DIR/context/ticket-context.md` — reference that path from `review-context.md`, do not duplicate the body).
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
- Read the diff of files referenced by the review:
  ```bash
  git -C "$REPO" diff origin/$(jq -r .baseRefName < "$ARTIFACTS_DIR/pr/$PR_NUMBER/pr.json")...HEAD -- <touched-files>
  ```
- If `docs/analysis/<TICKET_ID>.md` exists, read it into context.
- Write `$ARTIFACTS_DIR/pr/<PR-NUMBER>/review-context.md` with sections: `## Ticket Context` (path reference), `## PR Metadata` (url, title, headRefName, baseRefName), `## Target Review` (review id, author, state, body), `## Inline Comments` (each with `path:line — author: body`), `## Affected Files Diff`, `## Existing Analysis Memo` (path reference if present).

CRITICAL: If no `CHANGES_REQUESTED` review exists and `--review-id` was not provided, STOP. Report `No actionable CHANGES_REQUESTED review on PR #<PR-NUMBER>`.

CONTINUE WITH Phase 2.

### Phase 2: Planning

Produce `$ARTIFACTS_DIR/pr/<PR-NUMBER>/feedback-plan.md` with `Scope`, `Wiki Evidence`, `Graph Evidence`, and `Out-of-scope rejections` sections.

- Read `review-context.md`.
- Read `docs/llm-wiki/CLAUDE.md` (router) and `docs/llm-wiki/wiki/index.md`. Match the files affected by the review against the index to identify the 0–2 most relevant pages; read their bodies only if a comment touches architecture or a documented contract. Cite paths under `Wiki Evidence`.
- Targeted graph fallback: when a comment asks to change a shared utility, a public API, or a function with many callers, call `mcp__code_graph__get_impact_radius_tool` ONCE with lean defaults (`detail_level: "minimal"`, `limit: 20`, `include_members: false`, `include_source: false`). `mcp__code_graph__get_architecture_overview_tool` is forbidden. Cite results under `Graph Evidence`.
- For every planned change, link it to a specific inline comment or to the review body. Items the review raised but that the agent intentionally will not act on go under `Out-of-scope rejections` with a one-line reason.

CRITICAL: Do not plan a reimplementation. Do not plan changes outside the scope of the review feedback. Do not import unrelated cleanup. If a comment is ambiguous and a load-bearing decision depends on its meaning, use `AskUserQuestion` rather than guessing.

CONTINUE WITH Phase 3.

### Phase 3: Implementation

- Apply only the changes planned in Phase 2.
- Respect prior decisions recorded in `docs/analysis/<TICKET_ID>.md` that are still `Status: ACTIVE`.
- For non-trivial changes (more than 3 files OR any item flagged `risk: high` in the plan), spawn the implementer:
  ```
  Task(
    subagent_type: "implementer-{lang}",   // picked from project's primary stack
    prompt: <short brief naming review-context.md path and feedback-plan.md path>
  )
  ```
  The implementer reads the plan and review context, applies the changes, and emits a completion summary captured to `$ARTIFACTS_DIR/pr/<PR-NUMBER>/implementer-summary.md`.
- For trivial changes (≤3 files, no `risk: high`), apply inline using `Edit`/`Write`.
- If `docs/analysis/<TICKET_ID>.md` exists, append a new entry to the `Historical Feedback And Decisions` section recording the review id, date, summary of feedback, and the resolution. Do NOT create that file if it does not already exist.

CRITICAL: Do not modify files unrelated to the feedback. After implementation, run `git -C "$REPO" diff --name-only` and verify every modified path appears in the plan's `Scope`. If a file outside scope was touched, STOP and report.

CONTINUE WITH Phase 4.

### Phase 4: Testing

If `--skip-tests` flag: mark completed as "Skipped via flag" and continue.

Otherwise:

- **Resolve the test command from `framework-config.json::stack_profile.command_catalog`** — look up `run_tests`, `run_unit_tests`, `run_integration_tests`, `run_e2e`. The first entry of each operation array is the highest-tier candidate (wrapper → readme → package_manager → ci). Prefer the wrapper (`make tests`, `just test`, `task test`, `./scripts/test.sh`) over per-service package-manager commands when both exist.
- Only fall back to auto-detection (Jest, Pytest, Playwright, Vitest) when the catalog has NO entry for the relevant operation.
- Run the suites that cover the files touched by Phase 3. A full-suite run is optional; targeted runs are preferred for review fixes.

If tests fail: re-spawn the implementer with the failing output OR fix inline if trivial. Max 3 fix iterations.

CRITICAL: If tests still fail after 3 iterations, STOP. Report failure. Do not continue.

CONTINUE WITH Phase 5.

### Phase 5: Quality

- Resolve lint and format commands from `framework-config.json::stack_profile.command_catalog` (`run_lint`, `run_format`). Fall back to auto-detection only if the catalog has no entry.
- Run lint; apply trivial auto-fixes (`--fix`, format-on-save equivalent).
- Re-run lint to confirm a clean state.

CONTINUE WITH Phase 6.

### Phase 6: Commit and Push

- Verify with `git -C "$REPO" status --porcelain` that no files outside the plan's `Scope` are modified. If a stray file appears, STOP and report — never silently commit it.
- Stage planned files only:
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

CRITICAL:

- If a pre-commit hook fails, surface output verbatim and STOP. The commit did not happen — investigate the hook failure rather than retrying with `--no-verify`.
- If `git push` fails with non-fast-forward, STOP and report. Do NOT `--force` without explicit user consent.

## Error Handling

If a phase fails:

- Do NOT mark the task as completed.
- Report which phase failed and why.
- Phase 0 failure: stop immediately.
- Phase 1 failure (no `CHANGES_REQUESTED` review found and no `--review-id`): stop and report.
- Phase 2 failure (cannot derive a scoped plan from the review): stop and report.
- Phase 3 failure (stray file modifications detected): stop and report; user must clean the working tree before retrying.
- Phase 4 failure after 3 fix iterations: stop and report.
- Phase 6 failure (pre-commit hook, non-fast-forward push): stop and report — never bypass.
- Other phases: attempt to recover once, then stop if still failing.

## Skills and Agents Used

- `/fetch-ticket-context` — Phase 1 (Jira tickets only).
- `mcp__code_graph__get_impact_radius_tool` — Phase 2 (at most one call, only when the review touches shared utilities or public APIs).
- `implementer-{lang}` agent — Phase 3 and Phase 4 (fixes); only for non-trivial changes. Picked from the project's primary stack (`implementer-typescript` / `implementer-python` / `implementer-generic`).

## Prerequisites

- Project initialized with `/initialize-project`.
- `code-review-graph` built and MCP-accessible.
- `.code-review-graph/graph.db` exists at the workspace root.
- Project root `.mcp.json` defines `mcpServers.code_graph`.
- Claude Code has been restarted after MCP config changes and `/mcp` shows `code_graph` connected.
- LLM wiki exists at `docs/llm-wiki/` with `docs/llm-wiki/CLAUDE.md` present and the three core wiki documents well-formed.
- Git: the target repo is on `--branch` with a clean working tree, and `origin` is reachable.
- `gh` CLI installed and authenticated against the target GitHub remote.
- For `--from-jira`: Jira MCP configured.
- A review with state `CHANGES_REQUESTED` exists on PR `--pr-number`, or a specific `--review-id` is passed.
