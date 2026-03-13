# Skills and Agents Map (V2 - Skill-First Architecture)

**Purpose**: This document clarifies the new skill-first architecture where skills are the single source of truth and agents are minimal stack-specific executors.

**Last Updated**: 2026-03-12 (Refactor to skill-first architecture)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Skills vs Agents](#skills-vs-agents)
3. [User-Invocable Skills](#user-invocable-skills)
4. [Agent Templates (Only 3)](#agent-templates-only-3)
5. [Skill Invocation Patterns](#skill-invocation-patterns)
6. [Quick Reference](#quick-reference)

---

## Architecture Overview

### Skill-First Philosophy

**Before Refactor**: Duplicated functionality in both agents and skills
- ❌ tester-unit agent + jest-coverage-automation skill
- ❌ tester-e2e agent + playwright-e2e-automation skill
- ❌ doc-updater agent + update-project-context skill
- ❌ security-reviewer agent + security-review skill

**After Refactor**: Skills are single source of truth
- ✅ Skills contain all knowledge, patterns, and best practices
- ✅ Agents are minimal stack-specific executors (only 3 types)
- ✅ implement-ticket invokes skills directly for testing/security/docs

### Three Core Principles

1. **Skills = Knowledge**: All testing patterns, security rules, doc update logic lives in skills
2. **Agents = Execution**: Only for stack-specific code generation (planner, implementer, visual-verifier)
3. **Direct Invocation**: implement-ticket calls skills directly, not via agent spawning

---

## Skills vs Agents

### What is a Skill?

A **skill** is a Claude Code feature that provides:
- Complete workflows with step-by-step instructions
- Domain expertise and best practices
- Can be invoked by users OR by other skills
- Returns structured output (JSON, markdown, artifacts)

**Key Characteristics**:
- Self-contained (has all knowledge needed)
- Deterministic (TodoWrite integration)
- Composable (can invoke other skills)
- Testable (returns structured data)

### What is an Agent?

An **agent** is a specialized Claude instance with:
- Specific role (planning, implementation, visual verification)
- Stack-specific variable substitution
- Spawned by skills for code generation tasks

**Key Characteristics**:
- Thin wrapper around code generation
- Stack-specific (TypeScript, Python, etc.)
- Template-based (compiled from .template.md)
- No business logic (delegates to skills)

---

## User-Invocable Skills

### Primary Workflow Skills

| Skill | Path | Purpose | Returns |
|-------|------|---------|---------|
| **implement-ticket** | `skills/020-development-workflow/implement-ticket/` | Complete SDLC (10 phases) | PR URL + artifacts |
| **create-sdd-ticket** | `skills/020-development-workflow/create-sdd-ticket/` | Create detailed specification | Markdown ticket |

### Quality Assurance Skills

| Skill | Path | Purpose | Returns |
|-------|------|---------|---------|
| **jest-coverage-automation** | `skills/030-quality-assurance/jest-coverage-automation/` | Unit test generation + coverage | Coverage report JSON |
| **playwright-e2e-automation** | `skills/030-quality-assurance/playwright-e2e-automation/` | E2E test generation | Test results JSON |
| **security-review** | `skills/030-quality-assurance/security-review/` | OWASP security scanning | Security findings JSON |
| **pr-reviewer** | `skills/030-quality-assurance/pr-reviewer/` | PR review with iterations | Review results JSON |
| **code-quality-check** | `skills/030-quality-assurance/code-quality-check/` | Linting + formatting | Quality report |

### Context & Planning Skills

| Skill | Path | Purpose | Returns |
|-------|------|---------|---------|
| **analyze-requirements** | `skills/020-development-workflow/analyze-requirements/` | Create implementation plan | Plan markdown |
| **fetch-ticket-context** | `skills/040-integrations/fetch-ticket-context/` | Gather Jira/Notion/Confluence context | Context markdown |
| **update-project-context** | `skills/010-foundation/update-project-context/` | Update CLAUDE.md + project-context | Updated docs |

### Integration Skills

| Skill | Path | Purpose | Returns |
|-------|------|---------|---------|
| **jira** | `skills/040-integrations/jira/` | Jira MCP operations | Jira data |
| **mastering-github-agent-skill** | `skills/040-integrations/mastering-github-agent-skill/` | GitHub operations | GitHub data |

---

## Agent Templates (Only 3)

After the refactor, only **3 agent templates** remain:

| Template | Purpose | Spawned By | Stack-Specific? | Skills Loaded |
|----------|---------|------------|-----------------|---------------|
| **planner.template.md** | Architecture-aware planning | implement-ticket (Phase 2) | ❌ No (all languages) | All language skills for context |
| **implementer.template.md** | Code implementation | implement-ticket (Phase 4) | ✅ Yes (per language) | Stack-specific mastery skills |
| **visual-verifier.template.md** | Screenshot comparison | implement-ticket (Phase 6) | ❌ No (frontend only) | Visual testing skills |

### Removed Agent Templates

These agent templates were **DELETED** because their functionality is now in skills:

- ❌ `tester-unit.template.md` → Use **jest-coverage-automation** skill
- ❌ `tester-e2e.template.md` → Use **playwright-e2e-automation** skill
- ❌ `doc-updater.template.md` → Use **update-project-context** skill
- ❌ `security-reviewer.template.md` → Use **security-review** skill

---

## Skill Invocation Patterns

### Pattern 1: Direct Skill Invocation (Testing)

**Old Way** (spawning agents):
```
implement-ticket Phase 5
  └─ Spawns: tester-unit-typescript agent
      └─ Agent loads jest-coverage-automation skill as context
          └─ Agent runs tests
```

**New Way** (direct skill invocation):
```
implement-ticket Phase 5
  └─ Invokes: /jest-coverage-automation skill
      └─ Skill runs tests directly
      └─ Returns: coverage-report.json
```

### Pattern 2: Direct Skill Invocation (Security)

**Old Way**:
```
implement-ticket Phase 9
  └─ Spawns: security-reviewer-typescript agent
      └─ Agent loads security-review skill as context
```

**New Way**:
```
implement-ticket Phase 9
  └─ Invokes: /security-review skill
      └─ Returns: security-findings.json
```

### Pattern 3: Direct Skill Invocation (Documentation)

**Old Way**:
```
implement-ticket Phase 7
  └─ Spawns: doc-updater agent
      └─ Agent loads update-project-context skill
```

**New Way**:
```
implement-ticket Phase 7
  └─ Invokes: /update-project-context skill (lightweight mode)
      └─ Returns: updated-docs.json
```

### Pattern 4: Agent Spawning (Code Generation Only)

**Still Uses Agents** (for stack-specific code generation):
```
implement-ticket Phase 4
  └─ Spawns: implementer-typescript agent
      └─ Agent loads mastering-typescript skill
      └─ Agent generates code
```

---

## implement-ticket Flow (10 Phases)

```
PHASE 0: Pre-Flight Validation
  └─ TodoWrite: "Validating environment"
  └─ Check: git, tests, build
  └─ TodoWrite: COMPLETE

PHASE 1: Context Gathering
  └─ TodoWrite: "Gathering context"
  └─ Invoke: /fetch-ticket-context skill (if Jira)
  └─ TodoWrite: COMPLETE

PHASE 2: Planning
  └─ TodoWrite: "Creating plan"
  └─ Invoke: /analyze-requirements skill
  └─ Spawn: planner agent
  └─ TodoWrite: COMPLETE

PHASE 3: Environment Setup
  └─ TodoWrite: "Setting up environment"
  └─ Allocate ports, create docker-compose override
  └─ TodoWrite: COMPLETE

PHASE 4: Implementation
  └─ TodoWrite: "Implementing code"
  └─ Spawn: implementer-{stack} agent
  └─ TodoWrite: COMPLETE

PHASE 5: Testing
  └─ TodoWrite: "Running tests"

  5a. Unit Tests
    └─ Invoke: /jest-coverage-automation skill (or /pytest-patterns)
    └─ TodoWrite: COMPLETE

  5b. E2E Tests
    └─ Invoke: /playwright-e2e-automation skill
    └─ TodoWrite: COMPLETE

PHASE 6: Visual Verification (frontend)
  └─ TodoWrite: "Visual verification"
  └─ Spawn: visual-verifier agent (if diff > 5%)
  └─ TodoWrite: COMPLETE

PHASE 7: Documentation
  └─ TodoWrite: "Updating docs"
  └─ Invoke: /update-project-context skill (lightweight)
  └─ TodoWrite: COMPLETE

PHASE 8: PR Creation
  └─ TodoWrite: "Creating PR"
  └─ Invoke: /create-pr skill
  └─ TodoWrite: COMPLETE

PHASE 9: Review Loop
  └─ TodoWrite: "Running PR review"
  └─ Invoke: /pr-reviewer skill
  └─ Invoke: /security-review skill
  └─ IF blocking issues:
      └─ Apply fixes
      └─ Re-test (invoke /jest-coverage-automation again)
      └─ Re-review (max 3 iterations)
  └─ TodoWrite: COMPLETE

PHASE 10: Cleanup
  └─ TodoWrite: "Cleaning up"
  └─ Teardown environment
  └─ TodoWrite: COMPLETE
```

---

## Quick Reference

### When to Use Skills vs Agents

| Task | Use | Rationale |
|------|-----|-----------|
| Generate unit tests | **Skill** (jest-coverage-automation) | Has all test patterns |
| Generate E2E tests | **Skill** (playwright-e2e-automation) | Has all Playwright knowledge |
| Security scan | **Skill** (security-review) | Has OWASP rules |
| Update docs | **Skill** (update-project-context) | Has doc update logic |
| PR review | **Skill** (pr-reviewer) | Has review criteria |
| Write code | **Agent** (implementer-{stack}) | Needs stack-specific generation |
| Plan architecture | **Agent** (planner) | Needs all language context |
| Visual comparison | **Agent** (visual-verifier) | Needs screenshot analysis |

### Skill Output Formats

All quality skills return structured JSON:

**jest-coverage-automation**:
```json
{
  "coverage": { "lines": 85, "statements": 82, "branches": 78, "functions": 90 },
  "tests_passed": 42,
  "tests_failed": 0,
  "status": "passed"
}
```

**security-review**:
```json
{
  "findings": {
    "blocking": [],
    "major": [],
    "minor": []
  },
  "overall_status": "PASS"
}
```

**pr-reviewer**:
```json
{
  "findings": {
    "blocking": [],
    "major": [],
    "minor": []
  },
  "nextSteps": {
    "action": "APPROVE",
    "reason": "No blocking issues"
  }
}
```

---

## Migration Notes

If you have an existing project initialized with the old architecture:

1. **Old agents still exist** (e.g., `tester-unit-typescript.md`) but won't be invoked
2. **Skills are used instead** - implement-ticket now calls skills directly
3. **No breaking changes** - old agents are just ignored
4. **Re-initialize** (optional): Run `./scripts/initialize-project.sh --force` to clean up

---

**Version**: 2.0.0 (Skill-First Architecture)
**Last Updated**: 2026-03-12
