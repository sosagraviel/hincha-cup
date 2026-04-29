---
name: implement-ticket
version: 3.4.0
last-updated: 2026-04-24
description: Implements a ticket end-to-end through a wiki-aware and graph-aware 13-phase workflow from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
disable-model-invocation: true
---

# Implement Ticket (Codex)

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 13-phase SDLC workflow.

## Execution Model — Codex-specific

**Codex does not spawn subagents programmatically.** You (the agent running this skill) execute every phase yourself, switching your operating persona by loading the corresponding role prompt from `{{CONFIG_DIR}}/agents/`:

- Planning phase (Phase 3): read `{{CONFIG_DIR}}/agents/planner.md` and follow its instructions as your active role.
- Implementation phase (Phase 5): read `{{CONFIG_DIR}}/agents/<recommended-implementer>.md` — pick the file from the planner's `Recommended Implementer` section (`implementer-typescript.md`, `implementer-python.md`, or `implementer-generic.md`). A missing recommendation is a Phase 3 Constraint violation and should already have aborted the run.
- Visual verification (Phase 7): read `{{CONFIG_DIR}}/agents/visual-verifier.md` and follow it.

When a phase below says "apply the planner role prompt", treat it as: read that file, internalise the instructions, and produce the artifact it specifies. Do not try to spawn it as a separate process.

## Flags

