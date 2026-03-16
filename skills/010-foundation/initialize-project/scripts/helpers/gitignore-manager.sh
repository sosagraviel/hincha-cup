#!/bin/bash
set -e

# Helper script to manage .gitignore for AI Agentic Framework
PROJECT_PATH="$1"
FRAMEWORK_PATH="$2"

if [ -z "$PROJECT_PATH" ]; then
  echo "Error: PROJECT_PATH is required"
  exit 1
fi

if [ -z "$FRAMEWORK_PATH" ]; then
  echo "Error: FRAMEWORK_PATH is required"
  exit 1
fi

GITIGNORE_PATH="$PROJECT_PATH/.gitignore"

# Determine framework folder name relative to project
if [[ "$FRAMEWORK_PATH" == "$PROJECT_PATH"* ]]; then
  # Framework is inside project - use relative path
  FRAMEWORK_FOLDER="${FRAMEWORK_PATH#$PROJECT_PATH/}"
  # Remove trailing slash if present
  FRAMEWORK_FOLDER="${FRAMEWORK_FOLDER%/}"
else
  # Framework is outside project - use folder name only
  FRAMEWORK_FOLDER="$(basename "$FRAMEWORK_PATH")"
fi

# Check if .gitignore exists
if [ ! -f "$GITIGNORE_PATH" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  .gitignore NOT FOUND"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "The project doesn't have a .gitignore file."
  echo "It's recommended to create one to exclude temporary files."
  echo ""
  read -p "Create .gitignore with AI framework entries? (Y/n): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    cat > "$GITIGNORE_PATH" << EOF
# AI Agentic Framework - managed by framework, should not be committed
$FRAMEWORK_FOLDER/

# AI Agentic Framework temporary files
.claude-temp/
.claude-backups/
EOF
    echo "✓ Created .gitignore with AI framework entries"
  else
    echo "⊘ Skipped .gitignore creation"
    echo "⚠ Warning: $FRAMEWORK_FOLDER/, .claude-temp/ and .claude-backups/ will not be ignored by git"
  fi
else
  # .gitignore exists, check if it has the entries
  HAS_FRAMEWORK=$(grep -c "^${FRAMEWORK_FOLDER}" "$GITIGNORE_PATH" || true)
  HAS_TEMP=$(grep -c "^\.claude-temp" "$GITIGNORE_PATH" || true)
  HAS_BACKUPS=$(grep -c "^\.claude-backups" "$GITIGNORE_PATH" || true)

  MISSING_ENTRIES=()
  [ "$HAS_FRAMEWORK" -eq 0 ] && MISSING_ENTRIES+=("$FRAMEWORK_FOLDER/")
  [ "$HAS_TEMP" -eq 0 ] && MISSING_ENTRIES+=(".claude-temp/")
  [ "$HAS_BACKUPS" -eq 0 ] && MISSING_ENTRIES+=(".claude-backups/")

  if [ ${#MISSING_ENTRIES[@]} -gt 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  .gitignore MISSING ENTRIES"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Your .gitignore is missing the following AI framework entries:"
    for entry in "${MISSING_ENTRIES[@]}"; do
      echo "  - $entry"
    done
    echo ""
    read -p "Add these entries to .gitignore? (Y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      echo "" >> "$GITIGNORE_PATH"

      # Add framework folder with its own comment if missing
      if [[ " ${MISSING_ENTRIES[@]} " =~ " ${FRAMEWORK_FOLDER}/ " ]]; then
        echo "# AI Agentic Framework - managed by framework, should not be committed" >> "$GITIGNORE_PATH"
        echo "$FRAMEWORK_FOLDER/" >> "$GITIGNORE_PATH"
        echo "" >> "$GITIGNORE_PATH"
      fi

      # Add temp files with their comment if any are missing
      if [[ " ${MISSING_ENTRIES[@]} " =~ " .claude-temp/ " ]] || [[ " ${MISSING_ENTRIES[@]} " =~ " .claude-backups/ " ]]; then
        echo "# AI Agentic Framework temporary files" >> "$GITIGNORE_PATH"
        for entry in "${MISSING_ENTRIES[@]}"; do
          if [[ "$entry" == ".claude-temp/" ]] || [[ "$entry" == ".claude-backups/" ]]; then
            echo "$entry" >> "$GITIGNORE_PATH"
          fi
        done
      fi

      echo "✓ Added AI framework entries to .gitignore"
    else
      echo "⊘ Skipped updating .gitignore"
      echo "⚠ Warning: ${MISSING_ENTRIES[*]} will not be ignored by git"
    fi
  else
    echo "✓ .gitignore already contains AI framework entries"
  fi
fi

exit 0
