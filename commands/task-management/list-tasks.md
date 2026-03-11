# List Tasks - View All Active Worktrees

Display all active task worktrees with their status, ports, and access URLs.

## Usage

```bash
/list-tasks
```

## Implementation

```bash
#!/usr/bin/env bash

REGISTRY_FILE=".worktree-registry.json"

# Check if registry exists
if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo ""
    echo "📭 No active tasks"
    echo ""
    echo "Create a task worktree with: /start-task <task-id>"
    exit 0
fi

# Check if any tasks exist
TASK_COUNT=$(jq '.tasks | length' "$REGISTRY_FILE")

if [[ "$TASK_COUNT" -eq 0 ]]; then
    echo ""
    echo "📭 No active tasks"
    echo ""
    echo "Create a task worktree with: /start-task <task-id>"
    exit 0
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  📋 Active Task Worktrees                                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# List all tasks
jq -r '.tasks | to_entries[] | .key' "$REGISTRY_FILE" | while IFS= read -r TASK_ID; do
    # Get task info
    TASK_INFO=$(jq --arg id "$TASK_ID" '.tasks[$id]' "$REGISTRY_FILE")

    PATH_VALUE=$(echo "$TASK_INFO" | jq -r '.path')
    BRANCH=$(echo "$TASK_INFO" | jq -r '.branch')
    SLOT=$(echo "$TASK_INFO" | jq -r '.slot')
    CREATED=$(echo "$TASK_INFO" | jq -r '.created')
    URLS=$(echo "$TASK_INFO" | jq -r '.urls[]' 2>/dev/null)

    # Check if path exists
    if [[ ! -d "$PATH_VALUE" ]]; then
        echo "🔴 $TASK_ID (MISSING)"
        echo "   Path: $PATH_VALUE"
        echo "   ⚠️  Directory not found - use /end-task $TASK_ID to clean up"
        echo ""
        continue
    fi

    # Check git status
    cd "$PATH_VALUE" || continue

    # Get uncommitted changes
    UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')

    # Get ahead/behind status
    AHEAD_BEHIND=$(git rev-list --left-right --count origin/$(git rev-parse --abbrev-ref HEAD)...HEAD 2>/dev/null || echo "0 0")
    AHEAD=$(echo "$AHEAD_BEHIND" | awk '{print $2}')
    BEHIND=$(echo "$AHEAD_BEHIND" | awk '{print $1}')

    # Check if containers are running (if Docker project)
    CONTAINERS_RUNNING=false
    if command -v docker &>/dev/null; then
        PROJECT_NAME=$(basename "$(dirname "$PATH_VALUE")" | sed 's/-tasks$//')
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$PROJECT_NAME-$TASK_ID"; then
            CONTAINERS_RUNNING=true
        fi
    fi

    # Display task
    echo "🟢 $TASK_ID"
    echo "   Branch:   $BRANCH"
    echo "   Slot:     $SLOT"
    echo "   Path:     $PATH_VALUE"
    echo "   Created:  $(echo "$CREATED" | sed 's/T/ /' | sed 's/Z/ UTC/')"

    # Git status
    if [[ $UNCOMMITTED -gt 0 ]]; then
        echo "   Git:      ⚠️  $UNCOMMITTED uncommitted change(s)"
    else
        echo "   Git:      ✅ Clean working directory"
    fi

    if [[ $AHEAD -gt 0 || $BEHIND -gt 0 ]]; then
        echo "             ↑ $AHEAD ahead, ↓ $BEHIND behind"
    fi

    # Docker status
    if [[ -f "$PATH_VALUE/docker-compose.yml" ]]; then
        if $CONTAINERS_RUNNING; then
            echo "   Docker:   🟢 Running"
        else
            echo "   Docker:   ⚪ Stopped"
        fi
    fi

    # URLs
    if [[ -n "$URLS" ]]; then
        echo "   URLs:"
        echo "$URLS" | while IFS= read -r url; do
            echo "     • $url"
        done
    fi

    echo ""

    # Return to original directory
    cd "$OLDPWD" || return
done

echo "💡 Commands:"
echo "   • /switch-task <id>    - Jump to a task worktree"
echo "   • /end-task <id>       - Remove a task worktree"
echo "   • /start-task <id>     - Create new task worktree"
echo ""
```

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║  📋 Active Task Worktrees                                  ║
╚════════════════════════════════════════════════════════════╝

🟢 PROJ-123
   Branch:   task/PROJ-123
   Slot:     1
   Path:     ../gira-tasks/PROJ-123
   Created:  2026-03-02 14:30:00 UTC
   Git:      ✅ Clean working directory
   Docker:   🟢 Running
   URLs:
     • http://localhost:3051
     • http://localhost:2713

🟢 PROJ-124
   Branch:   feat/awesome-feature
   Slot:     2
   Path:     ../gira-tasks/PROJ-124
   Created:  2026-03-02 15:45:00 UTC
   Git:      ⚠️  3 uncommitted change(s)
             ↑ 2 ahead, ↓ 0 behind
   Docker:   ⚪ Stopped
   URLs:
     • http://localhost:3052
     • http://localhost:2714

🔴 PROJ-125 (MISSING)
   Path: ../gira-tasks/PROJ-125
   ⚠️  Directory not found - use /end-task PROJ-125 to clean up

💡 Commands:
   • /switch-task <id>    - Jump to a task worktree
   • /end-task <id>       - Remove a task worktree
   • /start-task <id>     - Create new task worktree
```

## Status Indicators

- 🟢 **Active** - Worktree exists and is accessible
- 🔴 **Missing** - Worktree registered but directory doesn't exist
- ✅ **Clean** - No uncommitted changes
- ⚠️ **Modified** - Has uncommitted changes
- 🟢 **Running** - Docker containers are up
- ⚪ **Stopped** - Docker containers are down
