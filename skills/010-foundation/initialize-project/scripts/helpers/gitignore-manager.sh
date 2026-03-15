#!/bin/bash
set -e

# Helper script to manage .gitignore for AI Agentic Framework
PROJECT_PATH="$1"

if [ -z "$PROJECT_PATH" ]; then
  echo "Error: PROJECT_PATH is required"
  exit 1
fi

GITIGNORE_PATH="$PROJECT_PATH/.gitignore"

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
    cat > "$GITIGNORE_PATH" << 'EOF'
# AI Agentic Framework temporary files
.claude-temp/
.claude-backups/
EOF
    echo "✓ Created .gitignore with AI framework entries"
  else
    echo "⊘ Skipped .gitignore creation"
    echo "⚠ Warning: .claude-temp/ and .claude-backups/ will not be ignored by git"
  fi
else
  # .gitignore exists, check if it has the entries
  HAS_TEMP=$(grep -c "^\.claude-temp" "$GITIGNORE_PATH" || true)
  HAS_BACKUPS=$(grep -c "^\.claude-backups" "$GITIGNORE_PATH" || true)

  MISSING_ENTRIES=()
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
      echo "# AI Agentic Framework temporary files" >> "$GITIGNORE_PATH"
      for entry in "${MISSING_ENTRIES[@]}"; do
        echo "$entry" >> "$GITIGNORE_PATH"
      done
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
