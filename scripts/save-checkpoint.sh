#!/usr/bin/env bash
# Save checkpoint wrapper script
# Migrated to use orchestration TypeScript module

JIRA_KEY="$1"
PHASE="$2"

if [ -z "$JIRA_KEY" ] || [ -z "$PHASE" ]; then
  echo "Usage: $0 <JIRA_KEY> <PHASE>"
  echo "Example: $0 PROJ-123 phase2"
  exit 1
fi

# Determine project root (assuming script is in <project>/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Navigate to orchestration module and run TypeScript script
cd "$PROJECT_ROOT/orchestration" && npm run save-checkpoint "$JIRA_KEY" "$PHASE"
