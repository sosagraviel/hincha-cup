---
name: implement-ticket
version: 3.7.0
last-updated: 2026-05-13
description: Implements a ticket end-to-end through 14-phase workflow from planning to PR. Supports both single-repo projects and multi-repo workspaces (a parent folder containing N independent child git repos). Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
disable-model-invocation: true
---

# Implement Ticket

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 14-phase SDLC workflow.

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
- The LLM wiki at `docs/llm-wiki/` MUST exist. Specifically `docs/llm-wiki/CLAUDE.md` MUST be present (enforces that initialization ran for this provider). The three core wiki documents MUST be present under `docs/llm-wiki/wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`. Each MUST contain YAML frontmatter with at least `document_type`, `summary`, and `last_updated` keys. Phase 8.5 (Wiki Refresh) is invoked at the end of every ticket — if the wiki has drifted since the last refresh, the skill will catch and fix it.

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

## Multi-Repository Awareness

The workspace may be a single git repo OR a parent folder containing multiple independent child git repos (each with its own GitHub remote). When operating on the working tree (status, branch, commit, push, tests), target each affected repo individually with `git -C <repo>` rather than assuming a single workspace root. The LLM wiki and code graph remain workspace-scoped (one shared `docs/llm-wiki/` and `.code-review-graph/` at the workspace root).

## CRITICAL: Task Tracking Setup

BEFORE starting any phase work, you MUST create the full task list using TaskCreate. This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 14 tasks first, then set up dependencies, then begin Phase 0.

Create each task using TaskCreate with these exact values:

1. Phase 0: Preflight (Auto-bootstrap + Validation)
   subject: "Phase 0: Preflight (Auto-bootstrap + Validation)"
   activeForm: "Running deterministic preflight (auto-bootstrap + validation)"
   Steps: (a) Run `bash $FRAMEWORK_PATH/scripts/ensure-context.sh --artifacts-dir "$ARTIFACTS_DIR"` — this auto-installs `uv`/`uvx`/`code-review-graph` if missing, builds or updates the graph, re-emits `.mcp.json`, and writes a success marker `$ARTIFACTS_DIR/.preflight-ok`. <3 s on the hot path. (b) If the script exits non-zero, STOP and surface its output verbatim — failure marker `$ARTIFACTS_DIR/.preflight-failed` carries `{reason, git_head, ran_at}`. (c) Defensive double-check: check git status (in a multi-repo workspace, run the status check in each child git repo, not at the workspace root), verify test commands work, verify build succeeds, detect primary language and stack, assert `.code-review-graph/graph.db`, assert `.mcp.json` has `mcpServers.code_graph`, verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools, assert `docs/llm-wiki/CLAUDE.md`, assert `docs/llm-wiki/wiki/{index,ARCHITECTURE,SERVICES}.md` exist, assert at least one `docs/llm-wiki/wiki/services/*.md` exists. Wiki staleness is no longer checked at preflight — Phase 8.5 handles it.
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
   Steps: MUST spawn planner agent, planner consumes the ticket context from Phase 1 and the Phase 2 wiki context (`WIKI_INDEX_SNAPSHOT`, `WIKI_CORE`, and the optional `get_minimal_context_tool` payload when present), planner returns the only Phase 3 planning artifact named `Implementation Plan`, parent/main agent persists that returned plan under the normal artifact path, planner includes implementation strategy/files to create or modify/test strategy/Wiki Evidence/Graph Evidence in that artifact, planner emits a `Recommended Implementer` section naming exactly one of `implementer-typescript` | `implementer-python` | `implementer-generic` with rationale. If the workspace contains multiple git repos and the change touches more than one, the plan SHOULD identify which repo each file belongs to so Phase 9 can fan out cleanly.
   Expected outputs: planner agent was spawned with the Phase 2 wiki context injected, parent/main agent saved the planner-authored `Implementation Plan` as the only Phase 3 planning artifact, Wiki Evidence exists and cites the wiki paths actually used, Graph Evidence exists, test strategy defined, files to create/modify identified, `Recommended Implementer` present in the plan naming one of `implementer-typescript` | `implementer-python` | `implementer-generic`
   Constraint: Do not proceed if planner agent was not spawned, Wiki Evidence or Graph Evidence is absent, the planner-authored `Implementation Plan` does not exist, Phase 3 produced competing planning artifacts, or `Recommended Implementer` is missing.

