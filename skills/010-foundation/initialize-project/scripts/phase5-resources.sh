#!/bin/bash
set -e

# Phase 5: Resource Generation - Skill copying, agent generation, command copying
# Note: Stack detection is done in Phase 4, stack-profile.json should already exist
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

# Verify stack-profile.json exists (created in Phase 4)
if [ ! -f "$PROJECT_PATH/.claude-temp/stack-profile.json" ]; then
  echo "Error: stack-profile.json not found (should have been created in Phase 4)"
  exit 1
fi

# ============================================================================
# STEP 1: Skill Selection and Copying
# ============================================================================

echo "Step 1: Selecting and copying skills..."

node -e "
const { resolveSkills } = require('$FRAMEWORK_PATH/utils/core/skill-resolver.js');
const { addSingleSkill } = require('$FRAMEWORK_PATH/utils/skills/skill-manager.js');
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
const fs = require('fs');

async function main() {
  try {
    const stackProfile = JSON.parse(fs.readFileSync('$PROJECT_PATH/.claude-temp/stack-profile.json', 'utf-8'));

    console.log('Selecting skills based on stack...');
    const skillsToAdd = resolveSkills(stackProfile, '$FRAMEWORK_PATH');

    console.log('Copying', skillsToAdd.length, 'skills to project...');

    const copied = [];
    const errors = [];

    for (const skill of skillsToAdd) {
      try {
        const result = await addSingleSkill(skill.name, '$PROJECT_PATH', '$FRAMEWORK_PATH');
        if (result.added) {
          copied.push({ name: skill.name, path: result.path });
          console.log('  ✓', skill.name);
        }
      } catch (error) {
        errors.push({ name: skill.name, error: error.message });
        console.error('  ✗', skill.name, ':', error.message);
      }
    }

    console.log('✓ Copied', copied.length, 'skills');
    if (errors.length > 0) {
      console.log('⚠ Failed to copy', errors.length, 'skills');
    }

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
# STEP 2: Agent Generation
# ============================================================================

echo "Step 2: Generating agents..."

node -e "
const { generateAgentsWithTracking } = require('$FRAMEWORK_PATH/utils/agents');
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const stackProfile = JSON.parse(fs.readFileSync('$PROJECT_PATH/.claude-temp/stack-profile.json', 'utf-8'));

    console.log('Generating agents for detected languages with tracking...');

    // Template directory
    const templateDir = path.join('$FRAMEWORK_PATH', 'agents', 'templates');

    // Generate agents with tracking
    const result = await generateAgentsWithTracking(
      stackProfile,
      '$PROJECT_PATH',
      templateDir,
      '$FRAMEWORK_PATH'
    );

    console.log('✓ Generated', result.writeResult.written.length, 'agents');
    if (result.writeResult.errors.length > 0) {
      console.log('⚠ Failed to write', result.writeResult.errors.length, 'agents');
      result.writeResult.errors.forEach(err => {
        console.error('  -', err.name, ':', err.error);
      });
    }

    // Update config with agent tracking metadata
    console.log('Updating framework config with agent metadata...');
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const config = await configUpdater.readConfig();
    config.resource_state.agents = result.agentsTracking;
    await configUpdater.writeConfig(config);
    console.log('✓ Agent tracking metadata saved');

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
# STEP 3: Copy Commands
# ============================================================================

echo "Step 3: Copying commands..."

mkdir -p "$PROJECT_PATH/.claude/commands"

# Copy all command files except initialize-project (that's already there from setup)
find "$FRAMEWORK_PATH/commands" -name "*.md" ! -name "initialize-project.md" -exec cp {} "$PROJECT_PATH/.claude/commands/" \; 2>/dev/null || true

COMMAND_COUNT=$(find "$PROJECT_PATH/.claude/commands" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo "✓ $COMMAND_COUNT commands available"

# Update config with command tracking
node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const config = await configUpdater.readConfig();

    const commandsDir = path.join('$PROJECT_PATH', '.claude', 'commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

    for (const file of commandFiles) {
      const commandName = file.replace('.md', '');
      const sourcePath = path.join('$FRAMEWORK_PATH', 'commands', file);

      if (fs.existsSync(sourcePath)) {
        config.resource_state.commands[commandName] = {
          source_path: path.relative('$FRAMEWORK_PATH', sourcePath),
          copied_timestamp: new Date().toISOString()
        };
      }
    }

    await configUpdater.writeConfig(config);
    console.log('✓ Command tracking metadata saved');
    process.exit(0);
  } catch (error) {
    console.error('Error tracking commands:', error);
    process.exit(1);
  }
}

main();
"

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
AGENT_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

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
