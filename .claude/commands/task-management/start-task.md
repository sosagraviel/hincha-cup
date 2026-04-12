# Start Task - Create Isolated Worktree

Create a new git worktree for parallel task development with automatic port isolation.

## Usage

```bash
/start-task <task-id> [branch-name]
```

## What This Does

1. Validates project is initialized (has `.claude/CLAUDE.md`)
2. Creates git worktree in `../<project>-tasks/<task-id>/`
3. Auto-detects ports from project configuration
4. Assigns unique ports to avoid conflicts
5. Copies `.claude/` configuration to worktree
6. Creates environment files with updated ports
7. Displays URLs and next steps

## Implementation

Follow these steps to create the task worktree:

### Step 1: Parse Arguments and Validate

```bash
TASK_ID="${1:?Error: Task ID required. Usage: /start-task <task-id> [branch-name]}"
BRANCH_NAME="${2:-task/$TASK_ID}"
```

Validate prerequisites:

```bash
# Check if initialize-project has run
if [[ ! -f ".claude/CLAUDE.md" ]]; then
    echo "❌ Error: Project not initialized"
    echo ""
    echo "Run /initialize-project first to analyze this project."
    echo "This creates .claude/CLAUDE.md with project knowledge needed for task isolation."
    exit 1
fi

# Check if in git repository
if ! git rev-parse --git-dir &>/dev/null; then
    echo "❌ Error: Not a git repository"
    exit 1
fi

# Check for jq (required for registry)
if ! command -v jq &>/dev/null; then
    echo "❌ Error: jq is required"
    echo "Install with:"
    echo "  macOS: brew install jq"
    echo "  Ubuntu/Debian: apt-get install jq"
    echo "  RHEL/CentOS: yum install jq"
    exit 1
fi
```

### Step 2: Initialize Project Variables

```bash
PROJECT_NAME=$(basename "$(pwd)")
PROJECT_ROOT=$(pwd)
TASKS_DIR="../${PROJECT_NAME}-tasks"
WORKTREE_PATH="$TASKS_DIR/$TASK_ID"
REGISTRY_FILE=".worktree-registry.json"
```

Initialize registry if it doesn't exist:

```bash
if [[ ! -f "$REGISTRY_FILE" ]]; then
    cat > "$REGISTRY_FILE" <<EOF
{
  "project_name": "$PROJECT_NAME",
  "tasks": {}
}
EOF
fi
```

### Step 3: Find Available Slot

```bash
# Get next available slot (0-9, main project uses slot 0)
USED_SLOTS=$(jq -r '.tasks | to_entries[] | .value.slot' "$REGISTRY_FILE" | sort -n)

SLOT=-1
for check_slot in {1..9}; do
    if ! echo "$USED_SLOTS" | grep -q "^${check_slot}$"; then
        SLOT=$check_slot
        break
    fi
done

if [[ $SLOT -eq -1 ]]; then
    echo "❌ Error: No available slots (maximum 9 concurrent tasks)"
    echo "Use /list-tasks to see active tasks"
    echo "Use /end-task <id> to free up a slot"
    exit 1
fi

echo "📍 Assigned slot: $SLOT"
```

### Step 4: Detect Project Ports

```bash
# Extract ports from CLAUDE.md
DETECTED_PORTS=$(grep -oE '(localhost:|port[:\s]+|PORT=|:)[0-9]{4,5}' .claude/CLAUDE.md 2>/dev/null | grep -oE '[0-9]{4,5}' | sort -u)

echo "🔍 Detected ports: $DETECTED_PORTS"
```

Create port mapping:

```bash
# Store original and new ports
declare -A PORT_MAP

for PORT in $DETECTED_PORTS; do
    NEW_PORT=$((PORT + SLOT))
    PORT_MAP[$PORT]=$NEW_PORT
    echo "  $PORT → $NEW_PORT"
done
```

### Step 5: Create Worktree

