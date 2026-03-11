#!/bin/bash
set -e

# ============================================================================
# PHASE 5: RESOURCE COPYING
# ============================================================================
# Copies skills, generates agents, and copies commands to project
# Uses validated stack profile and proper skill linking
# ============================================================================

PROJECT_PATH="$1"
FRAMEWORK_PATH="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$FRAMEWORK_PATH" ]; then
  echo "Error: PROJECT_PATH and FRAMEWORK_PATH are required"
  exit 1
fi

echo "Phase 5: Resource Copying"
echo "  Project:   $PROJECT_PATH"
echo "  Framework: $FRAMEWORK_PATH"
echo ""

# ============================================================================
# STEP 1: DETECT STACK PROFILE
# ============================================================================

echo "Step 1: Detecting stack profile..."

STACK_PROFILE="$PROJECT_PATH/.claude-temp/stack-profile.json"

# Use stack detection utility
node -e "
const stackDetection = require('$FRAMEWORK_PATH/ai-agentic-framework/utils/stack-detection.js');
const fs = require('fs');

const profile = stackDetection.detectStack('$PROJECT_PATH');
fs.writeFileSync('$STACK_PROFILE', JSON.stringify(profile, null, 2), 'utf-8');

console.log('Stack detected:');
console.log('  Languages:', profile.languages?.join(', ') || 'none');
console.log('  Frontend:', profile.frontend?.framework || 'none');
console.log('  Backend:', profile.backend?.framework || 'none');
console.log('  Testing:', profile.testing?.framework || 'none');
"

if [ ! -f "$STACK_PROFILE" ]; then
  echo "Error: Stack detection failed"
  exit 1
fi

echo "✓ Stack profile created"
echo ""

# ============================================================================
# STEP 2: LINK SKILLS
# ============================================================================

echo "Step 2: Linking skills..."

# Use skill linking utility with validation
node -e "
const skillLinking = require('$FRAMEWORK_PATH/ai-agentic-framework/utils/skill-linking.js');
const fs = require('fs');
const path = require('path');

const stackProfile = JSON.parse(fs.readFileSync('$STACK_PROFILE', 'utf-8'));
const skillRequirements = JSON.parse(
  fs.readFileSync('$SKILL_DIR/config/skill-requirements.json', 'utf-8')
);

console.log('Determining required skills...');

// Get required skills for this stack
const required = [];
const optional = [];

// By language
if (stackProfile.languages) {
  stackProfile.languages.forEach(lang => {
    const langKey = lang.toLowerCase();
    const langSkills = skillRequirements.skills.by_language[langKey];
    if (langSkills) {
      required.push(...(langSkills.required || []));
      optional.push(...(langSkills.optional || []));
    }
  });
}

// By frontend
if (stackProfile.frontend?.framework) {
  const fw = stackProfile.frontend.framework.toLowerCase();
  const fwSkills = skillRequirements.skills.by_frontend_framework[fw];
  if (fwSkills) {
    required.push(...(fwSkills.required || []));
    optional.push(...(fwSkills.optional || []));
  }
}

console.log('  Required skills:', required.length);
console.log('  Optional skills:', optional.length);

// Copy skills
const targetDir = path.join('$PROJECT_PATH', '.claude', 'skills');
fs.mkdirSync(targetDir, { recursive: true });

let copiedCount = 0;
let missingRequired = [];

[...required, ...optional].forEach(skillPath => {
  const sourcePath = path.join('$FRAMEWORK_PATH', 'ai-agentic-framework/skills', skillPath);
  const targetPath = path.join(targetDir, skillPath);

  if (fs.existsSync(sourcePath)) {
    // Copy skill directory
    const targetSkillDir = path.dirname(targetPath);
    fs.mkdirSync(targetSkillDir, { recursive: true });

    // Copy all files in skill directory
    const files = fs.readdirSync(sourcePath);
    files.forEach(file => {
      const src = path.join(sourcePath, file);
      const dst = path.join(targetPath, '..', file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
      }
    });

    copiedCount++;
    console.log('  ✓', skillPath);
  } else {
    if (required.includes(skillPath)) {
      missingRequired.push(skillPath);
      console.log('  ✗ REQUIRED skill missing:', skillPath);
    } else {
      console.log('  ⚠ Optional skill missing:', skillPath);
    }
  }
});