5. Phase 4: Environment Setup
   subject: "Phase 4: Environment Setup"
   activeForm: "Setting up environment"
   Steps: MUST branch from the currently active branch in each affected repo. MUST NOT `git checkout`/`switch` to another branch first, and MUST NOT pass a base argument to `git checkout -b`. Branching from any base other than the active branch REQUIRES explicit user consent via `AskUserQuestion` — never assume `main`/`master`/`development`. Then run `git -C <repo> checkout -b <new-branch>` per affected repo, and allocate ports / docker-compose override / env vars / BEFORE screenshots as needed.
   Expected outputs: feature branch created in each affected repo, rooted at the branch that was active when Phase 4 started
   Constraint: STOP if branching from anything other than the active branch without explicit user consent.

6. Phase 5: Implementation
   subject: "Phase 5: Implementation"
   activeForm: "Implementing code changes"
   Steps: MUST spawn graph-aware implementer-{lang} agent with the planner-authored `Implementation Plan` from Phase 3, pass the same `WIKI_CORE` page paths the planner cited (including any service docs the wiki router already matched) plus the plan's `Wiki Evidence` and `Graph Evidence`, implementer absorbs those artifacts before any fresh discovery, implementer runs targeted graph checks only for high-risk edits flagged by the plan, implements code following the plan, follows project conventions from {{INSTRUCTION_FILE}}, creates/modifies files as needed, includes wiki pages consulted and any fresh graph queries in the final implementation summary, implementer MUST end its completion summary with a `## Wiki Delta Hints` JSONL fenced block (see implementer template); the block may be empty if no wiki impact, but the section MUST be present
   Expected outputs: graph-aware implementer agent was spawned, implementer confirmed it consumed the plan's Wiki Evidence and Graph Evidence, code changes exist, new files created as planned, completion summary contains a parseable `## Wiki Delta Hints` JSONL block
   Constraint: Do not proceed if implementer agent was not spawned, the plan's Wiki Evidence / Graph Evidence were not consumed, no code changes exist, or the implementer did not emit a parseable Wiki Delta Hints block.

7. Phase 6: Testing
   subject: "Phase 6: Testing"
   activeForm: "Running tests"
   Steps: If `--skip-tests` flag is set mark completed as "Skipped via flag" and proceed, otherwise auto-detect testing framework, run unit tests with coverage, run integration tests, run E2E tests (if applicable), collect coverage reports, if tests fail spawn implementer to fix (max 3 iterations). In a multi-repo workspace, run the test stack in each affected child repo and namespace coverage under `$ARTIFACTS_DIR/coverage/<repo-basename>/`; the 3-iteration retry budget is global across all repos.
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

10. Phase 8.4: Implementation Commit
    subject: "Phase 8.4: Implementation Commit"
    activeForm: "Committing implementation changes"
    Steps: Stage and commit implementation + tests + doc changes per affected repo (can be just one). Exclude `docs/llm-wiki/**` (Phase 8.5 owns it). Never `git add .` / `-A` / `commit -a`. Never skip hooks.
    Expected outputs: each affected repo has one new implementation commit; commit SHAs written to `$ARTIFACTS_DIR/commits/<repo-basename>.sha`.
    Constraint: STOP if any pre-commit hook fails — surface output verbatim.

11. Phase 8.5: Wiki Refresh
    subject: "Phase 8.5: Wiki Refresh"
    activeForm: "Refreshing LLM wiki"
    Steps: Invoke `/wiki-refresh --commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR`.
    Expected outputs: /wiki-refresh invocation completed; wiki commit produced when the wiki repo is tracked OR a diff manifest + warning file exist when the workspace parent is untracked OR the skill reported "wiki is fresh" with no changes.
    Constraint: Do not proceed if /wiki-refresh reported a hard error (it exits non-zero only when `.state.json` is missing, repeated AI parse failures, a page update genuinely failed, or the wiki-commit pre-commit hook failed). New-service suggestions are advisory and do NOT block.

12. Phase 9: PR Creation
    subject: "Phase 9: PR Creation"
    activeForm: "Creating pull request"
    Steps: If `--skip-pr` flag is set, mark completed as "Skipped via flag" (no push, no PR — commits stay local). This phase only pushes and opens PRs. Single-repo path runs `git push -u origin <branch>` then `gh pr create` with title/summary/test plan/ticket link. Multi-repo path delegates to `/repo-fanout-pr --no-commit ...` which validates the working tree is clean + branch is ahead of base in each affected repo, then pushes and opens one PR per repo with cross-linked bodies. If Phase 8.5 wrote `$ARTIFACTS_DIR/wiki/wiki-warning.txt`, embed it in every PR body.
    Expected outputs: branch pushed and PR created with URL in every affected repo, OR PR was skipped via `--skip-pr` (commits stay local in every affected repo). Multi-repo: every affected repo has its own PR (or local commits under `--skip-pr`), and the PR bodies are cross-linked.
    Constraint: Do not proceed if any expected PR was not created, unless `--skip-pr` was set in which case local commits in every affected repo are sufficient.

