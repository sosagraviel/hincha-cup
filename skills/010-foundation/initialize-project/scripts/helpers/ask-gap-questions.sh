#!/bin/bash
# Interactive Gap Questioner - Wrapper Script
# Calls the Node.js script to ask questions interactively

CONSOLIDATION_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file path required"
  exit 1
fi

if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file not found: $CONSOLIDATION_FILE"
  exit 1
fi

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  GAP CLARIFICATION QUESTIONS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Some gaps were detected in the codebase analysis."
echo "Please answer these questions to help improve the project context."
echo ""
echo "You can:"
echo "  - Answer the question"
echo "  - Type 'skip' to skip"
echo "  - Type 'unknown' if you don't know"
echo ""

# Call the Node.js script
node "$SCRIPT_DIR/ask-gap-questions.js" "$CONSOLIDATION_FILE"

exit $?