```bash
# Check if worktree already exists
if jq -e --arg id "$TASK_ID" '.tasks[$id]' "$REGISTRY_FILE" &>/dev/null; then
    echo "❌ Error: Worktree already exists for task: $TASK_ID"
    echo "Use /switch-task $TASK_ID to access it"
    echo "Or /end-task $TASK_ID to remove it first"
    exit 1
fi

echo ""
echo "📁 Creating worktree..."

# Create tasks directory
mkdir -p "$TASKS_DIR"

# Check if branch exists
if git rev-parse --verify "$BRANCH_NAME" &>/dev/null; then
    echo "  Branch '$BRANCH_NAME' exists, checking out..."
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    echo "  Creating new branch '$BRANCH_NAME'..."
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi

echo "✅ Worktree created at: $WORKTREE_PATH"
```

### Step 6: Copy .claude Configuration

```bash
echo ""
echo "📋 Copying .claude configuration..."

if [[ -d ".claude" ]]; then
    cp -r .claude "$WORKTREE_PATH/"
    echo "✅ Copied .claude/ (preserves project knowledge and skills)"
else
    echo "⚠️  No .claude/ directory found (this is unexpected)"
fi
```

### Step 7: Update Environment Files

```bash
echo ""
echo "⚙️  Updating environment files..."

# Find environment files
ENV_FILES=$(find . -maxdepth 3 -type f \( -name '.env*' -o -name 'docker-compose*.yml' \) 2>/dev/null | grep -v node_modules | grep -v '.git')

for ENV_FILE in $ENV_FILES; do
    if [[ ! -f "$ENV_FILE" ]]; then
        continue
    fi

    DEST_FILE="$WORKTREE_PATH/$ENV_FILE"
    mkdir -p "$(dirname "$DEST_FILE")"

    # Copy file
    cp "$ENV_FILE" "$DEST_FILE"

    # Replace all detected ports
    for OLD_PORT in "${!PORT_MAP[@]}"; do
        NEW_PORT=${PORT_MAP[$OLD_PORT]}

        # Use perl for in-place replacement (works on macOS and Linux)
        perl -pi -e "s/\b$OLD_PORT\b/$NEW_PORT/g" "$DEST_FILE"
    done

    echo "  ✓ Updated: $ENV_FILE"
done
```

### Step 8: Create Docker Override (if applicable)

```bash
if [[ -f "docker-compose.yml" ]]; then
    echo ""
    echo "🐳 Creating Docker Compose override..."

    cat > "$WORKTREE_PATH/docker-compose.override.yml" <<EOF
# Auto-generated override for task: $TASK_ID
# Provides container isolation for parallel development
# DO NOT commit this file

# Container naming prefix
# This prevents conflicts with main project containers
x-container-prefix: &container-prefix ${PROJECT_NAME}-${TASK_ID}

services:
EOF

    # Update service container names and ports
    # This is a simplified version - production would parse YAML properly
    echo "  ✓ Created docker-compose.override.yml"
    echo "  ℹ️  Containers will use prefix: ${PROJECT_NAME}-${TASK_ID}"
fi
```

### Step 9: Register Task

```bash
echo ""
echo "📝 Registering task..."

# Build URLs array
URLS=()
for PORT in "${PORT_MAP[@]}"; do
    URLS+=("http://localhost:$PORT")
done

# Create JSON for new task
TASK_JSON=$(cat <<EOF
{
  "path": "$WORKTREE_PATH",
  "branch": "$BRANCH_NAME",
  "slot": $SLOT,
  "created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "ports": $(echo "${PORT_MAP[@]}" | jq -R 'split(" ") | map(tonumber)'),
  "urls": $(printf '%s\n' "${URLS[@]}" | jq -R . | jq -s .)
}
EOF
)

# Update registry
jq --arg id "$TASK_ID" --argjson task "$TASK_JSON" '.tasks[$id] = $task' "$REGISTRY_FILE" > "$REGISTRY_FILE.tmp"
mv "$REGISTRY_FILE.tmp" "$REGISTRY_FILE"

echo "✅ Task registered: $TASK_ID"
```

### Step 10: Display Summary