13. Phase 10: Review Loop
    subject: "Phase 10: Review Loop"
    activeForm: "Running review loop"
    Steps: For each PR URL produced by Phase 9, invoke /pr-reviewer (`--pr-url <URL> --jira-key <ID> --mode automated [--repos <abs>]`) and /security-review (`--pr-url <URL> --jira-key <ID> [--repos <abs>] [--baseline <prior>]`). If blocking issues, spawn implementer for fixes and re-run tests; max 3 iterations global across all PRs. After the loop, in multi-repo mode only, run /pr-reviewer --aggregate --jira-key <ID> and /security-review --aggregate --jira-key <ID> to emit cross-repo summaries.
    Expected outputs: PR review ran, security review ran, either no blocking issues or fixes applied
    Constraint: If max iterations reached with unresolved issues, report and proceed to cleanup.

14. Phase 11: Cleanup
    subject: "Phase 11: Cleanup"
    activeForm: "Cleaning up environment"
    Steps: Remove docker-compose override (if created), archive artifacts, print final summary report
    Expected outputs: cleanup done, summary printed
    Constraint: None. This is the final phase.

After creating all 14 tasks, use TaskUpdate to chain dependencies:
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
- Task 14 addBlockedBy [Task 13]

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
- Writes a JSON success marker at `$ARTIFACTS_DIR/.preflight-ok` carrying `{git_head, graph_sha, provider, preflight_ran_at}`. Wiki staleness is no longer handled here — `/wiki-refresh` (Phase 8.5) owns it.

**If the script exits non-zero, STOP.** Surface its output verbatim to the user. Do NOT continue to Part B or any later phase. Failure modes (with structured marker `$ARTIFACTS_DIR/.preflight-failed`):

- `graph_build_failed` — surface the script's tail; the user will rerun.

**Part B — defensive double-check.** With the preflight marker present, the following assertions are belt-and-suspenders. They cannot fail because Part A just made them true; if any do, the marker file is corrupt and Part A must be rerun.

- Check git status (no uncommitted changes). In a multi-repo workspace run the status check in each child git repo rather than at the workspace root.
- **Resolve test / build commands from `framework-config.json::stack_profile.command_catalog`** — the catalog's `run_tests` and `run_build` operations name the canonical command for this project. Prefer the first entry (wrapper-tier: Makefile / Justfile / Taskfile / scripts) over package-manager fallbacks; wrappers orchestrate dependent services that raw package-manager invocations may skip.
- Verify tests pass in current state
- Validate build succeeds
- Detect primary language and stack
- Assert `.code-review-graph/graph.db` exists at the project root
- Assert project root `.mcp.json` has `mcpServers.code_graph`
- Verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools are visible in this Claude Code session
- Verify generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries in their frontmatter, not only the broad `mcp__code_graph` server alias
- Assert `docs/llm-wiki/CLAUDE.md` exists (confirms initialization ran for the Claude Code provider)
- Assert `docs/llm-wiki/wiki/` exists and contains the three core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`
- Verify each of those wiki files starts with YAML frontmatter containing `document_type`, `summary`, and `last_updated` keys.

CRITICAL: If any Part B assertion fails despite a present `.preflight-ok` marker, treat the marker as stale: delete it and rerun Part A. If the assertion still fails after a fresh Part A, STOP and report the inconsistency. Wiki staleness is no longer a preflight concern — Phase 8.5 handles it.

CONTINUE WITH Phase 1.

### Phase 1: Context Gathering

Produce a single canonical artifact at
`$ARTIFACTS_DIR/context/ticket-context.md` regardless of input source.
Every later phase reads from that path; nobody re-fetches from Jira / re-reads
the SDD markdown / re-parses `--from-input`.

- If `--from-jira <TICKET-ID>`: MUST invoke `/fetch-ticket-context` (the
  skill writes to the canonical path automatically).
- If `--from-markdown <PATH>`: copy the SDD ticket file to
  `$ARTIFACTS_DIR/context/ticket-context.md` (preserve the original
  body verbatim; add a one-line frontmatter `source: <PATH>`).
- If `--from-input "description"`: render the description into the same
  canonical file under a `## Description` heading; add `## Ticket` with
  a synthetic id (`AD-HOC-<timestamp>`).

