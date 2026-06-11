---
name: mastering-azure-devops-cli
description: Use for Azure DevOps CLI operations - pipeline monitoring, pull request management, work items, and repository operations. When user asks about Azure Pipelines, Azure DevOps commands (az repos pr, az pipelines, az boards), checking pipeline status, creating PRs, managing work items, or Azure DevOps automation, use this skill.
allowed-tools: Bash, Read, Write, Glob, Grep
---

# Mastering Azure DevOps CLI

Azure DevOps command-line interface for repository management, pull requests, pipelines, work items, and CI/CD automation.

## When to Use

Use this skill when:
- Creating, listing, or managing Azure DevOps Pull Requests (`az repos pr`)
- Running, monitoring, or querying Azure Pipelines (`az pipelines`)
- Managing work items and tracking (`az boards work-item`)
- Repository operations and branch management
- Debugging pipeline failures and checking logs
- Scripting Azure DevOps workflows and automation

## Contents

- [Quick Start](#quick-start)
- [Command Reference](#command-reference)
- [Pipeline Authoring](#pipeline-authoring)
- [Scripts](#scripts)
- [Validation Checklist](#validation-checklist)
- [When Not to Use](#when-not-to-use)

---

## Quick Start

### Initial Setup

```bash
# Configure defaults once
az devops configure --defaults organization=https://dev.azure.com/{org} project="{project}"

# Verify configuration
az devops configure --list-defaults
```

### Create a Pull Request

```bash
az repos pr create \
  --repository Fabrikam \
  --source-branch feature/new-api \
  --target-branch main \
  --title "Implement authentication API" \
  --description "Adds JWT-based authentication with refresh tokens" \
  --reviewers "user@company.com" \
  --open
```

### Monitor Pipeline Runs

```bash
# List recent pipeline runs
az pipelines run list --top 10

# Show specific run details
az pipelines run show --id 12345

# Stream logs from a run (if still running)
az pipelines run log --id 12345
```

### Work Item Management

```bash
# Find active work items
az boards work-item list --wiql "SELECT [System.Id] FROM workitems WHERE [System.State] = 'Active'"

# Create a new work item
az boards work-item create --title "Bug: Login fails" --type Bug

# Update work item status
az boards work-item update --id 12345 --state "Done"
```

---

## Essential Commands

### Pull Request Operations

| Task | Command |
|------|---------|
| Create PR | `az repos pr create --repository {repo} --source-branch {src} --target-branch {dst} --title "..."` |
| List PRs | `az repos pr list --repository {repo} --status active` |
| Show PR details | `az repos pr show --id {id} --open` |
| Add reviewers | `az repos pr reviewer add --id {id} --reviewers {email}` |
| Mark as draft | `az repos pr update --id {id} --draft true` |
| Auto-complete | `az repos pr update --id {id} --auto-complete true` |
| Link work items | `az repos pr update --id {id} --work-items {item-id}` |

### Pipeline Operations

| Task | Command |
|------|---------|
| List pipelines | `az pipelines list` |
| List runs | `az pipelines run list --top 10` |
| Show run | `az pipelines run show --id {id}` |
| Stream logs | `az pipelines run log --id {id}` |
| Trigger pipeline | `az pipelines run --name {pipeline}` |

### Work Items

| Task | Command |
|------|---------|
| List work items | `az boards work-item list --wiql "..."` |
| Create item | `az boards work-item create --title "..." --type Task` |
| Show item | `az boards work-item show --id {id}` |
| Update item | `az boards work-item update --id {id} --state Done` |

### JSON Query Examples

```bash
# List PR IDs and titles
az repos pr list --query '[].{id:pullRequestId,title:title}'

# Get pipeline run status
az pipelines run list --query '[].{id:id,status:status,result:result}'

# Extract work item IDs from query
az boards work-item list --query '[].id' --output json | jq '.[]'
```

### Authentication

**Prerequisites:**
- Azure CLI installed (`az --version` should work)
- Organization URL: `https://dev.azure.com/{org}`
- Either:
  - Personal Access Token (PAT) with appropriate scopes
  - Azure AD login (if organization supports it)

**Configure once:**
```bash
az devops configure --defaults organization=https://dev.azure.com/{org} project="{project}"
```

**Verify authentication:**
```bash
az devops configure --list-defaults
az account show  # For Azure AD
```

---

## Pipeline YAML Authoring

Essential patterns for Azure Pipelines YAML configurations.

### Minimal Pipeline

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - script: make build
    displayName: 'Build'
  - script: make test
    displayName: 'Test'
```

### Stages and Jobs

```yaml
stages:
  - stage: Build
    jobs:
      - job: Compile
        steps:
          - script: make build
  
  - stage: Test
    dependsOn: Build
    jobs:
      - job: UnitTests
        steps:
          - script: make test:unit
      - job: IntegrationTests
        steps:
          - script: make test:integration
```

### Variables

```yaml
variables:
  buildConfiguration: 'Release'
  pythonVersion: '3.11'

stages:
  - stage: Build
    variables:
      - name: envType
        value: 'staging'
    steps:
      - script: echo Build config: $(buildConfiguration)
```

### Variable Groups (from Library)

```yaml
variables:
  - group: my-aws-credentials  # From Pipelines > Library

jobs:
  - job: Deploy
    steps:
      - script: aws s3 ls
        env:
          AWS_ACCESS_KEY_ID: $(AWS_ACCESS_KEY_ID)
          AWS_SECRET_ACCESS_KEY: $(AWS_SECRET_ACCESS_KEY)
```

### Matrix Builds

```yaml
strategy:
  matrix:
    Python311:
      pythonVersion: '3.11'
    Python312:
      pythonVersion: '3.12'

steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: $(pythonVersion)
```

---

## Common Patterns

### Wait for Pipeline Run to Complete

```bash
# Trigger pipeline and capture run ID
RUN_ID=$(az pipelines run --name "CI" --branch main --query id -o json)

# Poll until complete
while true; do
  STATUS=$(az pipelines run show --id $RUN_ID --query status -o json | tr -d '"')
  [ "$STATUS" = "completed" ] && break
  sleep 10
done

# Check result
az pipelines run show --id $RUN_ID --query result -o json
```

### Link Work Items to PR

```bash
# Get work item IDs from branch name or manually
WORK_ITEMS="123 456"

# Create PR and link items
az repos pr create \
  --source-branch feature/new-api \
  --title "Feature" \
  --work-items $WORK_ITEMS
```

---

## Before You Start

✅ **Verify:**
- `az --version` shows Azure CLI installed
- `az devops configure --list-defaults` shows your organization and project
- Personal Access Token (PAT) with repo + pipelines scopes, OR Azure AD login active

✅ **Command syntax:**
- Always use `--repository` and `--organization` if defaults not set
- Use `--output json` or `--output table` for formatting
- Enclose multi-word values in quotes: `--title "My Title"`

❌ **Don't use this skill for:**
- Git commands (`git push`, `git commit`, `git pull`)
- Azure resource management (use `az` infrastructure commands)
- Azure DevOps web UI navigation help
- GitHub Actions, GitLab CI, Jenkins, or other CI systems
- Local development setup questions