console.log('');
console.log('Skills copied:', copiedCount);

if (missingRequired.length > 0) {
  console.error('');
  console.error('ERROR: Required skills missing:', missingRequired.join(', '));
  process.exit(1);
}
"

SKILL_EXIT_CODE=$?
if [ $SKILL_EXIT_CODE -ne 0 ]; then
  echo "Error: Skill linking failed"
  exit 1
fi

echo "✓ Skills linked"
echo ""

# ============================================================================
# STEP 3: GENERATE AGENTS
# ============================================================================

echo "Step 3: Generating agents..."

# Use agent generation utility
node -e "
const agentGeneration = require('$FRAMEWORK_PATH/ai-agentic-framework/utils/agent-generation.js');
const fs = require('fs');
const path = require('path');

const stackProfile = JSON.parse(fs.readFileSync('$STACK_PROFILE', 'utf-8'));

console.log('Generating agents for stack...');

agentGeneration.generateAgents('$PROJECT_PATH', stackProfile, '$FRAMEWORK_PATH')
  .then(result => {
    console.log('');
    console.log('Agents generated:');
    console.log('  Planning:', result.planning.length);
    console.log('  Implementation:', result.implementation.length);
    console.log('  Testing:', result.testing.length);
    console.log('  Review:', result.review.length);
    console.log('  Total:',
      result.planning.length + result.implementation.length +
      result.testing.length + result.review.length
    );
  })
  .catch(error => {
    console.error('Agent generation failed:', error.message);
    process.exit(1);
  });
"

AGENT_EXIT_CODE=$?
if [ $AGENT_EXIT_CODE -ne 0 ]; then
  echo "Error: Agent generation failed"
  exit 1
fi

echo "✓ Agents generated"
echo ""

# ============================================================================
# STEP 4: COPY COMMANDS
# ============================================================================

echo "Step 4: Copying commands..."

# Copy slash commands
COMMANDS_SOURCE="$FRAMEWORK_PATH/ai-agentic-framework/commands"
COMMANDS_TARGET="$PROJECT_PATH/.claude/commands"

if [ -d "$COMMANDS_SOURCE" ]; then
  mkdir -p "$COMMANDS_TARGET"

  # Copy all .md files
  COPIED_COMMANDS=0
  for cmd_file in "$COMMANDS_SOURCE"/*.md; do
    if [ -f "$cmd_file" ]; then
      cp "$cmd_file" "$COMMANDS_TARGET/"
      COPIED_COMMANDS=$((COPIED_COMMANDS + 1))
    fi
  done

  echo "  Copied $COPIED_COMMANDS commands"
else
  echo "  Warning: Commands directory not found: $COMMANDS_SOURCE"
fi

echo "✓ Commands copied"
echo ""

# ============================================================================
# STEP 5: VALIDATE RESOURCES
# ============================================================================

echo "Step 5: Validating resources..."

# Check skills directory
SKILLS_COUNT=$(find "$PROJECT_PATH/.claude/skills" -name "SKILL.md" | wc -l)
echo "  Skills:   $SKILLS_COUNT"

if [ "$SKILLS_COUNT" -lt 3 ]; then
  echo "Warning: Fewer than 3 skills copied"
fi

# Check agents directory
AGENTS_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" 2>/dev/null | wc -l)
echo "  Agents:   $AGENTS_COUNT"

if [ "$AGENTS_COUNT" -lt 3 ]; then
  echo "Warning: Fewer than 3 agents generated"
fi

# Check commands directory
COMMANDS_COUNT=$(find "$PROJECT_PATH/.claude/commands" -name "*.md" 2>/dev/null | wc -l)
echo "  Commands: $COMMANDS_COUNT"

echo "✓ Resources validated"
echo ""

echo "Phase 5 complete!"
exit 0
