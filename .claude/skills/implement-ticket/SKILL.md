---
name: implement-ticket
version: 3.3.0
last-updated: 2026-04-23
description: Implements a ticket end-to-end through a wiki-aware and graph-aware 12-phase workflow from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
user-invokable: true
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Grep Glob Task TaskCreate TaskUpdate mcp__code_graph__get_minimal_context_tool
---

# Implement Ticket

Input: $ARGUMENTS

Implement the ticket described above through the full wiki-aware and graph-aware 12-phase SDLC workflow.

## Flags

Parse the input for these flags:
- `--from-input "description"` - implement from plain text description
- `--from-jira <TICKET-ID>` - implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` - implement from markdown SDD ticket
- `--skip-tests` - skip testing phase
- `--skip-visual` - skip visual verification phase
- `--skip-pr` - skip PR creation (commit only)
- `--branch <NAME>` - custom branch name (default: auto-generated)

## CRITICAL: Graph-Aware and Wiki-Aware Requirements

Both the graph path AND the AI Knowledge wiki must be active.

- `code-review-graph` MUST be built and MCP-accessible before planning starts.
- This framework uses `.code-graph.db` as the compatibility graph DB. Upstream `code-review-graph` defaults to `.code-review-graph/graph.db`.
- Project root `.mcp.json` MUST define `mcpServers.code_graph` so native Claude Code `/implement-ticket` sessions can load graph tools.
- Generated `.claude/agents/planner.md` and `.claude/agents/implementer-*.md` MUST expose exact `mcp__code_graph__*_tool` entries, not only the broad `mcp__code_graph` server alias.
- The actual active Claude Code session MUST expose `mcp__code_graph__*` tools. Agent frontmatter is only a subagent allowlist; it does not register the MCP server.
- The AI Knowledge wiki at `docs/ai-knowledge/` MUST exist with all five core documents present: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`. Each MUST contain YAML frontmatter with at least `document_type` and `graph_version` keys.
- If `framework-config.json > wiki.services` is non-empty, at least one matching file under `docs/ai-knowledge/services/` MUST exist.

If the graph DB, MCP config, graph-aware agents, active graph tools, or the AI Knowledge wiki are missing, STOP immediately. Tell the user to rerun `/initialize-project` or resource sync so `.code-graph.db`, project `.mcp.json`, graph-aware `.claude/agents/*`, and `docs/ai-knowledge/*` are regenerated. Then restart Claude Code in the project, approve the project MCP server if prompted, and verify `code_graph` with `/mcp` before using `/implement-ticket`.

## CRITICAL: Artifact Path Enforcement

**ALL artifacts MUST be saved to the following deterministic structure:**

```
.claude-temp/tickets/<TICKET_ID>/artifacts/
```

**NEVER save artifacts to:**
- `.claude/artifacts/`
- `.claude/screenshots/`
- `.claude/decisions/`
- `orchestration/artifacts/`
- Any other location

When spawning agents or invoking skills, ALWAYS pass the ARTIFACTS_DIR variable:
```bash
ARTIFACTS_DIR=".claude-temp/tickets/$TICKET_ID/artifacts"
export ARTIFACTS_DIR
```

This ensures:
- Artifacts are excluded from PRs (via `.gitignore`)
- Consistent paths across all workflows
- No artifact pollution in version control

## CRITICAL: Task Tracking Setup

BEFORE starting any phase work, you MUST create the full task list using TaskCreate. This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 12 tasks first, then set up dependencies, then begin Phase 0.

Create each task using TaskCreate with these exact values:

1. Phase 0: Preflight Validation
   subject: "Phase 0: Preflight Validation"
   activeForm: "Validating environment"
   Steps: Check git status, verify test commands work, verify build succeeds, detect primary language and stack, verify `.code-graph.db` exists, verify project `.mcp.json` has `mcpServers.code_graph`, verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools are visible, verify `docs/ai-knowledge/` exists with the five core files (`index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`), verify at least one `docs/ai-knowledge/services/*.md` exists.
   Expected outputs: git is clean, tests pass, build succeeds, graph DB exists, project MCP config exists, graph tools are visible in the active Claude Code session, graph-aware agents are present, AI Knowledge wiki is present and well-formed
   Constraint: If any check fails, STOP and report. Do not proceed to Phase 1.

