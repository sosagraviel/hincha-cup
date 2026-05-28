---
name: create-pr
description: Create a production-ready GitHub Pull Request with comprehensive artifacts (screenshots, videos, coverage). Single-repo PR creator complementary to /repo-fanout-pr (multi-repo). Use when implementation and testing complete.
argument-hint: '[JIRA-KEY]'
allowed-tools: Read, Write, Bash, Glob, Grep, Skill
---

# Create Production PR Skill

Creates production-ready GitHub Pull Requests with comprehensive artifacts, visual verification results, and automated documentation. Single-repo only; for multi-repo workspaces, `/implement-ticket` Phase 9 delegates to `/repo-fanout-pr` instead.

## Contents

- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Workflow](#workflow)
- [Integration with implement-ticket](#integration-with-implement-ticket)
- [PR Description Format](#pr-description-format)
- [Artifact Collection](#artifact-collection)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Purpose

This skill creates PRs by:

1. **Verifying prerequisites** - All tests passing, no quality issues
2. **Collecting artifacts** - Screenshots, videos, coverage, test results
3. **Creating feature branch** - Following branch naming conventions
4. **Generating PR description** - Rich documentation with visual artifacts
5. **Creating PR via GitHub CLI** - With labels, reviewers, metadata
6. **Linking to Jira** - Automatic ticket linking and status updates

**Input:** Jira ticket key
**Output:** GitHub PR URL with full description and artifacts

## When to Use

Activate this skill when:

- After implement-ticket workflow completes (Phase 8)
- All tests passing (unit, integration, E2E)
- Visual verification complete (if applicable)
- Ready to submit code for review

**Note**: This skill is automatically invoked by implement-ticket Phase 8, but can also be run standalone.

## Integration with implement-ticket

This skill is designed to work seamlessly with the new 10-phase implement-ticket workflow:

```
implement-ticket Phase 0-7 → Phase 8: PR Creation (THIS SKILL) → Phase 9-10
```

### Artifact Sources

The skill reads artifacts from the standardized directory structure:

```
.claude-temp/artifacts/{JIRA_KEY}/
├── context/
│   └── full-context.md                    # Phase 1
├── plans/
│   ├── implementation-plan.md             # Phase 2
│   └── test-plan.json                     # Phase 2
├── implementations/
│   └── implementation-log.md              # Phase 4
├── tests/
│   └── test-results.json                  # Phase 5
├── screenshots/
│   ├── before/                            # Phase 3
│   ├── after/                             # Phase 6
│   └── diffs/                             # Phase 6
│       └── visual-diff-report.json
├── videos/                                # Phase 5 (E2E)
├── coverage/                              # Phase 5
├── decisions/
│   └── {JIRA_KEY}.md                      # Autonomous decisions
└── doc-update-analysis.json               # Phase 7
```

### Standalone Usage

If run independently (outside implement-ticket):

```bash
/create-pr PROJ-123
```

The skill will:

1. Check for artifacts in `.claude-temp/artifacts/PROJ-123/`
2. If artifacts exist, use them (prefer implement-ticket structure)
3. If no artifacts, fall back to legacy artifact locations
4. Generate PR description based on available artifacts

## Workflow

### Phase 1: Pre-flight Checks

```bash
run_preflight_checks() {
    local jira_key="$1"
    echo "🔍 Running pre-flight checks..."

    local checks_passed=true
    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"

    # 1. Check if in git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo "❌ Not in a git repository"
        checks_passed=false
    fi

    # 2. Check for uncommitted changes
    if [[ -z $(git status --porcelain) ]]; then
        echo "⚠️  No uncommitted changes found"
        echo "   Have you completed implementation?"
    fi

    # 3. Verify test results exist
    if [[ ! -f "$ARTIFACTS_DIR/tests/test-results.json" ]]; then
        echo "⚠️  Test results not found at $ARTIFACTS_DIR/tests/test-results.json"
        echo "   Falling back to legacy test reports..."

        # Check legacy locations
        if [[ ! -f "/tmp/code_quality_report.md" ]]; then
            echo "⚠️  No test results found. Recommended: Run tests first"
        fi
    else
        # Check if all tests passed
        OVERALL_STATUS=$(jq -r '.overall.status' "$ARTIFACTS_DIR/tests/test-results.json")
        if [[ "$OVERALL_STATUS" != "passed" ]]; then
            echo "❌ Tests failed. Cannot create PR."
            checks_passed=false
        else
            echo "✅ All tests passed"
        fi
    fi

    # 4. Check for visual verification results (if applicable)
    TEST_PLAN="$ARTIFACTS_DIR/plans/test-plan.json"
    if [[ -f "$TEST_PLAN" ]]; then
        VISUAL_REQUIRED=$(jq -r '.visualVerification.required' "$TEST_PLAN")
        if [[ "$VISUAL_REQUIRED" == "true" ]]; then
            VISUAL_REPORT="$ARTIFACTS_DIR/screenshots/diffs/visual-diff-report.json"
            if [[ -f "$VISUAL_REPORT" ]]; then
                VISUAL_STATUS=$(jq -r '.overallStatus' "$VISUAL_REPORT")
                VISUAL_SCORE=$(jq -r '.overallScore' "$VISUAL_REPORT")
                echo "📸 Visual verification: $VISUAL_STATUS (score: ${VISUAL_SCORE}%)"
            else
                echo "⚠️  Visual verification required but no report found"
            fi
        fi
    fi

    # 5. Check remote repository exists
    if ! git remote -v | grep -q "origin"; then
        echo "❌ No remote repository configured"
        echo "   Add remote: git remote add origin <url>"
        checks_passed=false
    else
        echo "✅ Remote repository configured"
    fi

    if [[ "$checks_passed" != "true" ]]; then
        echo "❌ Pre-flight checks FAILED"
        return 1
    fi

    echo "✅ Pre-flight checks PASSED"
    return 0
}

run_preflight_checks "$JIRA_KEY" || exit 1
```

### Phase 2: Collect Artifacts

```bash
collect_artifacts() {
    local jira_key="$1"

    echo "📦 Collecting artifacts..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"
    UTILS_DIR="$HOME/.claude/utils"

    # Use ArtifactCollector utility
    node -e "
    const { ArtifactCollector } = require('$UTILS_DIR/artifact-collector.js');

    const collector = new ArtifactCollector('$jira_key', process.cwd());

    collector.collect().then(artifacts => {
        // Write manifest
        const fs = require('fs');
        fs.writeFileSync('$ARTIFACTS_DIR/artifacts-manifest.json', JSON.stringify(artifacts, null, 2));

        console.log('✅ Artifacts collected:');
        console.log('   - Screenshots: ' + artifacts.screenshots.length);
        console.log('   - Videos: ' + artifacts.videos.length);
        console.log('   - Test results: ' + artifacts.testResults.length);
        console.log('   - Coverage reports: ' + artifacts.coverage.length);
        console.log('   - Traces: ' + artifacts.traces.length);
    }).catch(err => {
        console.error('⚠️  Artifact collection warning:', err.message);
        console.log('   Continuing with available artifacts...');
    });
    "

    echo "✅ Artifact collection complete"
}

collect_artifacts "$JIRA_KEY"
```

### Phase 3: Create Feature Branch

```bash
create_feature_branch() {
    local jira_key="$1"

    echo "🌿 Creating feature branch..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"

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
        echo "❌ Cannot determine base branch (main/master/develop not found)"
        return 1
    fi

    # Ensure we're up to date with remote
    echo "   Updating base branch: $base_branch"
    git fetch origin
    git checkout "$base_branch"
    git pull origin "$base_branch"

    # Determine branch type from implementation plan
    branch_type="feature"  # Default

    if [[ -f "$ARTIFACTS_DIR/plans/implementation-plan.md" ]]; then
        if grep -qi "bug\|fix" "$ARTIFACTS_DIR/plans/implementation-plan.md"; then
            branch_type="bugfix"
        elif grep -qi "hotfix\|critical" "$ARTIFACTS_DIR/plans/implementation-plan.md"; then
            branch_type="hotfix"
        elif grep -qi "chore\|refactor" "$ARTIFACTS_DIR/plans/implementation-plan.md"; then
            branch_type="chore"
        fi
    fi

    # Create branch name from summary
    if [[ -f "$ARTIFACTS_DIR/context/full-context.md" ]]; then
        description=$(grep -m 1 "^## Summary" "$ARTIFACTS_DIR/context/full-context.md" -A 1 | tail -1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-50)
    else
        description="implementation"
    fi

    branch_name="${branch_type}/${jira_key}-${description}"

    echo "   Branch name: $branch_name"

    # Create and checkout branch
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo "   Branch already exists, checking out..."
        git checkout "$branch_name"
    else
        echo "   Creating new branch..."
        git checkout -b "$branch_name"
    fi

    echo "✅ Feature branch ready: $branch_name"
    echo "$branch_name" > "$ARTIFACTS_DIR/pr-branch.txt"
}

create_feature_branch "$JIRA_KEY"
```

### Phase 4: Stage Changes and Commit

```bash
stage_and_commit() {
    local jira_key="$1"

    echo "📝 Staging changes and creating commit..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"

    # Get list of changed files
    changed_files=$(git status --porcelain)

    if [[ -z "$changed_files" ]]; then
        echo "⚠️  No changes to stage"
        return 1
    fi

    echo "   Changed files:"
    echo "$changed_files" | head -10

    # Identify files to exclude
    exclude_patterns=(
        ".env"
        ".env.local"
        "*.log"
        "node_modules/"
        ".venv/"
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
                exclude=true
                break
            fi
        done

        if [[ "$exclude" == "false" ]]; then
            git add "$file"
        fi
    done <<< "$changed_files"

    # Determine commit type
    branch_name=$(cat "$ARTIFACTS_DIR/pr-branch.txt")
    commit_type="feat"  # Default

    if [[ "$branch_name" == bugfix/* ]]; then
        commit_type="fix"
    elif [[ "$branch_name" == hotfix/* ]]; then
        commit_type="fix"
    elif [[ "$branch_name" == chore/* ]]; then
        commit_type="chore"
    fi

    # Get summary
    if [[ -f "$ARTIFACTS_DIR/context/full-context.md" ]]; then
        summary=$(grep -m 1 "^## Summary" "$ARTIFACTS_DIR/context/full-context.md" -A 1 | tail -1 | xargs | cut -c1-72)
    else
        summary="Implement $jira_key"
    fi

    # Build commit message
    commit_msg="${commit_type}: ${summary}

Implements: $jira_key

$(git diff --cached --stat)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

    # Create commit
    git commit -m "$commit_msg"

    echo "✅ Commit created"
}

stage_and_commit "$JIRA_KEY"
```

### Phase 5: Push to Remote

```bash
push_to_remote() {
    local jira_key="$1"

    echo "⬆️  Pushing to remote repository..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"
    branch_name=$(cat "$ARTIFACTS_DIR/pr-branch.txt")

    # Push branch with upstream tracking
    git push -u origin "$branch_name"

    if [[ $? -eq 0 ]]; then
        echo "✅ Pushed to origin/$branch_name"
    else
        echo "❌ Push failed"
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

    echo "📋 Generating PR description..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"
    UTILS_DIR="$HOME/.claude/utils"

    # Use ArtifactCollector to generate PR documentation
    TEST_RESULTS="$ARTIFACTS_DIR/tests/test-results.json"

    if [[ ! -f "$TEST_RESULTS" ]]; then
        echo "⚠️  Test results not found, using empty test results"
        TEST_RESULTS="{}"
    fi

    node -e "
    const { ArtifactCollector } = require('$UTILS_DIR/artifact-collector.js');
    const fs = require('fs');

    const collector = new ArtifactCollector('$jira_key', process.cwd());
    let testResults = {};

    try {
        testResults = JSON.parse(fs.readFileSync('$TEST_RESULTS', 'utf8'));
    } catch (err) {
        console.log('Warning: Could not read test results');
    }

    collector.generatePRDocumentation(testResults).then(markdown => {
        fs.writeFileSync('$ARTIFACTS_DIR/pr-description.md', markdown);
        console.log('✅ PR description generated');
    }).catch(err => {
        console.error('PR description generation failed:', err.message);

        // Fallback: Basic PR description
        const fallback = \`## Summary

Implements $jira_key

## Description

See implementation log for details.

## Testing

\${JSON.stringify(testResults, null, 2)}

🤖 Generated with Claude Code
\`;

        fs.writeFileSync('$ARTIFACTS_DIR/pr-description.md', fallback);
        console.log('✅ Fallback PR description generated');
    });
    "

    echo "✅ PR description ready: $ARTIFACTS_DIR/pr-description.md"
}

generate_pr_description "$JIRA_KEY"
```

### Phase 7: Create GitHub PR

```bash
create_github_pr() {
    local jira_key="$1"

    echo "🚀 Creating GitHub Pull Request..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"

    # Get PR details
    branch_name=$(cat "$ARTIFACTS_DIR/pr-branch.txt")
    pr_body=$(cat "$ARTIFACTS_DIR/pr-description.md")

    # Get title from summary
    if [[ -f "$ARTIFACTS_DIR/context/full-context.md" ]]; then
        summary=$(grep -m 1 "^## Summary" "$ARTIFACTS_DIR/context/full-context.md" -A 1 | tail -1 | xargs)
    else
        summary="Implementation"
    fi

    # Determine base branch
    if git show-ref --verify --quiet refs/heads/main; then
        base_branch="main"
    else
        base_branch="master"
    fi

    # Create PR using GitHub CLI
    gh pr create \
        --title "$jira_key: $summary" \
        --body "$pr_body" \
        --base "$base_branch" \
        --head "$branch_name" \
        --label "automated" \
        --label "ready-for-review"

    if [[ $? -eq 0 ]]; then
        PR_URL=$(gh pr view --json url -q .url)
        echo ""
        echo "✅ Pull request created: $PR_URL"
        echo ""

        # Save PR URL
        echo "$PR_URL" > "$ARTIFACTS_DIR/pr-url.txt"

        return 0
    else
        echo "❌ Failed to create PR"
        return 1
    fi
}

create_github_pr "$JIRA_KEY"
```

### Phase 8: Link PR to Jira (Optional)

```bash
link_pr_to_jira() {
    local jira_key="$1"

    echo "🔗 Linking PR to Jira ticket..."

    ARTIFACTS_DIR=".claude-temp/artifacts/$jira_key"
    pr_url=$(cat "$ARTIFACTS_DIR/pr-url.txt" 2>/dev/null)

    if [[ -z "$pr_url" ]]; then
        echo "⚠️  PR URL not found, skipping Jira linking"
        return 0
    fi

    # Check if Jira MCP is available
    if ! command -v gh &> /dev/null; then
        echo "⚠️  GitHub CLI not available, skipping Jira linking"
        return 0
    fi

    # Add PR link as comment (if Jira integration is configured)
    # Note: This requires Jira MCP server or API configuration
    echo "   PR URL: $pr_url"
    echo "   Manual action: Add PR link to Jira ticket $jira_key"

    echo "✅ Jira linking complete (manual step may be required)"
}

link_pr_to_jira "$JIRA_KEY"
```

## PR Description Format

The PR description is generated by the `ArtifactCollector.generatePRDocumentation()` method and includes:

### 1. Summary Section

- One-sentence summary from context

### 2. Visual Changes Section

- Before/after screenshots (if available)
- Mobile and desktop viewports
- Visual diff reports with scores

### 3. Test Results Section

- Unit test metrics (total, passed, failed, coverage)
- Integration test metrics
- E2E test metrics with video links
- Coverage report links

### 4. Changes Section

- File categorization (frontend, backend, tests, config)
- Collapsible sections for each category

### 5. Implementation Details Section

- Implementation plan reference
- Key decisions from autonomous workflow
- Assumptions made (if any)

### 6. Artifacts Section

- Directory structure
- Links to coverage reports
- Links to E2E HTML reports
- Playwright trace files

### 7. Checklist Section

- Code quality checklist
- Testing checklist
- Security checklist
- Review checklist

## Artifact Collection

The skill uses the `ArtifactCollector` utility which automatically finds and collects:

### Screenshots

- `screenshots/before/*.png` - Captured in Phase 3
- `screenshots/after/*.png` - Captured in Phase 6
- `screenshots/diffs/*.png` - Visual diff images

### Videos

- `videos/*.webm` - E2E test recordings from Phase 5

### Test Results

- `tests/test-results.json` - Unified test results from Phase 5
- `coverage/` - HTML coverage reports

### Traces

- `traces/*.zip` - Playwright trace files for debugging

### Reports

- `screenshots/diffs/visual-diff-report.json` - Visual verification results
- `doc-update-analysis.json` - Documentation update analysis

## Error Handling

### Pre-flight Checks Failed

```bash
if [[ "$checks_passed" != "true" ]]; then
    echo "❌ Cannot create PR - pre-flight checks failed"
    echo "   Fix issues and try again"
    exit 1
fi
```

### No Artifacts Found

```bash
if [[ ! -d "$ARTIFACTS_DIR" ]]; then
    echo "⚠️  Artifacts directory not found: $ARTIFACTS_DIR"
    echo "   Creating PR with minimal description..."
    # Fallback to basic PR description
fi
```

### Push Failed

```bash
if ! git push -u origin "$branch_name"; then
    echo "❌ Push failed - check permissions and network"
    echo "   Resolve and run: git push -u origin $branch_name"
    exit 1
fi
```

### PR Creation Failed

```bash
if ! gh pr create ...; then
    echo "❌ PR creation failed"
    echo "   Check GitHub CLI authentication: gh auth status"
    echo "   Manual PR creation: https://github.com/org/repo/compare/main...$branch_name"
    exit 1
fi
```

## Best Practices

### 1. Run After Complete Workflow

```bash
# Correct: After implement-ticket
/implement-ticket PROJ-123 --no-stop
# PR automatically created in Phase 8

# Also correct: Standalone after manual implementation
/create-pr PROJ-123
```

### 2. Verify Artifacts Exist

```bash
# Check artifacts before creating PR
ls -la .claude-temp/artifacts/PROJ-123/

# Expected structure:
# - screenshots/
# - videos/
# - tests/test-results.json
# - coverage/
```

### 3. Review Visual Diffs

```bash
# If visual verification was performed
cat .claude-temp/artifacts/PROJ-123/screenshots/diffs/visual-diff-report.json

# Check for failures
jq -r '.overallStatus' .claude-temp/artifacts/PROJ-123/screenshots/diffs/visual-diff-report.json
```

### 4. Keep PRs Focused

- Single feature/bug fix per PR
- < 500 lines changed
- One concern per PR

## Examples

### Example 1: After implement-ticket Workflow

**Context**: implement-ticket Phase 8 automatically invokes this skill

```bash
$ /implement-ticket PROJ-123 --no-stop

# ... Phases 0-7 complete ...

📋 Phase 8: PR Creation
=======================
  - Collecting artifacts...
  ✅ Artifacts collected:
     - Screenshots: 12
     - Videos: 5
     - Test results: 3
     - Coverage reports: 1
     - Traces: 5

  - Creating feature branch...
  ✅ Feature branch ready: feature/PROJ-123-oauth-authentication

  - Staging changes and creating commit...
  ✅ Commit created

  - Pushing to remote repository...
  ✅ Pushed to origin/feature/PROJ-123-oauth-authentication

  - Generating PR description...
  ✅ PR description generated

  - Creating GitHub Pull Request...
  ✅ Pull request created: https://github.com/org/repo/pull/456

  - Linking PR to Jira ticket...
  ✅ Jira linking complete

✅ PR Creation complete
```

### Example 2: Standalone Usage

**Context**: Manual implementation, artifacts in legacy locations

```bash
$ /create-pr PROJ-456

🔍 Running pre-flight checks...
   ⚠️  Artifacts not found at .claude-temp/artifacts/PROJ-456/
   Falling back to legacy locations...
   ✅ Remote repository configured

✅ Pre-flight checks PASSED

📦 Collecting artifacts...
   ⚠️  Using legacy artifact locations
   ✅ Artifacts collected

🌿 Creating feature branch...
   ✅ Feature branch ready: feature/PROJ-456-fix-login-bug

📝 Staging changes and creating commit...
   ✅ Commit created

⬆️  Pushing to remote repository...
   ✅ Pushed to origin/feature/PROJ-456-fix-login-bug

📋 Generating PR description...
   ⚠️  Test results not found, using fallback description
   ✅ PR description generated

🚀 Creating GitHub Pull Request...
✅ Pull request created: https://github.com/org/repo/pull/457

🔗 Linking PR to Jira ticket...
   Manual action: Add PR link to Jira ticket PROJ-456
✅ Jira linking complete
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Auto-Create PR

on:
  workflow_dispatch:
    inputs:
      jira_key:
        description: 'Jira ticket key'
        required: true

jobs:
  create-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run create-pr
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          /create-pr ${{ github.event.inputs.jira_key }}
```

## Troubleshooting

**Issue: "Artifacts not found"**

- Check if implement-ticket workflow completed
- Verify artifacts directory exists: `ls .claude-temp/artifacts/PROJ-123/`
- Fall back to legacy artifact locations

**Issue: "Push failed - permission denied"**

- Check GitHub authentication: `gh auth status`
- Re-authenticate: `gh auth login`
- Verify repository permissions

**Issue: "PR already exists"**

- List existing PRs: `gh pr list`
- View existing PR: `gh pr view <number>`
- Update existing PR or close it first

**Issue: "Test results show failures"**

- Cannot create PR with failing tests
- Fix test failures first
- Re-run implement-ticket or tests manually

## References

- implement-ticket: `skills/020-development-workflow/implement-ticket/SKILL.claude.md` (Claude) or `SKILL.codex.md` (Codex)
- ArtifactCollector utility: `utils/artifact-collector.js`
- GitHub CLI: https://cli.github.com/
- Conventional Commits: https://www.conventionalcommits.org/

---

**Version**: 2.0.0
**Last Updated**: 2024-01-15
**Maintained By**: AI Platform Team
