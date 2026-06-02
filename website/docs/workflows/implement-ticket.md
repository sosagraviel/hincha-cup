---
sidebar_position: 3
title: Implement Ticket Workflow
description: Transform tickets into production-ready pull requests with AI automation. Complete with working code, tests, quality validation, and documentation.
---

# Implement Ticket Workflow

Transform tickets into production-ready pull requests with AI automation.

---

## Overview

Produces complete pull requests with:
- ✅ Working code following your project patterns
- ✅ Comprehensive tests (unit, integration, E2E)
- ✅ Quality validation (linting, type checking, coverage)
- ✅ Documentation updates
- ✅ Visual regression testing (for UI changes)

**Duration**: 10-25 minutes depending on complexity

---

## Production Approach (Use This)

### Using the implement-ticket Skill

Current production approach using the user-invokable skill. Works in both
Claude Code and Codex CLI — only the prefix changes (`/` vs `$`). In Codex,
run `/skills` to confirm the skill is registered in the current session.

**Usage**:

```bash
# Claude Code — Jira ticket
/implement-ticket --from-jira PROJ-123
# Markdown file
/implement-ticket --from-markdown ./specs/feature-spec.md
# Plain text
/implement-ticket --from-input "Add dark mode toggle to settings page"

# Codex CLI — same flags, '$' prefix
$implement-ticket --from-jira PROJ-123
$implement-ticket --from-markdown ./specs/feature-spec.md
$implement-ticket --from-input "Add dark mode toggle to settings page"
```

**Options**:

| Option | Description |
|--------|-------------|
| `--from-jira TICKET-ID` | Fetch from Jira + Confluence |
| `--from-markdown PATH` | Read from markdown file |
| `--from-input "text"` | Use plain text description |
| `--skip-tests` | Skip testing phase |
| `--skip-visual` | Skip visual verification |
| `--skip-pr` | Skip PR creation (commit only) |

Input modes (`--from-*`) are mutually exclusive.

**Examples**:

```bash
# Claude Code
/implement-ticket --from-jira PROJ-123                  # Jira ticket
/implement-ticket --from-jira PROJ-456 --skip-visual    # Skip visual tests for backend
/implement-ticket --from-jira PROJ-789 --skip-pr        # Commit locally, no PR

# Codex CLI
$implement-ticket --from-jira PROJ-123
$implement-ticket --from-jira PROJ-456 --skip-visual
$implement-ticket --from-jira PROJ-789 --skip-pr
```

---

## Experimental Approach (Do Not Use)

### TypeScript Orchestration Script 🚧

Work in progress, not ready for production. Use the `/implement-ticket` skill in Claude Code (or `$implement-ticket` in Codex) instead.

---

## 14-Phase Process

```mermaid
graph LR
    P0[0: Preflight] --> P1[1: Context]
    P1 --> P2[2: Wiki Preload]
    P2 --> P3[3: Planning]
    P3 --> P4[4: Environment]
    P4 --> P5[5: Implementation]
    P5 --> P6[6: Testing]
    P6 --> P7[7: Visual]
    P7 --> P8[8: Documentation]
    P8 --> P84[8.4: Impl Commit]
    P84 --> P85[8.5: Wiki Refresh]
    P85 --> P9[9: PR Creation]
    P9 --> P10[10: Review Loop]
    P10 --> P11[11: Cleanup]
```

**Phases** — 14 in total. The skill labels them `0`–`11`, with two extra steps (`8.4` and `8.5`) inserted after Documentation:

1. **Phase 0 · Preflight** - Auto-bootstrap (build/refresh code graph, emit MCP config) + validate environment, git status, and prerequisites
2. **Phase 1 · Context** - Gather ticket context from Jira/markdown/input
3. **Phase 2 · Wiki Preload** - Load the relevant LLM wiki pages for graph- and wiki-aware planning
4. **Phase 3 · Planning** - Create implementation plan with the AI planner agent
5. **Phase 4 · Environment** - Create feature branch and set up
6. **Phase 5 · Implementation** - Generate code with the AI implementer agent
7. **Phase 6 · Testing** - Run test suite with coverage validation
8. **Phase 7 · Visual** - Capture and analyze visual changes (UI only)
9. **Phase 8 · Documentation** - Update project documentation
10. **Phase 8.4 · Implementation Commit** - Commit the code + doc changes
11. **Phase 8.5 · Wiki Refresh** - Run `/wiki-refresh` to update `docs/llm-wiki/` if high-level facts drifted
12. **Phase 9 · PR Creation** - Push branch and open the pull request (multi-repo: one PR per affected repo)
13. **Phase 10 · Review Loop** - Run automated quality and security reviews (`/pr-reviewer`, `/security-review`)
14. **Phase 11 · Cleanup** - Clean up and archive artifacts

---

## Input Formats

### Jira Tickets

```bash
# Claude Code
/implement-ticket --from-jira PROJ-123
# Codex CLI
$implement-ticket --from-jira PROJ-123
```

