#!/bin/bash
set -e

# ============================================================================
# migrate-to-persistent-config.sh
# ============================================================================
#
# Migrates existing .claude/ directories to use persistent configuration.
# This script is for projects that were initialized before the persistent
# config feature was added.
#
# What it does:
# 1. Detects legacy .claude without framework-config.json
# 2. Runs stack detection to rebuild stack profile
# 3. Catalogs existing skills/agents (marks them as user-managed to preserve)
# 4. Generates minimal config with "migrated" hashes
# 5. Prompts user to run sync to update resources
#
# Usage:
#   ./scripts/migrate-to-persistent-config.sh <project-path> [framework-path]
#
# Examples:
#   ./scripts/migrate-to-persistent-config.sh ~/my-project
#   ./scripts/migrate-to-persistent-config.sh ~/my-project ~/ai-framework
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

echo "🔄 Migrate to Persistent Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project:   $PROJECT_PATH"
echo "  Framework: $FRAMEWORK_PATH"
echo ""

# ============================================================================
# STEP 1: Detect Legacy Setup
# ============================================================================

echo "Step 1: Detecting project setup..."

if [ ! -d "$PROJECT_PATH/.claude" ]; then
  echo "❌ Error: No .claude directory found"
  echo ""
  echo "This project has not been initialized with the framework."
  echo "Run initialize-project instead of migration."
  exit 1
fi

CONFIG_FILE="$PROJECT_PATH/.claude/framework-config.json"
if [ -f "$CONFIG_FILE" ]; then
  echo "ℹ️  Project already has persistent configuration"
  echo ""
  echo "This project does not need migration."
  echo "Use sync-framework-resources.sh to sync updates."
  exit 0
fi

echo "✓ Legacy .claude directory detected (no framework-config.json)"
echo ""

# ============================================================================
# STEP 2: Stack Detection
# ============================================================================

echo "Step 2: Running stack detection..."

mkdir -p "$PROJECT_PATH/.claude-temp"

node "$FRAMEWORK_PATH/utils/stack-detection.js" "$PROJECT_PATH" > "$PROJECT_PATH/.claude-temp/stack-profile.json"

if [ ! -f "$PROJECT_PATH/.claude-temp/stack-profile.json" ]; then
  echo "❌ Error: Stack detection failed"
  exit 1
fi

echo "✓ Stack profile generated"
echo ""

# ============================================================================
# STEP 3: Catalog Existing Resources
# ============================================================================

echo "Step 3: Cataloging existing resources..."

CATALOG_RESULT=$(node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function hashDirectory(dirPath) {
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  walk(dirPath);
  files.sort();
  const combined = files.map(f => fs.readFileSync(f, 'utf-8')).join('');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

const projectPath = '$PROJECT_PATH';
const skillsDir = path.join(projectPath, '.claude', 'skills');
const agentsDir = path.join(projectPath, '.claude', 'agents');

const result = {
  skills: {},
  agents: {}
};

// Catalog skills
if (fs.existsSync(skillsDir)) {
  const categories = fs.readdirSync(skillsDir).filter(f =>
    fs.statSync(path.join(skillsDir, f)).isDirectory()
  );

  for (const category of categories) {
    const categoryPath = path.join(skillsDir, category);
    const skills = fs.readdirSync(categoryPath).filter(f =>
      fs.statSync(path.join(categoryPath, f)).isDirectory()
    );

    for (const skill of skills) {
      const skillPath = path.join(categoryPath, skill);
      const skillKey = category + '/' + skill;

      result.skills[skillKey] = {
        source_path: 'skills/' + category + '/' + skill,
        copied_timestamp: new Date().toISOString(),
        source_hash: 'migrated',
        file_hash: hashDirectory(skillPath),
        managed_by_framework: (category !== 'project-context'),
        user_modified: false,
        last_sync: new Date().toISOString()
      };
    }
  }
}

// Catalog agents
if (fs.existsSync(agentsDir)) {
  const agents = fs.readdirSync(agentsDir).filter(f =>
    f.endsWith('.md') && f !== 'INDEX.md'
  );

  for (const agentFile of agents) {
    const agentName = agentFile.replace('.md', '');
    const agentPath = path.join(agentsDir, agentFile);

    let templatePath = 'agents/templates/';
    if (agentName === 'planner') {
      templatePath += 'planner.template.md';
    } else if (agentName.startsWith('implementer-')) {
      templatePath += 'implementer.template.md';
    } else if (agentName.startsWith('tester-unit-')) {
      templatePath += 'tester-unit.template.md';
    } else if (agentName.startsWith('tester-e2e-')) {
      templatePath += 'tester-e2e.template.md';
    } else if (agentName.startsWith('security-reviewer-')) {
      templatePath += 'security-reviewer.template.md';
    } else if (agentName === 'visual-verifier') {
      templatePath += 'visual-verifier.template.md';
    } else if (agentName === 'doc-updater') {
      templatePath += 'doc-updater.template.md';
    } else {
      templatePath = 'unknown';
    }

    let category = 'unknown';
    if (agentName === 'planner') category = 'planning';
    else if (agentName.startsWith('implementer-')) category = 'implementation';
    else if (agentName.startsWith('tester-')) category = 'testing';
    else if (agentName.startsWith('security-reviewer-')) category = 'review';
    else if (agentName === 'visual-verifier') category = 'verification';
    else if (agentName === 'doc-updater') category = 'documentation';

    const language = agentName.includes('-') ? agentName.split('-')[1] : null;

    result.agents[agentName] = {
      template_path: templatePath,
      generated_timestamp: new Date().toISOString(),
      template_hash: 'migrated',
      file_hash: hashFile(agentPath),
      managed_by_framework: true,
      user_modified: false,
      language: language,
      category: category,
      last_sync: new Date().toISOString()
    };
  }
}

console.log(JSON.stringify(result));
")

SKILLS_COUNT=$(echo "$CATALOG_RESULT" | node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync(0, 'utf-8')).skills).length)")
AGENTS_COUNT=$(echo "$CATALOG_RESULT" | node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync(0, 'utf-8')).agents).length)")

