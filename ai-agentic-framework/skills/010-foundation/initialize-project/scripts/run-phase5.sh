#!/bin/bash
set -e

# Phase 5: Stack Detection & Auto-Configuration
# This script orchestrates all Phase 5 steps using utility scripts

PROJECT_ROOT="${1:-.}"
AI_FRAMEWORK_PATH="${2:-ai-agentic-framework}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 5: STACK DETECTION & AUTO-CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 5.1: Run stack detection utility
echo "Step 5.1: Detecting stack..."
cd "$PROJECT_ROOT"
node "$AI_FRAMEWORK_PATH/utils/stack-detection.js" > /tmp/stack-profile.json
echo "✓ Stack detected"

# Step 5.2: Select and copy skills
echo "Step 5.2: Selecting skills..."
node "$AI_FRAMEWORK_PATH/utils/skill-selection.js" \
  /tmp/stack-profile.json \
  "$AI_FRAMEWORK_PATH" \
  "$PROJECT_ROOT" > /tmp/skill-selection-result.json

# Display summary
SKILL_COUNT=$(cat /tmp/skill-selection-result.json | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log(s.total);")
echo "✓ $SKILL_COUNT skills copied"

# Step 5.3: Generate and write agents
echo "Step 5.3: Generating agents..."
node "$AI_FRAMEWORK_PATH/utils/agent-generation.js" \
  /tmp/stack-profile.json \
  /tmp/skill-selection-result.json \
  "$PROJECT_ROOT" \
  "$AI_FRAMEWORK_PATH/agents/templates" > /tmp/agent-generation-result.json

# Display summary
AGENT_COUNT=$(cat /tmp/agent-generation-result.json | node -e "const g=JSON.parse(require('fs').readFileSync(0));console.log(g.total);")
echo "✓ $AGENT_COUNT agents generated"

# Step 5.4: Copy commands
echo "Step 5.4: Copying commands..."
mkdir -p "$PROJECT_ROOT/.claude/commands"
cp -r "$AI_FRAMEWORK_PATH/commands/"* "$PROJECT_ROOT/.claude/commands/"
chmod 644 "$PROJECT_ROOT/.claude/commands/"*.md 2>/dev/null || true
COMMAND_COUNT=$(ls -1 "$PROJECT_ROOT/.claude/commands/"*.md 2>/dev/null | wc -l | xargs)
echo "✓ $COMMAND_COUNT commands copied"

# Step 5.5: Generate index files
echo "Step 5.5: Generating index files..."
bash "$AI_FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/generate-indexes.sh" \
  "$PROJECT_ROOT" \
  /tmp/skill-selection-result.json \
  /tmp/agent-generation-result.json
echo "✓ Index files generated"

# Step 5.6: Display stack summary
echo ""
bash "$AI_FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/display-stack-summary.sh" \
  /tmp/stack-profile.json

# Step 5.7: Cleanup
rm -f /tmp/stack-profile.json /tmp/skill-selection-result.json /tmp/agent-generation-result.json
echo ""
echo "✓ Phase 5 complete - All skills, agents, and commands configured"
