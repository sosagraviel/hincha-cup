# End Task - Remove Task Worktree

Remove a task worktree and free up its slot for new tasks.

## Usage

```bash
/end-task <task-id>
```

## What This Does

1. Prompts for confirmation
2. Stops Docker containers (if applicable)
3. Removes git worktree
4. Unregisters task from registry
5. Frees up the slot for future tasks

## Implementation

```bash
#!/usr/bin/env bash

TASK_ID="${1:?Error: Task ID required. Usage: /end-task <task-id>}"
REGISTRY_FILE=".worktree-registry.json"

# Check if registry exists
if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo "❌ Error: No active tasks"
    exit 1
fi

# Check if task exists
if ! jq -e --arg id "$TASK_ID" '.tasks[$id]' "$REGISTRY_FILE" &>/dev/null; then
    echo "❌ Error: Task not found: $TASK_ID"
    echo ""
    echo "Available tasks:"
    jq -r '.tasks | keys[]' "$REGISTRY_FILE" | sed 's/^/  • /'
    exit 1
fi

# Get task info
TASK_INFO=$(jq --arg id "$TASK_ID" '.tasks[$id]' "$REGISTRY_FILE")
WORKTREE_PATH=$(echo "$TASK_INFO" | jq -r '.path')
BRANCH=$(echo "$TASK_INFO" | jq -r '.branch')
SLOT=$(echo "$TASK_INFO" | jq -r '.slot')

echo ""
echo "⚠️  About to remove task worktree:"
echo ""
echo "  Task ID:  $TASK_ID"
echo "  Branch:   $BRANCH"
echo "  Path:     $WORKTREE_PATH"
echo "  Slot:     $SLOT"
echo ""

# Check if there are uncommitted changes
if [[ -d "$WORKTREE_PATH" ]]; then
    cd "$WORKTREE_PATH" || exit 1

    UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')

    if [[ $UNCOMMITTED -gt 0 ]]; then
        echo "⚠️  WARNING: This worktree has $UNCOMMITTED uncommitted change(s)!"
        echo ""
        git status --short
        echo ""
    fi

    # Check if branch has unpushed commits
    UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')

    if [[ $UNPUSHED -gt 0 ]]; then
        echo "⚠️  WARNING: Branch has $UNPUSHED unpushed commit(s)!"
        echo ""
        git log @{u}.. --oneline
        echo ""
    fi

    cd "$OLDPWD" || return
fi

# Confirm
read -p "Are you sure you want to remove this task? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "🗑️  Removing task worktree..."
echo ""

# Step 1: Stop Docker containers
if [[ -f "$WORKTREE_PATH/docker-compose.yml" ]]; then
    echo "  🐳 Stopping Docker containers..."

    cd "$WORKTREE_PATH" || exit 1

    if docker compose down 2>/dev/null; then
        echo "  ✅ Containers stopped"
    else
        echo "  ⚠️  Failed to stop containers (may not be running)"
    fi

    cd "$OLDPWD" || return
fi

# Step 2: Remove git worktree
if [[ -d "$WORKTREE_PATH" ]]; then
    echo "  📁 Removing worktree directory..."

    if git worktree remove "$WORKTREE_PATH" --force 2>/dev/null; then
        echo "  ✅ Worktree removed"
    else
        echo "  ⚠️  git worktree remove failed, trying manual deletion..."

        # Manual deletion as fallback
        rm -rf "$WORKTREE_PATH"

        # Prune git worktrees
        git worktree prune

        echo "  ✅ Directory deleted manually"
    fi
else
    echo "  ⚠️  Worktree directory not found (already deleted?)"

    # Still prune to clean up git's worktree list
    git worktree prune
fi

# Step 3: Unregister from registry
echo "  📝 Updating registry..."

jq --arg id "$TASK_ID" 'del(.tasks[$id])' "$REGISTRY_FILE" > "$REGISTRY_FILE.tmp"
mv "$REGISTRY_FILE.tmp" "$REGISTRY_FILE"

echo "  ✅ Task unregistered"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Task Removed Successfully                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Freed slot: $SLOT"
echo "  Branch '$BRANCH' is preserved in git"
echo ""
echo "💡 Next steps:"
echo "   • Create new task: /start-task <id>"
echo "   • View active tasks: /list-tasks"
echo ""

# Offer to delete branch if merged
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "🌿 Branch '$BRANCH' still exists locally."

    # Check if merged into main/master
    MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

    if git merge-base --is-ancestor "$BRANCH" "$MAIN_BRANCH" 2>/dev/null; then
        echo "   ✅ Branch is merged into $MAIN_BRANCH"
        echo ""
        read -p "   Delete branch '$BRANCH'? (y/N): " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git branch -d "$BRANCH" 2>/dev/null && echo "   ✅ Branch deleted" || echo "   ⚠️  Failed to delete branch (use: git branch -D $BRANCH)"
        fi
    else
        echo "   ⚠️  Branch is NOT merged into $MAIN_BRANCH"
        echo "   Keep it to preserve your work, or delete with: git branch -D $BRANCH"
    fi

    echo ""
fi
```

