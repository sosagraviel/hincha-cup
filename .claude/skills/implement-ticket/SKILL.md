---
name: implement-ticket
version: 3.0.0
last-updated: 2026-04-15
description: Implements a ticket end-to-end through 11 phases from planning to PR. Use when user says "implement ticket", "implement PROJ-123", or provides a Jira ID or markdown spec to implement.
argument-hint: '[--from-jira TICKET-ID | --from-input "description" | --from-markdown PATH]'
user-invokable: true
disable-model-invocation: true
---

# Implement Ticket

Input: $ARGUMENTS

Implement the ticket described above through the full 11-phase SDLC workflow.

## Flags

Parse the input for these flags:
- `--from-input "description"` - implement from plain text description
- `--from-jira <TICKET-ID>` - implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` - implement from markdown SDD ticket
- `--skip-tests` - skip testing phase
- `--skip-visual` - skip visual verification phase
- `--skip-pr` - skip PR creation (commit only)
- `--branch <NAME>` - custom branch name (default: auto-generated)

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

BEFORE starting any phase work, you MUST create the full task list using TaskCreate. This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 11 tasks first, then set up dependencies, then begin Phase 0.

Create each task using TaskCreate with these exact values:

1. Phase 0: Preflight Validation
   subject: "Phase 0: Preflight Validation"
   activeForm: "Validating environment"
   Steps: Check git status, verify test commands work, verify build succeeds, detect primary language and stack
   Expected outputs: git is clean, tests pass, build succeeds
   Constraint: If any check fails, STOP and report. Do not proceed to Phase 1.

2. Phase 1: Context Gathering
   subject: "Phase 1: Context Gathering"
   activeForm: "Gathering ticket context"
   Steps: Fetch from source (Jira/Markdown/Input), extract requirements and acceptance criteria, save context to artifacts directory
   Expected outputs: context and requirements extracted and available for Phase 2
   Constraint: Do not proceed if requirements could not be extracted.

3. Phase 2: Planning
   subject: "Phase 2: Planning"
   activeForm: "Creating implementation plan"
   Steps: MUST invoke /analyze-requirements skill, MUST spawn planner agent, generate implementation strategy, identify files to create/modify, create test strategy
   Expected outputs: planner agent was spawned, implementation plan exists, test strategy defined, files to modify identified
   Constraint: Do not proceed if planner agent was not spawned or plan does not exist.

4. Phase 3: Environment Setup
   subject: "Phase 3: Environment Setup"
   activeForm: "Setting up environment"
   Steps: Create feature branch, allocate ports (if needed), create docker-compose override (if needed), set up environment variables, capture BEFORE screenshots (if frontend)
   Expected outputs: feature branch created and checked out
   Constraint: None.

5. Phase 4: Implementation
   subject: "Phase 4: Implementation"
   activeForm: "Implementing code changes"
   Steps: MUST spawn implementer-{lang} agent with the plan from Phase 2, implement code following plan, follow project conventions from CLAUDE.md, create/modify files as needed
   Expected outputs: implementer agent was spawned, code changes exist, new files created as planned
   Constraint: Do not proceed if implementer agent was not spawned or no code changes exist.

6. Phase 5: Testing
   subject: "Phase 5: Testing"
   activeForm: "Running tests"
   Steps: Auto-detect testing framework, run unit tests with coverage, run integration tests, run E2E tests (if applicable), collect coverage reports, if tests fail spawn implementer to fix (max 3 iterations)
   Expected outputs: all tests pass, coverage reports collected
   Constraint: If tests fail after 3 fix iterations, STOP and report failure. Do not proceed.

7. Phase 6: Visual Verification
   subject: "Phase 6: Visual Verification"
   activeForm: "Verifying visual changes"
   Steps: If no frontend changes or --skip-visual flag mark completed as "Skipped" and proceed, otherwise take screenshots, compare with pixelmatch, if diff > 5% MUST spawn visual-verifier agent
   Expected outputs: screenshots compared OR phase correctly skipped
   Constraint: None.

8. Phase 7: Documentation Update
   subject: "Phase 7: Documentation Update"
   activeForm: "Updating documentation"
   Steps: MUST invoke /doc-updater skill, analyze changed files for doc impact, apply maintenance test, update CLAUDE.md and project-context if needed
   Expected outputs: doc-updater skill was invoked and analysis completed
   Constraint: Do not proceed if doc-updater was not invoked.

9. Phase 8: PR Creation
   subject: "Phase 8: PR Creation"
   activeForm: "Creating pull request"
   Steps: Commit all changes, push feature branch, create pull request with title/summary/test plan/ticket link, return PR URL
   Expected outputs: commit exists, branch pushed, PR created with URL
   Constraint: Do not proceed if PR was not created.

10. Phase 9: Review Loop
    subject: "Phase 9: Review Loop"
    activeForm: "Running review loop"
    Steps: Run PR review via /pr-reviewer skill, run security review via /security-review skill, if blocking issues spawn implementer for fixes and re-run tests, max 3 iterations
    Expected outputs: PR review ran, security review ran, either no blocking issues or fixes applied
    Constraint: If max iterations reached with unresolved issues, report and proceed to cleanup.

11. Phase 10: Cleanup
    subject: "Phase 10: Cleanup"
    activeForm: "Cleaning up environment"
    Steps: Remove docker-compose override (if created), archive artifacts, print final summary report
    Expected outputs: cleanup done, summary printed
    Constraint: None. This is the final phase.

After creating all 11 tasks, use TaskUpdate to chain dependencies:
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

CRITICAL: If any check fails, STOP. Report the failure. Do not continue.

CONTINUE WITH Phase 1.

### Phase 1: Context Gathering

- If `--from-jira`: MUST invoke `/fetch-ticket-context` to gather Jira/Confluence context
- If `--from-markdown`: read the SDD ticket file
- If `--from-input`: use description directly
- Extract requirements and acceptance criteria

CONTINUE WITH Phase 2.

### Phase 2: Planning

CRITICAL: You MUST do both of these. Do not skip either one.
1. Invoke `/analyze-requirements` skill to create implementation plan
2. Spawn `planner` agent for architecture-aware planning

After both complete, verify:
- Implementation plan exists
- Test strategy is defined
- Files to create/modify are identified

CONTINUE WITH Phase 3.

### Phase 3: Environment Setup

- Create feature branch (e.g., `feature/PROJ-123-description`)
- Allocate ports for services (if needed)
- Create docker-compose override (if needed)
- Capture BEFORE screenshots (if frontend)

CONTINUE WITH Phase 4.

### Phase 4: Implementation

CRITICAL: You MUST spawn the stack-specific `implementer-{lang}` agent with the plan from Phase 2. Do not implement code directly without spawning the agent.

After agent completes, verify:
- Code changes exist
- New files created as planned

CONTINUE WITH Phase 5.

### Phase 5: Testing

- Auto-detect testing framework (Jest, Pytest, Playwright)
- Run unit tests with coverage
- Run integration tests
- Run E2E tests (if applicable)
- Collect coverage reports

If tests fail: spawn implementer to fix issues. Max 3 fix iterations.

CRITICAL: If tests still fail after 3 iterations, STOP. Report failure. Do not continue.

CONTINUE WITH Phase 6.

### Phase 6: Visual Verification

If no frontend changes or `--skip-visual` flag: mark completed as "Skipped" and continue.

Otherwise:
- Take screenshots of affected pages
- Compare before/after with pixelmatch
- If diff > 5%: MUST spawn `visual-verifier` agent

CONTINUE WITH Phase 7.

### Phase 7: Documentation Update

CRITICAL: You MUST invoke `/doc-updater` skill. Do not skip this even if you think no docs need updating.

- Analyze changed files for doc impact
- Apply maintenance test (only update if truly needed)
- Update CLAUDE.md and project-context surgically if needed

CONTINUE WITH Phase 8.

### Phase 8: PR Creation

- Commit all changes with structured commit message
- Push feature branch to remote
- Create pull request with:
  - Auto-generated title from ticket
  - Summary of changes
  - Test plan checklist
  - Link to original ticket
- Return PR URL

CRITICAL: Do not proceed if PR was not created.

CONTINUE WITH Phase 9.

### Phase 9: Review Loop

- Run PR review via `/pr-reviewer` skill
- Run security review via `/security-review` skill
- If blocking issues found:
  - Spawn implementer agent with fixes
  - Re-run tests
  - Re-review (max 3 iterations)
- Exit when approved or max iterations reached

CONTINUE WITH Phase 10.

### Phase 10: Cleanup

- Remove docker-compose override (if created)
- Clean up temporary files
- Report final status with summary

## Error Handling

If a phase fails:
- Do NOT mark the task as completed
- Report which phase failed and why
- If Phase 0 fails: stop immediately
- If Phase 5 fails after 3 fix iterations: stop and report
- For other phases: attempt to recover once, then stop if still failing

## Skills and Agents Used

- `/fetch-ticket-context`: Phase 1 (Jira tickets only)
- `/analyze-requirements`: Phase 2
- `planner` agent: Phase 2
- `implementer-{lang}` agent: Phase 4, Phase 5 (fixes), Phase 9 (fixes)
- `visual-verifier` agent: Phase 6
- `/doc-updater`: Phase 7
- `/pr-reviewer`: Phase 9
- `/security-review`: Phase 9

## Prerequisites

- Project initialized with `/initialize-project`
- Git repository with remote configured
- Tests passing in current state
- For `--from-jira`: Jira MCP configured
- For GitHub PR: GitHub MCP or gh CLI configured