CRITICAL: this phase does NOT plan, analyze requirements, or recommend
implementer agents — those are the planner's job in Phase 3. Phase 1's
only product is the canonical context artifact.

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

Spawn `planner` via `Task(subagent_type: "planner", prompt: ...)`. Keep
the prompt short — the planner's system prompt already covers
methodology. Include only:

- Ticket ID and one-line summary.
- Input paths (PATHS, not bodies): `$ARTIFACTS_DIR/context/ticket-context.md`,
  `$ARTIFACTS_DIR/context/wiki-context.md`.
- Hard rules — re-call ban:
  - Do NOT re-call `mcp__code_graph__get_minimal_context_tool`. Phase 2
    already invoked it (at most once); the full payload is in
    `wiki-context.md` under `## get_minimal_context_tool Payload` if it
    ran. Reference that payload by section name; do not regenerate it.
  - Do NOT re-fetch the ticket from Jira. The body, comments, and linked
    resources are in `ticket-context.md`.
- Targeted graph queries the planner MAY run when the wiki bodies do not
  resolve a load-bearing question: `mcp__code_graph__semantic_search_nodes_tool`,
  `mcp__code_graph__get_impact_radius_tool`,
  `mcp__code_graph__query_graph_tool` (callers_of / imports_of / tests_for).
  `mcp__code_graph__get_architecture_overview_tool` is forbidden (response
  cannot be bounded — see graph navigation discipline).

Persist the planner's returned markdown verbatim to
`$ARTIFACTS_DIR/plans/implementation-plan.md`.

Verify: plan file exists, contains `Wiki Evidence` and `Graph Evidence`,
test strategy and target files are named, contains a
`Recommended Implementer` section naming exactly one of
`implementer-typescript` | `implementer-python` | `implementer-generic`,
and (in `multi` mode) contains an `Affected Repositories` section
listing each touched repo path with the files within it. In `single`
mode the section may be absent — the parent/main agent infers it as
the single workspace repo.

CONTINUE WITH Phase 4.

### Phase 4: Environment Setup

- Create feature branch (e.g., `feature/PROJ-123-description`). **MUST branch from the currently active branch in each affected repo.** MUST NOT `git checkout`/`switch` to another branch first, and MUST NOT pass a base argument to `git checkout -b`. Branching from any base other than the active branch REQUIRES explicit user consent via `AskUserQuestion` — never assume `main`/`master`/`development`. Then run `git -C <repo> checkout -b <new-branch>` per affected repo.
- Allocate ports for services (if needed)
- Create docker-compose override (if needed)
- Capture BEFORE screenshots (if frontend) into `$ARTIFACTS_DIR/screenshots/before/`

CONTINUE WITH Phase 5.

### Phase 5: Implementation

Spawn the stack-specific `implementer-{lang}` via
`Task(subagent_type: <picked-from-plan>, prompt: ...)`. Pick the
subagent_type from the planner's `Recommended Implementer`. Keep the
prompt short — the implementer's system prompt already covers methodology.
Include only:

- Ticket ID and one-line summary.
- Input paths (PATHS, not bodies):
  `$ARTIFACTS_DIR/plans/implementation-plan.md`,
  `$ARTIFACTS_DIR/context/wiki-context.md`,
  `$ARTIFACTS_DIR/context/ticket-context.md`.
- Hard rules — re-call ban:
  - Do NOT re-call `mcp__code_graph__get_minimal_context_tool`. The
    Phase 2 payload (when present) is referenced in the plan; the
    planner already consumed it. Re-running it costs tokens for no new
    information.
  - Do NOT re-read full wiki page bodies whose relevant excerpts are
    already inlined in the plan's `Wiki Evidence` section. Read the
    full body ONLY when the plan's `Implementation Steps` flags a
    specific edit as high-risk and cites a section the excerpt didn't
    cover.
  - Do NOT re-run any graph query the plan already documents in
    `Graph Evidence`. Reuse those findings.
- Fresh graph checks the implementer MAY run, only when the plan flags
  an edit as high-risk OR when source code reality contradicts the
  plan's evidence: `mcp__code_graph__get_impact_radius_tool` (before
  touching shared utilities or public APIs),
  `mcp__code_graph__query_graph_tool` (single targeted relationship
  question — callers / imports / tests),
  `mcp__code_graph__semantic_search_nodes_tool` (only when the plan
  lacks a symbol). `mcp__code_graph__get_architecture_overview_tool` is
  forbidden.

