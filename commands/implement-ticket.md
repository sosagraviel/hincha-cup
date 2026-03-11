---
name: implement-ticket
description: End-to-end ticket implementation with autonomous execution, quality gates, and automated PR creation
---

# /implement-ticket

Complete SDLC workflow for implementing tickets with security, quality checks, and automated PR creation.

## Usage

```bash
/implement-ticket [INPUT] [OPTIONS]
```

### Required Flags

**INPUT** (mutually exclusive, one required):
- `--from-jira <JIRA-URL-OR-KEY>` - Implement from Jira ticket
- `--from-markdown <PATH>` - Implement from markdown ticket

### Optional Flags

**Execution Modes**:
- `--no-stop` - Run autonomously without prompts (recommended for production)
- `--interactive` - Prompt at decision points (default for learning)

**Planning Modes**:
- `--architect-mode` - Use supervisor pattern with grading (high-risk tickets)
- `--planner-mode` - Use fast linear pipeline (low-risk tickets, default)

**Workflow Control**:
- `--skip-pre-flight` - Skip pre-flight validation (not recommended)
- `--resume` - Resume from checkpoint

## Examples

### Example 1: Implement Jira ticket (interactive)
```bash
/implement-ticket --from-jira PROJ-123
```

### Example 2: Implement Jira ticket (autonomous)
```bash
/implement-ticket --from-jira PROJ-123 --no-stop
```

### Example 3: Implement from markdown (autonomous)
```bash
/implement-ticket --from-markdown .claude/tickets/feature-auth.md --no-stop
```

### Example 4: High-risk ticket with architect mode
```bash
/implement-ticket --from-jira PROJ-456 --architect-mode --no-stop
```

### Example 5: Resume from checkpoint
```bash
/implement-ticket --from-jira PROJ-789 --resume
```

## Workflow

### Phase 0: Pre-Flight Validation (1-2 minutes)
- ✅ Git status clean
- ✅ All tests passing
- ✅ Build/compilation successful
- ✅ Dependencies installed
- ✅ Docker containers running (if applicable)
- ✅ Environment variables configured
- ✅ Disk space available (>5GB)
- ✅ Memory available (>2GB recommended)
- ✅ MCP servers reachable
- ✅ E2E framework initialized (frontend projects)

**Checkpoint saved**: Ready to proceed

### Phase 1: Context Gathering (2-5 minutes)
- **If --from-jira**:
  - Fetch ticket via Jira MCP
  - Fetch linked documentation (Notion, Confluence, Figma)
  - Fetch related/blocking tickets
  - Compose comprehensive context document

- **If --from-markdown**:
  - Read markdown file
  - Validate structure against SDD schema
  - Extract all sections to canonical format
  - Validate completeness

**Output**: `/tmp/context_${TICKET_ID}.md`
**Checkpoint saved**: Context gathered

### Phase 2: Requirements Analysis (3-5 minutes)
- Parse ticket requirements
- Identify affected components
- Plan implementation approach
- Risk assessment (auto-select architect mode if high-risk)
- Generate detailed implementation plan

**Planning Mode Selection**:
- **Auto-architect** if ticket contains: migration, auth, payment, security, breaking change, crypto, GDPR, PCI, HIPAA
- **Planner** for all other tickets

**Output**: Implementation plan document
**Checkpoint saved**: Plan created

### Phase 3: Code Implementation (10-30 minutes)
- Execute implementation plan
- Follow project patterns and conventions
- Write clean, maintainable code
- Add inline documentation
- Handle edge cases
- Implement error handling

**Autonomous Mode**: Makes decisions for:
- File placement
- Naming conventions
- Code structure
- Library choices (based on existing patterns)

**Decisions logged**: All choices documented in `.claude/decisions/${TICKET_ID}.md`

**Checkpoint saved**: Code implemented

### Phase 4: Testing (5-15 minutes)
- **Unit Tests**: Generate tests for all new functions/methods
  - Coverage gate: ≥80% required
  - Uses existing test patterns
  - Auto-fix failures (3 attempts)

- **Integration Tests**: Test API endpoints, database operations
  - Coverage gate: 100% endpoint coverage
  - Uses project test framework

- **E2E Tests** (frontend only): Test user flows
  - Coverage gate: 100% acceptance criteria scenarios
  - Uses Playwright or existing E2E framework

**Checkpoint saved**: Tests passing

