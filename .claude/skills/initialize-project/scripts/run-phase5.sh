#!/bin/bash
set -e

# Phase 5: Stack Detection & Auto-Configuration
# This script orchestrates all Phase 5 steps using utility scripts

PROJECT_ROOT="${1:-.}"
AI_FRAMEWORK_PATH="${2:-ai-agentic-framework}"

# Convert paths to absolute paths before any directory changes
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
AI_FRAMEWORK_PATH="$(cd "$AI_FRAMEWORK_PATH" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 5: STACK DETECTION & AUTO-CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 5.1: Run stack detection utility
echo "Step 5.1: Detecting stack..."
cd "$PROJECT_ROOT"
node "$AI_FRAMEWORK_PATH/utils/stack-detection.js" > /tmp/stack-profile.json
echo "✓ Stack detected"

# Step 5.2: Select and copy skills
echo "Step 5.2: Selecting and copying skills..."
# FIXED: Updated to match new CLI signature and to actually copy skills
node "$AI_FRAMEWORK_PATH/utils/skill-selection.js" \
  /tmp/stack-profile.json \
  "$AI_FRAMEWORK_PATH" \
  "$PROJECT_ROOT" > /tmp/skill-selection-result.json

# Display summary
SKILL_COUNT=$(cat /tmp/skill-selection-result.json | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log(s.total);")
COPIED_COUNT=$(cat /tmp/skill-selection-result.json | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log((s.copied||[]).length);")
echo "✓ $COPIED_COUNT/$SKILL_COUNT skills copied (preserving category paths)"

# Step 5.3: Generate and write agents
echo "Step 5.3: Generating and writing agents..."
# FIXED: Updated to match new CLI signature and to actually write agents
node "$AI_FRAMEWORK_PATH/utils/agent-generation.js" \
  /tmp/stack-profile.json \
  /tmp/skill-selection-result.json \
  "$PROJECT_ROOT" \
  "$AI_FRAMEWORK_PATH/agents/templates" > /tmp/agent-generation-result.json

# Display summary
AGENT_COUNT=$(cat /tmp/agent-generation-result.json | node -e "const g=JSON.parse(require('fs').readFileSync(0));console.log(g.total);")
WRITTEN_COUNT=$(cat /tmp/agent-generation-result.json | node -e "const g=JSON.parse(require('fs').readFileSync(0));console.log((g.written||[]).length);")
echo "✓ $WRITTEN_COUNT/$AGENT_COUNT agents generated and written"


# Step 5.4: Copy commands
echo "Step 5.4: Copying commands..."
COMMAND_COUNT=$(node -e "
const fs = require('fs');
const path = require('path');

async function copyDirectory(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
      if (entry.name.endsWith('.md')) {
        await fs.promises.chmod(destPath, 0o644);
        count++;
      }
    }
  }
  return count;
}

const commandsPath = '$AI_FRAMEWORK_PATH/commands';
const destPath = '$PROJECT_ROOT/.claude/commands';

copyDirectory(commandsPath, destPath)
  .then(count => console.log(count))
  .catch(err => { console.error(err); process.exit(1); });
")
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
