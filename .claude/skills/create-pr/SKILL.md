---
name: create-pr
description: Create production-ready GitHub Pull Request with conventional commits and comprehensive PR description. Use when asked to "create PR", "create pull request", "submit for review", or after code quality and security checks pass. Creates feature branch, commits with conventional commit format, uses /mastering-github-agent-skill to create PR with title, description, linked Jira ticket, test plan, and automatically links back to Jira.
user-invocable: true
argument-hint: [JIRA-KEY]
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Skill
metadata:
  version: 1.0.0
  category: sdlc-workflow
  triggers:
    - create pr
    - create pull request
    - submit pr
    - create production pr
    - submit for review
---

# Create Production PR Skill

Creates production-ready GitHub Pull Requests with conventional commits, comprehensive descriptions, and Jira integration.

## Table of Contents

- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Workflow](#workflow)
- [Conventional Commits](#conventional-commits)
- [PR Description Format](#pr-description-format)
- [Jira Integration](#jira-integration)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Purpose

This skill creates PRs by:

1. **Verifying prerequisites** - Code quality and security checks passed
2. **Creating feature branch** - Following branch naming conventions
3. **Staging changes** - Selecting relevant files only
4. **Creating conventional commits** - Structured commit messages
5. **Using GitHub CLI** - Invoking `/mastering-github-agent-skill`
6. **Linking to Jira** - Automatic ticket linking and status updates
7. **Adding PR metadata** - Labels, reviewers, test plan, screenshots

**Input:** Jira ticket key
**Output:** GitHub PR URL with full description and Jira link

## When to Use

Activate this skill when:
- After passing code quality checks (`/code-quality-check`)
- After passing security review (`/security-review`)
- Ready to submit code for review
- Asked to "create a PR" or "create pull request"
- Implementation is complete and tested
- All checks have passed

## Workflow

### Phase 1: Pre-flight Checks

```bash
run_preflight_checks() {
    echo "Running pre-flight checks..."

    local checks_passed=true

    # 1. Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo "ERROR: Not in a git repository"
        checks_passed=false
    fi

    # 2. Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo "Found uncommitted changes"
        # This is OK - we'll commit them
    else
        echo "WARNING: No uncommitted changes found"
        echo "Have you made any code changes?"
    fi

    # 3. Verify code quality report exists
    if [[ ! -f "/tmp/code_quality_report.md" ]]; then
        echo "WARNING: Code quality report not found"
        echo "Recommended: Run /code-quality-check first"
        echo "Continue anyway? (yes/no)"
        # In automation mode, skip this prompt
    else
        # Check if quality checks passed
        if grep -q "Status:.*FAILED" /tmp/code_quality_report.md; then
            echo "ERROR: Code quality checks failed"
            echo "Fix issues before creating PR"
            checks_passed=false
        else
            echo "Code quality: PASSED"
        fi
    fi

    # 4. Verify security report exists
    if [[ ! -f "/tmp/security_report_final.md" ]]; then
        echo "WARNING: Security report not found"
        echo "Recommended: Run /security-review first"
    else
        # Check for critical security issues
        if grep -q "CRITICAL:" /tmp/security_report_final.md; then
            echo "ERROR: Critical security issues found"
            echo "Fix issues before creating PR"
            checks_passed=false
        else
            echo "Security review: PASSED"
        fi
    fi

    # 5. Check remote repository exists
    if ! git remote -v | grep -q "origin"; then
        echo "ERROR: No remote repository configured"
        echo "Add remote: git remote add origin <url>"
        checks_passed=false
    else
        echo "Remote repository: OK"
    fi

    if [[ "$checks_passed" != "true" ]]; then
        echo "Pre-flight checks FAILED"
        return 1
    fi

    echo "Pre-flight checks PASSED"
    return 0
}

run_preflight_checks || exit 1
```

### Phase 2: Create Feature Branch

```bash
create_feature_branch() {
    local jira_key="$1"

    echo "Creating feature branch..."

    # Parse Jira key
    project=$(echo "$jira_key" | cut -d- -f1)
    issue_num=$(echo "$jira_key" | cut -d- -f2)

    # Get current branch (should be main/master/develop)
    current_branch=$(git branch --show-current)

    # Determine base branch
    if git show-ref --verify --quiet refs/heads/main; then
        base_branch="main"
    elif git show-ref --verify --quiet refs/heads/master; then
        base_branch="master"
    elif git show-ref --verify --quiet refs/heads/develop; then
        base_branch="develop"
    else
        echo "ERROR: Cannot determine base branch (main/master/develop not found)"
        return 1
    fi

    # Ensure we're up to date with remote
    echo "Updating base branch: $base_branch"
    git fetch origin
    git checkout "$base_branch"
    git pull origin "$base_branch"

    # Determine branch type from Jira labels or issue type
    # Read from plan or context file
    branch_type="feature"  # Default

    if grep -q "bug\|fix" /tmp/context_${jira_key}.md 2>/dev/null; then
        branch_type="bugfix"
    elif grep -q "hotfix\|critical" /tmp/context_${jira_key}.md 2>/dev/null; then
        branch_type="hotfix"
    elif grep -q "chore\|refactor" /tmp/context_${jira_key}.md 2>/dev/null; then
        branch_type="chore"
    fi

    # Create branch name (lowercase, kebab-case)
    # Format: {type}/{jira-key}-{description}
    description=$(grep "Summary:" /tmp/context_${jira_key}.md | cut -d: -f2- | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-50)
    branch_name="${branch_type}/${jira_key}-${description}"

    echo "Branch name: $branch_name"

    # Create and checkout branch
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo "Branch already exists, checking out..."
        git checkout "$branch_name"
    else
        echo "Creating new branch..."
        git checkout -b "$branch_name"
    fi

    echo "Feature branch ready: $branch_name"
    echo "$branch_name" > /tmp/pr_branch_${jira_key}.txt
}

create_feature_branch "$JIRA_KEY"
```

### Phase 3: Stage Changes

```bash
stage_changes() {
    echo "Staging changes..."

    # Get list of changed files
    changed_files=$(git status --porcelain)

    if [[ -z "$changed_files" ]]; then
        echo "No changes to stage"
        return 1
    fi

    echo "Changed files:"
    echo "$changed_files"

    # Identify files to exclude (sensitive, generated, etc.)
    exclude_patterns=(
        ".env"
        ".env.local"
        "*.log"
        "node_modules/"
        ".venv/"
        "venv/"
        "__pycache__/"
        "*.pyc"
        ".coverage"
        "coverage/"
        "dist/"
        "build/"
        ".DS_Store"
    )

    # Stage files selectively
    while IFS= read -r line; do
        status=$(echo "$line" | awk '{print $1}')
        file=$(echo "$line" | awk '{print $2}')

        # Check if file should be excluded
        exclude=false
        for pattern in "${exclude_patterns[@]}"; do
            if [[ "$file" == $pattern ]]; then
                echo "Excluding: $file (matches $pattern)"
                exclude=true
                break
            fi
        done

        if [[ "$exclude" == "false" ]]; then
            echo "Staging: $file"
            git add "$file"
        fi
    done <<< "$changed_files"

    # Verify staged files
    staged_files=$(git diff --cached --name-only)
    staged_count=$(echo "$staged_files" | wc -l)

    echo "Staged $staged_count files for commit"

    if [[ $staged_count -eq 0 ]]; then
        echo "ERROR: No files staged"
        return 1
    fi

    return 0
}

stage_changes
```

### Phase 4: Create Conventional Commit

```bash
create_conventional_commit() {
    local jira_key="$1"

    echo "Creating conventional commit..."

    # Determine commit type from branch type
    branch_name=$(cat /tmp/pr_branch_${jira_key}.txt)
    commit_type="feat"  # Default

    if [[ "$branch_name" == bugfix/* ]]; then
        commit_type="fix"
    elif [[ "$branch_name" == hotfix/* ]]; then
        commit_type="fix"
    elif [[ "$branch_name" == chore/* ]]; then
        commit_type="chore"
    elif grep -q "refactor" /tmp/context_${jira_key}.md 2>/dev/null; then
        commit_type="refactor"
    elif grep -q "test" /tmp/context_${jira_key}.md 2>/dev/null; then
        commit_type="test"
    elif grep -q "docs\|documentation" /tmp/context_${jira_key}.md 2>/dev/null; then
        commit_type="docs"
    fi

    # Get commit scope from affected area
    scope=""
    if grep -q "auth" /tmp/context_${jira_key}.md 2>/dev/null; then
        scope="auth"
    elif grep -q "api" /tmp/context_${jira_key}.md 2>/dev/null; then
        scope="api"
    elif grep -q "ui\|frontend" /tmp/context_${jira_key}.md 2>/dev/null; then
        scope="ui"
    elif grep -q "database\|db" /tmp/context_${jira_key}.md 2>/dev/null; then
        scope="db"
    fi

    # Get short description from Jira summary
    summary=$(grep "Summary:" /tmp/context_${jira_key}.md | cut -d: -f2- | xargs)
    short_desc=$(echo "$summary" | cut -c1-72)  # Max 72 chars for first line

    # Build commit message
    commit_msg=""

    # Line 1: type(scope): description
    if [[ -n "$scope" ]]; then
        commit_msg="${commit_type}(${scope}): ${short_desc}"
    else
        commit_msg="${commit_type}: ${short_desc}"
    fi

    # Line 2: Empty

    # Line 3+: Body with details
    commit_body=$(cat <<EOF

Implements: $jira_key

$(grep -A 5 "## Description" /tmp/context_${jira_key}.md | grep -v "^##" | head -5)

Changes:
$(git diff --cached --stat)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)

    # Create commit
    echo "Commit message:"
    echo "$commit_msg"
    echo "$commit_body"

    git commit -m "$commit_msg" -m "$commit_body"

    if [[ $? -eq 0 ]]; then
        echo "Commit created successfully"
    else
        echo "ERROR: Commit failed"
        return 1
    fi

    return 0
}

create_conventional_commit "$JIRA_KEY"
```

### Phase 5: Push to Remote

```bash
push_to_remote() {
    local jira_key="$1"

    echo "Pushing to remote repository..."

    branch_name=$(cat /tmp/pr_branch_${jira_key}.txt)

    # Push branch with upstream tracking
    git push -u origin "$branch_name"

    if [[ $? -eq 0 ]]; then
        echo "Pushed to origin/$branch_name"
    else
        echo "ERROR: Push failed"
        echo "Check remote permissions and network"
        return 1
    fi

    return 0
}

push_to_remote "$JIRA_KEY"
```

### Phase 6: Generate PR Description

```bash
generate_pr_description() {
    local jira_key="$1"

    echo "Generating PR description..."

    # Read context and reports
    summary=$(grep "Summary:" /tmp/context_${jira_key}.md | cut -d: -f2- | xargs)
    description=$(sed -n '/^## Description$/,/^##/p' /tmp/context_${jira_key}.md | grep -v "^##")
    acceptance_criteria=$(sed -n '/^## Acceptance Criteria$/,/^##/p' /tmp/context_${jira_key}.md | grep -v "^##")

    # Get implementation details from plan
    implementation_summary=""
    if [[ -f "/tmp/plan_${jira_key}.md" ]]; then
        implementation_summary=$(sed -n '/^## 3. File Changes$/,/^##/p' /tmp/plan_${jira_key}.md | head -20)
    fi

    # Get quality metrics
    quality_score=""
    coverage=""
    if [[ -f "/tmp/code_quality_report.md" ]]; then
        quality_score=$(grep "Quality Score:" /tmp/code_quality_report.md | cut -d: -f2 | xargs)
        coverage=$(grep "Overall Coverage:" /tmp/code_quality_report.md | cut -d: -f2 | xargs)
    fi

    # Get security status
    security_score=""
    if [[ -f "/tmp/security_report_final.md" ]]; then
        security_score=$(grep "Overall Score:" /tmp/security_report_final.md | cut -d: -f2 | xargs)
    fi

    # Determine PR labels
    labels=""
    if [[ "$branch_name" == bugfix/* ]]; then
        labels="bug,bugfix"
    elif [[ "$branch_name" == feature/* ]]; then
        labels="enhancement,feature"
    elif [[ "$branch_name" == hotfix/* ]]; then
        labels="hotfix,urgent"
    fi

    # Add language label
    if [[ -f "pyproject.toml" ]]; then
        labels="$labels,python"
    elif [[ -f "package.json" ]]; then
        labels="$labels,typescript"
    fi

    # Check for test artifacts
    artifacts_section=""
    if [[ -f ".claude/artifacts/${jira_key}/MANIFEST.md" ]]; then
        artifacts_section=$(cat <<ARTIFACTS

## Test Artifacts

### E2E Test Results

<details>
<summary>View E2E Test Artifacts</summary>

$(cat .claude/artifacts/${jira_key}/MANIFEST.md)

</details>

### Artifact Locations

All test artifacts are available in \`.claude/artifacts/${jira_key}/\`:
- **Videos**: \`.claude/artifacts/${jira_key}/videos/\` (E2E test recordings)
- **Screenshots**: \`.claude/artifacts/${jira_key}/screenshots/\` (Failure screenshots + UI before/after)
- **Traces**: \`.claude/artifacts/${jira_key}/traces/\` (Playwright trace files for debugging)
- **Reports**: \`.claude/artifacts/${jira_key}/reports/\` (HTML coverage + E2E reports)

### How to View

\`\`\`bash
# View E2E HTML report
open .claude/artifacts/${jira_key}/reports/e2e/index.html

# View trace file for debugging
npx playwright show-trace .claude/artifacts/${jira_key}/traces/<trace-file>.zip

# View coverage report
open .claude/artifacts/${jira_key}/reports/coverage/index.html
\`\`\`

ARTIFACTS
)
    fi

    # Check for decision log (autonomous mode)
    decision_log_section=""
    if [[ -f ".claude/decisions/${jira_key}.md" ]]; then
        decision_log_section=$(cat <<DECISIONS

## Implementation Decisions (Autonomous Mode)

This PR was implemented in autonomous mode (\`--no-stop\`). All implementation decisions are documented below for transparency and review.

<details>
<summary>View Decision Log</summary>

$(cat .claude/decisions/${jira_key}.md)

</details>

### Key Decisions

$(grep "^###" .claude/decisions/${jira_key}.md | sed 's/^### /- /' | head -10)

DECISIONS
)
    fi

    # Check for implementation plan with assumptions (planner mode)
    assumptions_section=""
    if [[ -f ".claude/plans/${jira_key}-plan.md" ]]; then
        # Extract assumptions & decisions section if it exists
        if grep -q "^### 8. Assumptions & Decisions" ".claude/plans/${jira_key}-plan.md"; then
            assumptions_section=$(cat <<ASSUMPTIONS

## 🧠 Implementation Decisions & Assumptions

This PR was implemented autonomously. The following decisions were made during planning:

<details>
<summary>View Decisions & Assumptions</summary>

$(sed -n '/^### 8. Assumptions & Decisions/,/^###/p' ".claude/plans/${jira_key}-plan.md" | sed '$ d')

</details>

**High-Risk Assumptions**:

$(grep -A 10 "^**High-Risk Assumptions**" ".claude/plans/${jira_key}-plan.md" || echo "None identified")

**Note**: These decisions were made autonomously based on project patterns, best practices, and requirements in the ticket. Please review and validate before merging.

ASSUMPTIONS
)
        fi
    fi

    # Check for documentation update recommendations
    documentation_section=""
    if [[ -f ".claude/documentation-updates/${jira_key}-updates.md" ]]; then
        documentation_section=$(cat <<DOCUMENTATION

## 📚 Documentation Updates Required

⚠️ **This PR includes architectural changes that require documentation updates.**

<details>
<summary>View Documentation Update Recommendations</summary>

$(cat .claude/documentation-updates/${jira_key}-updates.md)

</details>

### ✅ Action Required Before Merge

- [ ] Review documentation update recommendations above
- [ ] Update \`.claude/skills/010-foundation/project-context/SKILL.md\` (affected sections listed above)
- [ ] Update \`.claude/CLAUDE.md\` if project-level conventions changed
- [ ] Commit documentation updates to this PR

**Files to Update**:
- \`.claude/skills/010-foundation/project-context/SKILL.md\`
- \`.claude/CLAUDE.md\` (if conventions or architecture changed)

**Why**: Project documentation must stay current to ensure future implementations follow correct patterns.

DOCUMENTATION
)
    fi

    # Check for grading report (architect mode)
    grading_section=""
    if ls .claude/gradings/grade-*-${jira_key}.md 1> /dev/null 2>&1; then
        # Find the latest grading file
        latest_grading=$(ls -t .claude/gradings/grade-*-${jira_key}.md | head -1)
        grading_score=$(grep "^## Overall Score:" "$latest_grading" | grep -oP '\d+' | head -1)

        grading_section=$(cat <<GRADING

## Quality Assurance (Architect Mode)

This PR was implemented using **architect mode** with post-implementation quality grading.

### Grading Summary

**Overall Score**: ${grading_score}/100

<details>
<summary>View Full Grading Report</summary>

$(cat "$latest_grading")

</details>

### Quality Assessment

$(grep -A 5 "^## Quality Assessment" "$latest_grading" | tail -5)

### Grading File

Full grading report available at: \`$latest_grading\`

---

**What is Architect Mode?**

Architect mode is an enhanced quality assurance workflow that includes:
- Detailed implementation instructions with success criteria
- Post-implementation grading against a 100-point rubric
- Quality thresholds (≥80 passing, ≥95 excellent)
- Iterative improvement loop for low scores

This ensures higher code quality for security-critical, compliance, and breaking-change tickets.

GRADING
)
    fi

    # Create PR description
    pr_description=$(cat <<EOF
## Summary

$summary

## Description

$description

## Jira Ticket

[$jira_key](https://your-company.atlassian.net/browse/$jira_key)

## Changes

$implementation_summary

## Testing

### Automated Tests
- All tests passing
- Coverage: $coverage
- Quality Score: $quality_score
- Security Score: $security_score

### Test Plan

$acceptance_criteria

### Manual Testing Checklist
- [ ] Tested happy path
- [ ] Tested error cases
- [ ] Tested edge cases
- [ ] Verified UI/UX (if applicable)
- [ ] Tested on different browsers (if frontend)
- [ ] Verified backward compatibility

## Screenshots/Demo

<!-- Add screenshots or demo GIFs here if applicable -->

$artifacts_section

$grading_section

$decision_log_section

$assumptions_section

$documentation_section

## Deployment Notes

<!-- Any special deployment considerations -->

## Checklist

- [x] Code follows project style guidelines
- [x] Tests added/updated
- [x] Documentation updated
- [x] No security vulnerabilities
- [x] No breaking changes (or documented)
- [x] Linked to Jira ticket

## Additional Context

<!-- Any additional information reviewers should know -->

---

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)

    # Save PR description
    echo "$pr_description" > /tmp/pr_description_${jira_key}.md

    echo "PR description generated: /tmp/pr_description_${jira_key}.md"
}

generate_pr_description "$JIRA_KEY"
```

### Phase 7: Create PR with GitHub CLI

```bash
create_github_pr() {
    local jira_key="$1"

    echo "Creating GitHub Pull Request..."

    # Get PR details
    branch_name=$(cat /tmp/pr_branch_${jira_key}.txt)
    summary=$(grep "Summary:" /tmp/context_${jira_key}.md | cut -d: -f2- | xargs)

    # Determine base branch
    if git show-ref --verify --quiet refs/heads/main; then
        base_branch="main"
    else
        base_branch="master"
    fi

    # Get PR description
    pr_body=$(cat /tmp/pr_description_${jira_key}.md)

    # Parse labels
    labels=$(echo "$labels" | tr ',' '\n')

    # Invoke mastering-github-agent-skill to create PR
    echo "Using /mastering-github-agent-skill to create PR..."

    # Use gh pr create command
    pr_url=$(gh pr create \
        --title "$jira_key: $summary" \
        --body "$pr_body" \
        --base "$base_branch" \
        --head "$branch_name" \
        --label "$labels" \
        --web)

    if [[ $? -eq 0 ]]; then
        echo "PR created successfully!"
        echo "URL: $pr_url"

        # Save PR URL
        echo "$pr_url" > /tmp/pr_url_${jira_key}.txt

        return 0
    else
        echo "ERROR: Failed to create PR"
        return 1
    fi
}

create_github_pr "$JIRA_KEY"
```

### Phase 8: Link PR to Jira

```bash
link_pr_to_jira() {
    local jira_key="$1"

    echo "Linking PR to Jira ticket..."

    pr_url=$(cat /tmp/pr_url_${jira_key}.txt)

    # Add PR link to Jira ticket using Jira skill
    /jira add-comment "$jira_key" "Pull Request created: $pr_url"

    # Transition ticket to "In Review" status
    /jira transition "$jira_key" "In Review"

    echo "Jira ticket updated with PR link"
}

link_pr_to_jira "$JIRA_KEY"
```

## Conventional Commits

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| **feat** | New feature | `feat(auth): add OAuth2 login` |
| **fix** | Bug fix | `fix(api): handle null user profile` |
| **docs** | Documentation | `docs(readme): update installation steps` |
| **style** | Code style (formatting) | `style: apply prettier formatting` |
| **refactor** | Code refactoring | `refactor(db): optimize query performance` |
| **test** | Adding tests | `test(auth): add OAuth flow tests` |
| **chore** | Maintenance | `chore(deps): update dependencies` |
| **perf** | Performance improvement | `perf(api): cache user lookups` |
| **ci** | CI/CD changes | `ci: add security scan to pipeline` |
| **build** | Build system | `build: update webpack config` |

### Scope Examples

- **auth** - Authentication/authorization
- **api** - API endpoints
- **ui** - User interface
- **db** - Database
- **core** - Core functionality
- **config** - Configuration
- **deps** - Dependencies

### Breaking Changes

```
feat(api)!: redesign user authentication

BREAKING CHANGE: API endpoints now require Bearer token instead of API key.
Migration guide: https://docs.example.com/migration
```

## PR Description Format

### Template Structure

```markdown
## Summary
Brief one-sentence summary

## Description
Detailed explanation of what changed and why

## Jira Ticket
Link to Jira ticket

## Changes
List of files/areas modified

## Testing
- Automated test results
- Manual testing checklist

## Screenshots/Demo
Visual proof (if UI changes)

## Deployment Notes
Special considerations

## Checklist
Standard PR checklist
```

### Quality Metrics Section

```markdown
### Automated Tests
- Tests: 125 passed, 0 failed
- Coverage: 87.5%
- Quality Score: 95/100
- Security Score: 100/100
```

## Jira Integration

### Auto-linking

The PR title format `JIRA-KEY: Description` automatically creates a link in Jira.

### Status Transitions

```bash
# When PR created
/jira transition JIRA-123 "In Review"

# When PR approved
/jira transition JIRA-123 "Approved"

# When PR merged
/jira transition JIRA-123 "Done"
```

### Jira Comments

```bash
# Add PR link to Jira
/jira add-comment JIRA-123 "Pull Request: https://github.com/org/repo/pull/456"

# Add review feedback
/jira add-comment JIRA-123 "PR approved and merged!"
```

## Error Handling

### No Remote Repository
```bash
if ! git remote -v | grep -q "origin"; then
    echo "ERROR: No remote repository"
    echo "Add remote: git remote add origin <url>"
    exit 1
fi
```

### Merge Conflicts
```bash
if git push -u origin "$branch_name" 2>&1 | grep -q "conflict"; then
    echo "ERROR: Merge conflict detected"
    echo "Resolve conflicts and try again"
    exit 1
fi
```

### PR Already Exists
```bash
if gh pr view "$branch_name" &>/dev/null; then
    echo "WARNING: PR already exists for this branch"
    echo "Update existing PR? (yes/no)"
    # Option to update existing PR instead
fi
```

### Quality Checks Failed
```bash
if [[ ! -f "/tmp/code_quality_report.md" ]] || grep -q "FAILED" /tmp/code_quality_report.md; then
    echo "ERROR: Code quality checks failed"
    echo "Run: /code-quality-check"
    exit 1
fi
```

## Best Practices

### 1. Always Run Checks First
```bash
# Correct order
/code-quality-check
/security-review
/create-pr JIRA-123

# Wrong - skip checks
/create-pr JIRA-123  # DON'T DO THIS
```

### 2. Keep PRs Focused
```markdown
Good:
- Single feature/bug fix
- < 400 lines changed
- One concern

Bad:
- Multiple features
- > 1000 lines
- Mixing concerns (feature + refactor + bug fix)
```

### 3. Descriptive Titles
```markdown
Good:
"PROJ-123: Implement OAuth2 authentication with Google and GitHub"

Bad:
"PROJ-123: Updates"
"Fix bug"
"Changes"
```

### 4. Complete Test Plan
```markdown
Good:
### Test Plan
- [x] Tested Google OAuth login
- [x] Tested GitHub OAuth login
- [x] Verified token refresh
- [x] Tested error cases (invalid token, expired token)
- [x] Manual testing in staging environment

Bad:
### Test Plan
- Tests pass
```

## Examples

### Example 1: Feature Implementation

**Input:**
```bash
$ /create-pr PROJ-123
```

**Output:**
```
Running pre-flight checks...
  Code quality: PASSED
  Security review: PASSED
  Remote repository: OK

Creating feature branch: feature/PROJ-123-oauth-authentication
Staging 15 files...
Creating conventional commit...
  Type: feat(auth)
  Message: "feat(auth): implement OAuth2 authentication with Google and GitHub"

Pushing to origin/feature/PROJ-123-oauth-authentication...
Generating PR description...
Creating GitHub PR...

PR created successfully!
URL: https://github.com/company/app/pull/456

Linking to Jira...
  Added comment to PROJ-123
  Transitioned to "In Review"

Done! PR ready for review.
```

### Example 2: Bug Fix

**Input:**
```bash
$ /create-pr BUG-789
```

**Output:**
```
Running pre-flight checks...
  Code quality: PASSED
  Security review: PASSED

Creating feature branch: bugfix/BUG-789-fix-null-pointer-in-user-profile
Staging 3 files...
Creating conventional commit...
  Type: fix(api)
  Message: "fix(api): handle null pointer in user profile endpoint"

Pushing to origin/bugfix/BUG-789-fix-null-pointer-in-user-profile...
Creating GitHub PR...

PR created successfully!
URL: https://github.com/company/app/pull/457

Labels: bug, bugfix, python
Linked to Jira: BUG-789

Done!
```

## Integration with Workflow

This is the final step in the SDLC workflow:

```bash
# Step 1: Fetch context
/fetch-ticket-context PROJ-123

# Step 2: Analyze requirements
/analyze-requirements PROJ-123

# Step 3: Implement code
/code-implementation PROJ-123

# Step 4: Code quality
/code-quality-check

# Step 5: Security review
/security-review

# Step 6: Create PR (THIS SKILL - FINAL STEP)
/create-pr PROJ-123

# After PR created:
# - Request code review
# - Wait for approval
# - Merge when approved
# - Jira auto-transitions to Done
```

## Troubleshooting

**Issue: "Pre-flight checks failed"**
- Run `/code-quality-check`
- Run `/security-review`
- Fix any issues found
- Try again

**Issue: "Push failed - permission denied"**
- Check GitHub authentication: `gh auth status`
- Re-authenticate: `gh auth login`
- Verify repository permissions

**Issue: "PR already exists"**
- List existing PRs: `gh pr list`
- View existing PR: `gh pr view <number>`
- Update existing PR or close it first

**Issue: "Cannot determine base branch"**
- Check available branches: `git branch -a`
- Manually specify: `--base main`
- Ensure you've cloned from remote

**Issue: "Jira linking failed"**
- Verify Jira credentials
- Check Jira ticket exists
- Manual link: Add PR URL to Jira comments

## References

- GitHub CLI Skill: `.claude/skills/mastering-github-agent-skill/SKILL.md`
- Jira Skill: `.claude/skills/jira/SKILL.md`
- Conventional Commits: https://www.conventionalcommits.org/
- PR Best Practices: https://google.github.io/eng-practices/review/