echo "  ✓ Cataloged $SKILLS_COUNT skills"
echo "  ✓ Cataloged $AGENTS_COUNT agents"
echo ""

# ============================================================================
# STEP 4: Generate Configuration
# ============================================================================

echo "Step 4: Generating framework configuration..."

node -e "
const fs = require('fs');
const path = require('path');
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');

async function main() {
  try {
    const stackProfile = JSON.parse(fs.readFileSync('$PROJECT_PATH/.claude-temp/stack-profile.json', 'utf-8'));
    const catalog = $CATALOG_RESULT;

    const configUpdater = new ConfigUpdater('$PROJECT_PATH', '$FRAMEWORK_PATH');

    const packageJsonPath = path.join('$FRAMEWORK_PATH', 'package.json');
    let frameworkVersion = '2.0.0';
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      frameworkVersion = packageJson.version || '2.0.0';
    }

    const config = {
      schema_version: '1.0.0',
      framework_version: frameworkVersion,
      project_metadata: {
        project_path: path.resolve('$PROJECT_PATH'),
        last_analysis: new Date().toISOString(),
        initialization_hash: configUpdater.generateProjectHash()
      },
      analysis_results: {
        phase1_analysis: {
          structure_architecture: {
            agent_name: 'migrated',
            timestamp: new Date().toISOString(),
            findings: { note: 'Migrated from legacy setup' },
            confidence: 'high'
          },
          tech_stack_dependencies: {
            agent_name: 'migrated',
            timestamp: new Date().toISOString(),
            findings: { note: 'Migrated from legacy setup' },
            confidence: 'high'
          },
          code_patterns_testing: {
            agent_name: 'migrated',
            timestamp: new Date().toISOString(),
            findings: { note: 'Migrated from legacy setup' },
            confidence: 'high'
          },
          data_flows_integrations: {
            agent_name: 'migrated',
            timestamp: new Date().toISOString(),
            findings: { note: 'Migrated from legacy setup' },
            confidence: 'high'
          }
        },
        phase2_consolidation: {
          gaps_identified: [],
          consolidation_timestamp: new Date().toISOString(),
          validation_status: 'valid'
        },
        phase3_synthesis: {
          synthesis_timestamp: new Date().toISOString(),
          project_understanding: { note: 'Migrated from legacy setup' }
        },
        phase4_context: {
          context_generation_timestamp: new Date().toISOString(),
          files_generated: [
            '.claude/CLAUDE.md',
            '.claude/skills/project-context/SKILL.md'
          ]
        }
      },
      stack_profile: {
        languages: stackProfile.languages || [],
        primary_language: stackProfile.primary_language || null,
        frameworks: stackProfile.frameworks || { frontend: [], backend: [], mobile: [] },
        testing_frameworks: stackProfile.testing_frameworks || {},
        detected_workspaces: stackProfile.detected_workspaces || [],
        file_counts: stackProfile.file_counts || {}
      },
      resource_state: {
        skills: catalog.skills,
        agents: catalog.agents,
        commands: {},
        last_sync: new Date().toISOString()
      }
    };

    const validation = await configUpdater.validateConfig(config);
    if (!validation.valid) {
      console.error('Config validation failed:', JSON.stringify(validation.errors, null, 2));
      process.exit(1);
    }

    await configUpdater.writeConfig(config);

    console.log('✓ Framework configuration generated');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
"

if [ $? -ne 0 ]; then
  echo "❌ Error: Configuration generation failed"
  exit 1
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MIGRATION COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Your project has been migrated to persistent configuration"
echo ""
echo "What was done:"
echo "  - Stack profile regenerated"
echo "  - $SKILLS_COUNT skills cataloged"
echo "  - $AGENTS_COUNT agents cataloged"
echo "  - framework-config.json created"
echo ""
echo "What's preserved:"
echo "  - All existing skills and agents remain unchanged"
echo "  - project-context skill marked as user-managed (never updated)"
echo "  - All resources marked with 'migrated' hashes"
echo ""
echo "Next steps:"
echo "  1. Review .claude/framework-config.json"
echo "  2. Run sync to update resources to latest versions:"
echo "     $FRAMEWORK_PATH/scripts/sync-framework-resources.sh $PROJECT_PATH"
echo "  3. Add .claude-temp/ and .claude-backups/ to .gitignore"
echo ""
echo "Notes:"
echo "  - Sync will detect which resources need updates"
echo "  - User-modified resources will be preserved"
echo "  - Backups are created before any changes"
echo ""

exit 0
