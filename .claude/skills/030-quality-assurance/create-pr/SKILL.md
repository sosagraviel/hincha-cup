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

    echo "Generating enhanced PR description with artifacts..."

    # Read context and reports
    summary=$(grep "Summary:" /tmp/context_${jira_key}.md | cut -d: -f2- | xargs)
    description=$(sed -n '/^## Description$/,/^##/p' /tmp/context_${jira_key}.md | grep -v "^##")
    acceptance_criteria=$(sed -n '/^## Acceptance Criteria$/,/^##/p' /tmp/context_${jira_key}.md | grep -v "^##")

    # ============================================
    # 1. IMPLEMENTATION ACCURACY SECTION
    # ============================================
    accuracy_section=""
    if [[ -f ".claude/artifacts/${jira_key}/reports/accuracy-report.json" ]]; then
        accuracy_percentage=$(jq -r '.accuracyPercentage // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        total_requirements=$(jq -r '.totalRequirements // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        fulfilled=$(jq -r '.fulfilled // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        partial=$(jq -r '.partial // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        unfulfilled=$(jq -r '.unfulfilled // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")

        # Extract breakdown by type
        acceptance_criteria_count=$(jq -r '.breakdown.acceptanceCriteria.total // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        acceptance_criteria_fulfilled=$(jq -r '.breakdown.acceptanceCriteria.fulfilled // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        acceptance_criteria_pct=$(echo "scale=0; $acceptance_criteria_fulfilled * 100 / $acceptance_criteria_count" | bc 2>/dev/null || echo "0")

        technical_req_count=$(jq -r '.breakdown.technicalRequirements.total // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        technical_req_fulfilled=$(jq -r '.breakdown.technicalRequirements.fulfilled // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        technical_req_pct=$(echo "scale=0; $technical_req_fulfilled * 100 / $technical_req_count" | bc 2>/dev/null || echo "0")

        coverage_req_count=$(jq -r '.breakdown.coverageRequirements.total // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        coverage_req_fulfilled=$(jq -r '.breakdown.coverageRequirements.fulfilled // 0' ".claude/artifacts/${jira_key}/reports/accuracy-report.json")
        coverage_req_pct=$(echo "scale=0; $coverage_req_fulfilled * 100 / $coverage_req_count" | bc 2>/dev/null || echo "0")

        accuracy_section=$(cat <<ACCURACY

## 🎯 Implementation Accuracy

**Accuracy**: ${accuracy_percentage}%

- **Total Requirements**: ${total_requirements}
- **Fulfilled**: ${fulfilled} | **Partially Fulfilled**: ${partial} | **Unfulfilled**: ${unfulfilled}

### Breakdown by Type

- **Acceptance Criteria**: ${acceptance_criteria_fulfilled}/${acceptance_criteria_count} (${acceptance_criteria_pct}%)
- **Technical Requirements**: ${technical_req_fulfilled}/${technical_req_count} (${technical_req_pct}%)
- **Coverage Requirements**: ${coverage_req_fulfilled}/${coverage_req_count} (${coverage_req_pct}%)

<details>
<summary>📊 View Full Accuracy Report</summary>

\`\`\`
$(cat .claude/artifacts/${jira_key}/reports/accuracy-report.md 2>/dev/null || echo "Detailed report not available")
\`\`\`

</details>

ACCURACY
)
    fi

    # ============================================
    # 2. ARCHITECTURE DIAGRAMS SECTION
    # ============================================
    architecture_section=""
    if ls .claude/diagrams/${jira_key}-*.mmd 1> /dev/null 2>&1; then
        architecture_section="## 📐 Architecture\n\n"

        # Overview diagram (always included if exists)
        if [[ -f ".claude/diagrams/${jira_key}-overview.mmd" ]]; then
            architecture_section+=$(cat <<OVERVIEW

<details>
<summary>📊 Overview Diagram</summary>

\`\`\`mermaid
$(cat .claude/diagrams/${jira_key}-overview.mmd)
\`\`\`

</details>

OVERVIEW
)
        fi

        # Component diagram
        if [[ -f ".claude/diagrams/${jira_key}-component.mmd" ]]; then
            architecture_section+=$(cat <<COMPONENT

<details>
<summary>🧩 Component Diagram</summary>

\`\`\`mermaid
$(cat .claude/diagrams/${jira_key}-component.mmd)
\`\`\`

</details>

COMPONENT
)
        fi

        # Sequence diagram
        if [[ -f ".claude/diagrams/${jira_key}-sequence.mmd" ]]; then
            architecture_section+=$(cat <<SEQUENCE

<details>
<summary>🔄 Sequence Diagram</summary>

\`\`\`mermaid
$(cat .claude/diagrams/${jira_key}-sequence.mmd)
\`\`\`

</details>

SEQUENCE
)
        fi

        # ER diagram
        if [[ -f ".claude/diagrams/${jira_key}-er.mmd" ]]; then
            architecture_section+=$(cat <<ERDIAGRAM

<details>
<summary>🗄️ Database Schema (ER Diagram)</summary>

\`\`\`mermaid
$(cat .claude/diagrams/${jira_key}-er.mmd)
\`\`\`

</details>

ERDIAGRAM
)
        fi

        # Class diagram
        if [[ -f ".claude/diagrams/${jira_key}-class.mmd" ]]; then
            architecture_section+=$(cat <<CLASSDIAGRAM

<details>
<summary>📦 Class Diagram</summary>

\`\`\`mermaid
$(cat .claude/diagrams/${jira_key}-class.mmd)
\`\`\`

</details>

CLASSDIAGRAM
)
        fi
    fi

    # ============================================
    # 3. CHANGES SECTION WITH FILE CATEGORIZATION
    # ============================================
    changes_section=""
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Get changed files from git
        files_changed=$(git diff --name-only $(git merge-base HEAD origin/main 2>/dev/null || echo "HEAD~1") HEAD 2>/dev/null || echo "")

        if [[ -n "$files_changed" ]]; then
            total_files=$(echo "$files_changed" | wc -l | xargs)

            # Categorize files
            frontend_files=$(echo "$files_changed" | grep -E "(src/.*\.(tsx?|jsx?)|components/|pages/|routes/)" || echo "")
            backend_files=$(echo "$files_changed" | grep -E "(src/.*\.(ts|js)|controllers/|services/|models/|repositories/)" || echo "")
            database_files=$(echo "$files_changed" | grep -E "(migrations/|seeds/|schema\.)" || echo "")
            test_files=$(echo "$files_changed" | grep -E "(\.test\.|\.spec\.|e2e/|__tests__/)" || echo "")
            config_files=$(echo "$files_changed" | grep -E "(config|\.env|docker|package\.json|tsconfig)" || echo "")

            frontend_count=$(echo "$frontend_files" | grep -v "^$" | wc -l | xargs)
            backend_count=$(echo "$backend_files" | grep -v "^$" | wc -l | xargs)
            database_count=$(echo "$database_files" | grep -v "^$" | wc -l | xargs)
            test_count=$(echo "$test_files" | grep -v "^$" | wc -l | xargs)
            config_count=$(echo "$config_files" | grep -v "^$" | wc -l | xargs)

            changes_section=$(cat <<CHANGES

## 🔄 Changes

### Files Modified (${total_files})

CHANGES
)

            # Add frontend files if any
            if [[ "$frontend_count" -gt 0 ]]; then
                changes_section+="<details>\n<summary>Frontend (${frontend_count} files)</summary>\n\n"
                while IFS= read -r file; do
                    [[ -n "$file" ]] && changes_section+="- \`${file}\`\n"
                done <<< "$frontend_files"
                changes_section+="</details>\n\n"
            fi

            # Add backend files if any
            if [[ "$backend_count" -gt 0 ]]; then
                changes_section+="<details>\n<summary>Backend (${backend_count} files)</summary>\n\n"
                while IFS= read -r file; do
                    [[ -n "$file" ]] && changes_section+="- \`${file}\`\n"
                done <<< "$backend_files"
                changes_section+="</details>\n\n"
            fi

            # Add database files if any
            if [[ "$database_count" -gt 0 ]]; then
                changes_section+="<details>\n<summary>Database (${database_count} files)</summary>\n\n"
                while IFS= read -r file; do
                    [[ -n "$file" ]] && changes_section+="- \`${file}\`\n"
                done <<< "$database_files"
                changes_section+="</details>\n\n"
            fi

            # Add test files if any
            if [[ "$test_count" -gt 0 ]]; then
                changes_section+="<details>\n<summary>Tests (${test_count} files)</summary>\n\n"
                while IFS= read -r file; do
                    [[ -n "$file" ]] && changes_section+="- \`${file}\`\n"
                done <<< "$test_files"
                changes_section+="</details>\n\n"
            fi

            # Add config files if any
            if [[ "$config_count" -gt 0 ]]; then
                changes_section+="<details>\n<summary>Configuration (${config_count} files)</summary>\n\n"
                while IFS= read -r file; do
                    [[ -n "$file" ]] && changes_section+="- \`${file}\`\n"
                done <<< "$config_files"
                changes_section+="</details>\n\n"
            fi
        fi
    fi

    # ============================================
    # 4. ENHANCED TESTING SECTION
    # ============================================
    testing_section=$(cat <<TESTING

## 🧪 Testing

TESTING
)

    # Unit tests
    if [[ -f ".claude/artifacts/${jira_key}/reports/unit-metrics.json" ]]; then
        unit_total=$(jq -r '.total // 0' ".claude/artifacts/${jira_key}/reports/unit-metrics.json")
        unit_passed=$(jq -r '.passed // 0' ".claude/artifacts/${jira_key}/reports/unit-metrics.json")
        unit_failed=$(jq -r '.failed // 0' ".claude/artifacts/${jira_key}/reports/unit-metrics.json")
        unit_pass_rate=$(jq -r '.pass_rate // 0' ".claude/artifacts/${jira_key}/reports/unit-metrics.json")

        testing_section+=$(cat <<UNIT

### Unit Tests
- **Total**: ${unit_total} | **Passed**: ✅ ${unit_passed} | **Failed**: ❌ ${unit_failed}
- **Pass Rate**: ${unit_pass_rate}%

UNIT
)
    fi

    # Integration tests
    if [[ -f ".claude/artifacts/${jira_key}/reports/integration-metrics.json" ]]; then
        integration_total=$(jq -r '.total // 0' ".claude/artifacts/${jira_key}/reports/integration-metrics.json")
        integration_passed=$(jq -r '.passed // 0' ".claude/artifacts/${jira_key}/reports/integration-metrics.json")
        integration_failed=$(jq -r '.failed // 0' ".claude/artifacts/${jira_key}/reports/integration-metrics.json")
        integration_pass_rate=$(jq -r '.pass_rate // 0' ".claude/artifacts/${jira_key}/reports/integration-metrics.json")

        testing_section+=$(cat <<INTEGRATION

### Integration Tests
- **Total**: ${integration_total} | **Passed**: ✅ ${integration_passed} | **Failed**: ❌ ${integration_failed}
- **Pass Rate**: ${integration_pass_rate}%

INTEGRATION
)
    fi

    # E2E tests with videos
    if [[ -f ".claude/artifacts/${jira_key}/reports/e2e-metrics.json" ]]; then
        e2e_total=$(jq -r '.total // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")
        e2e_passed=$(jq -r '.passed // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")
        e2e_failed=$(jq -r '.failed // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")
        e2e_flaky=$(jq -r '.flaky // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")
        e2e_videos=$(jq -r '.videos_collected // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")
        e2e_screenshots=$(jq -r '.screenshots_collected // 0' ".claude/artifacts/${jira_key}/reports/e2e-metrics.json")

        testing_section+=$(cat <<E2E

### E2E Tests
- **Total**: ${e2e_total} | **Passed**: ✅ ${e2e_passed} | **Failed**: ❌ ${e2e_failed} | **Flaky**: ⚠️ ${e2e_flaky}
- **Artifacts Collected**: ${e2e_videos} videos, ${e2e_screenshots} screenshots

E2E
)

        # Add video links if videos exist
        if [[ "$e2e_videos" -gt 0 ]] && ls .claude/artifacts/${jira_key}/videos/*.webm 1> /dev/null 2>&1; then
            testing_section+=$(cat <<VIDEOS

#### E2E Test Videos

<details>
<summary>🎥 View Test Videos (${e2e_videos} recordings)</summary>

VIDEOS
)
            video_index=1
            for video in .claude/artifacts/${jira_key}/videos/*.webm; do
                video_name=$(basename "$video" .webm | sed 's/-/ /g' | sed 's/\b\(.\)/\u\1/g')
                testing_section+="${video_index}. ▶️ [${video_name}](${video})\n"
                ((video_index++))
            done

            testing_section+="</details>\n\n"
        fi
    fi

    # Coverage metrics
    if [[ -f "/tmp/code_quality_report.md" ]]; then
        coverage=$(grep "Overall Coverage:" /tmp/code_quality_report.md | cut -d: -f2 | xargs)
        testing_section+="### Coverage\n- **Overall**: ${coverage}\n\n"
    fi

    # ============================================
    # 5. UI CHANGES SECTION WITH SCREENSHOTS
    # ============================================
    ui_section=""
    if ls .claude/artifacts/${jira_key}/screenshots/ui-*.png 1> /dev/null 2>&1; then
        ui_section=$(cat <<UISECTION

## 🖼️ UI Changes

### Before/After Screenshots

<details>
<summary>View Screenshots</summary>

UISECTION
)

        # Add before screenshots
        for screenshot in .claude/artifacts/${jira_key}/screenshots/ui-before-*.png; do
            if [[ -f "$screenshot" ]]; then
                screenshot_name=$(basename "$screenshot" .png | sed 's/ui-before-//')
                ui_section+="**Before (${screenshot_name})**:\n\n"
                ui_section+="![Before ${screenshot_name}](${screenshot})\n\n"
            fi
        done

        # Add after screenshots
        for screenshot in .claude/artifacts/${jira_key}/screenshots/ui-after-*.png; do
            if [[ -f "$screenshot" ]]; then
                screenshot_name=$(basename "$screenshot" .png | sed 's/ui-after-//')
                ui_section+="**After (${screenshot_name})**:\n\n"
                ui_section+="![After ${screenshot_name}](${screenshot})\n\n"
            fi
        done

        ui_section+="</details>\n\n"
    fi

    # ============================================
    # 6. ASSUMPTIONS SECTION WITH RISK LEVELS
    # ============================================
    assumptions_section=""
    if [[ -f ".claude/decisions/${jira_key}.md" ]]; then
        # Extract assumptions with risk levels
        high_risk_assumptions=$(grep -A 3 "### High-Risk Assumption:" ".claude/decisions/${jira_key}.md" 2>/dev/null || echo "")
        medium_risk_assumptions=$(grep -A 3 "### Medium-Risk Assumption:" ".claude/decisions/${jira_key}.md" 2>/dev/null || echo "")
        low_risk_assumptions=$(grep -A 3 "### Low-Risk Assumption:" ".claude/decisions/${jira_key}.md" 2>/dev/null || echo "")

        if [[ -n "$high_risk_assumptions" ]] || [[ -n "$medium_risk_assumptions" ]] || [[ -n "$low_risk_assumptions" ]]; then
            assumptions_section=$(cat <<ASSUMPTIONS

## 💭 Assumptions Made

This PR was implemented autonomously. The following assumptions were made:

ASSUMPTIONS
)

            # High-risk assumptions
            if [[ -n "$high_risk_assumptions" ]]; then
                assumptions_section+="### High-Risk Assumptions ⚠️\n\n"
                assumptions_section+="$(echo "$high_risk_assumptions" | sed 's/^###/####/' | head -20)\n\n"
            fi

            # Medium-risk assumptions
            if [[ -n "$medium_risk_assumptions" ]]; then
                assumptions_section+="### Medium-Risk Assumptions ℹ️\n\n"
                assumptions_section+="$(echo "$medium_risk_assumptions" | sed 's/^###/####/' | head -10)\n\n"
            fi

            # Low-risk assumptions
            if [[ -n "$low_risk_assumptions" ]]; then
                assumptions_section+="### Low-Risk Assumptions ✓\n\n"
                assumptions_section+="<details>\n<summary>View Low-Risk Assumptions</summary>\n\n"
                assumptions_section+="$(echo "$low_risk_assumptions" | sed 's/^###/####/')\n\n"
                assumptions_section+="</details>\n\n"
            fi

            assumptions_section+="**Action Required**: Review and validate assumptions marked with ⚠️ and ℹ️ before merging.\n\n"
        fi
    fi

    # ============================================
    # 7. ARTIFACTS DIRECTORY STRUCTURE
    # ============================================
    artifacts_structure=""
    if [[ -d ".claude/artifacts/${jira_key}" ]]; then
        artifacts_structure=$(cat <<ARTIFACTSTRUCT

## 📊 Artifacts

All test artifacts and implementation documentation are available in:

\`\`\`
.claude/artifacts/${jira_key}/
├── diagrams/          # Architecture diagrams (Mermaid)
├── videos/            # E2E test recordings (.webm)
├── screenshots/       # UI screenshots + test failures
├── traces/            # Playwright trace files (.zip)
└── reports/
    ├── accuracy-report.md          # Implementation accuracy analysis
    ├── accuracy-report.json        # Structured accuracy data
    ├── unit-metrics.json           # Unit test metrics
    ├── integration-metrics.json    # Integration test metrics
    ├── e2e-metrics.json            # E2E test metrics
    ├── coverage/                   # HTML coverage reports
    └── e2e/                        # HTML E2E reports
\`\`\`

### How to View Artifacts

\`\`\`bash
# View E2E HTML report
open .claude/artifacts/${jira_key}/reports/e2e/index.html

# View trace file for debugging
npx playwright show-trace .claude/artifacts/${jira_key}/traces/<trace-file>.zip

# View coverage report
open .claude/artifacts/${jira_key}/reports/coverage/index.html

# View accuracy report
cat .claude/artifacts/${jira_key}/reports/accuracy-report.md
\`\`\`

ARTIFACTSTRUCT
)
    fi

    # ============================================
    # LEGACY SECTIONS (grading, documentation)
    # ============================================

    # Check for grading report (architect mode)
    grading_section=""
    if ls .claude/gradings/grade-*-${jira_key}.md 1> /dev/null 2>&1; then
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

GRADING
)
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
- [ ] Update \`.claude/skills/010-foundation/project-context/SKILL.md\`
- [ ] Update \`.claude/CLAUDE.md\` if project-level conventions changed

DOCUMENTATION
)
    fi

    # ============================================
    # FINAL PR DESCRIPTION ASSEMBLY
    # ============================================
    pr_description=$(cat <<EOF
## Summary

$summary

## Description

$description

## Jira Ticket

[$jira_key](https://your-company.atlassian.net/browse/$jira_key)

$accuracy_section

$architecture_section

$changes_section

$testing_section

$ui_section

$assumptions_section

$artifacts_structure

$grading_section

$documentation_section

## Deployment Notes

<!-- Any special deployment considerations -->

## Review Checklist

- [ ] Implementation matches acceptance criteria (see Accuracy section)
- [ ] All tests passing (unit, integration, E2E)
- [ ] Architecture changes reviewed (see diagrams)
- [ ] High-risk assumptions validated
- [ ] UI changes reviewed (see screenshots)
- [ ] No security vulnerabilities introduced
- [ ] Documentation updated if needed

---

🤖 Generated with [Claude Code](https://claude.com/claude-code) | 📊 Accuracy: ${accuracy_percentage:-N/A}%
EOF
)

    # Save PR description
    echo -e "$pr_description" > /tmp/pr_description_${jira_key}.md

    echo "✅ Enhanced PR description generated: /tmp/pr_description_${jira_key}.md"
    echo "   - Implementation Accuracy: ${accuracy_percentage:-N/A}%"
    echo "   - Architecture Diagrams: $(ls .claude/diagrams/${jira_key}-*.mmd 2>/dev/null | wc -l | xargs) diagrams"
    echo "   - E2E Videos: ${e2e_videos:-0} recordings"
    echo "   - UI Screenshots: $(ls .claude/artifacts/${jira_key}/screenshots/ui-*.png 2>/dev/null | wc -l | xargs) screenshots"
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

### Enhanced Template Structure

The PR description is auto-generated from collected artifacts to provide instant reviewability.

```markdown
## 🎯 Implementation Accuracy

**Accuracy**: 95%

- **Total Requirements**: 20
- **Fulfilled**: 19
- **Partially Fulfilled**: 1
- **Unfulfilled**: 0

### Breakdown by Type
- **Acceptance Criteria**: 8/8 (100%)
- **Technical Requirements**: 9/10 (90%)
- **Test Coverage**: 3/3 (100%)
- **Documentation**: 0/1 (0%)

📄 [View Detailed Accuracy Report](.claude/artifacts/JIRA-KEY/reports/accuracy-report.md)

---

## 📋 Summary

Brief one-sentence summary of what changed and why

## 📝 Description

Detailed explanation of the implementation:
- What changed
- Why it was necessary
- How it addresses the ticket requirements
- Any design decisions made

## 🎫 Jira Ticket

[JIRA-KEY: Ticket Title](https://your-company.atlassian.net/browse/JIRA-KEY)

**Type**: Feature | Bug Fix | Improvement | Refactor
**Priority**: High | Medium | Low
**Status**: In Review

---

## 📐 Architecture

### Diagrams

The following architecture diagrams were auto-generated from the changes:

<details>
<summary>📊 Overview Diagram</summary>

\`\`\`mermaid
<!-- Content of overview diagram -->
\`\`\`

**Shows**: File changes breakdown, affected areas
</details>

<details>
<summary>🧩 Component Diagram</summary>

\`\`\`mermaid
<!-- Content of component diagram -->
\`\`\`

**Shows**: Frontend component structure and relationships
</details>

<details>
<summary>🔄 Sequence Diagram</summary>

\`\`\`mermaid
<!-- Content of sequence diagram -->
\`\`\`

**Shows**: API request/response flow
</details>

<details>
<summary>🗄️ Database Schema</summary>

\`\`\`mermaid
<!-- Content of ER diagram -->
\`\`\`

**Shows**: Database model changes
</details>

📁 All diagrams: [.claude/artifacts/JIRA-KEY/diagrams/](.claude/artifacts/JIRA-KEY/diagrams/)

---

## 🔄 Changes

### Files Modified (15)

<details>
<summary>Frontend (7 files)</summary>

- `src/components/AuthButton.tsx` - OAuth button component
- `src/components/OAuthCallback.tsx` - Callback handler
- `src/hooks/useAuth.ts` - Authentication hook
- `src/pages/LoginPage.tsx` - Login page integration
- `src/api/auth.ts` - Auth API client
- `src/types/auth.ts` - Auth type definitions
- `src/styles/auth.css` - Authentication styles
</details>

<details>
<summary>Backend (5 files)</summary>

- `src/modules/auth/controller/oauth.controller.ts` - OAuth endpoints
- `src/modules/auth/service/oauth.service.ts` - OAuth business logic
- `src/modules/auth/providers/google.provider.ts` - Google OAuth
- `src/modules/auth/providers/github.provider.ts` - GitHub OAuth
- `src/config/oauth.config.ts` - OAuth configuration
</details>

<details>
<summary>Tests (3 files)</summary>

- `tests/unit/auth/oauth.test.ts` - Unit tests
- `tests/integration/auth/oauth-flow.test.ts` - Integration tests
- `e2e/auth/oauth-login.spec.ts` - E2E tests
</details>

**Lines Changed**: +842 / -12

---

## 🧪 Testing

### Unit Tests
- **Total**: 45 tests
- **Passed**: 45
- **Failed**: 0
- **Coverage**: 87.3%

### Integration Tests
- **Total**: 12 tests
- **Passed**: 12
- **Failed**: 0
- **Pass Rate**: 100%

📊 [View Integration Test Report](.claude/artifacts/JIRA-KEY/reports/integration/index.html)

### E2E Tests
- **Total**: 8 tests
- **Passed**: 8
- **Failed**: 0
- **Flaky**: 0
- **Pass Rate**: 100%

📊 [View E2E Test Report](.claude/artifacts/JIRA-KEY/reports/e2e/index.html)

#### E2E Test Videos

All E2E tests recorded with video for visual verification:

<details>
<summary>🎥 View Test Videos (8 recordings)</summary>

1. ▶️ [OAuth Login - Google](.claude/artifacts/JIRA-KEY/videos/oauth-login-google.webm)
2. ▶️ [OAuth Login - GitHub](.claude/artifacts/JIRA-KEY/videos/oauth-login-github.webm)
3. ▶️ [OAuth Callback Success](.claude/artifacts/JIRA-KEY/videos/oauth-callback-success.webm)
4. ▶️ [OAuth Callback Error](.claude/artifacts/JIRA-KEY/videos/oauth-callback-error.webm)
5. ▶️ [Token Refresh](.claude/artifacts/JIRA-KEY/videos/token-refresh.webm)
6. ▶️ [Logout Flow](.claude/artifacts/JIRA-KEY/videos/logout-flow.webm)
7. ▶️ [Multiple Provider Linking](.claude/artifacts/JIRA-KEY/videos/multiple-providers.webm)
8. ▶️ [Session Expiry](.claude/artifacts/JIRA-KEY/videos/session-expiry.webm)

**Total Duration**: 125 seconds
</details>

### Code Coverage

| Type | Coverage | Status |
|------|----------|--------|
| Statements | 87.3% | ✅ Pass (≥80%) |
| Branches | 82.1% | ✅ Pass (≥80%) |
| Functions | 91.2% | ✅ Pass (≥80%) |
| Lines | 87.3% | ✅ Pass (≥80%) |

📊 [View Coverage Report](.claude/artifacts/JIRA-KEY/reports/coverage/index.html)

---

## 🖼️ UI Changes

### Before/After Screenshots

<details>
<summary>🖼️ Login Page (3 screenshots)</summary>

#### Before
![Login Page Before](.claude/artifacts/JIRA-KEY/screenshots/ui-before-login.png)

#### After
![Login Page After](.claude/artifacts/JIRA-KEY/screenshots/ui-after-login.png)

#### Mobile View
![Login Page Mobile](.claude/artifacts/JIRA-KEY/screenshots/ui-after-login-mobile.png)

</details>

---

## 💭 Assumptions Made

During autonomous implementation, the following assumptions were made:

### High-Risk Assumptions ⚠️
> **These require validation before merging**

- [ ] **OAuth Provider Setup**: Assumed OAuth client IDs/secrets will be configured in environment variables
  - **Rationale**: Standard practice found in 8/10 similar implementations
  - **Action Required**: Verify `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID` are set in production
  - **Evidence**: `.env.example` updated with required variables

- [ ] **Session Storage**: Assumed JWT tokens stored in httpOnly cookies
  - **Rationale**: Security best practice, prevents XSS attacks
  - **Action Required**: Confirm this aligns with existing auth architecture
  - **Evidence**: Implemented in `src/modules/auth/service/session.service.ts:45`

### Medium-Risk Assumptions ℹ️
> **Recommended to validate**

- [ ] **Token Refresh Strategy**: Assumed 7-day refresh token lifetime
  - **Rationale**: Common practice, balances security vs UX
  - **Action Required**: Confirm with product/security team
  - **Evidence**: Configured in `src/config/oauth.config.ts:12`

- [ ] **Error Message Format**: Assumed generic error messages for OAuth failures
  - **Rationale**: Security - don't leak provider implementation details
  - **Action Required**: Review error messages with UX team
  - **Evidence**: Error messages in `src/modules/auth/controller/oauth.controller.ts`

### Low-Risk Assumptions ✓
> **Documented for transparency**

- OAuth button colors match brand guidelines
- Login redirect goes to `/dashboard` (can be changed via config)
- Mobile breakpoint at 768px

📄 [View All Assumptions & Decisions](.claude/decisions/JIRA-KEY.md)

---

## 🔒 Security Review

- ✅ No SQL injection vulnerabilities
- ✅ Input validation on all endpoints
- ✅ CSRF protection enabled
- ✅ Rate limiting configured
- ✅ Secrets not committed to repository
- ✅ HTTPS enforced for OAuth callbacks
- ✅ State parameter used in OAuth flow
- ✅ Token encryption at rest

📄 [View Security Report](.claude/artifacts/JIRA-KEY/reports/security-report.md)

---

## 📦 Deployment Notes

### Environment Variables Required

```bash
# OAuth Providers
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# OAuth Configuration
OAUTH_CALLBACK_URL=https://yourdomain.com/auth/callback
OAUTH_SESSION_SECRET=random_secret_here
```

### Database Migrations

```bash
# Run migration to add oauth_providers table
npm run migration:run
```

### Configuration Changes

No breaking configuration changes. OAuth is opt-in feature.

---

## ✅ Checklist

### Code Quality
- [x] All tests passing (unit, integration, E2E)
- [x] Code coverage ≥80% (achieved 87.3%)
- [x] No linting errors (`--max-warnings=0`)
- [x] No type errors (TypeScript strict mode)
- [x] Security review passed (0 critical issues)

### Testing
- [x] Unit tests for all new functions
- [x] Integration tests for OAuth flows
- [x] E2E tests for critical user journeys
- [x] Manual testing completed
- [x] Edge cases tested (errors, timeouts, invalid tokens)

### Documentation
- [x] Code comments added where needed
- [x] API endpoints documented
- [x] README updated with OAuth setup instructions
- [x] Environment variables documented

### Security
- [x] No secrets in code
- [x] Input validation implemented
- [x] OWASP security checklist reviewed
- [x] Authentication/authorization tested

### Review
- [ ] Self-reviewed code
- [ ] Validate high-risk assumptions (see above)
- [ ] Confirm environment variables configured
- [ ] Test in staging environment

---

## 📊 Artifacts

All test artifacts and reports available in:
`.claude/artifacts/JIRA-KEY/`

### Directory Structure
```
.claude/artifacts/JIRA-KEY/
├── diagrams/              # Architecture diagrams
│   ├── JIRA-KEY-overview.mmd
│   ├── JIRA-KEY-component.mmd
│   ├── JIRA-KEY-sequence.mmd
│   └── JIRA-KEY-er.mmd
├── videos/                # E2E test recordings (8 videos)
├── screenshots/           # UI screenshots + failures
├── traces/                # Playwright trace files
├── reports/
│   ├── e2e/              # E2E HTML report
│   ├── integration/      # Integration test results
│   ├── coverage/         # Coverage HTML report
│   ├── accuracy-report.md   # Detailed accuracy breakdown
│   ├── e2e-metrics.json     # E2E test metrics
│   └── integration-metrics.json  # Integration metrics
└── MANIFEST.md           # Artifact index
```

📄 [View Artifact Manifest](.claude/artifacts/JIRA-KEY/MANIFEST.md)

---

**Generated by AI Framework** | [Implementation Decisions](.claude/decisions/JIRA-KEY.md) | [Test Artifacts](.claude/artifacts/JIRA-KEY/)
```

### Key Enhancements

1. **Accuracy Section** - Shows implementation accuracy percentage with detailed breakdown
2. **Architecture Diagrams** - Collapsible sections for each diagram type
3. **Enhanced Test Metrics** - Separate sections for unit/integration/E2E with detailed metrics
4. **E2E Videos** - Embedded video links with descriptions
5. **UI Screenshots** - Before/after comparison with mobile views
6. **Assumptions Section** - Three-tier risk categorization with validation checkboxes
7. **Artifact Directory** - Complete directory structure showing all collected artifacts

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
