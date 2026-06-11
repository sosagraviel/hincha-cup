---
name: create-pr-azure
description: Create production-ready Azure DevOps Pull Requests with work item linking, artifact collection, and reviewer assignment. Use after implementation and testing complete in Azure DevOps projects.
argument-hint: '[WORK-ITEM-ID]'
allowed-tools: Read, Write, Bash, Glob, Grep, Skill
---

# Create Azure DevOps PR Skill

Creates production-ready Azure DevOps Pull Requests with work item linking, artifact collection, reviewer assignment, and automated documentation.

## When to Use

Use this skill when:
- Implementation and testing are complete
- Code is ready for review
- You need to link to Azure work items (user stories, bugs, tasks)
- You want to request specific reviewers
- You're working in Azure DevOps (not GitHub)

## Quick Start

### Basic PR Creation

```bash
# Verify setup
az devops configure --list-defaults

# Create PR with title and description
az repos pr create \
  --repository MyRepo \
  --source-branch feature/new-api \
  --title "Implement authentication API" \
  --description "Adds JWT-based authentication with refresh tokens" \
  --open
```

### With Work Item Linking

```bash
# Create PR and link to work item
az repos pr create \
  --repository MyRepo \
  --source-branch feature/DEVOPS-123 \
  --title "DEVOPS-123: Implement auth" \
  --work-items 123 \
  --open
```

### With Reviewers

```bash
# Create PR with specific reviewers
az repos pr create \
  --repository MyRepo \
  --source-branch feature/new-api \
  --title "Implement feature" \
  --reviewers "dev1@company.com" "dev2@company.com" \
  --open
```

## PR Description Guidelines

### Good PR Description

```markdown
## Summary
Implements authentication API with JWT and refresh tokens

## Work Items
Fixes #123 (Implement user auth)

## Changes
- Add JWT token generation and validation
- Implement refresh token endpoint
- Add rate limiting to auth endpoints

## Testing
- [x] Unit tests pass (15 new tests)
- [x] Integration tests pass
- [x] Manual testing complete
- Coverage: 85%

## Notes
- No breaking changes
- No database migrations needed
- Requires AUTH_SECRET env var (see .env.example)
```

### Minimal (Still Effective)

```markdown
## Summary
Adds authentication API with JWT support

## Changes
- JWT token generation
- Refresh token endpoint
- Rate limiting

## Work Items
Fixes #123
```

## Common Commands

```bash
# Create simple PR
az repos pr create --source-branch feature --title "Feature" --open

# Create with work item link
az repos pr create --source-branch feature --work-items 123 --open

# Create with reviewers
az repos pr create --source-branch feature \
  --reviewers "user@company.com" --open

# Auto-complete when approved
az repos pr update --id 456 --auto-complete true

# Mark as draft
az repos pr update --id 456 --draft true
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "PR already exists" | Use `az repos pr list` to find existing PR, or create new branch |
| Work item not found | Verify ID with `az boards work-item show --id 123` |
| Authentication failed | Run `az devops login` |
| Repository not found | Verify with `az repos list` |
