#!/bin/bash
set -e

# ============================================================================
# Validate and Fix Agent Skills
# ============================================================================
#
# Detects when agents are missing skills and regenerates them.
# Use this if you suspect agents are out of sync with skills.
#
# Usage:
#   ./scripts/validate-and-fix-agents.sh <project-path> [framework-path]
#
# ============================================================================

PROJECT_PATH="${1:-$PWD}"
FRAMEWORK_PATH="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if [ ! -d "$PROJECT_PATH" ]; then
  echo "❌ Error: Project path does not exist: $PROJECT_PATH"
  exit 1
fi

if [ ! -d "$FRAMEWORK_PATH" ]; then
  echo "❌ Error: Framework path does not exist: $FRAMEWORK_PATH"
  exit 1
fi

echo "🔍 Validating Agent Skills"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project:   $PROJECT_PATH"
echo "  Framework: $FRAMEWORK_PATH"
echo ""

# Validate and fix
RESULT=$(node -e "
const { validateAgentSkills } = require('$FRAMEWORK_PATH/utils/discovery/agent-skill-validator.js');
const { regenerateSingleAgent } = require('$FRAMEWORK_PATH/utils/agents');
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const config = await configUpdater.readConfig();

    const needsRegen = validateAgentSkills(
      '$PROJECT_PATH',
      '$FRAMEWORK_PATH',
      config.stack_profile,
      config.resource_state.agents
    );

    if (needsRegen.length === 0) {
      console.log('✅ All agents have correct skills linked');
      process.exit(0);
    }

    console.log('⚠️  Found ' + needsRegen.length + ' agent(s) with missing skills:');
    console.log('');

    for (const info of needsRegen) {
      console.log('Agent: ' + info.agent);
      console.log('  Missing skills: ' + info.missingSkills.join(', '));
      console.log('');
    }

    console.log('Regenerating affected agents...');
    console.log('');

    let regenerated = 0;
    for (const info of needsRegen) {
      try {
        const result = await regenerateSingleAgent(info.agent, '$PROJECT_PATH', '$FRAMEWORK_PATH');
        if (result.success) {
          console.log('  ✓ Regenerated: ' + info.agent);
          regenerated++;
        } else {
          console.log('  ✗ Failed: ' + info.agent + ' - ' + result.error);
        }
      } catch (error) {
        console.log('  ✗ Error: ' + info.agent + ' - ' + error.message);
      }
    }

    console.log('');
    console.log('✅ Regenerated ' + regenerated + ' agent(s)');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done"
echo ""