2. Phase 1: Context Gathering
   subject: "Phase 1: Context Gathering"
   activeForm: "Gathering ticket context"
   Steps: Fetch from source (Jira/Markdown/Input), extract requirements and acceptance criteria, save context to artifacts directory
   Expected outputs: context and requirements extracted and available for Phase 2
   Constraint: Do not proceed if requirements could not be extracted.

3. Phase 2: Wiki Context Preload
   subject: "Phase 2: Wiki Context Preload"
   activeForm: "Preloading AI Knowledge wiki context"
   Steps: Read the five core wiki docs under `docs/ai-knowledge/` (`index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`) and collect their paths as `WIKI_CORE`, call `mcp__code_graph__get_minimal_context_tool({ task: "<ticket summary>", changed_files: [], base: "HEAD~1" })` exactly once and keep its full response, extract relevant service IDs from the query and `SERVICES.md`, for each identified service resolve `docs/ai-knowledge/services/<service-id>.md` and collect matches as `WIKI_SERVICES` (cap at 5), read each loaded wiki file's YAML frontmatter and persist `WIKI_CORE`, `WIKI_SERVICES`, and the raw `get_minimal_context_tool` payload to `$ARTIFACTS_DIR/context/wiki-context.md`
   Expected outputs: `$ARTIFACTS_DIR/context/wiki-context.md` exists and contains `WIKI_CORE`, `WIKI_SERVICES`, and the preserved `get_minimal_context_tool` payload for reuse by the planner
   Constraint: Do not proceed if `wiki-context.md` is missing, if any `WIKI_CORE` file failed to load, or if `get_minimal_context_tool` failed. `WIKI_SERVICES` may be empty when no service was implicated. The `get_minimal_context_tool` call MUST NOT be re-issued by later phases.

4. Phase 3: Planning
   subject: "Phase 3: Planning"
   activeForm: "Creating implementation plan"
   Steps: MUST invoke /analyze-requirements skill to produce structured requirements analysis input, MUST spawn graph-aware planner agent, planner consumes the requirements analysis input, the ticket context from Phase 1, and the Phase 2 wiki context (`WIKI_CORE`, `WIKI_SERVICES`, preserved `get_minimal_context_tool` payload), planner returns the only Phase 3 planning artifact named `Implementation Plan`, parent/main agent persists that returned plan under the normal artifact path, planner includes implementation strategy/files to create or modify/test strategy/Wiki Evidence/Graph Evidence in that artifact
   Expected outputs: requirements analysis input exists, graph-aware planner agent was spawned with the Phase 2 wiki context injected, parent/main agent saved the planner-authored `Implementation Plan` as the only Phase 3 planning artifact, Wiki Evidence exists and cites the wiki paths actually used, Graph Evidence exists, test strategy defined, files to create/modify identified
   Constraint: Do not proceed if planner agent was not spawned, Wiki Evidence or Graph Evidence is absent, the planner-authored `Implementation Plan` does not exist, or Phase 3 produced competing planning artifacts.

5. Phase 4: Environment Setup
   subject: "Phase 4: Environment Setup"
   activeForm: "Setting up environment"
   Steps: Create feature branch, allocate ports (if needed), create docker-compose override (if needed), set up environment variables, capture BEFORE screenshots (if frontend)
   Expected outputs: feature branch created and checked out
   Constraint: None.

6. Phase 5: Implementation
   subject: "Phase 5: Implementation"
   activeForm: "Implementing code changes"
   Steps: MUST spawn graph-aware implementer-{lang} agent with the planner-authored `Implementation Plan` from Phase 3, pass the same `WIKI_SERVICES` paths the planner cited plus the plan's `Wiki Evidence` and `Graph Evidence`, implementer absorbs those artifacts before any fresh discovery, implementer runs targeted graph checks only for high-risk edits flagged by the plan, implements code following the plan, follows project conventions from CLAUDE.md, creates/modifies files as needed, includes wiki pages consulted and any fresh graph queries in the final implementation summary
   Expected outputs: graph-aware implementer agent was spawned, implementer confirmed it consumed the plan's Wiki Evidence and Graph Evidence, code changes exist, new files created as planned
   Constraint: Do not proceed if implementer agent was not spawned, the plan's Wiki Evidence / Graph Evidence were not consumed, or no code changes exist.