## Example Output

### Normal Removal

```
⚠️  About to remove task worktree:

  Task ID:  PROJ-123
  Branch:   task/PROJ-123
  Path:     ../gira-tasks/PROJ-123
  Slot:     1

Are you sure you want to remove this task? (y/N): y

🗑️  Removing task worktree...

  🐳 Stopping Docker containers...
  ✅ Containers stopped
  📁 Removing worktree directory...
  ✅ Worktree removed
  📝 Updating registry...
  ✅ Task unregistered

╔════════════════════════════════════════════════════════════╗
║  ✅ Task Removed Successfully                              ║
╚════════════════════════════════════════════════════════════╝

  Freed slot: 1
  Branch 'task/PROJ-123' is preserved in git

💡 Next steps:
   • Create new task: /start-task <id>
   • View active tasks: /list-tasks

🌿 Branch 'task/PROJ-123' still exists locally.
   ✅ Branch is merged into main

   Delete branch 'task/PROJ-123'? (y/N): y
   ✅ Branch deleted
```

### With Uncommitted Changes

```
⚠️  About to remove task worktree:

  Task ID:  PROJ-124
  Branch:   feat/awesome-feature
  Path:     ../gira-tasks/PROJ-124
  Slot:     2

⚠️  WARNING: This worktree has 3 uncommitted change(s)!

 M src/components/Button.tsx
 M src/styles/theme.css
?? src/components/NewComponent.tsx

Are you sure you want to remove this task? (y/N): n
❌ Cancelled
```

### With Unpushed Commits

```
⚠️  About to remove task worktree:

  Task ID:  PROJ-125
  Branch:   task/PROJ-125
  Path:     ../gira-tasks/PROJ-125
  Slot:     3

⚠️  WARNING: Branch has 2 unpushed commit(s)!

abc1234 feat: add user authentication
def5678 fix: resolve merge conflicts

Are you sure you want to remove this task? (y/N):
```

## Safety Features

1. **Confirmation Prompt**: Always asks before removing
2. **Uncommitted Changes Warning**: Shows dirty files before removal
3. **Unpushed Commits Warning**: Shows commits that would be lost
4. **Branch Preservation**: Never deletes git branches automatically
5. **Merged Branch Detection**: Offers to clean up merged branches
6. **Force Removal**: Uses `--force` to handle edge cases
7. **Fallback Deletion**: Manual `rm -rf` if git worktree fails
8. **Prune Cleanup**: Runs `git worktree prune` to clean orphans

## Best Practices

1. **Before Removal**:
   - Push your commits: `git push`
   - Ensure work is saved or merged
   - Create PR if work is complete

2. **After PR Merged**:
   - Safe to run `/end-task`
   - Say "yes" to branch deletion
   - Slot is freed for new work

3. **Abandoned Work**:
   - Keep branch for later: say "no" to branch deletion
   - Delete branch manually if truly abandoned: `git branch -D <branch>`

## Emergency Recovery

If you accidentally removed a task with uncommitted work:

```bash
# Recover from git reflog (within 30 days usually)
git reflog --all

# Find the commit before removal
git checkout <commit-hash>

# Create recovery branch
git checkout -b recovered-PROJ-123
```

## Integration with Git Workflows

Works seamlessly with:
- ✅ Git Flow (feature/hotfix branches)
- ✅ GitHub Flow (PR-based workflow)
- ✅ GitLab Flow (environment branches)
- ✅ Trunk-Based Development (short-lived branches)
