---
name: implement-ticket
version: 3.7.0
last-updated: 2026-05-13
description: Implements a ticket end-to-end through a wiki-aware and graph-aware 14-phase workflow from planning to PR. Supports both single-repo projects and multi-repo workspaces (a parent folder containing N independent child git repos). Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
disable-model-invocation: true
---

# Implement Ticket (Codex)

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 14-phase SDLC workflow.

## Execution Model — Codex-specific

**Codex does not spawn subagents programmatically.** You (the agent running this skill) execute every phase yourself, switching your operating persona by loading the corresponding role prompt from `{{CONFIG_DIR}}/agents/`:

- Planning phase (Phase 3): read `{{CONFIG_DIR}}/agents/planner.md` and follow its instructions as your active role.
- Implementation phase (Phase 5): for each entry in the planner's `Recommended Implementers` list (in the listed order), read `{{CONFIG_DIR}}/agents/<entry.agent>.md` and apply it as your active role to produce that entry's scoped files. The set of valid `<entry.agent>` values is `$AVAILABLE_IMPLEMENTERS` — the implementer files actually installed under `{{CONFIG_DIR}}/agents/` (enumerated at Phase 3 start). Move to the next entry only after the current one's files are written. An empty list or an unknown agent name is a Phase 3 Constraint violation and should already have aborted the run.
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
- The LLM wiki at `docs/llm-wiki/` MUST exist. Specifically `docs/llm-wiki/AGENTS.md` MUST be present (enforces that initialization ran for this provider). The three core wiki documents MUST be present under `docs/llm-wiki/wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`. Each MUST contain YAML frontmatter with at least `document_type`, `summary`, and `last_updated` keys. Phase 8.5 (Wiki Refresh) is invoked at the end of every ticket — if the wiki has drifted, the skill will catch and fix it.

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

## Multi-Repository Awareness

The workspace may be a single git repo OR a parent folder containing multiple independent child git repos (each with its own GitHub remote). When operating on the working tree (status, branch, commit, push, tests), target each affected repo individually with `git -C <repo>` rather than assuming a single workspace root. The LLM wiki and code graph remain workspace-scoped (one shared `docs/llm-wiki/` and `.code-review-graph/` at the workspace root).

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
- Emit an `in_progress` record BEFORE starting each phase (phases 0, 1, 2, 3, 4, 5, 6, 7, 8, 8.4, 8.5, 9, 10, 11).
- Emit a `completed` record ONLY after verifying the Expected outputs for that phase.
- For a phase skipped via flag, emit `{"phase": N, "status": "completed", "note": "Skipped via flag", "ts": "..."}`.
- Emit `{"phase": N, "status": "failed", "reason": "<why>", "ts": "..."}` and STOP if a Constraint is violated.
- Use this file (not memory) to decide whether a phase has been completed when resuming.

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase has emitted a `completed` record. For each phase: perform the Steps, verify the Expected outputs, then mark completed.

**Preflight marker check (Phase 1 onward):** at the start of every phase from Phase 1, assert `test -f "$ARTIFACTS_DIR/.preflight-ok"` exits 0. If the marker is missing, emit `failed` for that phase and return to Phase 0 to rerun the preflight. The marker contains the `git_head` at preflight time — subsequent phases trust it as the authoritative graph + wiki freshness signal.

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
- Re-emits `.codex/config.toml`'s `[mcp_servers.code_graph]` block with this machine's local framework path. Compare-then-write — no-op when content already matches.
- Writes a JSON success marker at `$ARTIFACTS_DIR/.preflight-ok` carrying `{git_head, graph_sha, provider, preflight_ran_at}`. Wiki staleness is no longer handled here — `/wiki-refresh` (Phase 8.5) owns it.

**If the script exits non-zero, emit `failed` and STOP.** Surface its output verbatim to the user. Do NOT continue to Part B or any later phase. Failure modes (with structured marker `$ARTIFACTS_DIR/.preflight-failed`):

- `graph_build_failed` — surface the script's tail; the user will rerun.

**Part B — defensive double-check.** With the preflight marker present, the following assertions are belt-and-suspenders. They cannot fail because Part A just made them true; if any do, the marker file is corrupt and Part A must be rerun.

