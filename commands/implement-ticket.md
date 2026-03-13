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
