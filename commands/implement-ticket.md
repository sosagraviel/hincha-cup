---
name: implement-ticket
description: Complete SDLC workflow for implementing tickets with automated testing, PR creation, and review loops
---

# /implement-ticket

Execute the complete Software Development Lifecycle (SDLC) workflow to implement a ticket from requirements to merged PR.

## Usage

```bash
/implement-ticket [INPUT] [OPTIONS]
```

### Required Flags

**INPUT** (mutually exclusive, one required):
- `--from-input "description"` - Implement from plain text description
- `--from-jira <TICKET-ID>` - Implement from Jira ticket (e.g., PROJ-123)
- `--from-markdown <PATH>` - Implement from markdown SDD ticket

### Optional Flags

- `--skip-tests` - Skip automated testing phase (not recommended)
- `--skip-visual` - Skip visual verification phase
- `--skip-pr` - Skip PR creation (commit only)
- `--branch <NAME>` - Custom branch name (default: auto-generated)

---

## CRITICAL: Task Tracking Setup

**BEFORE starting any phase work, you MUST create the full task list using TaskCreate.** This gives the user real-time progress visibility via Ctrl+T. Do NOT skip this step. Create all 11 tasks first, then set up dependencies, then begin Phase 0.

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
    Constraint: None — this is the final phase.

**After creating all 11 tasks**, use TaskUpdate to chain dependencies:
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
- If a phase is skipped via flag (e.g., `--skip-visual`): mark it completed with description "Skipped via flag"

---

## Examples

### Example 1: Implement from Jira
```bash
/implement-ticket --from-jira PROJ-123
```

### Example 2: Implement from Markdown
```bash
/implement-ticket --from-markdown .claude/tickets/user-export.md
```

### Example 3: Implement from description
```bash
/implement-ticket --from-input "Add password reset endpoint with email verification"
```

### Example 4: Skip visual verification
```bash
/implement-ticket --from-jira PROJ-123 --skip-visual
```

## Workflow (11 Phases)

### Phase 0: Pre-Flight Validation
- Check git status (no uncommitted changes)
- Verify tests pass in current state
- Validate build succeeds
- Exit early if environment not ready

### Phase 1: Context Gathering
- If `--from-jira`: Invoke `/fetch-ticket-context` to gather Jira/Confluence context
- If `--from-markdown`: Read SDD ticket file
- If `--from-input`: Use description directly
- Extract requirements and acceptance criteria

### Phase 2: Planning
- Invoke `/analyze-requirements` skill to create implementation plan
- Spawn `planner` agent for architecture-aware planning
- Generate step-by-step implementation strategy
- Identify files to create/modify

### Phase 3: Environment Setup
- Create feature branch (e.g., `feature/PROJ-123-user-export`)
- Allocate ports for services (if needed)
- Create docker-compose override (if needed)
- Set up environment variables

### Phase 4: Implementation
- Spawn stack-specific `implementer-{lang}` agent
- Implement code following plan
- Follow project conventions from CLAUDE.md
- Create/modify files as needed

### Phase 5: Testing
- Use `TestOrchestrator` utility to run all tests:
  - Auto-detect testing framework (Jest, Pytest, Playwright)
  - Run unit tests with coverage
  - Run integration tests
  - Run E2E tests (if applicable)
- Collect coverage reports
- If tests fail: Spawn implementer to fix issues

### Phase 6: Visual Verification (Frontend Only)
- Take screenshots of affected pages
- Compare before/after screenshots
- If diff > 5%: Spawn `visual-verifier` agent
- Validate UI changes match requirements

### Phase 7: Documentation Update
- Invoke `/doc-updater` skill
- Analyze changed files for doc impact
- Apply maintenance test (only update if truly needed)
- Update CLAUDE.md and project-context surgically

### Phase 8: PR Creation
- Commit all changes
- Push feature branch
- Create pull request with:
  - Auto-generated title from ticket
  - Summary of changes
  - Test plan checklist
  - Link to original ticket
- Return PR URL

### Phase 9: Review Loop
- Use `ReviewLoopOrchestrator` utility:
  - Run PR review (via `/pr-reviewer` skill internally)
  - Run security review (via `/security-review` skill internally)
  - If blocking issues found:
    - Spawn implementer agent with fixes
    - Re-run tests via TestOrchestrator
    - Re-review (max 3 iterations)
- Exit when PR approved or max iterations reached

### Phase 10: Cleanup
- Teardown environment (ports, docker-compose override)
- Clean up temporary files
- Report final status

## Key Features