7. Phase 6: Testing
   subject: "Phase 6: Testing"
   activeForm: "Running tests"
   Steps: Auto-detect testing framework, run unit tests with coverage, run integration tests, run E2E tests (if applicable), collect coverage reports, if tests fail spawn implementer to fix (max 3 iterations)
   Expected outputs: all tests pass, coverage reports collected
   Constraint: If tests fail after 3 fix iterations, STOP and report failure. Do not proceed.

8. Phase 7: Visual Verification
   subject: "Phase 7: Visual Verification"
   activeForm: "Verifying visual changes"
   Steps: If no frontend changes or --skip-visual flag mark completed as "Skipped" and proceed, otherwise take screenshots, compare with pixelmatch, if diff > 5% MUST spawn visual-verifier agent
   Expected outputs: screenshots compared OR phase correctly skipped
   Constraint: None.

9. Phase 8: Documentation Update
   subject: "Phase 8: Documentation Update"
   activeForm: "Updating documentation"
   Steps: MUST invoke /doc-updater skill, analyze changed files for doc impact, apply maintenance test, update CLAUDE.md and project-context if needed
   Expected outputs: doc-updater skill was invoked and analysis completed
   Constraint: Do not proceed if doc-updater was not invoked.

10. Phase 9: PR Creation
    subject: "Phase 9: PR Creation"
    activeForm: "Creating pull request"
    Steps: Commit all changes, push feature branch, create pull request with title/summary/test plan/ticket link, return PR URL
    Expected outputs: commit exists, branch pushed, PR created with URL
    Constraint: Do not proceed if PR was not created.

11. Phase 10: Review Loop
    subject: "Phase 10: Review Loop"
    activeForm: "Running review loop"
    Steps: Run PR review via /pr-reviewer skill, run security review via /security-review skill, if blocking issues spawn implementer for fixes and re-run tests, max 3 iterations
    Expected outputs: PR review ran, security review ran, either no blocking issues or fixes applied
    Constraint: If max iterations reached with unresolved issues, report and proceed to cleanup.

12. Phase 11: Cleanup
    subject: "Phase 11: Cleanup"
    activeForm: "Cleaning up environment"
    Steps: Remove docker-compose override (if created), archive artifacts, print final summary report
    Expected outputs: cleanup done, summary printed
    Constraint: None. This is the final phase.

After creating all 12 tasks, use TaskUpdate to chain dependencies:
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

### Task Status Rules

- Use TaskUpdate to mark a task `in_progress` BEFORE starting any work on that phase
- Use TaskUpdate to mark a task `completed` ONLY after verifying the Expected outputs listed above
- NEVER mark a task completed if expected outputs are missing, required agents were not spawned, or errors occurred
- If a phase is skipped via flag: mark it completed with description "Skipped via flag"

## Phase Execution

Execute each phase sequentially. Do not proceed to the next phase until the current phase is marked completed. For each phase, follow the Steps and verify Expected outputs listed above.

### Phase 0: Preflight Validation

