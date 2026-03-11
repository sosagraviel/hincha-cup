# Switch Task - Navigate to Task Worktree

Quickly switch to a task worktree directory.

## Usage

```bash
eval $(/switch-task <task-id>)
```

Or use the alias:

```bash
/switch-task <task-id>  # Outputs cd command to copy
```

## Implementation

```bash
#!/usr/bin/env bash

TASK_ID="${1:?Error: Task ID required. Usage: /switch-task <task-id>}"
REGISTRY_FILE=".worktree-registry.json"

# Check if registry exists
if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo "❌ Error: No active tasks"
    echo "Use /list-tasks to see available tasks"
    exit 1
fi

# Check if task exists
if ! jq -e --arg id "$TASK_ID" '.tasks[$id]' "$REGISTRY_FILE" &>/dev/null; then
    echo "❌ Error: Task not found: $TASK_ID"
    echo ""
    echo "Available tasks:"
    jq -r '.tasks | keys[]' "$REGISTRY_FILE" | sed 's/^/  • /'
    echo ""
    echo "Use /list-tasks for detailed information"
    exit 1
fi

# Get worktree path
WORKTREE_PATH=$(jq -r --arg id "$TASK_ID" '.tasks[$id].path' "$REGISTRY_FILE")

# Check if path exists
if [[ ! -d "$WORKTREE_PATH" ]]; then
    echo "❌ Error: Worktree directory not found: $WORKTREE_PATH"
    echo "The task is registered but the directory is missing."
    echo "Use /end-task $TASK_ID to clean up the registry"
    exit 1
fi

# Output cd command
echo "cd \"$WORKTREE_PATH\""
```

## Usage Examples

### Method 1: eval (Recommended)

```bash
# Switches directory in current shell
eval $(/switch-task PROJ-123)
```

### Method 2: Copy Command

```bash
# Run command to see the cd path
/switch-task PROJ-123

# Output:
# cd "../gira-tasks/PROJ-123"

# Copy and paste the output
cd "../gira-tasks/PROJ-123"
```

### Method 3: Subshell (not recommended - creates new shell)

```bash
# Opens new shell in worktree (exit to return)
$(/switch-task PROJ-123)
```

## Integration with Shell Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Quick task switching
alias t='/switch-task'
alias task='eval $(/switch-task $1)'

# Usage:
task PROJ-123  # Immediately switches to PROJ-123 worktree
```

## Example Workflow

```bash
# Working in main project
pwd
# /Users/dev/gira

# Switch to task worktree
eval $(/switch-task PROJ-123)

pwd
# /Users/dev/gira-tasks/PROJ-123

# Implement the ticket
/implement-ticket PROJ-123

# Switch to another task
eval $(/switch-task PROJ-124)

# Return to main project
cd -
# OR
cd /Users/dev/gira
```

## Error Messages

**Task not found:**
```
❌ Error: Task not found: PROJ-999

Available tasks:
  • PROJ-123
  • PROJ-124

Use /list-tasks for detailed information
```

**Directory missing:**
```
❌ Error: Worktree directory not found: ../gira-tasks/PROJ-123
The task is registered but the directory is missing.
Use /end-task PROJ-123 to clean up the registry
```
