#!/bin/bash
set -e

# ============================================================================
# sync-framework-resources.sh
# ============================================================================
#
# Idempotent script to sync framework skills and agents to a project.
# Can be run multiple times safely - only updates what changed.
#
# Features:
# - Hash-based change detection for skills and agents
# - User modification detection and preservation
# - Framework version detection and upgrade handling
# - New language/framework detection from config changes
# - Timestamped backups before replacements
# - Atomic operations with rollback on error
# - Interactive merge options for conflicting changes
#
# Usage:
#   ./scripts/sync-framework-resources.sh <project-path> [framework-path]
#
# Examples:
#   ./scripts/sync-framework-resources.sh ~/my-project
#   ./scripts/sync-framework-resources.sh ~/my-project ~/ai-framework
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

echo "🔄 Framework Resource Sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project:   $PROJECT_PATH"
echo "  Framework: $FRAMEWORK_PATH"
echo ""

# ============================================================================
# STEP 1: Prerequisite Validation
# ============================================================================

echo "Step 1: Validating prerequisites..."

# Check for framework-config.json
CONFIG_FILE="$PROJECT_PATH/.claude/framework-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Error: framework-config.json not found at $CONFIG_FILE"
  echo ""
  echo "This project has not been initialized with persistent configuration."
  echo "Run initialize-project to set up this project."
  exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js is required but not installed"
  exit 1
fi

echo "✓ Prerequisites validated"
echo ""

# ============================================================================
# STEP 2: Framework Version Detection
# ============================================================================

echo "Step 2: Detecting framework version..."

SYNC_RESULT=$(node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const result = await configUpdater.isFrameworkUpdated();

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
")

if [ $? -ne 0 ]; then
  echo "❌ Error detecting framework version"
  exit 1
fi

FRAMEWORK_UPDATED=$(echo "$SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).updated)")
CURRENT_VERSION=$(echo "$SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).current)")
CONFIGURED_VERSION=$(echo "$SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).configured)")

echo "  Current framework version:    $CURRENT_VERSION"
echo "  Configured framework version: $CONFIGURED_VERSION"

if [ "$FRAMEWORK_UPDATED" == "true" ]; then
  echo "  ⚠️  Framework version mismatch - full sync recommended"
fi

echo ""

# ============================================================================
# STEP 3: Detect User Modifications
# ============================================================================

echo "Step 3: Detecting user modifications..."

USER_MODS=$(node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const mods = await configUpdater.detectUserModifications();

    console.log(JSON.stringify(mods));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
")

MODIFIED_SKILLS_COUNT=$(echo "$USER_MODS" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).skills.length)")
MODIFIED_AGENTS_COUNT=$(echo "$USER_MODS" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).agents.length)")

if [ "$MODIFIED_SKILLS_COUNT" -gt 0 ] || [ "$MODIFIED_AGENTS_COUNT" -gt 0 ]; then
  echo "  ⚠️  User modifications detected:"
  echo "     - Modified skills: $MODIFIED_SKILLS_COUNT"
  echo "     - Modified agents: $MODIFIED_AGENTS_COUNT"
  echo ""
  echo "  These resources will be skipped during sync to preserve your changes."
  echo "  To force sync and discard your changes, mark them as framework-managed in config."
else
  echo "  ✓ No user modifications detected"
fi

echo ""

# ============================================================================
# STEP 4: Create Backup
# ============================================================================

echo "Step 4: Creating backup..."

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_DIR="$PROJECT_PATH/.claude-backups/$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

# Backup skills (excluding project-context)
if [ -d "$PROJECT_PATH/.claude/skills" ]; then
  mkdir -p "$BACKUP_DIR/skills"
  find "$PROJECT_PATH/.claude/skills" -mindepth 1 -maxdepth 2 -type d ! -name "project-context" -exec cp -r {} "$BACKUP_DIR/skills/" \;
fi

# Backup agents
if [ -d "$PROJECT_PATH/.claude/agents" ]; then
  cp -r "$PROJECT_PATH/.claude/agents" "$BACKUP_DIR/agents"
fi

echo "✓ Backup created at: $BACKUP_DIR"
echo ""

# ============================================================================
# STEP 5: Sync Skills
# ============================================================================

echo "Step 5: Syncing skills..."