Steps:
- Check git status (no uncommitted changes). In a multi-repo workspace, run the status check in each child git repo rather than at the workspace root.
- **Resolve test / build commands from `framework-config.json::stack_profile.command_catalog`** — the catalog's `run_tests` and `run_build` operations name the canonical command for this project. Prefer the first entry (wrapper-tier: Makefile / Justfile / Taskfile / scripts) over package-manager fallbacks; wrappers orchestrate dependent services (databases, queues, identity providers) that raw package-manager invocations may skip.
- Verify tests pass in current state.
- Validate build succeeds.
- Detect primary language and stack from `{{CONFIG_DIR}}/framework-config.json`.
- Assert `.code-review-graph/graph.db` exists at the project root.
- Verify the active Codex session exposes `mcp__code_graph__*` tools.
- Assert `docs/llm-wiki/AGENTS.md` exists (confirms initialization ran for the Codex provider).
- Assert `docs/llm-wiki/wiki/` exists and contains the three core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`.
- Verify each of those wiki files starts with YAML frontmatter containing `document_type`, `summary`, and `last_updated` keys.
- If `framework-config.json > wiki.services` is non-empty, verify at least one matching file exists under `docs/llm-wiki/wiki/services/`.

Expected outputs: `$ARTIFACTS_DIR/.preflight-ok` exists and carries the current `git_head`; git clean, tests pass, build succeeds, graph DB exists, graph MCP tools are visible, LLM wiki is present and well-formed.

Constraint: If `ensure-context.sh` exits non-zero, emit `failed` and STOP. If any defensive assertion fails despite a fresh marker, delete the marker and rerun Part A once; if the assertion still fails, emit `failed` and STOP. Wiki staleness is no longer a preflight concern — Phase 8.5 handles it.

### Phase 1: Context Gathering

Produce a single canonical artifact at
`$ARTIFACTS_DIR/context/ticket-context.md` regardless of input source.
Every later phase reads from that path; nobody re-fetches from Jira /
re-reads the SDD markdown / re-parses `--from-input`.

Steps:
- If `--from-jira <TICKET-ID>`: invoke `/fetch-ticket-context` (the skill
  writes to the canonical path automatically).
- If `--from-markdown <PATH>`: copy the SDD ticket file to
  `$ARTIFACTS_DIR/context/ticket-context.md` (preserve the original body
  verbatim; add a one-line frontmatter `source: <PATH>`).
- If `--from-input "description"`: render the description into the same
  canonical file under `## Description`; add `## Ticket` with a
  synthetic id (`AD-HOC-<timestamp>`).

Constraint: this phase does NOT plan, analyze requirements, or recommend
implementer agents — those are the planner's job in Phase 3. Phase 1's
only product is the canonical context artifact.

Expected outputs: `$ARTIFACTS_DIR/context/ticket-context.md` exists.

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

Before switching to the planner persona, enumerate the implementer agents that actually exist in this project's `{{CONFIG_DIR}}/agents/`.
The planner MUST constrain its `Recommended Implementers` mapping to this set:

```bash
AVAILABLE_IMPLEMENTERS=$(ls {{CONFIG_DIR}}/agents/implementer-*.md 2>/dev/null \
  | xargs -n1 basename | sed 's/\.md$//' | tr '\n' ',' | sed 's/,$//')
```

Apply the planner role prompt: read `{{CONFIG_DIR}}/agents/planner.md`
and follow it as your active persona. Feed it the canonical artifact
PATHS (not bodies):
- `$ARTIFACTS_DIR/context/ticket-context.md`
- `$ARTIFACTS_DIR/context/wiki-context.md` (`WIKI_INDEX_SNAPSHOT`,
  `WIKI_CORE`, and `## get_minimal_context_tool Payload` when present).
