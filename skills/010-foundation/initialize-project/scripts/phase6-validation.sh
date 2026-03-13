#!/bin/bash
set -e

# Phase 6: Final Validation - Pure bash validation with multi-stack support
PROJECT_PATH="$1"
TEMP_DIR="$2"

echo "Phase 6: Final Validation"

# Validate files exist and are correct format
[ -f "$PROJECT_PATH/.claude/CLAUDE.md" ] && echo "✓ CLAUDE.md exists" || { echo "✗ CLAUDE.md missing"; exit 1; }
[ -f "$PROJECT_PATH/.claude/skills/project-context/SKILL.md" ] && echo "✓ project-context exists" || { echo "✗ project-context missing"; exit 1; }

# Validate agents are .md format (planner + at least 1 implementer)
AGENT_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
[ "$AGENT_COUNT" -ge 2 ] && echo "✓ Found $AGENT_COUNT agents" || { echo "✗ Need at least 2 agents (planner + implementer)"; exit 1; }

# Check for incorrect .json agents
JSON_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
[ "$JSON_COUNT" -eq 0 ] && echo "✓ No JSON agents (correct)" || echo "⚠ Found $JSON_COUNT JSON agents (should be 0)"

# Multi-stack validation
if [ -n "$TEMP_DIR" ]; then
  echo ""
  echo "Checking multi-stack coverage..."

  # Check if stack-profile.json exists
  if [ -f "$TEMP_DIR/stack-profile.json" ]; then
    # Count languages with significant code (>10 files)
    LANGUAGES=$(node -e "
      const fs = require('fs');
      const profile = JSON.parse(fs.readFileSync('$TEMP_DIR/stack-profile.json', 'utf-8'));
      const fileCounts = profile.file_counts || {};
      const significant = Object.entries(fileCounts)
        .filter(([lang, count]) => count >= 10)
        .map(([lang]) => lang);
      console.log(JSON.stringify(significant));
    ")

    LANG_COUNT=$(echo "$LANGUAGES" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).length)")

    if [ "$LANG_COUNT" -gt 1 ]; then
      echo "✓ Multi-stack project detected: $LANG_COUNT languages with >10 files"

      # For each language, check if implementer agents exist
      echo "$LANGUAGES" | node -e "
        const fs = require('fs');
        const languages = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
        let allFound = true;

        languages.forEach(lang => {
          const implementerPath = '$PROJECT_PATH/.claude/agents/implementer-' + lang + '.md';

          if (!fs.existsSync(implementerPath)) {
            console.error('  ✗ Missing implementer for ' + lang);
            allFound = false;
          } else {
            console.log('  ✓ implementer-' + lang + '.md');
          }
        });

        if (!allFound) {
          process.exit(1);
        }
      "

      if [ $? -ne 0 ]; then
        echo ""
        echo "❌ CRITICAL: Missing agents for some languages"
        echo "   Multi-stack projects require agents for ALL languages with >10 files"
        exit 1
      fi

      # Validate CLAUDE.md mentions all languages
      echo ""
      echo "Validating CLAUDE.md mentions all languages..."
      echo "$LANGUAGES" | node -e "
        const fs = require('fs');
        const languages = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
        const claudeMd = fs.readFileSync('$PROJECT_PATH/.claude/CLAUDE.md', 'utf-8');
        let allMentioned = true;

        languages.forEach(lang => {
          // Check if language is mentioned (case insensitive)
          const regex = new RegExp(lang, 'i');
          if (!regex.test(claudeMd)) {
            console.error('  ✗ CLAUDE.md does not mention ' + lang);
            allMentioned = false;
          } else {
            console.log('  ✓ CLAUDE.md mentions ' + lang);
          }
        });

        if (!allMentioned) {
          console.error('');
          console.error('⚠ WARNING: CLAUDE.md should document ALL significant languages');
        }
      "
    else
      echo "✓ Single-stack project (1 language)"
    fi
  else
    echo "⚠ stack-profile.json not found, skipping multi-stack validation"
  fi
fi

echo ""
echo "✅ Validation complete"
exit 0
