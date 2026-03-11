#!/bin/bash
set -e

# Phase 5: Resource Generation - Stack detection, skill copying, agent generation
PROJECT_PATH="$1"
FRAMEWORK_PATH="$2"

if [ -z "$PROJECT_PATH" ] || [ -z "$FRAMEWORK_PATH" ]; then
  echo "Error: PROJECT_PATH and FRAMEWORK_PATH are required"
  exit 1
fi

echo "Phase 5: Resource Generation"
echo "  Project: $PROJECT_PATH"
  echo "  Framework: $FRAMEWORK_PATH"
echo ""

# ============================================================================
# STEP 1: Stack Detection
# ============================================================================

echo "Step 1: Detecting stack..."

node "$FRAMEWORK_PATH/utils/stack-detection.js" "$PROJECT_PATH" > "$PROJECT_PATH/.claude-temp/stack-profile.json"

if [ ! -f "$PROJECT_PATH/.claude-temp/stack-profile.json" ]; then
  echo "Error: Stack detection failed"
  exit 1
fi

echo "✓ Stack detected"
echo ""

# ============================================================================
# STEP 2: Skill Selection and Copying
# ============================================================================

echo "Step 2: Selecting and copying skills..."

node -e "
const skillSelection = require('$FRAMEWORK_PATH/utils/skill-selection.js');
const fs = require('fs');

async function main() {
  try {
    const stackProfile = JSON.parse(fs.readFileSync('$PROJECT_PATH/.claude-temp/stack-profile.json', 'utf-8'));

    console.log('Selecting skills based on stack...');
    const selection = await skillSelection.selectSkills(stackProfile, '$FRAMEWORK_PATH');

    console.log('Copying skills to project...');
    const result = await skillSelection.copySkills(selection, '$PROJECT_PATH');

    console.log('✓ Copied', result.copied.length, 'skills');
    if (result.errors.length > 0) {
      console.log('⚠ Failed to copy', result.errors.length, 'skills');
      result.errors.forEach(err => {
        console.error('  -', err.name, ':', err.error);
      });
    }

    // Generate skill index
    console.log('Generating skill index...');
    await skillSelection.generateSkillIndex(selection, '$PROJECT_PATH');
    console.log('✓ Skill index generated');

    process.exit(0);
  } catch (error) {
    console.error('Error in skill selection/copying:', error);
    process.exit(1);
  }
}

main();
"

echo ""

# ============================================================================
# STEP 3: Agent Generation
# ============================================================================

echo "Step 3: Generating agents..."

node -e "
const agentGen = require('$FRAMEWORK_PATH/utils/agent-generation.js');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const stackProfile = JSON.parse(fs.readFileSync('$PROJECT_PATH/.claude-temp/stack-profile.json', 'utf-8'));

    console.log('Generating agents for detected languages...');

    // Template directory
    const templateDir = path.join('$FRAMEWORK_PATH', 'agents', 'templates');

    // Generate agents
    const agents = await agentGen.generateAgents(
      stackProfile,
      {},
      '$PROJECT_PATH',
      templateDir
    );

    console.log('Writing agents to project...');
    const result = await agentGen.writeAgents(agents, '$PROJECT_PATH');

    console.log('✓ Generated', result.written.length, 'agents');
    if (result.errors.length > 0) {
      console.log('⚠ Failed to write', result.errors.length, 'agents');
      result.errors.forEach(err => {
        console.error('  -', err.name, ':', err.error);
      });
    }

    // Generate agent index
    console.log('Generating agent index...');
    await agentGen.generateAgentIndex(agents, '$PROJECT_PATH');
    console.log('✓ Agent index generated');

    process.exit(0);
  } catch (error) {
    console.error('Error in agent generation:', error);
    process.exit(1);
  }
}

main();
"

echo ""

# ============================================================================
# STEP 4: Copy Commands
# ============================================================================

echo "Step 4: Copying commands..."

mkdir -p "$PROJECT_PATH/.claude/commands"

# Copy all command files except initialize-project (that's already there from setup)
find "$FRAMEWORK_PATH/commands" -name "*.md" ! -name "initialize-project.md" -exec cp {} "$PROJECT_PATH/.claude/commands/" \; 2>/dev/null || true

COMMAND_COUNT=$(find "$PROJECT_PATH/.claude/commands" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo "✓ $COMMAND_COUNT commands available"
echo ""

# ============================================================================
# VALIDATION
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 5 VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Count what was created
SKILL_COUNT=$(find "$PROJECT_PATH/.claude/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
AGENT_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" -not -name "INDEX.md" 2>/dev/null | wc -l | tr -d ' ')

echo "Results:"
echo "  Skills: $SKILL_COUNT"
echo "  Agents: $AGENT_COUNT"
echo "  Commands: $COMMAND_COUNT"
echo ""

# Validate minimums
if [ "$SKILL_COUNT" -lt 5 ]; then
  echo "⚠ WARNING: Only $SKILL_COUNT skills copied (expected 10+)"
fi

if [ "$AGENT_COUNT" -lt 3 ]; then
  echo "⚠ WARNING: Only $AGENT_COUNT agents generated (expected 3+)"
fi

if [ "$COMMAND_COUNT" -lt 1 ]; then
  echo "⚠ WARNING: Only $COMMAND_COUNT commands copied (expected 1+)"
fi

# Check agents directory exists
if [ ! -d "$PROJECT_PATH/.claude/agents" ]; then
  echo "❌ ERROR: Agents directory not created"
  exit 1
fi

# Check for JSON agents (should be Markdown)
JSON_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JSON_COUNT" -gt 0 ]; then
  echo "⚠ WARNING: Found $JSON_COUNT JSON agents (should be Markdown)"
fi

echo "✅ Phase 5 validation complete"
echo ""

exit 0
