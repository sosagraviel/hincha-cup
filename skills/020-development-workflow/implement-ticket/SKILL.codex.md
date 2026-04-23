---
name: implement-ticket
version: 3.0.0
last-updated: 2026-04-22
description: Implements a ticket end-to-end through 11 phases from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
user-invokable: true
disable-model-invocation: true
---

# Implement Ticket (Codex)

Input: $ARGUMENTS

Implement the ticket described above through the full 11-phase SDLC workflow.

## Execution Model — Codex-specific

**Codex does not spawn subagents programmatically.** You (the agent running this skill) execute every phase yourself, switching your operating persona by loading the corresponding role prompt from `{{CONFIG_DIR}}/agents/`:

- Planning phase: read `{{CONFIG_DIR}}/agents/planner.md` and follow its instructions as your active role.
- Implementation phase: read `{{CONFIG_DIR}}/agents/implementer-<stack>.md` (or `implementer-generic.md` as fallback) and follow it.
- Visual verification: read `{{CONFIG_DIR}}/agents/visual-verifier.md` and follow it.

When a phase below says "apply the planner role prompt", treat it as: read that file, internalise the instructions, and produce the artifact it specifies. Do not try to spawn it as a separate process.

## Flags

Parse the input for these flags:
- `--from-input "description"` — implement from plain text description
- `--from-jira <TICKET-ID>` — implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` — implement from markdown SDD ticket
- `--skip-tests` — skip testing phase
- `--skip-visual` — skip visual verification phase
- `--skip-pr` — skip PR creation (commit only)
- `--branch <NAME>` — custom branch name (default: auto-generated)

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
mkdir -p "$ARTIFACTS_DIR"
export ARTIFACTS_DIR
```

This keeps artifacts out of PRs (already covered by `.gitignore`), keeps paths consistent, and avoids polluting version control.

## Progress Tracking (file-based)

Codex has no `TaskCreate` tool. Track phase progress by appending JSONL events to a progress file so the state survives restarts and is observable from outside the session:

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
- Emit an `in_progress` record BEFORE starting each phase.
- Emit a `completed` record ONLY after verifying the Expected outputs for that phase.
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

Expected outputs: git clean, tests pass, build succeeds.

Constraint: If any check fails, emit `failed` and STOP. Do not continue.

### Phase 1: Context Gathering

Steps:
- If `--from-jira`: invoke `/fetch-ticket-context` to gather Jira/Confluence context.
- If `--from-markdown`: read the SDD ticket file.
- If `--from-input`: use the description directly.
- Extract requirements and acceptance criteria.
- Persist to `$ARTIFACTS_DIR/context.md`.

Expected outputs: `$ARTIFACTS_DIR/context.md` exists and contains requirements and acceptance criteria.

Constraint: Do not proceed if requirements could not be extracted.

### Phase 2: Planning

Steps:
1. Invoke `/analyze-requirements` skill to produce a requirements analysis.
2. Apply the planner role prompt: read `{{CONFIG_DIR}}/agents/planner.md` and produce a plan in `$ARTIFACTS_DIR/plan.md` containing: files to create/modify, test strategy, edge cases, risks.

Expected outputs: `$ARTIFACTS_DIR/plan.md` exists, test strategy defined, files to create/modify identified.

Constraint: Do not proceed if `plan.md` does not exist or omits files/tests.

### Phase 3: Environment Setup

Steps:
- Create feature branch (e.g., `feature/PROJ-123-description`).
- Allocate service ports (if needed).
- Create docker-compose override (if needed).
- Capture BEFORE screenshots into `$ARTIFACTS_DIR/screenshots/before/` (if frontend).

Expected outputs: feature branch created and checked out.

Constraint: None.

### Phase 4: Implementation

Apply the implementer role prompt: read `{{CONFIG_DIR}}/agents/implementer-<stack>.md` (fallback: `implementer-generic.md`) and follow its conventions. Execute the plan from `$ARTIFACTS_DIR/plan.md`.

- Follow project conventions from `{{CONFIG_DIR}}/{{INSTRUCTION_FILE}}`.
- Create/modify files exactly as listed in the plan.

Expected outputs: code changes exist, new files created as planned.

Constraint: Do not proceed if no code changes exist.

### Phase 5: Testing

Steps:
- Auto-detect testing framework (Jest, Pytest, Playwright).
- Run unit tests with coverage.
- Run integration tests.
- Run E2E tests (if applicable).
- Collect coverage reports into `$ARTIFACTS_DIR/coverage/`.

If tests fail: re-apply the implementer role prompt with the failing test output and fix. Max 3 fix iterations.

Expected outputs: all tests pass, coverage reports collected.

Constraint: If tests still fail after 3 iterations, emit `failed` and STOP.

### Phase 6: Visual Verification

If no frontend changes OR `--skip-visual` flag: mark completed with reason "Skipped" and continue.

Otherwise:
- Take screenshots of affected pages into `$ARTIFACTS_DIR/screenshots/after/`.
- Compare before/after with pixelmatch; write diff to `$ARTIFACTS_DIR/screenshots/diff/`.
- If any page has diff > 5%: apply the visual-verifier role prompt (`{{CONFIG_DIR}}/agents/visual-verifier.md`) on the diff images; act on its findings.

Expected outputs: screenshots compared OR phase correctly skipped.

Constraint: None.

### Phase 7: Documentation Update

Invoke `/doc-updater` skill. Do not skip this even if you think no docs need updating.

- Analyze changed files for doc impact.
- Apply the maintenance test (update only if truly needed).
- Update `{{INSTRUCTION_FILE}}` and project-context surgically if needed.

Expected outputs: doc-updater ran and produced an analysis.

Constraint: Do not proceed if doc-updater was not invoked.

### Phase 8: PR Creation

Steps:
- Commit all changes with a structured commit message.
- Push feature branch to remote.
- Create pull request with:
  - Auto-generated title from ticket.
  - Summary of changes.
  - Test plan checklist.
  - Link to original ticket.
- Return the PR URL.

Expected outputs: commit exists, branch pushed, PR created with URL.

Constraint: Do not proceed if PR was not created.

### Phase 9: Review Loop

Steps:
- Run `/pr-reviewer` skill on the created PR.
- Run `/security-review` skill on the diff.
- If blocking issues are found:
  - Re-apply the implementer role prompt with the review findings.
  - Re-run tests (Phase 5 logic).
  - Re-run the reviews.
  - Max 3 iterations.
- Exit when approved or max iterations reached.

Expected outputs: pr-reviewer and security-review ran; no blocking issues remain, or fixes were attempted up to the limit.

Constraint: If max iterations reached with unresolved issues, record them in the PR body and proceed to cleanup.

### Phase 10: Cleanup

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
- If Phase 5 fails after 3 iterations: stop and report.
- For other phases: attempt to recover once, then stop if still failing.

## Skills and Role Prompts Used

- `/fetch-ticket-context` — Phase 1 (Jira tickets only).
- `/analyze-requirements` — Phase 2.
- `planner` role prompt — Phase 2.
- `implementer-<stack>` role prompt — Phase 4, Phase 5 (fixes), Phase 9 (fixes).
- `visual-verifier` role prompt — Phase 6.
- `/doc-updater` — Phase 7.
- `/pr-reviewer` — Phase 9.
- `/security-review` — Phase 9.

## Prerequisites

- Project initialized with `/initialize-project`.
- Git repository with remote configured.
- Tests passing in current state.
- For `--from-jira`: Jira MCP configured.
- For GitHub PR: GitHub MCP or `gh` CLI configured.