- Available implementers (you MUST constrain your bucket→agent
  mapping to this set — see the planner template's `Recommended
  Implementers (per-service)` selection rule, step 3 fallback):
  `$AVAILABLE_IMPLEMENTERS`.

Hard rules — re-call ban:
- Do NOT re-call `mcp__code_graph__get_minimal_context_tool`. Phase 2
  already invoked it (at most once); the full payload is in
  `wiki-context.md` under `## get_minimal_context_tool Payload` if it
  ran. Reference that payload by section name; do not regenerate it.
- Do NOT re-fetch the ticket from Jira. The body, comments, and linked
  resources are in `ticket-context.md`.

Targeted graph queries the planner MAY run when the wiki bodies do not
resolve a load-bearing question:
`mcp__code_graph__semantic_search_nodes_tool`,
`mcp__code_graph__get_impact_radius_tool`,
`mcp__code_graph__query_graph_tool` (callers_of / imports_of / tests_for).
`mcp__code_graph__get_architecture_overview_tool` is forbidden (response
cannot be bounded — see graph navigation discipline).

Produce an `Implementation Plan` containing:
- Implementation strategy.
- Files to create/modify.
- Test strategy.
- `Wiki Evidence` (cite the wiki paths actually consulted).
- `Graph Evidence` (cite the graph queries and results that justify the plan).
- `Recommended Implementers` section — a non-empty ordered list, one entry per unique language bucket derived from `framework-config.json::stack_profile.services` (longest-prefix file→service match, dedupe by `language`; `python`→`implementer-python`, `typescript`/`javascript`→`implementer-typescript`, anything else or unmapped→`implementer-generic`). Each entry names its agent, the service IDs it covers, the scoped files within them, and a one-line rationale. Order matters — Phase 5 dispatches entries sequentially, so list producers before consumers (e.g., a backend stack before a frontend stack that consumes its endpoints).

If the workspace contains multiple git repos and the change touches more than one, the plan SHOULD identify which repo each file belongs to so Phase 9 can fan out cleanly. `Recommended Implementers` and `Affected Repositories` are orthogonal — the former drives Phase 5 per-stack implementer dispatch, the latter drives Phase 8.4 commit + Phase 9 PR fanout per git repo.

Persist the plan verbatim to `$ARTIFACTS_DIR/plans/implementation-plan.md`.

Expected outputs: `$ARTIFACTS_DIR/plans/implementation-plan.md` exists, contains `Wiki Evidence` and `Graph Evidence`, test strategy and target files are named, contains a `Recommended Implementers` section that is a non-empty ordered list where **every entry's agent name appears verbatim in `$AVAILABLE_IMPLEMENTERS`** (no recommending agents that are not installed under `{{CONFIG_DIR}}/agents/`), plus the service IDs and scoped files each entry covers, and (in `multi` mode) contains an `Affected Repositories` section listing each touched repo path with the files within it. In `single` mode the `Affected Repositories` section may be absent — the agent infers it as the single workspace repo.

Constraint: Do not proceed if the plan is missing, Wiki Evidence or Graph Evidence is absent, `Recommended Implementers` is missing/empty, or any entry's agent name is not present in `$AVAILABLE_IMPLEMENTERS` (i.e., not installed under `{{CONFIG_DIR}}/agents/`).

### Phase 4: Environment Setup

Steps:
- Create feature branch (e.g., `feature/PROJ-123-description`). **MUST branch from the currently active branch in each affected repo.** MUST NOT `git checkout`/`switch` to another branch first, and MUST NOT pass a base argument to `git checkout -b`. Branching from any base other than the active branch REQUIRES explicit user consent — never assume `main`/`master`/`development`. Then run `git -C <repo> checkout -b <new-branch>` per affected repo.
- Allocate service ports (if needed).
- Create docker-compose override (if needed).
- Capture BEFORE screenshots into `$ARTIFACTS_DIR/screenshots/before/` (if frontend).

Expected outputs: feature branch created in each affected repo, rooted at the branch that was active when Phase 4 started.

Constraint: STOP if branching from anything other than the active branch without explicit user consent.

### Phase 5: Implementation

Parse the planner's `Recommended Implementers` section into an ordered list. **For each entry, in the listed order**, apply that implementer's role prompt: read `{{CONFIG_DIR}}/agents/<entry.agent>.md`. Every entry's `<entry.agent>` was already validated against `$AVAILABLE_IMPLEMENTERS` in Phase 3, so any installed `implementer-*.md` file is fair game (not just the canonical TypeScript / Python / generic trio). Sequential — finish the current entry's
scoped files before moving to the next entry, so later entries see
earlier edits on disk (this matters when one stack's contract feeds
another, e.g., a backend endpoint consumed by a frontend client).

Feed each role prompt the canonical artifact PATHS (not bodies):
- `$ARTIFACTS_DIR/plans/implementation-plan.md`
- `$ARTIFACTS_DIR/context/wiki-context.md`
- `$ARTIFACTS_DIR/context/ticket-context.md`

Plus the entry's `Scoped Files` list (verbatim from the plan). Treat
files outside the current entry's scope as out of scope for this
persona pass.

Hard rules — re-call ban:
- Do NOT re-call `mcp__code_graph__get_minimal_context_tool`. The Phase
  2 payload (when present) is referenced in the plan; the planner
  already consumed it. Re-running it costs tokens for no new
  information.
- Do NOT re-read full wiki page bodies whose relevant excerpts are
  already inlined in the plan's `Wiki Evidence` section. Read the full
  body ONLY when the plan's `Implementation Steps` flags a specific
  edit as high-risk and cites a section the excerpt didn't cover.
- Do NOT re-run any graph query the plan already documents in
  `Graph Evidence`. Reuse those findings.

Fresh graph checks the implementer MAY run, only when the plan flags an
edit as high-risk OR when source code reality contradicts the plan's
evidence: `mcp__code_graph__get_impact_radius_tool`,
`mcp__code_graph__query_graph_tool`,
`mcp__code_graph__semantic_search_nodes_tool`.
`mcp__code_graph__get_architecture_overview_tool` is forbidden.

- Follow project conventions from `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}`.
- Create/modify files exactly as listed in the plan.

Expected outputs, **per entry**: code changes exist within that entry's scope, new files created as planned; the per-entry completion summary lists wiki pages consulted and any fresh graph checks; the per-entry completion summary contains a `## Wiki Delta Hints` JSONL fenced block (may be empty, but section must be present).

Constraint: Do not advance to the next entry — and do not proceed to Phase 6 — if any entry produced no code changes within its scope, did not consume the plan's Wiki Evidence / Graph Evidence, or did not emit a parseable Wiki Delta Hints block.

### Phase 6: Testing

If `--skip-tests` flag: emit `completed` with `note: "Skipped via flag"` and continue.

Otherwise:
- **Resolve the test command from `framework-config.json::stack_profile.command_catalog`.** Look up the preferred command for each test op: `run_tests`, `run_unit_tests`, `run_integration_tests`, `run_e2e`. The first entry of each operation array is the highest-tier candidate (wrapper → readme → package_manager → ci). **Prefer the wrapper** (`make tests`, `just test`, `task test`, `./scripts/test.sh`) over per-service package-manager commands when both exist — wrappers orchestrate dependent services (databases, queues, identity providers) that raw `pnpm test` / `npm test` / `pytest` invocations may silently skip.
- Only fall back to auto-detection (Jest, Pytest, Playwright, Vitest, etc.) when the catalog has NO entry for the relevant operation.
- Run unit tests with coverage, integration tests, E2E tests (if applicable); collect coverage reports into `$ARTIFACTS_DIR/coverage/`.

In a multi-repo workspace, run the test stack in each affected child repo and namespace coverage under `$ARTIFACTS_DIR/coverage/<repo-basename>/`.

If tests fail: map each failing test file back to its owning service via longest-prefix match on `stack_profile.services[].path`, then re-apply ONLY the `Recommended Implementers` entries whose `Scoped Files` overlap with the failure set (in the original listed order) with the failing test output and fix. Max 3 fix iterations, **global** across all implementers and all repos in multi-repo workspaces.

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
- Update `{{INSTRUCTION_FILE}}` and the relevant convention skill (`code-conventions` / `multi-file-workflows` / `testing-conventions`) surgically if needed; descriptive context flows to the wiki via Phase 8.5, not into a skill body.

Expected outputs: doc-updater ran and produced an analysis.

Constraint: Do not proceed if doc-updater was not invoked.

### Phase 8.4: Implementation Commit

For each affected repo (single workspace root, or each child repo from the planner's `Affected Repositories`):

1. List changed files with `git -C <repo> status --porcelain`; exclude `docs/llm-wiki/**` (Phase 8.5 owns it). Empty list → emit `failed` and STOP (single-repo) or skip with a note (multi-repo).
2. `git -C <repo> add -- <files>` then `git -C <repo> commit -m "<message>"`. Never `git add .` / `-A` / `commit -a`. Do not skip hooks.
3. Write the new SHA to `$ARTIFACTS_DIR/commits/<repo-basename>.sha`.

Expected outputs: each affected repo has one new implementation commit; SHAs written under `$ARTIFACTS_DIR/commits/<repo-basename>.sha`.

Constraint: emit `failed` and STOP if any pre-commit hook fails — surface output verbatim. Earlier sibling commits remain for inspection.

### Phase 8.5: Wiki Refresh

CRITICAL: invoke `/wiki-refresh --commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR`. The skill is multi-repo aware — one invocation handles the whole workspace.

Orchestrator responsibilities in this phase:

- Invoke the skill with the flags above.
- If `/wiki-refresh` reports a hard error (`.state.json` missing, AI parse failure, page update failed, or commit pre-commit hook failed), emit `failed` and STOP. Do NOT create the PR.
- If `/wiki-refresh` surfaces a "potential new service detected" suggestion, record it in the PR body. Do NOT auto-invoke `/wiki-add-service` — the user decides.
- If the refresh produced no changes ("wiki is fresh" or "no high-level facts drifted"), do nothing and continue to Phase 9.

Expected outputs: /wiki-refresh invocation completed; wiki commit produced when the wiki repo is tracked OR a diff manifest + warning file exist when the workspace parent is untracked OR the skill reported "wiki is fresh" with no changes.

Constraint: Do not proceed if /wiki-refresh reported a hard error. New-service suggestions are advisory and do not block.

### Phase 9: PR Creation

If `--skip-pr` flag: skip push and PR creation, emit `completed` with `note: "Skipped via flag"` and continue. 

- BEFORE Phase 9 starts: confirm Phase 8.5 marked completed (wiki refreshed or confirmed unchanged). The implementation commit from Phase 8.4 and the optional wiki commit from Phase 8.5 are already on the branch — Phase 9 only pushes and opens PRs.

Local commits from Phase 8.4 + Phase 8.5 remain on the branch.

Otherwise, **single-repo path**:

- `git -C <workspace-root> push -u origin <branch>`
- `gh pr create` with:
  - Auto-generated title from ticket.
  - Summary of changes.
  - Test plan checklist.
  - Link to original ticket.
- Return the PR URL.

**Multi-repo workspace**: if the change touches more than one git repo, delegate the fanout to `/repo-fanout-pr --no-commit --repos <abs1>,<abs2>,... --branch <branch> --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR` instead. The skill asserts every repo's working tree is clean and the branch is ahead of base, pushes each branch, opens one PR per repo, and cross-links the PR bodies. The orchestrator just consumes its returned `result.json`.

If Phase 8.5 wrote `$ARTIFACTS_DIR/wiki/wiki-warning.txt`, append its contents to every PR body created in this phase.

Expected outputs: branch pushed and PR created with URL in every affected repo; OR PR was skipped via `--skip-pr` (commits stay local in every affected repo). Multi-repo: every affected repo has its own PR (or local commits under `--skip-pr`), and the PR bodies are cross-linked.

Constraint: Do not proceed if any expected PR was not created, unless `--skip-pr` was set (in which case local commits in every affected repo are sufficient).

### Phase 10: Review Loop

Steps:
For each PR URL produced by Phase 9 (single-repo: one URL; multi-repo: one per affected repo):
- Run `/pr-reviewer --pr-url <URL> --jira-key <TICKET_ID> --mode automated [--repos <abs-repo-path>]`.
- Run `/security-review --pr-url <URL> --jira-key <TICKET_ID> [--repos <abs-repo-path>] [--baseline <prior-findings.json>]`.
- If blocking issues are found:
  - Map each finding's file path back to its owning service (longest-prefix on `stack_profile.services[].path`); re-apply ONLY the `Recommended Implementers` entries whose `Scoped Files` overlap with the finding set, in the original listed order, with the review findings.
  - Re-run tests (Phase 6 logic).
  - Re-run the reviews.
  - Max 3 iterations, **global** across all PRs, all implementers, and all repos in a multi-repo workspace.
- Exit when approved or the global iteration cap is reached.

After the loop, in multi-repo mode only:
- `/pr-reviewer --aggregate --jira-key <TICKET_ID>` → writes `{{TEMP_DIR}}/artifacts/<TICKET_ID>/pr/cross-repo-summary.{json,md}` (cross-repo concerns + merge order).
- `/security-review --aggregate --jira-key <TICKET_ID>` → writes `{{TEMP_DIR}}/artifacts/<TICKET_ID>/security/cross-repo-summary.{json,md}` (cross-cutting security concerns + dependency-ordered remediation).

Fix commits land in the corresponding repo (`git -C <repo>`). Skip the aggregation pass in single-repo mode.

Expected outputs: pr-reviewer and security-review ran; per-PR results JSONs exist; cross-repo summary JSON exists when multi-repo. No blocking issues remain, or fixes were attempted up to the limit.

Constraint: If max iterations reached with unresolved issues, record them in the PR body and proceed to cleanup.

### Phase 11: Cleanup

Steps:
- Remove docker-compose override (if created).
- Archive artifacts (`tar` the `$ARTIFACTS_DIR` into `{{TEMP_DIR}}/tickets/<TICKET_ID>/artifacts.tar.gz`).
- Run `aggregate-metrics` CLI to produce `<ARTIFACTS_DIR>/metrics/summary.md`; include the summary path in the final report.
- Print the final summary report. List every PR URL produced (multi-repo workspaces have more than one), the per-repo coverage paths under `$ARTIFACTS_DIR/coverage/`, the wiki refresh outcome, and the metrics summary path.

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
- `planner` role prompt — Phase 3 sole `Implementation Plan` author, Wiki Evidence and Graph Evidence owner, `Recommended Implementers` per-stack selector.
- `implementer-<stack>` role prompts — Phase 5 (one persona switch per stack from `stack_profile.services`, applied sequentially in the planner's listed order), Phase 6 (fixes — only the implementer(s) owning failing tests), Phase 10 (fixes — only the implementer(s) owning review findings); each pass consumes the plan's Wiki + Graph evidence before any fresh discovery, scoped to its entry's `Scoped Files`.
- `visual-verifier` role prompt — Phase 7.
- `/doc-updater` — Phase 8.
- `/wiki-refresh` — Phase 8.5 (auto-invoked with `--commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR`; reads per-repo commits from `.state.json`, surgically edits affected pages under a high-level-only conservatism rule, commits `docs/llm-wiki/**` itself when the wiki is git-tracked or emits a diff manifest + warning for Phase 9 otherwise).
- `/repo-fanout-pr` — Phase 9 (multi-repo workspaces only — invoked with `--no-commit`; per-repo push + PR creation and cross-linking. The implementation commit is produced in Phase 8.4 before this skill runs.).
- `/pr-reviewer` — Phase 10 (run once per PR URL).
- `/security-review` — Phase 10 (run once per PR URL).
- `aggregate-metrics` CLI — Phase 11 (final metrics summary).

## Prerequisites

- Project initialized with `/initialize-project`.
- `code-review-graph` built and MCP-accessible.
- `.code-review-graph/graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`).
- Codex session has the `code_graph` MCP server registered and `mcp__code_graph__*` tools visible.
- LLM wiki exists at `docs/llm-wiki/` (workspace-scoped; lives at the workspace root in both single and multi mode) with `docs/llm-wiki/AGENTS.md` present.
- Git: at least one git repository reachable. Two supported shapes:
  - **single-repo**: workspace root is itself a git repo; `origin/development` or `origin/main` reachable (required for Phase 9 base-branch resolution).
  - **multi-repo**: workspace root is NOT a git repo but contains one or more child directories that ARE git repos (each with its own GitHub remote). Every child repo must have `origin/development` or `origin/main` reachable.
- Tests passing in current state — at the workspace root in single mode, in every child repo in multi mode.
- For `--from-jira`: Jira MCP configured.
- For GitHub PR: `gh` CLI configured and authenticated against every affected GitHub remote.