Verify: code changes exist; completion summary lists wiki pages consulted and any fresh graph checks; completion summary contains a `## Wiki Delta Hints` JSONL fenced block (may be empty, but section must be present).

CRITICAL: Do not proceed to Phase 6 if the implementer did not emit a parseable Wiki Delta Hints block.

CONTINUE WITH Phase 6.

### Phase 6: Testing

If `--skip-tests` flag: mark completed as "Skipped via flag" and continue.

Otherwise:
- **Resolve the test command from the project's command catalog.**
  Read `framework-config.json::stack_profile.command_catalog` and look up the
  preferred command for each test op: `run_tests`, `run_unit_tests`,
  `run_integration_tests`, `run_e2e`. The first entry of each operation array
  is the highest-tier candidate (wrapper → readme → package_manager → ci).
  **Prefer the wrapper** (`make tests`, `just test`, `task test`,
  `./scripts/test.sh`) over per-service package-manager commands when both
  exist — wrappers orchestrate dependent services (databases, queues, identity
  providers) that raw `pnpm test` / `npm test` / `pytest` invocations may
  silently skip.
- Only fall back to auto-detection (Jest, Pytest, Playwright, Vitest, etc.)
  when the catalog has NO entry for the relevant operation.
- Run unit tests with coverage, integration tests, E2E tests (if applicable);
  collect coverage reports.

In a multi-repo workspace, run the test stack in each affected child repo and namespace coverage under `$ARTIFACTS_DIR/coverage/<repo-basename>/`.

If tests fail: spawn implementer to fix issues. Max 3 fix iterations (global across all repos in multi-repo workspaces).

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

CONTINUE WITH Phase 8.4.

### Phase 8.4: Implementation Commit