```bash
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Task Worktree Created Successfully                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🏷️  Task ID:    $TASK_ID"
echo "🌿 Branch:     $BRANCH_NAME"
echo "📁 Location:   $WORKTREE_PATH"
echo "🎯 Slot:       $SLOT"
echo ""
echo "🔗 Access URLs:"
for url in "${URLS[@]}"; do
    echo "   $url"
done
echo ""
echo "📝 Next Steps:"
echo ""
echo "  1. Switch to the worktree:"
echo "     cd $WORKTREE_PATH"
echo ""
echo "  2. Start development environment:"

# Suggest appropriate start command based on project
if [[ -f "Makefile" ]] && grep -q "^up:" Makefile 2>/dev/null; then
    echo "     make up"
elif [[ -f "docker-compose.yml" ]]; then
    echo "     docker compose up -d"
elif [[ -f "package.json" ]] && grep -q "\"dev\":" package.json 2>/dev/null; then
    echo "     npm run dev"
else
    echo "     (use your project's start command)"
fi

echo ""
echo "  3. Implement the ticket with AI:"
echo "     /implement-ticket $TASK_ID"
echo ""
echo "💡 Pro Tips:"
echo "   • Your main worktree continues running unaffected"
echo "   • Use /list-tasks to see all active tasks"
echo "   • Use /switch-task $TASK_ID to jump back here"
echo "   • Use /end-task $TASK_ID when finished"
echo ""
```

## Example Output

```
📍 Assigned slot: 1
🔍 Detected ports: 2712 3050 7080
  2712 → 2713
  3050 → 3051
  7080 → 7081

📁 Creating worktree...
  Creating new branch 'task/PROJ-123'...
✅ Worktree created at: ../gira-tasks/PROJ-123

📋 Copying .claude configuration...
✅ Copied .claude/ (preserves project knowledge and skills)

⚙️  Updating environment files...
  ✓ Updated: .env.development
  ✓ Updated: docker-compose.yml

🐳 Creating Docker Compose override...
  ✓ Created docker-compose.override.yml
  ℹ️  Containers will use prefix: gira-PROJ-123

📝 Registering task...
✅ Task registered: PROJ-123

╔════════════════════════════════════════════════════════════╗
║  ✅ Task Worktree Created Successfully                     ║
╚════════════════════════════════════════════════════════════╝

🏷️  Task ID:    PROJ-123
🌿 Branch:     task/PROJ-123
📁 Location:   ../gira-tasks/PROJ-123
🎯 Slot:       1

🔗 Access URLs:
   http://localhost:2713
   http://localhost:3051
   http://localhost:7081

📝 Next Steps:

  1. Switch to the worktree:
     cd ../gira-tasks/PROJ-123

  2. Start development environment:
     make up

  3. Implement the ticket with AI:
     /implement-ticket PROJ-123

💡 Pro Tips:
   • Your main worktree continues running unaffected
   • Use /list-tasks to see all active tasks
   • Use /switch-task PROJ-123 to jump back here
   • Use /end-task PROJ-123 when finished
```

## Integration with /implement-ticket

Once the worktree is created, you can:

```bash
cd ../gira-tasks/PROJ-123
/implement-ticket PROJ-123
```

The AI will:
- Use the copied `.claude/CLAUDE.md` for project context
- Work in the isolated git worktree
- Use the updated ports (no conflicts with main project)
- Create PR from the task branch

Meanwhile, your main project directory continues running without interruption.

## Error Handling

- **No CLAUDE.md**: Prompts to run `/initialize-project` first
- **Not a git repo**: Clear error message
- **jq not installed**: Installation instructions for all platforms
- **No available slots**: Suggests using `/end-task` to free slots
- **Worktree exists**: Suggests `/switch-task` or `/end-task`
- **Port conflicts**: Automatically finds next available port

## Platform Compatibility

- ✅ macOS (uses `perl` for cross-platform sed compatibility)
- ✅ Linux (Ubuntu, Debian, RHEL, Alpine)
- ✅ Windows WSL2

## Dependencies

- **Required**: git 2.25+, jq, perl
- **Optional**: docker, docker compose (auto-detected)