Parse the input for these flags:
- `--from-input "description"` — implement from plain text description
- `--from-jira <TICKET-ID>` — implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` — implement from markdown SDD ticket
- `--skip-tests` — skip testing phase
- `--skip-visual` — skip visual verification phase
- `--skip-pr` — skip PR creation (commit only)

## CRITICAL: Graph-Aware and Wiki-Aware Requirements

Both the graph path AND the LLM wiki must be active.

- `code-review-graph` MUST be built and MCP-accessible before planning starts.
- This framework uses `.code-review-graph/graph.db` as the compatibility graph DB. Upstream `code-review-graph` defaults to `.code-review-graph/graph.db`.
- The active Codex session MUST expose `mcp__code_graph__*` tools (register the `code_graph` MCP server in your Codex MCP settings and reload the session).
- The LLM wiki at `docs/llm-wiki/` MUST exist. Specifically `docs/llm-wiki/AGENTS.md` MUST be present (enforces that initialization ran for this provider). The five core wiki documents MUST be present under `docs/llm-wiki/wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`. Each MUST contain YAML frontmatter with at least `document_type` and `graph_version` keys. Phase 8.5 (Wiki Refresh) automatically updates this wiki at the end of every ticket — if the preflight warns about staleness, the refresh will fix it.

If the graph DB, graph MCP tools, or the LLM wiki are missing, STOP immediately. Tell the user to rerun `/initialize-project` or resource sync so `.code-review-graph/graph.db`, `{{CONFIG_DIR}}/agents/*`, and `docs/llm-wiki/*` are regenerated, then restart Codex so the `code_graph` MCP server reconnects and `mcp__code_graph__*` tools become visible before retrying `/implement-ticket`.

## CRITICAL: Artifact Path Enforcement

**ALL artifacts MUST be saved under:**

```
{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts/
```

**NEVER save artifacts to:**
- `{{CONFIG_DIR}}/artifacts/`
- `{{CONFIG_DIR}}/screenshots/`
- `{{CONFIG_DIR}}/decisions/`
- `orchestration/artifacts/`
- Any other location

Set and export the variable once at the start:
```bash
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
mkdir -p "$ARTIFACTS_DIR/context" "$ARTIFACTS_DIR/plans"
export ARTIFACTS_DIR
```

This keeps artifacts out of PRs (already covered by `.gitignore`), keeps paths consistent, and avoids polluting version control.

## Progress Tracking (file-based)

Codex has no `TaskCreate` tool. Track phase progress by appending JSONL events to a progress file so state survives restarts and is observable from outside the session:

```
PROGRESS_FILE="{{TEMP_DIR}}/tickets/$TICKET_ID/progress.jsonl"
mkdir -p "$(dirname "$PROGRESS_FILE")"
```

Append one JSON record per phase transition, on its own line:
```json
{"phase": 3, "name": "Planning", "status": "in_progress", "ts": "<iso8601>"}
{"phase": 3, "name": "Planning", "status": "completed", "ts": "<iso8601>"}
```

Rules:
- Emit an `in_progress` record BEFORE starting each phase (phases 0 through 8.5 through 11).
- Emit a `completed` record ONLY after verifying the Expected outputs for that phase.
- For a phase skipped via flag, emit `{"phase": N, "status": "completed", "note": "Skipped via flag", "ts": "..."}`.
- Emit `{"phase": N, "status": "failed", "reason": "<why>", "ts": "..."}` and STOP if a Constraint is violated.
- Use this file (not memory) to decide whether a phase has been completed when resuming.

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase has emitted a `completed` record. For each phase: perform the Steps, verify the Expected outputs, then mark completed.

### Phase 0: Preflight Validation

Steps:
- Check git status (no uncommitted changes).
- Verify tests pass in current state.
- Validate build succeeds.
- Detect primary language and stack from `{{CONFIG_DIR}}/framework-config.json`.
- Verify `.code-review-graph/graph.db` exists at the project root.
- Verify the active Codex session exposes `mcp__code_graph__*` tools.
- Verify `docs/llm-wiki/AGENTS.md` exists (confirms initialization ran for the Codex provider).
- Verify `docs/llm-wiki/wiki/` exists and contains all five core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`.
- Verify each of those five wiki files starts with YAML frontmatter containing `document_type`, `graph_version`, and `graph_commit` keys. Compute `sha256(.code-review-graph/graph.db)`; if any page's `graph_version` does not match, WARN the user and suggest `/wiki-refresh`. Compute `git rev-parse HEAD`; if any page's `graph_commit` is behind HEAD, WARN and suggest `/wiki-refresh --since <graph_commit>`. Do not block the workflow on stale wiki — Phase 8.5 refreshes it. But the user should see one clear warning line before planning begins.
- If `framework-config.json > wiki.services` is non-empty, verify at least one matching file exists under `docs/llm-wiki/wiki/services/`.

Expected outputs: git clean, tests pass, build succeeds, graph DB exists, graph MCP tools are visible, LLM wiki is present and well-formed; staleness warnings surfaced if applicable.

Constraint: If any structural check fails, emit `failed` and STOP. Do not continue. Staleness warnings (graph_version or graph_commit mismatch) do NOT count as failures — Phase 8.5 will resolve them automatically.

For graph or wiki failures, tell the user to rerun `/initialize-project` or resource sync so `.code-review-graph/graph.db`, `{{CONFIG_DIR}}/agents/*`, and `docs/llm-wiki/*` are regenerated. Then restart Codex and confirm `mcp__code_graph__*` tools are visible before retrying.

### Phase 1: Context Gathering

Steps:
- If `--from-jira`: invoke `/fetch-ticket-context` to gather Jira/Confluence context.
- If `--from-markdown`: read the SDD ticket file.
- If `--from-input`: use the description directly.
- Extract requirements and acceptance criteria.
- Persist to `$ARTIFACTS_DIR/context/ticket-context.md`.

Expected outputs: `$ARTIFACTS_DIR/context/ticket-context.md` exists and contains requirements and acceptance criteria.

Constraint: Do not proceed if requirements could not be extracted.

### Phase 2: Wiki Context Preload

Preload the LLM wiki so the planner can rely on pre-digested architecture instead of rediscovering it via graph queries. The wiki ships its own runtime router; defer to it instead of hard-coding a frontmatter walk. Do ALL of the following in order:

1. **Read the router.** Open `docs/llm-wiki/AGENTS.md` (the wiki's runtime router for the Codex provider, ≤150 lines). Its decision table tells you which page to consult for which question — architecture, a specific service, request lifecycles, testing/conventions, or "I don't know which page".

2. **Read the index.** Open `docs/llm-wiki/wiki/index.md` — the summary catalog. One line per page with summary / document_type / confidence / tags / related inline. This is Tier 1: a single read of `index.md` carries the same information today's frontmatter walk used to gather across N files.

3. **Pick 1–3 pages and expand them.** Match the ticket summary against the index entries; identify the 1–3 most relevant pages. Read their full bodies (cap 5 — the index summary is sufficient for everything else). Always include `index.md`'s body. **Confidence-aware:** prefer `confidence: high` pages; if only `confidence: low` matches, expand them but tag extracted facts as `confidence: low`. Stop wikilink traversal at depth 2.

4. **Optional graph call.** If the matched bodies do not fully answer the planner's likely questions, call `mcp__code_graph__get_minimal_context_tool({ task: "<ticket summary>", changed_files: [], base: "HEAD~1" })` AT MOST ONCE. Preserve the full response — the planner in Phase 3 may reuse it. The call MUST NOT be re-issued by any downstream phase.

   **Follow the graph navigation discipline.** When the planner or implementer falls back to graph MCP tools, follow the canonical rules in `<project>/.codex/AGENTS.md`, section *Graph navigation discipline*. Summary: start with `mcp__code_graph__get_minimal_context_tool`; never call `mcp__code_graph__get_architecture_overview_tool` (forbidden — response cannot be bounded); set `detail_level: "minimal"`, `limit: 20` MAX, `include_members: false`, `include_source: false` everywhere they apply.

5. **Persist.** Write `$ARTIFACTS_DIR/context/wiki-context.md` with these sections:
   - `## ROUTER` — the path to the router file (`docs/llm-wiki/AGENTS.md`)
   - `## WIKI_INDEX_SNAPSHOT` — the content of `index.md`
   - `## WIKI_CORE` — the 1–3 expanded page paths and their full bodies
   - `## get_minimal_context_tool Payload` — the full preserved response, only when step 4 ran

Expected outputs: `$ARTIFACTS_DIR/context/wiki-context.md` exists and contains `## ROUTER`, `## WIKI_INDEX_SNAPSHOT`, `## WIKI_CORE`, and (when step 4 ran) `## get_minimal_context_tool Payload`.

Constraint: Do not proceed if `wiki-context.md` is missing or the router could not be loaded. Step 4 is optional — skip it when the matched pages already answer the planner's likely questions. The graph call (when made) MUST NOT be re-issued by later phases.

### Phase 3: Planning

Apply the planner role prompt: read `{{CONFIG_DIR}}/agents/planner.md` and follow it as your active persona. Feed it:
- The ticket context from `$ARTIFACTS_DIR/context/ticket-context.md`.
- The wiki context from `$ARTIFACTS_DIR/context/wiki-context.md` (`WIKI_INDEX_SNAPSHOT`, `WIKI_CORE`, and the optional `get_minimal_context_tool` payload when present).

Reminder: use the wikis to plan, use `mcp__code_graph` tools to verify impacts and explore intelligently; do not re-run `get_minimal_context_tool` (already in `wiki-context.md`).

Produce an `Implementation Plan` containing:
- Implementation strategy.
- Files to create/modify.
- Test strategy.
- `Wiki Evidence` (cite the wiki paths actually consulted).
- `Graph Evidence` (cite the graph queries and results that justify the plan).
- `Recommended Implementer` section naming exactly one of `implementer-typescript` | `implementer-python` | `implementer-generic` with rationale.

Persist the plan verbatim to `$ARTIFACTS_DIR/plans/implementation-plan.md`.

Expected outputs: `$ARTIFACTS_DIR/plans/implementation-plan.md` exists, contains `Wiki Evidence` and `Graph Evidence`, test strategy and target files are named, and contains a `Recommended Implementer` section naming exactly one of `implementer-typescript` | `implementer-python` | `implementer-generic`.

Constraint: Do not proceed if the plan is missing, Wiki Evidence or Graph Evidence is absent, or `Recommended Implementer` is missing.

### Phase 4: Environment Setup

Steps:
- Create feature branch (e.g., `feature/PROJ-123-description`).
- Allocate service ports (if needed).
- Create docker-compose override (if needed).
- Capture BEFORE screenshots into `$ARTIFACTS_DIR/screenshots/before/` (if frontend).

Expected outputs: feature branch created and checked out.

Constraint: None.

### Phase 5: Implementation

Apply the implementer role prompt: read `{{CONFIG_DIR}}/agents/<recommended-implementer>.md` where `<recommended-implementer>` is the value from the planner's `Recommended Implementer` section (`implementer-typescript`, `implementer-python`, or `implementer-generic`).

Feed the role prompt:
- The plan from `$ARTIFACTS_DIR/plans/implementation-plan.md`.
- The wiki context from `$ARTIFACTS_DIR/context/wiki-context.md`.

Reminder: consult the cited `WIKI_CORE` pages (including any service docs already matched by the wiki router) for conventions; use `mcp__code_graph` to verify impacts before touching anything the plan flags high-risk; reuse the plan's `Graph Evidence` — do not re-run those queries.

- Follow project conventions from `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}`.
- Create/modify files exactly as listed in the plan.

Expected outputs: code changes exist, new files created as planned; completion summary lists wiki pages consulted and any fresh graph checks; completion summary contains a `## Wiki Delta Hints` JSONL fenced block (may be empty, but section must be present).

Constraint: Do not proceed if no code changes exist, or if the plan's Wiki Evidence / Graph Evidence were not consumed, or if the implementer did not emit a parseable Wiki Delta Hints block.

### Phase 6: Testing

If `--skip-tests` flag: emit `completed` with `note: "Skipped via flag"` and continue.

Otherwise:
- Auto-detect testing framework (Jest, Pytest, Playwright).
- Run unit tests with coverage.
- Run integration tests.
- Run E2E tests (if applicable).
- Collect coverage reports into `$ARTIFACTS_DIR/coverage/`.

If tests fail: re-apply the implementer role prompt with the failing test output and fix. Max 3 fix iterations.

Expected outputs: all tests pass and coverage reports collected, OR phase correctly skipped via `--skip-tests`.

Constraint: If tests still fail after 3 iterations, emit `failed` and STOP.

### Phase 7: Visual Verification

If no frontend changes OR `--skip-visual` flag: emit `completed` with `note: "Skipped via flag"` and continue.

Otherwise:
- Take screenshots of affected pages into `$ARTIFACTS_DIR/screenshots/after/`.
- Compare before/after with pixelmatch; write diff to `$ARTIFACTS_DIR/screenshots/diff/`.
- If any page has diff > 5%: apply the visual-verifier role prompt (`{{CONFIG_DIR}}/agents/visual-verifier.md`) on the diff images; act on its findings.

Expected outputs: screenshots compared OR phase correctly skipped.

Constraint: None.

### Phase 8: Documentation Update

Invoke `/doc-updater` skill. Do not skip this even if you think no docs need updating.

- Analyze changed files for doc impact.
- Apply the maintenance test (update only if truly needed).
- Update `{{INSTRUCTION_FILE}}` and project-context surgically if needed.

Expected outputs: doc-updater ran and produced an analysis.

Constraint: Do not proceed if doc-updater was not invoked.

### Phase 8.5: Wiki Refresh

CRITICAL: invoke `/wiki-refresh --since <branch-base>` (plus `--hints` if available) where `<branch-base>` is the merge-base with the target branch (`development` by default). This updates only the pages implicated by the diff (and by implementer hints) and runs `/wiki-lint` at the end.

- Extract the Wiki Delta Hints JSONL from the implementer's completion summary. The summary is expected at `$ARTIFACTS_DIR/implementation/<ticket-id>-completion.md`. If the file does not exist or the `## Wiki Delta Hints` section is absent, fall back to diff-only refresh.
- If hints exist, write them to `$ARTIFACTS_DIR/wiki/hints.jsonl` (create the `wiki/` subdirectory under `$ARTIFACTS_DIR` if needed).
- Compute `<branch-base>` via `git merge-base HEAD origin/development` (fall back to `git merge-base HEAD origin/main` if `development` does not exist).
- Invoke the `/wiki-refresh` skill:
  - With hints: `/wiki-refresh --since <branch-base> --hints $ARTIFACTS_DIR/wiki/hints.jsonl`
  - Without hints: `/wiki-refresh --since <branch-base>`
- If `/wiki-refresh` reports structural lint violations, STOP and report. Do NOT create the PR until the user resolves them.
- If `/wiki-refresh` reports only warnings, continue and surface them in the PR body.
- If the refresh produced no changes (no pages in the refresh set), do nothing and continue to Phase 9.
- If the refresh produced changes, commit them with a Conventional Commit message: `docs(wiki): refresh for <TICKET-ID>` using the same author as the implementation commit. Stage only `docs/llm-wiki/**` paths — do not sweep other changes into this commit.

Expected outputs: wiki-refresh invocation completed, lint report collected, `docs/llm-wiki/**` changes either committed or confirmed empty.

Constraint: Do not proceed if structural lint failures are unresolved. A wiki commit is optional only when no pages changed.

### Phase 9: PR Creation

- BEFORE Phase 9 starts: confirm Phase 8.5 marked completed (wiki refreshed or confirmed unchanged). If structural lint failures from 8.5 are unresolved, emit `failed` and STOP.

If `--skip-pr` flag: commit all changes locally with a structured commit message, skip push and PR creation, emit `completed` with `note: "Skipped via flag"` and continue.

Otherwise:
- Commit all changes with a structured commit message.
- Push feature branch to remote.
- Create pull request with:
  - Auto-generated title from ticket.
  - Summary of changes.
  - Test plan checklist.
  - Link to original ticket.
- Return the PR URL.

Expected outputs: commit exists, branch pushed, PR created with URL; OR commit exists locally and PR was skipped via `--skip-pr`.

Constraint: Do not proceed if PR was not created, unless `--skip-pr` was set (in which case a local commit is sufficient).

### Phase 10: Review Loop

Steps:
- Run `/pr-reviewer` skill on the created PR.
- Run `/security-review` skill on the diff.
- If blocking issues are found:
  - Re-apply the implementer role prompt (`{{CONFIG_DIR}}/agents/<recommended-implementer>.md`) with the review findings.
  - Re-run tests (Phase 6 logic).
  - Re-run the reviews.
  - Max 3 iterations.
- Exit when approved or max iterations reached.

Expected outputs: pr-reviewer and security-review ran; no blocking issues remain, or fixes were attempted up to the limit.

Constraint: If max iterations reached with unresolved issues, record them in the PR body and proceed to cleanup.

### Phase 11: Cleanup

Steps:
- Remove docker-compose override (if created).
- Archive artifacts (`tar` the `$ARTIFACTS_DIR` into `{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts.tar.gz`).
- Run `aggregate-metrics` CLI to produce `<ARTIFACTS_DIR>/metrics/summary.md`; include the summary path in the final report.
- Print the final summary report.

Expected outputs: cleanup done, summary printed.

Constraint: None. Final phase.

## Error Handling

If a phase fails:
- Emit a `failed` record to `$PROGRESS_FILE` with a `reason`.
- Do NOT mark the phase as completed.
- Report which phase failed and why.
- If Phase 0 fails: stop immediately.
- If graph DB, graph MCP tools, or the LLM wiki (`docs/llm-wiki/*`) are unavailable: stop immediately and instruct the user to rerun `/initialize-project` or resource sync, restart Codex, and verify `mcp__code_graph__*` tools are visible.
- If Phase 2 fails (wiki preload): stop and report. Do not fall back to a graph-only path — the planner depends on the wiki context artifact.
- If Phase 6 fails after 3 iterations: stop and report.
- For other phases: attempt to recover once, then stop if still failing.

## Skills and Role Prompts Used

- `/fetch-ticket-context` — Phase 1 (Jira tickets only).
- `mcp__code_graph__get_minimal_context_tool` — Phase 2 (called exactly once; result reused by the planner).
- `planner` role prompt — Phase 3 sole `Implementation Plan` author, Wiki Evidence and Graph Evidence owner, `Recommended Implementer` selector.
- `implementer-<stack>` role prompt — Phase 5, Phase 6 (fixes), Phase 10 (fixes); consumes the plan's Wiki + Graph evidence before any fresh discovery.
- `visual-verifier` role prompt — Phase 7.
- `/doc-updater` — Phase 8.
- `/wiki-refresh` — Phase 8.5 (auto-invoked with `--since <branch-base>`; commits wiki diff if any pages changed).
- `/pr-reviewer` — Phase 10.
- `/security-review` — Phase 10.
- `aggregate-metrics` CLI — Phase 11 (final metrics summary).

## Prerequisites

- Project initialized with `/initialize-project`.
- `code-review-graph` built and MCP-accessible.
- `.code-review-graph/graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`).
- Codex session has the `code_graph` MCP server registered and `mcp__code_graph__*` tools visible.
- LLM wiki exists at `docs/llm-wiki/` with `docs/llm-wiki/AGENTS.md` present.
- Git repository with remote configured and `origin/development` or `origin/main` reachable (required for Phase 8.5 merge-base computation).
- Tests passing in current state.
- For `--from-jira`: Jira MCP configured.
- For GitHub PR: GitHub MCP or `gh` CLI configured.