- Check git status (no uncommitted changes)
- Verify tests pass in current state
- Validate build succeeds
- Detect primary language and stack
- Verify `.code-graph.db` exists at the project root
- Verify project root `.mcp.json` has `mcpServers.code_graph`
- Verify `/mcp` shows `code_graph` connected or active `mcp__code_graph__*` tools are visible in this Claude Code session
- Verify generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries in their frontmatter, not only the broad `mcp__code_graph` server alias
- Verify `docs/ai-knowledge/` exists and contains all five core files: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`
- Verify each of those five wiki files starts with YAML frontmatter containing `document_type` and `graph_version` keys

CRITICAL: If any check fails, STOP. Report the failure. Do not continue.

For graph or wiki failures, tell the user to rerun `/initialize-project` or resource sync so `.code-graph.db`, project `.mcp.json`, graph-aware `.claude/agents/*`, and `docs/ai-knowledge/*` are regenerated. Then restart Claude Code, approve the project MCP server if prompted, and verify `code_graph` with `/mcp`.

CONTINUE WITH Phase 1.

### Phase 1: Context Gathering

- If `--from-jira`: MUST invoke `/fetch-ticket-context` to gather Jira/Confluence context
- If `--from-markdown`: read the SDD ticket file
- If `--from-input`: use description directly
- Extract requirements and acceptance criteria

CONTINUE WITH Phase 2.

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

CRITICAL: Do not proceed to Phase 3 if `wiki-context.md` is missing, any `WIKI_CORE` file failed to load, or `get_minimal_context_tool` failed. `WIKI_SERVICES` may legitimately be empty for tickets that touch no identified service.

CONTINUE WITH Phase 3.

### Phase 3: Planning

CRITICAL: You MUST do both of these. Do not skip either one.

1. Invoke `/analyze-requirements` skill to produce structured requirements analysis input. Capture its output path for step 2.

2. Delegate planning to the `planner` subagent. Use the `Task` tool with `subagent_type: "planner"` and pass ONLY a short task description listing the input paths below. The planner's system prompt lives at `.claude/agents/planner.md` and is authoritative — do NOT restate, paraphrase, or summarize the planner's instructions in your Task call. Pass input paths, not behavior.

   Required Task description template:
   ```
   Produce the Phase 3 Implementation Plan for ticket <TICKET_ID>.
   Inputs (read from disk):
   - Ticket context: <path from Phase 1>
   - Requirements analysis: <path from /analyze-requirements step 1>
   - Wiki context (WIKI_CORE, WIKI_SERVICES, preserved get_minimal_context_tool payload): $ARTIFACTS_DIR/context/wiki-context.md
   Return the Implementation Plan as markdown following the structure defined in your system prompt.
   ```

   Do not include tool-use instructions, Wiki-First rules, or Graph Evidence formatting in the Task call — the planner already has those in its `.claude/agents/planner.md` system prompt. Adding them here causes the parent to paraphrase and drift.

3. Persist the planner's returned markdown verbatim to `$ARTIFACTS_DIR/plans/implementation-plan.md`.

After the planner returns, verify:
- Requirements analysis input exists
- `$ARTIFACTS_DIR/plans/implementation-plan.md` exists and is the planner's output unmodified
- `Wiki Evidence` section is present and names the wiki paths consumed
- `Graph Evidence` section is present and lists any additional graph calls beyond the Phase 2 preload
- Test strategy is defined
- Files to create/modify are identified

Do not create, save, or hand off any competing implementation plan from `/analyze-requirements`. Its output is input to the planner only. The planner subagent returns markdown; the parent/main agent persists it verbatim.

CONTINUE WITH Phase 4.

### Phase 4: Environment Setup

- Create feature branch (e.g., `feature/PROJ-123-description`)
- Allocate ports for services (if needed)
- Create docker-compose override (if needed)
- Capture BEFORE screenshots (if frontend)

CONTINUE WITH Phase 5.

### Phase 5: Implementation

Delegate implementation to the stack-specific `implementer-{lang}` subagent. Pick the subagent_type from the planner's `Recommended Implementer` section in the Implementation Plan.

Use the `Task` tool with that `subagent_type` and pass ONLY a short task description listing the input paths below. The implementer's system prompt lives at `.claude/agents/implementer-{lang}.md` and is authoritative — do NOT restate, paraphrase, or summarize the implementer's instructions in your Task call. Pass input paths, not behavior.

Required Task description template:
```
Implement ticket <TICKET_ID> according to the Implementation Plan.
Inputs (read from disk):
- Implementation Plan: $ARTIFACTS_DIR/plans/implementation-plan.md
- Wiki context (same as the planner used): $ARTIFACTS_DIR/context/wiki-context.md
Follow the plan exactly. Return a short completion summary per your system prompt.
```

Do not include graph-query rules, wiki-handling guidance, or tool-use instructions in the Task call — the implementer already has those in its `.claude/agents/implementer-{lang}.md` system prompt. Adding them here causes the parent to paraphrase and drift.

After the implementer returns, verify:
- Wiki pages consulted and any fresh graph queries are listed in the completion summary
- Any inconclusive evidence is called out
- Code changes exist in the working tree
- New files were created as planned

CONTINUE WITH Phase 6.

### Phase 6: Testing

- Auto-detect testing framework (Jest, Pytest, Playwright)
- Run unit tests with coverage
- Run integration tests
- Run E2E tests (if applicable)
- Collect coverage reports

If tests fail: spawn implementer to fix issues. Max 3 fix iterations.

CRITICAL: If tests still fail after 3 iterations, STOP. Report failure. Do not continue.

CONTINUE WITH Phase 7.

### Phase 7: Visual Verification

If no frontend changes or `--skip-visual` flag: mark completed as "Skipped" and continue.

Otherwise:
- Take screenshots of affected pages
- Compare before/after with pixelmatch
- If diff > 5%: MUST spawn `visual-verifier` agent

CONTINUE WITH Phase 8.

### Phase 8: Documentation Update

CRITICAL: You MUST invoke `/doc-updater` skill. Do not skip this even if you think no docs need updating.

- Analyze changed files for doc impact
- Apply maintenance test (only update if truly needed)
- Update CLAUDE.md and project-context surgically if needed

CONTINUE WITH Phase 9.

### Phase 9: PR Creation

- Commit all changes with structured commit message
- Push feature branch to remote
- Create pull request with:
  - Auto-generated title from ticket
  - Summary of changes
  - Test plan checklist
  - Link to original ticket
- Return PR URL

CRITICAL: Do not proceed if PR was not created.

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
- Report final status with summary

## Error Handling

If a phase fails:
- Do NOT mark the task as completed
- Report which phase failed and why
- If Phase 0 fails: stop immediately
- If graph DB, project MCP config, active graph tools, exact graph-aware subagent allowlists, or the AI Knowledge wiki (`docs/ai-knowledge/*`) are unavailable: stop immediately and instruct the user to rerun `/initialize-project` or resource sync, restart Claude Code, approve the project MCP server if prompted, and verify `code_graph` with `/mcp`
- If Phase 2 fails (wiki preload): stop and report. Do not fall back to a graph-only path — the planner depends on the wiki context artifact.
- If Phase 6 fails after 3 fix iterations: stop and report
- For other phases: attempt to recover once, then stop if still failing

## Skills and Agents Used

- `/fetch-ticket-context`: Phase 1 (Jira tickets only)
- `mcp__code_graph__get_minimal_context_tool`: Phase 2 (called exactly once; result reused by planner)
- `/analyze-requirements`: Phase 3 structured requirements analysis input provider
- `planner` agent: Phase 3 sole `Implementation Plan` author, Wiki Evidence and Graph Evidence owner
- `implementer-{lang}` agent: Phase 5, Phase 6 (fixes), Phase 10 (fixes); consumes planner's Wiki+Graph evidence before any fresh discovery
- `visual-verifier` agent: Phase 7
- `/doc-updater`: Phase 8
- `/pr-reviewer`: Phase 10
- `/security-review`: Phase 10

## Prerequisites

- Project initialized with `/initialize-project`
- `code-review-graph` built and MCP-accessible
- `.code-graph.db` exists at the project root (framework compatibility DB; upstream default is `.code-review-graph/graph.db`)
- Project root `.mcp.json` defines `mcpServers.code_graph`
- Claude Code has been restarted after MCP config changes and `/mcp` shows `code_graph` connected
- Generated planner and implementer agents expose exact `mcp__code_graph__*_tool` entries
- AI Knowledge wiki exists at `docs/ai-knowledge/`
- Git repository with remote configured
- Tests passing in current state
- For `--from-jira`: Jira MCP configured
- For GitHub PR: GitHub MCP or gh CLI configured