### ✅ Full SDLC Automation
- End-to-end automation from ticket to merged PR
- Handles all phases without manual intervention
- Automatic error recovery and retries

### ✅ Skill-First Architecture
- Skills for AI-powered tasks (doc-updater, reviews)
- Utilities for deterministic tasks (testing, orchestration)
- Agents only for stack-specific code generation

### ✅ Multi-Stack Support
- Detects project tech stack automatically
- Spawns appropriate implementer agents per language
- Works with TypeScript, Python, Java, Go, Rust, etc.

### ✅ Comprehensive Testing
- Automatic framework detection
- Full test suite execution (unit, integration, E2E)
- Coverage reporting and validation

### ✅ Review Iteration
- Automated PR and security reviews
- Intelligent fix generation
- Multi-round review loop until approval

## Error Handling

### Pre-Flight Validation Failure
```
❌ Pre-flight validation failed:
  - Uncommitted changes in working directory
  - Tests failing in current state

Fix: Commit or stash changes, fix failing tests
```

### Implementation Errors
```
⚠️ Implementation failed during Phase 4:
  - Syntax error in generated code
  - Attempting fix iteration 1/3...

Spawning implementer with error context...
```

### Test Failures
```
⚠️ Tests failed:
  - 5 unit tests failing
  - Coverage: 72% (below 80% threshold)

Spawning implementer to fix test failures...
```

### Review Loop Max Iterations
```
⚠️ Review loop reached max iterations (3)
  - 2 blocking issues remain unresolved
  - PR created but NOT approved

Manual intervention required. PR: https://github.com/org/repo/pull/123
```

## Best Practices

### DO ✅
- Run on clean working directory (no uncommitted changes)
- Use SDD tickets for best results (detailed requirements)
- Review generated PR before merging
- Let automated review loop run fully
- Trust the skill-first architecture

### DON'T ❌
- Don't skip tests unless absolutely necessary
- Don't interrupt mid-phase (let it complete)
- Don't manually fix during automation
- Don't merge without review approval
- Don't use on broken codebase

## Integration with Other Skills

- **fetch-ticket-context**: Automatically invoked for `--from-jira`
- **analyze-requirements**: Planning phase
- **doc-updater**: Documentation update phase
- **pr-reviewer**: Review loop phase
- **security-review**: Review loop phase
- **create-pr**: PR creation phase

## Prerequisites

- Project initialized with `/initialize-project`
- Git repository with remote configured
- Tests passing in current state
- For `--from-jira`: Jira MCP configured
- For GitHub PR: GitHub MCP or gh CLI configured

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 0: PRE-FLIGHT VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Git working directory clean
✓ Tests passing (42 passed)
✓ Build successful

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 1: CONTEXT GATHERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 Fetching ticket: PROJ-123
✓ Context gathered from Jira + Confluence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 2: PLANNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Analyzing requirements...
✓ Implementation plan created
   - 5 files to modify
   - 2 files to create
   - Estimated: 3-4 hours

[... continues through all 11 phases ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IMPLEMENTATION COMPLETE ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PR Created: https://github.com/org/repo/pull/456
Status: Ready for Review
Review Status: ✅ Approved (no blocking issues)

Summary:
  - Files changed: 7
  - Tests: 47 passed, 0 failed
  - Coverage: 85.3% (+3.2%)
  - Review iterations: 1
  - Duration: 12m 34s

Next steps:
  - Review PR in GitHub
  - Merge when ready
```

## Troubleshooting

**Q: "Pre-flight validation keeps failing"**
A: Ensure:
- Working directory is clean (`git status`)
- All tests pass (`npm test` or `pytest`)
- Build succeeds (`npm run build`)

**Q: "Implementation phase errors"**
A: The system will auto-retry up to 3 times. If still failing:
- Check if requirements are clear enough
- Verify CLAUDE.md has sufficient context
- Review error logs in artifacts directory

**Q: "Tests keep failing after fixes"**
A: After 3 fix iterations, manual intervention is needed:
- Review test failure logs
- Check if requirements conflict with existing code
- May need to refine ticket requirements

**Q: "Review loop not approving PR"**
A: Check review feedback:
- Blocking issues may require manual fixes
- Security issues may need architectural changes
- Consider breaking ticket into smaller pieces

**Q: "Where are the artifacts?"**
A: All artifacts saved to `.claude-temp/implement-ticket-{TICKET-ID}/`:
- Implementation plan
- Test results
- Coverage reports
- Review findings
- Screenshots (if visual verification ran)

---

**Version**: 2.0.0 (Skill-First Architecture)
**Last Updated**: 2026-03-13
**Category**: development-workflow
