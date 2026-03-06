---
name: analyze-requirements
description: Analyze ticket context and create detailed implementation plan. Use when asked to "analyze requirements", "create implementation plan", "plan this ticket", or after running /fetch-ticket-context. Analyzes Jira tickets, external documentation, and dependencies to produce a comprehensive plan with file changes, risks, and implementation steps.
user-invocable: true
argument-hint: [JIRA-KEY or path/to/context.md]
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Edit
metadata:
  version: 1.0.0
  category: sdlc-workflow
  triggers:
    - analyze requirements
    - create plan
    - implementation plan
    - plan ticket
    - analyze ticket
---

# Analyze Requirements Skill

Transforms ticket context into actionable implementation plans with detailed file changes, risk assessment, and dependency analysis.

## Table of Contents

- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Workflow](#workflow)
- [Output Format](#output-format)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Purpose

This skill creates detailed implementation plans by:

1. **Analyzing ticket context** - Processing Jira ticket details and external documentation
2. **Identifying affected files** - Determining which files need changes
3. **Mapping dependencies** - Finding related code, libraries, and services
4. **Assessing risks** - Identifying potential issues and blockers
5. **Creating action plan** - Breaking down work into concrete steps

**Input:** Ticket context from `/fetch-ticket-context` or manual context file
**Output:** Comprehensive implementation plan with file list, risks, and steps

## When to Use

Activate this skill when:
- After running `/fetch-ticket-context` to analyze gathered context
- Given a Jira ticket key to analyze directly
- Asked to "create an implementation plan" or "analyze requirements"
- Starting work on a new ticket/feature
- Need to understand scope before coding

## Workflow

### Phase 1: Load Context

**Option A: From fetch-ticket-context output**
```bash
# Context file typically at /tmp/context_JIRA-KEY.md
CONTEXT_FILE="/tmp/context_${JIRA_KEY}.md"

if [[ ! -f "$CONTEXT_FILE" ]]; then
    echo "Running /fetch-ticket-context first..."
    /fetch-ticket-context "$JIRA_KEY"
fi
```

**Option B: From provided context file**
```bash
# User provides custom context file
CONTEXT_FILE="$1"  # Argument to skill

if [[ ! -f "$CONTEXT_FILE" ]]; then
    echo "Error: Context file not found: $CONTEXT_FILE"
    exit 1
fi
```

**Option C: Fetch directly from Jira**
```bash
# Fetch fresh context if not provided
if [[ -z "$CONTEXT_FILE" ]] && [[ -n "$JIRA_KEY" ]]; then
    echo "Fetching context for $JIRA_KEY..."
    /fetch-ticket-context "$JIRA_KEY"
    CONTEXT_FILE="/tmp/context_${JIRA_KEY}.md"
fi
```

### Phase 2: Parse Context

Extract key information from context document:

```bash
# Read full context
context=$(cat "$CONTEXT_FILE")

# Extract sections using grep/awk
summary=$(echo "$context" | grep -A 1 "^## Jira Ticket Details" | grep "Summary:" | cut -d: -f2-)
description=$(echo "$context" | sed -n '/^## Description$/,/^##/p' | grep -v "^##")
acceptance_criteria=$(echo "$context" | sed -n '/^## Acceptance Criteria$/,/^##/p' | grep -v "^##")
priority=$(echo "$context" | grep "Priority:" | cut -d: -f2-)
labels=$(echo "$context" | grep "Labels:" | cut -d: -f2-)

# Extract external docs
notion_docs=$(echo "$context" | grep -E "^### Notion Document:" | cut -d: -f2-)
confluence_docs=$(echo "$context" | grep -E "^### Confluence Page:" | cut -d: -f2-)

# Extract dependencies
blocking_issues=$(echo "$context" | sed -n '/^**Blocking:**$/,/^**/p' | grep -E "^- " | cut -d: -f1 | cut -d- -f2-)
dependent_issues=$(echo "$context" | sed -n '/^**Depends on:**$/,/^**/p' | grep -E "^- " | cut -d: -f1 | cut -d- -f2-)
```

### Phase 3: Analyze Codebase Impact

Identify which files and areas will be affected:

#### 3a. Detect Project Structure
```bash
# Identify language and framework
if [[ -f "pyproject.toml" ]] || [[ -f "setup.py" ]]; then
    LANGUAGE="python"
    if grep -q "fastapi" pyproject.toml 2>/dev/null || grep -q "fastapi" requirements.txt 2>/dev/null; then
        FRAMEWORK="fastapi"
    elif grep -q "django" pyproject.toml 2>/dev/null || grep -q "django" requirements.txt 2>/dev/null; then
        FRAMEWORK="django"
    fi
elif [[ -f "package.json" ]]; then
    LANGUAGE="typescript"
    if grep -q "next" package.json; then
        FRAMEWORK="nextjs"
    elif grep -q "react" package.json; then
        FRAMEWORK="react"
    elif grep -q "express" package.json; then
        FRAMEWORK="express"
    fi
fi

echo "Detected: $LANGUAGE ($FRAMEWORK)"
```

#### 3b. Search for Related Code
```bash
# Extract key terms from summary and description
key_terms=$(echo "$summary $description" | tr '[:upper:]' '[:lower:]' | grep -oE '\b[a-z]{4,}\b' | sort -u)

# Search codebase for relevant files
affected_files=""
for term in $key_terms; do
    # Search in code
    files=$(grep -r -l "$term" src/ 2>/dev/null || echo "")
    affected_files="$affected_files\n$files"
done

# Remove duplicates
affected_files=$(echo -e "$affected_files" | sort -u | grep -v "^$")

echo "Potentially affected files:"
echo "$affected_files"
```

#### 3c. Identify Dependencies
```bash
# For Python
if [[ "$LANGUAGE" == "python" ]]; then
    # Check imports in affected files
    dependencies=$(grep -h "^import\|^from" $affected_files 2>/dev/null | cut -d' ' -f2 | cut -d'.' -f1 | sort -u)

    # Check if new libraries needed
    echo "Current dependencies:"
    if [[ -f "pyproject.toml" ]]; then
        grep "^\[tool.poetry.dependencies\]" -A 20 pyproject.toml
    elif [[ -f "requirements.txt" ]]; then
        cat requirements.txt
    fi
fi

# For TypeScript/JavaScript
if [[ "$LANGUAGE" == "typescript" ]]; then
    # Check imports in affected files
    dependencies=$(grep -h "^import\|^require" $affected_files 2>/dev/null | grep -oE "from ['\"]([^'\"]+)" | cut -d'"' -f2 | cut -d"'" -f2 | sort -u)

    echo "Current dependencies:"
    cat package.json | jq '.dependencies, .devDependencies'
fi
```

### Phase 4: Risk Assessment

Identify potential risks and blockers:

```bash
# Database changes
db_risk=""
if grep -qi "database\|migration\|schema" "$CONTEXT_FILE"; then
    db_risk="Database schema changes required - need migration scripts"
fi

# API changes
api_risk=""
if grep -qi "api\|endpoint\|route" "$CONTEXT_FILE"; then
    api_risk="API changes - ensure backward compatibility and update API docs"
fi

# Security considerations
security_risk=""
if grep -qi "auth\|password\|token\|security\|permission" "$CONTEXT_FILE"; then
    security_risk="Security-sensitive changes - requires security review"
fi

# Performance concerns
perf_risk=""
if grep -qi "performance\|optimization\|slow\|scale" "$CONTEXT_FILE"; then
    perf_risk="Performance impact - needs load testing"
fi

# Breaking changes
breaking_risk=""
if grep -qi "breaking\|deprecat\|remove" "$CONTEXT_FILE"; then
    breaking_risk="Potential breaking changes - needs version bump and migration guide"
fi

# Dependencies on blocking issues
if [[ -n "$blocking_issues" ]]; then
    dependency_risk="Blocked by: $blocking_issues - cannot proceed until resolved"
fi
```

### Phase 5: Create Implementation Plan

Generate structured plan with all analysis:

```bash
PLAN_FILE="/tmp/plan_${JIRA_KEY}.md"

cat > "$PLAN_FILE" <<EOF
# Implementation Plan: $JIRA_KEY

**Summary:** $summary
**Priority:** $priority
**Estimated Complexity:** $(estimate_complexity)

---

## 1. Context Analysis

### Ticket Requirements
$description

### Acceptance Criteria
$acceptance_criteria

### External Documentation
$(list_external_docs)

---

## 2. Technical Analysis

### Language & Framework
- **Language:** $LANGUAGE
- **Framework:** $FRAMEWORK
- **Project Structure:** $(detect_structure)

### Affected Areas
$(analyze_affected_areas)

---

## 3. File Changes

### Files to Modify
$(list_files_to_modify)

### Files to Create
$(list_files_to_create)

### Files to Delete
$(list_files_to_delete)

### Configuration Changes
$(list_config_changes)

---

## 4. Dependencies

### Code Dependencies
$(list_code_dependencies)

### External Libraries
$(list_new_libraries)

### Service Dependencies
$(list_service_dependencies)

### Blocking Issues
$(list_blocking_issues)

---

## 5. Risk Assessment

### High Priority Risks
$(list_high_risks)

### Medium Priority Risks
$(list_medium_risks)

### Mitigation Strategies
$(list_mitigations)

---

## 6. Implementation Steps

### Step 1: Setup
$(generate_setup_steps)

### Step 2: Core Implementation
$(generate_implementation_steps)

### Step 3: Testing
$(generate_testing_steps)

### Step 4: Documentation
$(generate_documentation_steps)

### Step 5: Review & Deploy
$(generate_review_steps)

---

## 7. Testing Strategy

### Unit Tests
$(list_unit_tests_needed)

### Integration Tests
$(list_integration_tests_needed)

### E2E Tests
$(list_e2e_tests_needed)

### Manual Testing Checklist
$(generate_manual_test_checklist)

---

## 8. Rollout Plan

### Pre-deployment
- [ ] All tests passing
- [ ] Code review approved
- [ ] Security scan clean
- [ ] Documentation updated

### Deployment
$(generate_deployment_steps)

### Post-deployment
- [ ] Monitor logs for errors
- [ ] Verify metrics
- [ ] Check user feedback
- [ ] Update ticket status

---

## 9. Estimated Timeline

$(estimate_timeline)

---

## 10. Open Questions

$(list_open_questions)

---

## Next Steps

1. Review this plan with team
2. Address open questions
3. Resolve blocking issues
4. Begin implementation with \`/code-implementation\`

EOF

echo "Implementation plan created: $PLAN_FILE"
cat "$PLAN_FILE"
```

## Output Format

The skill produces a comprehensive plan file with this structure:

```markdown
# Implementation Plan: PROJ-123

**Summary:** Implement OAuth2 authentication
**Priority:** High
**Estimated Complexity:** Medium-High (5-8 days)

---

## 1. Context Analysis
[Ticket requirements, acceptance criteria, external docs]

## 2. Technical Analysis
[Language, framework, affected areas]

## 3. File Changes
[Specific files to modify/create/delete]

## 4. Dependencies
[Libraries, services, blocking issues]

## 5. Risk Assessment
[Risks and mitigation strategies]

## 6. Implementation Steps
[Detailed step-by-step plan]

## 7. Testing Strategy
[Unit, integration, E2E tests]

## 8. Rollout Plan
[Pre/post deployment checklist]

## 9. Estimated Timeline
[Time estimates per phase]

## 10. Open Questions
[Clarifications needed]
```

## Error Handling

### Context File Not Found
```bash
if [[ ! -f "$CONTEXT_FILE" ]]; then
    echo "Error: Context file not found"
    echo "Please run: /fetch-ticket-context $JIRA_KEY"
    exit 1
fi
```

### Invalid Jira Key
```bash
if [[ ! "$JIRA_KEY" =~ ^[A-Z]+-[0-9]+$ ]]; then
    echo "Error: Invalid Jira key format: $JIRA_KEY"
    echo "Expected format: PROJ-123"
    exit 1
fi
```

### Empty Context
```bash
if [[ $(wc -l < "$CONTEXT_FILE") -lt 10 ]]; then
    echo "Warning: Context file seems empty or incomplete"
    echo "Consider re-fetching context"
fi
```

### Missing Project Structure
```bash
if [[ ! -f "pyproject.toml" ]] && [[ ! -f "package.json" ]] && [[ ! -f "pom.xml" ]]; then
    echo "Warning: Cannot detect project type"
    echo "Manual analysis required for file changes"
fi
```

## Best Practices

### 1. Be Specific with File Changes
```markdown
Good:
- Modify: src/auth/oauth.py - Add OAuth2 provider class
- Create: tests/test_oauth.py - Test OAuth flow
- Update: pyproject.toml - Add authlib dependency

Bad:
- Update authentication files
- Add tests
- Install dependencies
```

### 2. Prioritize Risks
```markdown
High (Blockers):
- Database migration fails on production
- Breaking API change without versioning

Medium (Important):
- Performance degradation under load
- Missing error handling

Low (Nice to have):
- Code style improvements
- Documentation gaps
```

### 3. Include Concrete Steps
```markdown
Good:
Step 2.1: Create OAuth2 provider class
  - File: src/auth/oauth_provider.py
  - Implement: GoogleOAuth, GitHubOAuth, MicrosoftOAuth
  - Use: authlib library
  - Reference: /mastering-python-skill for async patterns

Bad:
Step 2: Implement OAuth providers
```

### 4. Link to Related Skills
```markdown
For implementation, use:
- Python code: /mastering-python-skill
- TypeScript code: /mastering-typescript
- Database migrations: See references/database-migrations.md
```

## Examples

### Example 1: Simple Bug Fix

**Input:**
```
JIRA-456: Fix null pointer in user profile
Priority: High
Description: Users getting 500 error when profile is missing avatar
```

**Output Plan:**
```markdown
# Implementation Plan: JIRA-456

Estimated Complexity: Low (2-4 hours)

## File Changes
- Modify: src/users/profile.py (line ~45)
- Create: tests/test_profile_avatar.py

## Implementation Steps
1. Add null check for avatar field
2. Return default avatar URL if missing
3. Add test for missing avatar case
4. Add test for null avatar case

## Testing
- Unit test: test_profile_with_missing_avatar()
- Manual: Test with user account without avatar

## Risks
Low - Simple null check, no breaking changes
```

### Example 2: Complex Feature

**Input:**
```
PROJ-123: Implement OAuth2 authentication
Priority: High
Description: Add Google, GitHub, Microsoft OAuth
External docs: 3 Notion pages, 2 Confluence pages
```

**Output Plan:**
```markdown
# Implementation Plan: PROJ-123

Estimated Complexity: High (1-2 weeks)

## File Changes
Create:
- src/auth/oauth_provider.py - Base OAuth provider
- src/auth/providers/google.py - Google OAuth
- src/auth/providers/github.py - GitHub OAuth
- src/auth/providers/microsoft.py - Microsoft OAuth
- src/auth/token_manager.py - Token refresh logic

Modify:
- src/auth/routes.py - Add OAuth endpoints
- src/config.py - OAuth credentials config
- pyproject.toml - Add authlib, httpx

## Dependencies
New libraries:
- authlib>=1.2.0 - OAuth implementation
- httpx>=0.24.0 - Async HTTP client

External services:
- Google OAuth API
- GitHub OAuth API
- Microsoft Identity Platform

Blocking issues:
- PROJ-120: Set up OAuth app credentials

## Risk Assessment
High:
- Token refresh mechanism must be bulletproof
- Secret management (OAuth client secrets)

Medium:
- Session management complexity
- Multiple provider support

Mitigation:
- Use proven library (authlib)
- Comprehensive testing of refresh flow
- Security review before deployment

## Implementation Steps
[20+ detailed steps broken down by file and function]

## Testing Strategy
Unit tests (15 tests):
- test_google_oauth_flow()
- test_token_refresh()
- test_invalid_state_parameter()
[...]

Integration tests (8 tests):
- test_end_to_end_google_login()
[...]

Manual testing:
- Test with real Google account
- Test with real GitHub account
- Test token expiry and refresh
[...]
```

## Integration with Workflow

This skill fits into the SDLC workflow:

```bash
# Step 1: Fetch context
/fetch-ticket-context PROJ-123

# Step 2: Analyze and create plan (THIS SKILL)
/analyze-requirements PROJ-123

# Step 3: Review plan, address questions
# [Manual review]

# Step 4: Implement based on plan
/code-implementation PROJ-123

# Step 5: Quality checks
/code-quality-check

# Step 6: Security review
/security-review

# Step 7: Create PR
/create-pr PROJ-123
```

## Troubleshooting

**Issue: "Cannot detect project structure"**
- Ensure you're in project root directory
- Check for pyproject.toml, package.json, or pom.xml
- Manually specify language with --language flag

**Issue: "No affected files found"**
- Context may not contain enough technical details
- Manually search codebase for relevant terms
- Check if feature is entirely new (no existing code)

**Issue: "Complexity estimate seems wrong"**
- Review file count and dependency list
- Consider team experience with technology
- Adjust based on similar past tickets

**Issue: "Missing risk assessment"**
- Review acceptance criteria for hints
- Check for security, performance, or breaking change keywords
- Consult with tech lead if uncertain

## References

- Fetch Ticket Context: `.claude/skills/fetch-ticket-context/SKILL.md`
- Code Implementation: `.claude/skills/code-implementation/SKILL.md`
- Python Patterns: `.claude/skills/mastering-python-skill/SKILL.md`
- TypeScript Patterns: `.claude/skills/mastering-typescript/SKILL.md`