For each affected repo (single workspace root, or each child repo from the planner's `Affected Repositories`):

1. List changed files with `git -C <repo> status --porcelain`; exclude `docs/llm-wiki/**` (Phase 8.5 owns it). Empty list → STOP (single-repo) or skip with a note (multi-repo).
2. `git -C <repo> add -- <files>` then `git -C <repo> commit -m "<message>"`. Never `git add .` / `-A` / `commit -a`. Do not skip hooks.
3. Write the new SHA to `$ARTIFACTS_DIR/commits/<repo-basename>.sha`.

If a pre-commit hook fails, surface the output verbatim and STOP. Earlier sibling commits remain for inspection.

CONTINUE WITH Phase 8.5.

### Phase 8.5: Wiki Refresh

CRITICAL: invoke `/wiki-refresh --commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR` via the Skill tool. The skill is multi-repo aware — one invocation handles the whole workspace.

Orchestrator responsibilities in this phase:

- Invoke the skill with the flags above.
- If `/wiki-refresh` reports a hard error (`.state.json` missing, AI parse failure, page update failed, or commit pre-commit hook failed), STOP and report. Do NOT create the PR.
- If `/wiki-refresh` surfaces a "potential new service detected" suggestion in its summary, surface that suggestion in the PR body. Do NOT auto-invoke `/wiki-add-service` — the user decides whether the new service is worth documenting now.
- If the refresh produced no changes ("wiki is fresh" or "no high-level facts drifted"), do nothing and continue to Phase 9.

CONTINUE WITH Phase 9.

### Phase 9: PR Creation

- BEFORE Phase 9 starts: confirm Phase 8.5 marked completed (wiki refreshed or confirmed unchanged). The implementation commit from Phase 8.4 and the optional wiki commit from Phase 8.5 are already on the branch — Phase 9 only pushes and opens PRs.

If `--skip-pr` flag: skip push and PR creation, mark completed as "Skipped via flag" and continue. Local commits from Phase 8.4 + Phase 8.5 remain on the branch for the user to inspect.

Otherwise, **single-repo path**:

- `git -C <workspace-root> push -u origin <branch>`
- `gh pr create` with:
  - Auto-generated title from ticket
  - Summary of changes
  - Test plan checklist
  - Link to original ticket
- Return PR URL

**Multi-repo workspace**: if the change touches more than one git repo, delegate the fanout to `/repo-fanout-pr --no-commit --repos <abs1>,<abs2>,... --branch <branch> --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR` instead. The skill asserts every repo's working tree is clean and the branch is ahead of base, pushes each branch, opens one PR per repo, and cross-links the PR bodies. The orchestrator just consumes its returned `result.json`.

If Phase 8.5 wrote `$ARTIFACTS_DIR/wiki/wiki-warning.txt`, append its contents to every PR body created in this phase.

CRITICAL: Do not proceed if PR was not created, unless `--skip-pr` was set (in which case local commits are sufficient). In multi-repo, partial fanout success (any expected PR missing) is treated as failure.

CONTINUE WITH Phase 10.

### Phase 10: Review Loop

For each PR URL produced by Phase 9 (single-repo: one URL; multi-repo: one per affected repo):

- Run PR review: `/pr-reviewer --pr-url <URL> --jira-key <TICKET-ID> --mode automated [--repos <abs-repo-path>]`
- Run security review: `/security-review --pr-url <URL> --jira-key <TICKET-ID> [--repos <abs-repo-path>] [--baseline <prior-findings.json>]`
- If blocking issues found:
  - Spawn implementer agent with fixes
  - Re-run tests
  - Re-review (max 3 iterations)
- Exit when approved or max iterations reached

In a multi-repo workspace, run the reviews once per PR URL produced by Phase 9 — each invocation passes the corresponding repo path via `--repos <abs>`. Fix commits land in the corresponding repo (`git -C <repo>`). The 3-iteration retry budget is global across all PRs.

**Multi-repo aggregation (after the loop):** when more than one PR URL was reviewed for the same ticket, run a final aggregation pass:

- `/pr-reviewer --aggregate --jira-key <TICKET-ID>` — emits `.claude/artifacts/<TICKET-ID>/pr/cross-repo-summary.{json,md}` describing cross-repo concerns (API contract mismatches, schema skew, shared-dep conflicts) and a recommended merge order.
- `/security-review --aggregate --jira-key <TICKET-ID>` — emits `.claude/artifacts/<TICKET-ID>/security/cross-repo-summary.{json,md}` describing cross-cutting security concerns (shared-dep CVEs, identical findings across repos) and a dependency-ordered remediation plan.

Skip the aggregation pass in single-repo mode.

CONTINUE WITH Phase 11.

### Phase 11: Cleanup

- Remove docker-compose override (if created)
- Clean up temporary files
- Run `aggregate-metrics` CLI to produce `<ARTIFACTS_DIR>/metrics/summary.md`; include the summary path in the final report.
- Report final status with summary. List every PR URL produced (multi-repo workspaces have more than one), the per-repo coverage paths under `$ARTIFACTS_DIR/coverage/`, the wiki refresh outcome, and the metrics summary path.

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
- `/wiki-refresh`: Phase 8.5 (auto-invoked with `--commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR`; reads per-repo commits from `.state.json`, surgically edits affected pages under a high-level-only conservatism rule, commits `docs/llm-wiki/**` itself when the wiki is git-tracked or emits a diff manifest + warning for Phase 9 otherwise)
- `/repo-fanout-pr`: Phase 9 (multi-repo workspaces only — invoked with `--no-commit`; per-repo push + PR creation and cross-linking. The implementation commit is produced in Phase 8.4 before this skill runs.)
- `/pr-reviewer`: Phase 10 (run once per PR URL)
- `/security-review`: Phase 10 (run once per PR URL)
- `aggregate-metrics` CLI: Phase 11 (final metrics summary)

## Prerequisites

- Project initialized with `/initialize-project`
- `code-review-graph` built and MCP-accessible
- `.code-review-graph/graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`)
- Project root `.mcp.json` defines `mcpServers.code_graph`
- Claude Code has been restarted after MCP config changes and `/mcp` shows `code_graph` connected
- Generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries
- LLM wiki exists at `docs/llm-wiki/` (workspace-scoped; lives at the workspace root in both single and multi mode) with `docs/llm-wiki/CLAUDE.md` present
- Git: at least one git repository reachable. Two supported shapes:
  - **single-repo**: workspace root is itself a git repo; `origin/development` or `origin/main` reachable (required for Phase 9 base-branch resolution).
  - **multi-repo**: workspace root is NOT a git repo but contains one or more child directories that ARE git repos (each with its own GitHub remote). Every child repo must have `origin/development` or `origin/main` reachable.
- Tests passing in current state — at the workspace root in single mode, in every child repo in multi mode
- For `--from-jira`: Jira MCP configured
- For GitHub PR: `gh` CLI configured and authenticated against every affected GitHub remote