**Requirements**:
- Clear title and description
- Acceptance criteria (Given/When/Then format preferred)
- Priority and issue type set

### Markdown Specifications

```bash
# Claude Code
/implement-ticket --from-markdown ./specs/feature.md
# Codex CLI
$implement-ticket --from-markdown ./specs/feature.md
```

**Format**:
```markdown
# Feature Title

## Description
Clear description

## User Stories
As a [user], I want [feature] so that [benefit]

## Acceptance Criteria
- [ ] Given/When/Then scenarios
- [ ] Edge cases
- [ ] Error handling

## Technical Requirements
- Technical constraints
- Performance requirements
- Security considerations

## Definition of Done
- [ ] Checklist items
```

---

## Quality Gates

### Automatic Validation

- **Code Quality**: Linting, formatting, type checking
- **Testing**: Unit, integration, and E2E tests are run with coverage collected; the project's existing coverage thresholds (if any) are respected
- **Security**: Vulnerability scanning, static analysis

### Auto-Fix

Common issues resolved automatically:
- Formatting (Prettier, Black)
- Linting fixes (ESLint --fix)
- Missing dependencies

### Manual Intervention

For complex issues:
1. Execution pauses with clear error
2. Specific guidance provided
3. Re-run command to continue

---

## Visual Regression Testing

For UI changes:

1. **Before Screenshots** - Capture current state
2. **Implementation** - Make code changes
3. **After Screenshots** - Capture new state
4. **Pixel Comparison** - Generate diffs (pixelmatch)
5. **AI Review** - If >5% pixels changed, AI analyzes changes

AI verifier checks:
- Pixel diffs match ticket requirements
- No unintended side effects
- Layout integrity preserved

**Skipping**: Automatically skips for non-UI changes, or use `--skip-visual`

---

## Troubleshooting

### "Planning phase timeout"
- Break the ticket into smaller parts
- Re-initialize with a higher model tier (`MODEL_TIER` is chosen at setup time — see [Custom Model Selection](#custom-model-selection))

### "Tests failing"
- Review failures in output
- Check artifacts in `.claude-temp/tickets/PROJ-123/`
- Automatic retries up to 3 times

### "Quality gates failing"
- Review specific errors in output
- Fix project-wide issues first (linting config, types)
- Most issues auto-fixed

### "Visual regression false positives"
- Use `--skip-visual` for backend changes
- Tests skip automatically if no visual changes

### Inspecting Artifacts

Every run writes its intermediate artifacts to a deterministic directory — inspect it to debug a failed or surprising run:

```bash
# Claude: .claude-temp/   |   Codex: .codex-temp/
ls .claude-temp/tickets/PROJ-123/artifacts/

# Preflight outcome markers live here too:
#   .preflight-ok      → bootstrap + validation passed (carries git_head)
#   .preflight-failed  → carries { reason, git_head, ran_at }
```

---

## Advanced Usage

### Custom Model Selection

`MODEL_TIER` is chosen at **setup time** — it configures the agents the framework generates, not a per-run flag. Re-run setup to change tiers:

```bash
# Faster / cheaper models
MODEL_TIER=fast     ./scripts/initialize-project.sh

# Higher-capability models for complex codebases
MODEL_TIER=advanced ./scripts/initialize-project.sh
```

| Tier | Use for |
|------|---------|
| `fast` | Simple, high-volume changes (speed/cost) |
| `standard` | Default — balanced |
| `advanced` | Complex changes needing the strongest models |
| `openai` / `gemini` | Use the OpenAI / Google provider instead of Anthropic |

After re-initializing, run `/implement-ticket` normally.

### Batch Processing

```bash
# Claude Code
/implement-ticket --from-jira PROJ-123
/implement-ticket --from-jira PROJ-124
/implement-ticket --from-jira PROJ-125

# Codex CLI
$implement-ticket --from-jira PROJ-123
$implement-ticket --from-jira PROJ-124
$implement-ticket --from-jira PROJ-125
```

### Custom Workflows

```bash
# Claude Code
/implement-ticket --from-jira PROJ-123 --skip-pr                 # Skip PR for local testing
/implement-ticket --from-jira PROJ-123 --skip-visual             # Backend only
/implement-ticket --from-jira PROJ-123 --skip-tests --skip-pr    # Fast local spike

# Codex CLI
$implement-ticket --from-jira PROJ-123 --skip-pr
$implement-ticket --from-jira PROJ-123 --skip-visual
$implement-ticket --from-jira PROJ-123 --skip-tests --skip-pr
```

---

## Success Patterns

### Well-Suited Tickets

✅ Feature additions with clear criteria
✅ Bug fixes with reproduction steps
✅ Refactoring with specific scope
✅ Test coverage improvements
✅ Documentation updates

### Optimization Tips

1. Write clear Given/When/Then acceptance criteria
2. Include technical constraints
3. Specify test requirements
4. Provide context about related features
5. Keep scope small and focused

---

**Ready to automate development?** Start with a well-defined ticket.