### Phase 5: Quality Checks (2-5 minutes)
- **Linting**: ESLint/Pylint/etc (--max-warnings=0)
- **Type Checking**: TypeScript/MyPy (zero errors)
- **Formatting**: Prettier/Black (auto-format)
- **Code Complexity**: Cyclomatic complexity check

**Checkpoint saved**: Quality gates passed

### Phase 6: Security Review (2-3 minutes)
- OWASP Top 10 checks
- SQL injection prevention
- XSS prevention
- CSRF protection
- Authentication/authorization validation
- Secrets detection
- Dependency vulnerabilities

**Checkpoint saved**: Security validated

### Phase 7: PR Creation (1-2 minutes)
- Create feature branch: `feat/${TICKET_ID}-${title}`
- Commit changes with conventional commits format
- Push to remote
- Create PR with:
  - Comprehensive description
  - Links to ticket
  - Testing evidence
  - Security review results
  - Decision log
  - Screenshots (if UI changes)

**Final Output**: PR URL

## Execution Modes

### Interactive Mode (Default)
**Use for**: Learning, reviewing plans, supervised development

Prompts at:
- After context gathering: "Ready to proceed with implementation?"
- After plan creation: "Review plan and approve?"
- Before quality checks: "Ready to run quality gates?"

**Example**:
```bash
/implement-ticket --from-jira PROJ-123 --interactive
```

### Autonomous Mode (--no-stop)
**Use for**: Production workflows, overnight runs, well-defined tickets

Only stops on:
- Hard errors (build failures, test failures after retries)
- Coverage gate failures (after 3 attempts)
- Merge conflicts (cannot auto-resolve)

**All decisions logged** to `.claude/decisions/${TICKET_ID}.md`

**Example**:
```bash
/implement-ticket --from-jira PROJ-123 --no-stop
```

## Planning Modes

### Planner Mode (Default)
**Fast linear pipeline** for most tickets:
- Single-pass planning (Opus model)
- Direct implementation (Sonnet model)
- Hard quality gates
- Autonomous execution capable
- **Time**: 10-30 minutes

**Best for**: Feature work, bug fixes, refactoring, UI changes

### Architect Mode
**Deliberate supervisor pattern** for high-risk tickets:
- Detailed instruction generation
- Implementation by code agent
- Post-implementation grading (100-point rubric)
- Iterative improvement loop (target: ≥95%)
- Enhanced quality assurance
- **Time**: 1-3 hours

**Auto-selected for**: migration, auth, payment, security, breaking changes, compliance

**Best for**: Security-critical work, compliance changes, breaking API changes, complex migrations

## Error Handling

### Pre-Flight Failures
```
❌ Pre-flight validation failed: 3 tests failing

Failing tests:
  - auth.test.ts:42 - Invalid token not rejected
  - user.test.ts:67 - Email validation broken
  - api.test.ts:23 - Timeout on slow endpoint

Fix these tests before starting implementation.
Use --skip-pre-flight to bypass (not recommended)
```

### Coverage Gate Failures
```
⚠️ Coverage gate failed (Attempt 1/3): 72% unit coverage (target: 80%)

Missing coverage:
  - src/auth/validator.ts:45-67 (22 lines)
  - src/utils/helpers.ts:12-18 (6 lines)

Auto-generating additional tests...
```

### Checkpoint Recovery
```
✓ Found checkpoint for PROJ-123

Checkpoint status:
  ✓ Phase 0: Pre-flight (completed)
  ✓ Phase 1: Context gathering (completed)
  ✓ Phase 2: Requirements analysis (completed)
  ⏸ Phase 3: Implementation (in progress)

Resume from checkpoint? [Y/n]
```

### Merge Conflicts
```
❌ Merge conflict detected with main branch

Files in conflict:
  - src/auth/service.ts (12 conflicts)
  - src/models/user.ts (3 conflicts)

Autonomous resolution failed. Manual intervention required.
Run: git diff main...HEAD to review conflicts
```

## Decision Logging

All autonomous decisions logged to `.claude/decisions/${TICKET_ID}.md`:

