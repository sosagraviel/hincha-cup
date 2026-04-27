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

**Duration**: 12-30 minutes depending on complexity

---

## Production Approach (Use This)

### Using the implement-ticket Skill

Current production approach using the user-invokable skill. Works in both
Claude Code and Codex CLI — only the prefix changes (`/` vs `$`). In Codex,
run `/skills` to confirm the skill is registered in the current session.

**Usage**:

```bash
# Claude Code — Jira ticket / markdown / plain text
/implement-ticket --from-jira PROJ-123
/implement-ticket --from-markdown ./specs/feature-spec.md
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
| `--branch NAME` | Custom branch name |

**Examples**:

```bash
# Claude Code
/implement-ticket --from-jira PROJ-123                            # Jira ticket
/implement-ticket --from-jira PROJ-456 --skip-visual              # Skip visual tests for backend
/implement-ticket --from-jira PROJ-789 --branch feature/custom-name  # Custom branch

# Codex CLI
$implement-ticket --from-jira PROJ-123
$implement-ticket --from-jira PROJ-456 --skip-visual
$implement-ticket --from-jira PROJ-789 --branch feature/custom-name
```

---

## Experimental Approach (Do Not Use)

### TypeScript Orchestration Script 🚧

Work in progress, not ready for production. Use the `/implement-ticket` skill in Claude Code (or `$implement-ticket` in Codex) instead.

---

## Environment Variables

```bash
# Model tier
export MODEL_TIER=opus     # Complex changes
export MODEL_TIER=sonnet   # Default
export MODEL_TIER=haiku    # Simple fixes

# Authentication
export ANTHROPIC_API_KEY=sk-ant-your-key  # Claude: if not using Claude Code auth
export OPENAI_API_KEY=sk-...              # Codex: if not using Codex CLI auth

# Debug
export DEBUG=true  # Verbose logging
```

---

## 13-Phase Process

```mermaid
graph LR
    A[Phase 0: Preflight<br/>30-60s] --> B[Phase 1: Context<br/>2-5min]
    B --> C[Phase 2: Wiki Preload<br/>1-2min]
    C --> D[Phase 3: Planning<br/>1-2min]
    D --> E[Phase 4: Environment<br/>1-3min]
    E --> F[Phase 5: Implementation<br/>3-8min]
    F --> G[Phase 6: Testing<br/>2-5min]
    G --> H[Phase 7: Visual<br/>2-4min]
    H --> I[Phase 8: Documentation<br/>1-3min]
    I --> J[Phase 8.5: Wiki Refresh<br/>1-2min]
    J --> K[Phase 9: PR Creation<br/>1-2min]
    K --> L[Phase 10: Review<br/>2-4min]
    L --> M[Phase 11: Cleanup<br/>1-2min]
```

**Phases**:
0. Preflight - Validate environment, git status, LLM wiki presence; warn (do not fail) on stale wiki
1. Context - Gather ticket context from Jira/markdown/input
2. Wiki Preload - Tiered retrieval: Tier 1 builds a frontmatter summary index for all wiki pages (cheap); Tier 2 runs one `get_minimal_context_tool` call; Tier 3 expands full bodies only for the 1–3 most relevant pages. Saves ~15-20 KB of context versus loading all bodies; planners receive untruncated bodies for relevant docs.
3. Planning - Create implementation plan with AI planner using wiki + graph context
4. Environment - Create feature branch and setup
5. Implementation - Generate code with graph-aware AI implementer
6. Testing - Run test suite with coverage validation
7. Visual - Capture and analyze visual changes (UI only)
8. Documentation - Update project documentation via `/doc-updater`
8.5. Wiki Refresh - Auto-run `/wiki-refresh --since <branch-base>`; commit wiki diff; block PR on structural lint failures
9. PR Creation - Commit changes and create pull request (Phase 8.5 must be clean)
10. Review - Run automated quality and security reviews
11. Cleanup - Clean up, archive artifacts, emit token-usage summary

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
- **Testing**: 80% coverage minimum (configurable), unit/integration/E2E tests
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
- Use `MODEL_TIER=opus`
- Break ticket into smaller parts

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

### Debug Mode

```bash
export DEBUG=true

# Claude Code
/implement-ticket --from-jira PROJ-123
# Codex CLI
$implement-ticket --from-jira PROJ-123

# Check artifacts (.claude-temp/ in Claude, .codex-temp/ in Codex)
ls .claude-temp/tickets/PROJ-123/artifacts/
```

---

## Advanced Usage

### Custom Model Selection

```bash
# Claude Code
MODEL_TIER=haiku /implement-ticket --from-jira PROJ-123     # Simple fixes
MODEL_TIER=opus  /implement-ticket --from-jira PROJ-123     # Complex changes

# Codex CLI
MODEL_TIER=haiku $implement-ticket --from-jira PROJ-123
MODEL_TIER=opus  $implement-ticket --from-jira PROJ-123
```

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
/implement-ticket --from-jira PROJ-123 --branch feature/urgent   # Custom branch
/implement-ticket --from-jira PROJ-123 --skip-pr                 # Skip PR for local testing
/implement-ticket --from-jira PROJ-123 --skip-visual             # Backend only

# Codex CLI
$implement-ticket --from-jira PROJ-123 --branch feature/urgent
$implement-ticket --from-jira PROJ-123 --skip-pr
$implement-ticket --from-jira PROJ-123 --skip-visual
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
