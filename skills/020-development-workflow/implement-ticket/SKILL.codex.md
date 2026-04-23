---
name: implement-ticket
version: 3.3.0
last-updated: 2026-04-23
description: Implements a ticket end-to-end through a wiki-aware and graph-aware 12-phase workflow from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
user-invokable: true
disable-model-invocation: true
---

# Implement Ticket (Codex)

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 12-phase SDLC workflow.

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

Both the graph path AND the AI Knowledge wiki must be active.

- `code-review-graph` MUST be built and MCP-accessible before planning starts.
- This framework uses `.code-graph.db` as the compatibility graph DB. Upstream `code-review-graph` defaults to `.code-review-graph/graph.db`.
- The active Codex session MUST expose `mcp__code_graph__*` tools (register the `code_graph` MCP server in your Codex MCP settings and reload the session).
- The AI Knowledge wiki at `docs/ai-knowledge/` MUST exist with all five core documents present: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`. Each MUST contain YAML frontmatter with at least `document_type` and `graph_version` keys.

If the graph DB, graph MCP tools, or the AI Knowledge wiki are missing, STOP immediately. Tell the user to rerun `/initialize-project` or resource sync so `.code-graph.db`, `{{CONFIG_DIR}}/agents/*`, and `docs/ai-knowledge/*` are regenerated, then restart Codex so the `code_graph` MCP server reconnects and `mcp__code_graph__*` tools become visible before retrying `/implement-ticket`.

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
- Emit an `in_progress` record BEFORE starting each phase (phases 0 through 11).
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
- Verify `.code-graph.db` exists at the project root.
- Verify the active Codex session exposes `mcp__code_graph__*` tools.
- Verify `docs/ai-knowledge/` exists and contains all five core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`.
- Verify each of those five wiki files starts with YAML frontmatter containing `document_type` and `graph_version` keys.
- If `framework-config.json > wiki.services` is non-empty, verify at least one matching file exists under `docs/ai-knowledge/services/`.

Expected outputs: git clean, tests pass, build succeeds, graph DB exists, graph MCP tools are visible, AI Knowledge wiki is present and well-formed.

Constraint: If any check fails, emit `failed` and STOP. Do not continue.

For graph or wiki failures, tell the user to rerun `/initialize-project` or resource sync so `.code-graph.db`, `{{CONFIG_DIR}}/agents/*`, and `docs/ai-knowledge/*` are regenerated. Then restart Codex and confirm `mcp__code_graph__*` tools are visible before retrying.

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

Preload the AI Knowledge wiki so the planner can rely on pre-digested architecture summaries instead of rediscovering them via graph queries. Do ALL of the following in order:

1. Read the five core wiki documents and collect their absolute paths as `WIKI_CORE`:
   - `docs/ai-knowledge/index.md`
   - `docs/ai-knowledge/ARCHITECTURE.md`
   - `docs/ai-knowledge/SERVICES.md`
   - `docs/ai-knowledge/DATA-FLOWS.md`
   - `docs/ai-knowledge/PATTERNS.md`

2. Call `mcp__code_graph__get_minimal_context_tool({ task: "<ticket summary>", changed_files: [], base: "HEAD~1" })` EXACTLY ONCE. Preserve the full response — it will be reused by the planner in Phase 3 and MUST NOT be re-issued by any downstream phase.

3. From that response and from the `SERVICES.md` file, extract relevant service IDs for this ticket. For each, resolve `docs/ai-knowledge/services/<service-id>.md`. Collect matches (cap at 5) as `WIKI_SERVICES`.

4. Persist everything to `$ARTIFACTS_DIR/context/wiki-context.md` with these sections:
   - `## WIKI_CORE` — list of paths
   - `## WIKI_SERVICES` — list of paths (may be empty)
   - `## get_minimal_context_tool Payload` — the full preserved response

Expected outputs: `$ARTIFACTS_DIR/context/wiki-context.md` exists and contains `WIKI_CORE`, `WIKI_SERVICES`, and the preserved `get_minimal_context_tool` payload for reuse by the planner.

Constraint: Do not proceed if `wiki-context.md` is missing, any `WIKI_CORE` file failed to load, or `get_minimal_context_tool` failed. `WIKI_SERVICES` may legitimately be empty for tickets that touch no identified service.

### Phase 3: Planning

Apply the planner role prompt: read `{{CONFIG_DIR}}/agents/planner.md` and follow it as your active persona. Feed it:
- The ticket context from `$ARTIFACTS_DIR/context/ticket-context.md`.
- The wiki context from `$ARTIFACTS_DIR/context/wiki-context.md` (`WIKI_CORE`, `WIKI_SERVICES`, preserved `get_minimal_context_tool` payload).

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

Reminder: consult the cited `WIKI_SERVICES` pages for conventions; use `mcp__code_graph` to verify impacts before touching anything the plan flags high-risk; reuse the plan's `Graph Evidence` — do not re-run those queries.

- Follow project conventions from `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}`.
- Create/modify files exactly as listed in the plan.

Expected outputs: code changes exist, new files created as planned; completion summary lists wiki pages consulted and any fresh graph checks.

Constraint: Do not proceed if no code changes exist, or if the plan's Wiki Evidence / Graph Evidence were not consumed.

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

### Phase 9: PR Creation

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
- Print the final summary report.

Expected outputs: cleanup done, summary printed.

Constraint: None. Final phase.

## Error Handling

If a phase fails:
- Emit a `failed` record to `$PROGRESS_FILE` with a `reason`.
- Do NOT mark the phase as completed.
- Report which phase failed and why.
- If Phase 0 fails: stop immediately.
- If graph DB, graph MCP tools, or the AI Knowledge wiki (`docs/ai-knowledge/*`) are unavailable: stop immediately and instruct the user to rerun `/initialize-project` or resource sync, restart Codex, and verify `mcp__code_graph__*` tools are visible.
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
- `/pr-reviewer` — Phase 10.
- `/security-review` — Phase 10.

## Prerequisites

- Project initialized with `/initialize-project`.
- `code-review-graph` built and MCP-accessible.
- `.code-graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`).
- Codex session has the `code_graph` MCP server registered and `mcp__code_graph__*` tools visible.
- AI Knowledge wiki exists at `docs/ai-knowledge/`.
- Git repository with remote configured.
- Tests passing in current state.
- For `--from-jira`: Jira MCP configured.
- For GitHub PR: GitHub MCP or `gh` CLI configured.