```markdown
# Implementation Decisions for PROJ-123

**Implemented**: 2026-03-07 14:30:22
**Mode**: Autonomous (--no-stop)
**Engineer**: John Doe

---

## Decisions Log

### [Phase 3: Implementation] File placement for auth validator

**Rationale**: Placed in src/auth/validators/ following existing pattern seen in src/auth/middleware/. Maintains separation of concerns and aligns with project structure documented in CLAUDE.md.

**Timestamp**: 2026-03-07 14:35:10

---

### [Phase 3: Implementation] Library choice for JWT validation

**Rationale**: Used jsonwebtoken library (already in package.json) instead of jose. Maintains consistency with existing auth code in src/auth/jwt.ts and avoids introducing new dependencies.

**Timestamp**: 2026-03-07 14:42:33

---
```

## Checkpointing & Resume

Checkpoints automatically saved after each phase. Resume with:

```bash
/implement-ticket --from-jira PROJ-123 --resume
```

Checkpoint data stored at: `.claude/checkpoints/implement-ticket-${TICKET_ID}.json`

## Quality Gates (Hard Requirements)

| Gate | Requirement | Behavior on Failure |
|------|-------------|---------------------|
| Unit Tests | ≥80% coverage | Auto-generate tests (3 attempts), then fail |
| Integration Tests | 100% endpoint coverage | Auto-generate tests (3 attempts), then fail |
| E2E Tests | 100% scenario coverage | Auto-generate tests (3 attempts), then fail |
| Linting | Zero warnings | Auto-fix (1 attempt), then fail |
| Type Checking | Zero errors | Manual fix required |
| Build | Successful compilation | Manual fix required |

## Integration with Other Skills

- **fetch-ticket-context**: Auto-invoked for --from-jira
- **analyze-requirements**: Auto-invoked in Phase 2
- **code-implementation**: Auto-invoked in Phase 3
- **security-review**: Auto-invoked in Phase 6
- **create-pr**: Auto-invoked in Phase 7

## Prerequisites

- Git repository initialized
- Project dependencies installed
- Tests passing (pre-flight check)
- For `--from-jira`: Jira MCP configured
- For `--from-markdown`: Valid SDD markdown file
- For PR creation: GitHub MCP configured

## Best Practices

### DO ✅
- Use `--no-stop` for production workflows
- Let pre-flight validation complete
- Trust autonomous decisions (they're logged)
- Review PR before merging
- Use `--architect-mode` for high-risk tickets

### DON'T ❌
- Don't skip pre-flight checks in production
- Don't manually edit during autonomous execution
- Don't ignore coverage gate failures
- Don't bypass security review
- Don't commit without PR review

## Output

### Success Output
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Implementation Complete: PROJ-123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Summary:
  - Ticket: PROJ-123 (Add user export feature)
  - Mode: Autonomous
  - Duration: 23 minutes
  - Branch: feat/PROJ-123-user-export

✅ Quality Gates:
  - Unit Tests: 94% coverage (32 tests, all passing)
  - Integration Tests: 100% coverage (8 endpoints, all passing)
  - E2E Tests: 100% coverage (5 scenarios, all passing)
  - Linting: Zero warnings
  - Type Checking: Zero errors
  - Security Review: Passed

🔀 Pull Request:
  - URL: https://github.com/acme/project/pull/456
  - Reviewers: @tech-lead, @senior-dev
  - Status: Ready for review

📝 Decisions Made: 8 (see .claude/decisions/PROJ-123.md)

Next steps:
  1. Review PR at https://github.com/acme/project/pull/456
  2. Address review feedback if any
  3. Merge when approved
  4. Close PROJ-123 in Jira
```

## Troubleshooting

**Q: "Tests keep failing during autonomous mode"**
A: Check:
- Are tests flaky? (run manually to verify)
- Are dependencies installed correctly?
- Is test data properly seeded?
- Review auto-generated tests for correctness

**Q: "Coverage gates too strict"**
A: Coverage gates are intentionally strict to ensure quality. If consistently failing:
- Review test quality (are they meaningful?)
- Check for untestable code (refactor if needed)
- Verify coverage tool configuration

**Q: "Autonomous mode makes wrong decisions"**
A: Review decision log (`.claude/decisions/${TICKET_ID}.md`):
- Are project patterns documented in CLAUDE.md?
- Is project-context skill populated?
- Consider using interactive mode for complex tickets

**Q: "How do I customize quality gates?"**
A: Gates are configured per project in `.claude/CLAUDE.md`. Update coverage thresholds, linting rules, etc. there.

---

**Version**: 2.0.0
**Last Updated**: 2026-03-07
**Category**: development-workflow