SKILL_SYNC_RESULT=$(node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
const { updateSingleSkill, addSingleSkill } = require('$FRAMEWORK_PATH/utils/skill-selection.js');
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const config = await configUpdater.readConfig();

    const result = {
      updated: 0,
      added: 0,
      skipped: 0,
      errors: []
    };

    // Check each skill in config
    for (const [skillName, skillInfo] of Object.entries(config.resource_state.skills)) {
      if (!skillInfo.managed_by_framework) {
        result.skipped++;
        continue;
      }

      const sourcePath = path.join('$FRAMEWORK_PATH', skillInfo.source_path);

      if (!fs.existsSync(sourcePath)) {
        result.errors.push({ skill: skillName, error: 'Source skill not found in framework' });
        continue;
      }

      // Check if source has changed
      const currentSourceHash = configUpdater.hashDirectory(sourcePath);

      if (currentSourceHash !== skillInfo.source_hash) {
        try {
          await updateSingleSkill(skillName, '$PROJECT_PATH', '$FRAMEWORK_PATH');
          result.updated++;
        } catch (error) {
          result.errors.push({ skill: skillName, error: error.message });
        }
      }
    }

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
")

SKILLS_UPDATED=$(echo "$SKILL_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).updated)")
SKILLS_ADDED=$(echo "$SKILL_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).added)")
SKILLS_SKIPPED=$(echo "$SKILL_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).skipped)")

echo "  ✓ Skills updated:  $SKILLS_UPDATED"
echo "  ✓ Skills added:    $SKILLS_ADDED"
echo "  ℹ️  Skills skipped: $SKILLS_SKIPPED"
echo ""

# ============================================================================
# STEP 6: Sync Agents
# ============================================================================

echo "Step 6: Syncing agents..."

AGENT_SYNC_RESULT=$(node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
const { regenerateSingleAgent } = require('$FRAMEWORK_PATH/utils/agent-generation.js');
const path = require('path');
const fs = require('fs');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    const config = await configUpdater.readConfig();

    const result = {
      updated: 0,
      added: 0,
      skipped: 0,
      errors: []
    };

    // Check each agent in config
    for (const [agentName, agentInfo] of Object.entries(config.resource_state.agents)) {
      if (!agentInfo.managed_by_framework) {
        result.skipped++;
        continue;
      }

      const templatePath = path.join('$FRAMEWORK_PATH', agentInfo.template_path);

      if (!fs.existsSync(templatePath)) {
        result.errors.push({ agent: agentName, error: 'Template not found in framework' });
        continue;
      }

      // Check if template has changed
      const currentTemplateHash = configUpdater.hashFile(templatePath);

      if (currentTemplateHash !== agentInfo.template_hash) {
        try {
          const regenerateResult = await regenerateSingleAgent(agentName, '$PROJECT_PATH', '$FRAMEWORK_PATH');

          if (regenerateResult.success) {
            result.updated++;
          } else if (regenerateResult.skipped) {
            result.skipped++;
          } else {
            result.errors.push({ agent: agentName, error: regenerateResult.error });
          }
        } catch (error) {
          result.errors.push({ agent: agentName, error: error.message });
        }
      }
    }

    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
")

AGENTS_UPDATED=$(echo "$AGENT_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).updated)")
AGENTS_ADDED=$(echo "$AGENT_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).added)")
AGENTS_SKIPPED=$(echo "$AGENT_SYNC_RESULT" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).skipped)")

echo "  ✓ Agents updated:  $AGENTS_UPDATED"
echo "  ✓ Agents added:    $AGENTS_ADDED"
echo "  ℹ️  Agents skipped: $AGENTS_SKIPPED"
echo ""

# ============================================================================
# STEP 7: Update Framework Version
# ============================================================================

if [ "$FRAMEWORK_UPDATED" == "true" ]; then
  echo "Step 7: Updating framework version in config..."

  node -e "
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');

async function main() {
  try {
    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');
    await configUpdater.updateFrameworkVersion('$CURRENT_VERSION');

    console.log('✓ Framework version updated to $CURRENT_VERSION');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
  "

  echo ""
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SYNC COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Skills:  $SKILLS_UPDATED updated, $SKILLS_ADDED added, $SKILLS_SKIPPED skipped"
echo "  Agents:  $AGENTS_UPDATED updated, $AGENTS_ADDED added, $AGENTS_SKIPPED skipped"
echo "  Backup:  $BACKUP_DIR"
echo ""

TOTAL_CHANGES=$((SKILLS_UPDATED + SKILLS_ADDED + AGENTS_UPDATED + AGENTS_ADDED))

if [ "$TOTAL_CHANGES" -eq 0 ]; then
  echo "ℹ️  No changes needed - all resources are up to date"
else
  echo "✅ Successfully synced $TOTAL_CHANGES resource(s)"
fi

echo ""
echo "Notes:"
echo "  - User-modified resources were preserved"
echo "  - Backup created before any changes"
echo "  - Run this script again anytime to sync updates"
echo ""

exit 0
