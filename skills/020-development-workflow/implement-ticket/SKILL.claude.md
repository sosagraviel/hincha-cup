---
name: implement-ticket
version: 3.5.0
last-updated: 2026-04-29
description: Implements a ticket end-to-end through 13-phase workflow from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
disable-model-invocation: true
---

# Implement Ticket

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 13-phase SDLC workflow.

## Flags

Parse the input for these flags:
- `--from-input "description"` - implement from plain text description
- `--from-jira <TICKET-ID>` - implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` - implement from markdown SDD ticket
- `--skip-tests` - skip testing phase
- `--skip-visual` - skip visual verification phase
- `--skip-pr` - skip PR creation (commit only)

## CRITICAL: Graph-Aware and Wiki-Aware Requirements

Both the graph path AND the LLM wiki must be active.

- `code-review-graph` MUST be built and MCP-accessible before planning starts.
- This framework uses `.code-review-graph/graph.db` as the compatibility graph DB. Upstream `code-review-graph` defaults to `.code-review-graph/graph.db`.
- Project root `.mcp.json` MUST define `mcpServers.code_graph` so native Claude Code `/implement-ticket` sessions can load graph tools.
- Generated `.claude/agents/planner.md` and `.claude/agents/implementer-*.md` MUST expose exact `mcp__code_graph__*_tool` entries, not only the broad `mcp__code_graph` server alias.
- The actual active Claude Code session MUST expose `mcp__code_graph__*` tools. Agent frontmatter is only a subagent allowlist; it does not register the MCP server.
- The LLM wiki at `docs/llm-wiki/` MUST exist. Specifically `docs/llm-wiki/CLAUDE.md` MUST be present (enforces that initialization ran for this provider). The five core wiki documents MUST be present under `docs/llm-wiki/wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`. Each MUST contain YAML frontmatter with at least `document_type` and `graph_version` keys. Phase 8.5 (Wiki Refresh) automatically updates this wiki at the end of every ticket — if the preflight warns about staleness, the refresh will fix it.

If the graph DB, MCP config, graph-aware agents, active graph tools, or the LLM wiki are missing, STOP immediately. Tell the user to rerun `/initialize-project` or resource sync so `.code-review-graph/graph.db`, project `.mcp.json`, graph-aware `.claude/agents/*`, and `docs/llm-wiki/*` are regenerated. Then restart Claude Code in the project, approve the project MCP server if prompted, and verify `code_graph` with `/mcp` before using `/implement-ticket`.

## CRITICAL: Artifact Path Enforcement

**ALL artifacts MUST be saved to the following deterministic structure:**

```
{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts/
```

**NEVER save artifacts to:**
- `{{CONFIG_DIR}}/artifacts/`
- `{{CONFIG_DIR}}/screenshots/`
- `{{CONFIG_DIR}}/decisions/`
- `orchestration/artifacts/`
- Any other location

When spawning agents or invoking skills, ALWAYS pass the ARTIFACTS_DIR variable:
```bash
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
export ARTIFACTS_DIR
```

This ensures:
- Artifacts are excluded from PRs (via `.gitignore`)
- Consistent paths across all workflows
- No artifact pollution in version control

## CRITICAL: Task Tracking Setup

BEFORE starting any phase work, you MUST create the full task list using TaskCreate. This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 13 tasks first, then set up dependencies, then begin Phase 0.

Create each task using TaskCreate with these exact values:

1. Phase 0: Preflight (Auto-bootstrap + Validation)
   subject: "Phase 0: Preflight (Auto-bootstrap + Validation)"
   activeForm: "Running deterministic preflight (auto-bootstrap + validation)"
   Steps: (a) Run `bash $FRAMEWORK_PATH/scripts/ensure-context.sh --artifacts-dir "$ARTIFACTS_DIR"` — this auto-installs `uv`/`uvx`/`code-review-graph` if missing, builds or updates the graph, refreshes the wiki if stale, re-emits `.mcp.json`, and writes a success marker `$ARTIFACTS_DIR/.preflight-ok`. <3 s on the hot path. (b) If the script exits non-zero, STOP and surface its output verbatim — failure marker `$ARTIFACTS_DIR/.preflight-failed` carries `{reason, git_head, ran_at}`. (c) Defensive double-check: check git status, verify test commands work, verify build succeeds, detect primary language and stack, assert `.code-review-graph/graph.db`, assert `.mcp.json` has `mcpServers.code_graph`, verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools, assert `docs/llm-wiki/CLAUDE.md`, assert `docs/llm-wiki/wiki/{index,ARCHITECTURE,SERVICES,DATA-FLOWS,PATTERNS}.md` exist, assert at least one `docs/llm-wiki/wiki/services/*.md` exists, check `graph_version` + `graph_commit` freshness in each wiki file and WARN (not fail) if stale.
   Expected outputs: `$ARTIFACTS_DIR/.preflight-ok` exists and carries the current `git_head`, git is clean, tests pass, build succeeds, graph DB exists, project MCP config exists, graph tools are visible in the active Claude Code session, graph-aware agents are present, LLM wiki is present and well-formed; staleness warnings surfaced if applicable
   Constraint: If `ensure-context.sh` exits non-zero, STOP and surface its output. If any defensive assertion fails despite a fresh marker, delete the marker and rerun `ensure-context.sh` once; if it still fails, STOP. Staleness warnings do not block Phase 1 — Phase 8.5 resolves them automatically.

2. Phase 1: Context Gathering
   subject: "Phase 1: Context Gathering"
   activeForm: "Gathering ticket context"
   Steps: Fetch from source (Jira/Markdown/Input), extract requirements and acceptance criteria, save context to artifacts directory
   Expected outputs: context and requirements extracted and available for Phase 2
   Constraint: Do not proceed if requirements could not be extracted.

3. Phase 2: Wiki Context Preload
   subject: "Phase 2: Wiki Context Preload"
   activeForm: "Preloading LLM wiki context via the wiki router"
   Steps: (1) Read `docs/llm-wiki/CLAUDE.md` — the wiki's runtime router (≤150 lines, decision table tells which page to consult for which question); (2) Read `docs/llm-wiki/wiki/index.md` — the summary catalog with one line per page and summary / document_type / confidence / tags / related inline. Match the ticket summary against the index entries and pick the 1–3 most relevant pages; (3) Read full bodies for those pages (cap 5 — the index entry summary is sufficient for everything else). Stop wikilink traversal at depth 2; (4) Optional: if the matched bodies do not fully answer the planner's likely questions, call `mcp__code_graph__get_minimal_context_tool({ task: "<ticket summary>", changed_files: [], base: "HEAD~1" })` AT MOST ONCE and preserve the full response — the planner in Phase 3 may reuse it; (5) Persist `$ARTIFACTS_DIR/context/wiki-context.md` with sections `## ROUTER` (router file path), `## WIKI_INDEX_SNAPSHOT` (the index.md content), `## WIKI_CORE` (the 1–3 expanded page paths and bodies), and `## get_minimal_context_tool Payload` (only when step 4 ran).
   Expected outputs: `$ARTIFACTS_DIR/context/wiki-context.md` exists and contains `## ROUTER`, `## WIKI_INDEX_SNAPSHOT`, `## WIKI_CORE`, and (when step 4 ran) `## get_minimal_context_tool Payload`
   Constraint: Do not proceed if `wiki-context.md` is missing or the wiki router could not be loaded. Step 4 is optional — skip it when the matched pages already answer the planner's likely questions. When step 4 runs, the call MUST NOT be re-issued by later phases.

4. Phase 3: Planning
   subject: "Phase 3: Planning"
   activeForm: "Creating implementation plan"
   Steps: MUST spawn planner agent, planner consumes the ticket context from Phase 1 and the Phase 2 wiki context (`WIKI_INDEX_SNAPSHOT`, `WIKI_CORE`, and the optional `get_minimal_context_tool` payload when present), planner returns the only Phase 3 planning artifact named `Implementation Plan`, parent/main agent persists that returned plan under the normal artifact path, planner includes implementation strategy/files to create or modify/test strategy/Wiki Evidence/Graph Evidence in that artifact, planner emits a `Recommended Implementer` section naming exactly one of `implementer-typescript` | `implementer-python` | `implementer-generic` with rationale
   Expected outputs: planner agent was spawned with the Phase 2 wiki context injected, parent/main agent saved the planner-authored `Implementation Plan` as the only Phase 3 planning artifact, Wiki Evidence exists and cites the wiki paths actually used, Graph Evidence exists, test strategy defined, files to create/modify identified, `Recommended Implementer` present in the plan naming one of `implementer-typescript` | `implementer-python` | `implementer-generic`
   Constraint: Do not proceed if planner agent was not spawned, Wiki Evidence or Graph Evidence is absent, the planner-authored `Implementation Plan` does not exist, Phase 3 produced competing planning artifacts, or `Recommended Implementer` is missing.

5. Phase 4: Environment Setup
   subject: "Phase 4: Environment Setup"
   activeForm: "Setting up environment"
   Steps: Create feature branch, allocate ports (if needed), create docker-compose override (if needed), set up environment variables, capture BEFORE screenshots (if frontend)
   Expected outputs: feature branch created and checked out
   Constraint: None.

6. Phase 5: Implementation
   subject: "Phase 5: Implementation"
   activeForm: "Implementing code changes"
   Steps: MUST spawn graph-aware implementer-{lang} agent with the planner-authored `Implementation Plan` from Phase 3, pass the same `WIKI_CORE` page paths the planner cited (including any service docs the wiki router already matched) plus the plan's `Wiki Evidence` and `Graph Evidence`, implementer absorbs those artifacts before any fresh discovery, implementer runs targeted graph checks only for high-risk edits flagged by the plan, implements code following the plan, follows project conventions from {{INSTRUCTION_FILE}}, creates/modifies files as needed, includes wiki pages consulted and any fresh graph queries in the final implementation summary, implementer MUST end its completion summary with a `## Wiki Delta Hints` JSONL fenced block (see implementer template); the block may be empty if no wiki impact, but the section MUST be present
   Expected outputs: graph-aware implementer agent was spawned, implementer confirmed it consumed the plan's Wiki Evidence and Graph Evidence, code changes exist, new files created as planned, completion summary contains a parseable `## Wiki Delta Hints` JSONL block
   Constraint: Do not proceed if implementer agent was not spawned, the plan's Wiki Evidence / Graph Evidence were not consumed, no code changes exist, or the implementer did not emit a parseable Wiki Delta Hints block.

7. Phase 6: Testing
   subject: "Phase 6: Testing"
   activeForm: "Running tests"
   Steps: If `--skip-tests` flag is set mark completed as "Skipped via flag" and proceed, otherwise auto-detect testing framework, run unit tests with coverage, run integration tests, run E2E tests (if applicable), collect coverage reports, if tests fail spawn implementer to fix (max 3 iterations)
   Expected outputs: all tests pass and coverage reports collected, OR phase correctly skipped via `--skip-tests`
   Constraint: If tests fail after 3 fix iterations, STOP and report failure. Do not proceed.

8. Phase 7: Visual Verification
   subject: "Phase 7: Visual Verification"
   activeForm: "Verifying visual changes"
   Steps: If no frontend changes or `--skip-visual` flag mark completed as "Skipped via flag" and proceed, otherwise take screenshots, compare with pixelmatch, if diff > 5% MUST spawn visual-verifier agent
   Expected outputs: screenshots compared OR phase correctly skipped
   Constraint: None.

9. Phase 8: Documentation Update
   subject: "Phase 8: Documentation Update"
   activeForm: "Updating documentation"
   Steps: MUST invoke /doc-updater skill, analyze changed files for doc impact, apply maintenance test, update {{INSTRUCTION_FILE}} and the relevant convention skill (`code-conventions` / `multi-file-workflows` / `testing-conventions`) if needed
   Expected outputs: doc-updater skill was invoked and analysis completed
   Constraint: Do not proceed if doc-updater was not invoked.

10. Phase 8.5: Wiki Refresh
    subject: "Phase 8.5: Wiki Refresh"
    activeForm: "Refreshing LLM wiki"
    Steps: Extract the Wiki Delta Hints JSONL from the implementer's completion summary saved at `$ARTIFACTS_DIR/implementation/<ticket-id>-completion.md` (or wherever the implementer's completion summary was saved). If the implementer's completion summary is not available on disk, fall back to git-diff-only refresh. If hints exist, write them to `$ARTIFACTS_DIR/wiki/hints.jsonl`. Compute branch-base via `git merge-base HEAD origin/development` (fall back to `git merge-base HEAD origin/main`). Invoke `/wiki-refresh --since <branch-base>` and append `--hints $ARTIFACTS_DIR/wiki/hints.jsonl` if the hints file exists. Surface the lint report. If structural failures STOP. Otherwise commit `docs/llm-wiki/**` changes with Conventional Commit message `docs(wiki): refresh for <TICKET-ID>`.
    Expected outputs: wiki-refresh invocation completed, lint report collected, docs/llm-wiki/** changes either committed or confirmed empty.
    Constraint: Do not proceed if structural lint failures are unresolved. A wiki commit is optional only when no pages changed.

11. Phase 9: PR Creation
    subject: "Phase 9: PR Creation"
    activeForm: "Creating pull request"
    Steps: If `--skip-pr` flag is set commit all changes locally and mark completed as "Skipped via flag" (no push, no PR), otherwise commit all changes, push feature branch, create pull request with title/summary/test plan/ticket link, return PR URL
    Expected outputs: commit exists and branch pushed and PR created with URL, OR commit exists locally and PR was skipped via `--skip-pr`
    Constraint: Do not proceed if PR was not created, unless `--skip-pr` was set in which case a local commit is sufficient.

12. Phase 10: Review Loop
    subject: "Phase 10: Review Loop"
    activeForm: "Running review loop"
    Steps: Run PR review via /pr-reviewer skill, run security review via /security-review skill, if blocking issues spawn implementer for fixes and re-run tests, max 3 iterations
    Expected outputs: PR review ran, security review ran, either no blocking issues or fixes applied
    Constraint: If max iterations reached with unresolved issues, report and proceed to cleanup.

13. Phase 11: Cleanup
    subject: "Phase 11: Cleanup"
    activeForm: "Cleaning up environment"
    Steps: Remove docker-compose override (if created), archive artifacts, print final summary report
    Expected outputs: cleanup done, summary printed
    Constraint: None. This is the final phase.

After creating all 13 tasks, use TaskUpdate to chain dependencies:
- Task 2 addBlockedBy [Task 1]
- Task 3 addBlockedBy [Task 2]
- Task 4 addBlockedBy [Task 3]
- Task 5 addBlockedBy [Task 4]
- Task 6 addBlockedBy [Task 5]
- Task 7 addBlockedBy [Task 6]
- Task 8 addBlockedBy [Task 7]
- Task 9 addBlockedBy [Task 8]
- Task 10 addBlockedBy [Task 9]
- Task 11 addBlockedBy [Task 10]
- Task 12 addBlockedBy [Task 11]
- Task 13 addBlockedBy [Task 12]

### Task Status Rules

- Use TaskUpdate to mark a task `in_progress` BEFORE starting any work on that phase
- Use TaskUpdate to mark a task `completed` ONLY after verifying the Expected outputs listed above
- NEVER mark a task completed if expected outputs are missing, required agents were not spawned, or errors occurred
- If a phase is skipped via flag: mark it completed with description "Skipped via flag"

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase is marked completed. For each phase, follow the Steps and verify Expected outputs listed above.

**Preflight marker check (Phase 1 onward):** at the start of every phase from Phase 1, assert `test -f "$ARTIFACTS_DIR/.preflight-ok"` exits 0. If the marker is missing, return to Phase 0 and rerun the preflight. The marker contains the `git_head` at preflight time — subsequent phases trust it as the authoritative graph + wiki freshness signal.

### Phase 0: Preflight (MANDATORY — Auto-bootstrap + Validation)

This phase has two parts. **Part A (auto-bootstrap) is mandatory and runs first.** Part B (defensive double-check) is a belt-and-suspenders verification that the bootstrap succeeded.

**Part A — auto-bootstrap.** Run the deterministic preflight before doing anything else in this phase:

```bash
ARTIFACTS_DIR="{{TEMP_DIR}}/tickets/$TICKET_ID/artifacts"
bash "$FRAMEWORK_PATH/scripts/ensure-context.sh" --artifacts-dir "$ARTIFACTS_DIR"
```

What the script does (handled automatically; you do not need to do any of this manually):

- Auto-installs `uv` / `uvx` / `code-review-graph` via the framework's existing fallback chain (`uv tool install` → `bootstrap_uv` → `pipx` → `pip`).
- Builds the code graph if missing, incrementally updates it if the local commit moved, or no-ops if it is already at HEAD (<3 s on the hot path).
- Re-emits `.mcp.json` with `mcpServers.code_graph` pointed at this machine's local framework path. Compare-then-write — no-op when content already matches.
- Refreshes the LLM wiki if `graph_sha` or `last_indexed_commit` drift is detected.
- Writes a JSON success marker at `$ARTIFACTS_DIR/.preflight-ok` carrying `{git_head, graph_sha, wiki_*, provider, preflight_ran_at}`.

**If the script exits non-zero, STOP.** Surface its output verbatim to the user. Do NOT continue to Part B or any later phase. Failure modes (with structured marker `$ARTIFACTS_DIR/.preflight-failed`):

- `graph_build_failed` — surface the script's tail; the user will rerun.
- `wiki_not_initialized` — `docs/llm-wiki/wiki/index.md` is missing; tell the user to run `/initialize-project` once.

**Part B — defensive double-check.** With the preflight marker present, the following assertions are belt-and-suspenders. They cannot fail because Part A just made them true; if any do, the marker file is corrupt and Part A must be rerun.

- Check git status (no uncommitted changes)
- Verify tests pass in current state
- Validate build succeeds
- Detect primary language and stack
- Assert `.code-review-graph/graph.db` exists at the project root
- Assert project root `.mcp.json` has `mcpServers.code_graph`
- Verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools are visible in this Claude Code session
- Verify generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries in their frontmatter, not only the broad `mcp__code_graph` server alias
- Assert `docs/llm-wiki/CLAUDE.md` exists (confirms initialization ran for the Claude Code provider)
- Assert `docs/llm-wiki/wiki/` exists and contains all five core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`
- Verify each of those five wiki files starts with YAML frontmatter containing `document_type`, `graph_version`, and `graph_commit` keys. Compute `sha256(.code-review-graph/graph.db)`; if any page's `graph_version` does not match, WARN the user (Phase 8.5 will refresh it). Compute `git rev-parse HEAD`; if any page's `graph_commit` is behind HEAD, WARN. Do not block the workflow on stale wiki — Phase 8.5 refreshes it.

CRITICAL: If any Part B assertion fails despite a present `.preflight-ok` marker, treat the marker as stale: delete it and rerun Part A. If the assertion still fails after a fresh Part A, STOP and report the inconsistency. Staleness warnings (graph_version or graph_commit mismatch) do NOT count as failures — Phase 8.5 will resolve them automatically.

CONTINUE WITH Phase 1.

### Phase 1: Context Gathering

- If `--from-jira`: MUST invoke `/fetch-ticket-context` to gather Jira/Confluence context
- If `--from-markdown`: read the SDD ticket file
- If `--from-input`: use description directly
- Extract requirements and acceptance criteria

CONTINUE WITH Phase 2.

### Phase 2: Wiki Context Preload

Preload the LLM wiki so the planner can rely on pre-digested architecture instead of rediscovering it via graph queries. The wiki ships its own runtime router; defer to it instead of hard-coding a frontmatter walk. Do ALL of the following in order:

1. **Read the router.** Open `docs/llm-wiki/CLAUDE.md` (the wiki's runtime router, ≤150 lines). Its decision table tells you which page to consult for which question — architecture, a specific service, request lifecycles, testing/conventions, or "I don't know which page".

2. **Read the index.** Open `docs/llm-wiki/wiki/index.md` — the summary catalog. One line per page with summary / document_type / confidence / tags / related inline. This is Tier 1: a single read of `index.md` carries the same information today's frontmatter walk used to gather across N files.

3. **Pick 1–3 pages and expand them.** Match the ticket summary against the index entries; identify the 1–3 most relevant pages. Read their full bodies (cap 5 — the index summary is sufficient for everything else). Always include `index.md`'s body. **Confidence-aware:** prefer `confidence: high` pages; if only `confidence: low` matches, expand them but tag extracted facts as `confidence: low`. Stop wikilink traversal at depth 2.

4. **Optional graph call.** If the matched bodies do not fully answer the planner's likely questions, call `mcp__code_graph__get_minimal_context_tool({ task: "<ticket summary>", changed_files: [], base: "HEAD~1" })` AT MOST ONCE. Preserve the full response — the planner in Phase 3 may reuse it. The call MUST NOT be re-issued by any downstream phase.

   **Follow the graph navigation discipline.** When the planner or implementer falls back to graph MCP tools, follow the canonical rules in `<project>/.claude/CLAUDE.md`, section *Graph navigation discipline*. Summary: start with `mcp__code_graph__get_minimal_context_tool`; never call `mcp__code_graph__get_architecture_overview_tool` (forbidden — response cannot be bounded); set `detail_level: "minimal"`, `limit: 20` MAX, `include_members: false`, `include_source: false` everywhere they apply.

5. **Persist.** Write `$ARTIFACTS_DIR/context/wiki-context.md` with these sections:
   - `## ROUTER` — the path to the router file (`docs/llm-wiki/CLAUDE.md`)
   - `## WIKI_INDEX_SNAPSHOT` — the content of `index.md`
   - `## WIKI_CORE` — the 1–3 expanded page paths and their full bodies
   - `## get_minimal_context_tool Payload` — the full preserved response, only when step 4 ran

CRITICAL: Do not proceed to Phase 3 if `wiki-context.md` is missing or the router could not be loaded. Step 4 is optional — skip it when the matched pages already answer the planner's likely questions. The graph call (when made) MUST NOT be re-issued by later phases.

CONTINUE WITH Phase 3.

### Phase 3: Planning

Spawn `planner` via `Task(subagent_type: "planner", prompt: ...)`. Keep the prompt short — the planner's system prompt already covers methodology. Include only:
- Ticket ID and one-line summary
- Input paths: Phase 1 ticket context, `$ARTIFACTS_DIR/context/wiki-context.md`
- Reminder: use the wikis to plan, use `mcp__code_graph` to verify impacts and explore intelligently; do not re-run `get_minimal_context_tool` (already in wiki-context.md).

Persist the planner's returned markdown verbatim to `$ARTIFACTS_DIR/plans/implementation-plan.md`.

Verify: plan file exists, contains `Wiki Evidence` and `Graph Evidence`, test strategy and target files are named, and contains a `Recommended Implementer` section naming exactly one of `implementer-typescript` | `implementer-python` | `implementer-generic`.

CONTINUE WITH Phase 4.

### Phase 4: Environment Setup

- Create feature branch (e.g., `feature/PROJ-123-description`)
- Allocate ports for services (if needed)
- Create docker-compose override (if needed)
- Capture BEFORE screenshots (if frontend)

CONTINUE WITH Phase 5.

### Phase 5: Implementation

Spawn the stack-specific `implementer-{lang}` via `Task(subagent_type: <picked-from-plan>, prompt: ...)`. Pick the subagent_type from the planner's `Recommended Implementer`. Keep the prompt short — the implementer's system prompt already covers methodology. Include only:
- Ticket ID and one-line summary
- Input paths: `$ARTIFACTS_DIR/plans/implementation-plan.md`, `$ARTIFACTS_DIR/context/wiki-context.md`
- Reminder: consult the cited `WIKI_CORE` pages (including any service docs already matched by the wiki router) for conventions; use `mcp__code_graph` to verify impacts before touching anything the plan flags high-risk; reuse the plan's `Graph Evidence` — do not re-run those queries.

Verify: code changes exist; completion summary lists wiki pages consulted and any fresh graph checks; completion summary contains a `## Wiki Delta Hints` JSONL fenced block (may be empty, but section must be present).

CRITICAL: Do not proceed to Phase 6 if the implementer did not emit a parseable Wiki Delta Hints block.

CONTINUE WITH Phase 6.

### Phase 6: Testing

If `--skip-tests` flag: mark completed as "Skipped via flag" and continue.

Otherwise:
- Auto-detect testing framework (Jest, Pytest, Playwright)
- Run unit tests with coverage
- Run integration tests
- Run E2E tests (if applicable)
- Collect coverage reports

If tests fail: spawn implementer to fix issues. Max 3 fix iterations.

CRITICAL: If tests still fail after 3 iterations, STOP. Report failure. Do not continue.

CONTINUE WITH Phase 7.

### Phase 7: Visual Verification

If no frontend changes or `--skip-visual` flag: mark completed as "Skipped via flag" and continue.

Otherwise:
- Take screenshots of affected pages
- Compare before/after with pixelmatch
- If diff > 5%: MUST spawn `visual-verifier` agent

CONTINUE WITH Phase 8.

### Phase 8: Documentation Update

CRITICAL: You MUST invoke `/doc-updater` skill. Do not skip this even if you think no docs need updating.

- Analyze changed files for doc impact
- Apply maintenance test (only update if truly needed)
- Update {{INSTRUCTION_FILE}} and the relevant convention skill (`code-conventions` / `multi-file-workflows` / `testing-conventions`) surgically if needed; descriptive context flows to the wiki via Phase 8.5, not into a skill body

CONTINUE WITH Phase 8.5.

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

CONTINUE WITH Phase 9.

### Phase 9: PR Creation

- BEFORE Phase 9 starts: confirm Phase 8.5 marked completed (wiki refreshed or confirmed unchanged). If structural lint failures from 8.5 are unresolved, STOP.

If `--skip-pr` flag: commit all changes locally with structured commit message, skip push and PR creation, mark completed as "Skipped via flag" and continue.

Otherwise:
- Commit all changes with structured commit message
- Push feature branch to remote
- Create pull request with:
  - Auto-generated title from ticket
  - Summary of changes
  - Test plan checklist
  - Link to original ticket
- Return PR URL

CRITICAL: Do not proceed if PR was not created, unless `--skip-pr` was set (in which case a local commit is sufficient).

CONTINUE WITH Phase 10.

### Phase 10: Review Loop

- Run PR review via `/pr-reviewer` skill
- Run security review via `/security-review` skill
- If blocking issues found:
  - Spawn implementer agent with fixes
  - Re-run tests
  - Re-review (max 3 iterations)
- Exit when approved or max iterations reached

CONTINUE WITH Phase 11.

### Phase 11: Cleanup

- Remove docker-compose override (if created)
- Clean up temporary files
- Run `aggregate-metrics` CLI to produce `<ARTIFACTS_DIR>/metrics/summary.md`; include the summary path in the final report.
- Report final status with summary

## Error Handling

If a phase fails:
- Do NOT mark the task as completed
- Report which phase failed and why
- If Phase 0 fails: stop immediately
- If graph DB, project MCP config, active graph tools, exact graph-aware subagent allowlists, or the LLM wiki (`docs/llm-wiki/*`) are unavailable: stop immediately and instruct the user to rerun `/initialize-project` or resource sync, restart Claude Code, approve the project MCP server if prompted, and verify `code_graph` with `/mcp`
- If Phase 2 fails (wiki preload): stop and report. Do not fall back to a graph-only path — the planner depends on the wiki context artifact.
- If Phase 6 fails after 3 fix iterations: stop and report
- For other phases: attempt to recover once, then stop if still failing

## Skills and Agents Used

- `/fetch-ticket-context`: Phase 1 (Jira tickets only)
- `mcp__code_graph__get_minimal_context_tool`: Phase 2 (called exactly once; result reused by planner)
- `planner` agent: Phase 3 sole `Implementation Plan` author, context parser, Wiki Evidence and Graph Evidence owner
- `implementer-{lang}` agent: Phase 5, Phase 6 (fixes), Phase 10 (fixes); consumes planner's Wiki+Graph evidence before any fresh discovery
- `visual-verifier` agent: Phase 7
- `/doc-updater`: Phase 8
- `/wiki-refresh`: Phase 8.5 (auto-invoked with `--since <branch-base>`; commits wiki diff if any pages changed)
- `/pr-reviewer`: Phase 10
- `/security-review`: Phase 10
- `aggregate-metrics` CLI: Phase 11 (final metrics summary)

## Prerequisites

- Project initialized with `/initialize-project`
- `code-review-graph` built and MCP-accessible
- `.code-review-graph/graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`)
- Project root `.mcp.json` defines `mcpServers.code_graph`
- Claude Code has been restarted after MCP config changes and `/mcp` shows `code_graph` connected
- Generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries
- LLM wiki exists at `docs/llm-wiki/` with `docs/llm-wiki/CLAUDE.md` present
- Git repository with remote configured and `origin/development` or `origin/main` reachable (required for Phase 8.5 merge-base computation)
- Tests passing in current state
- For `--from-jira`: Jira MCP configured
- For GitHub PR: GitHub MCP or gh CLI configured
