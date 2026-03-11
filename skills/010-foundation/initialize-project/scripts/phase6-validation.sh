#!/bin/bash
set -e

# Phase 6: Final Validation - Pure bash validation
PROJECT_PATH="$1"

echo "Phase 6: Final Validation"

# Validate files exist and are correct format
[ -f "$PROJECT_PATH/.claude/CLAUDE.md" ] && echo "✓ CLAUDE.md exists" || { echo "✗ CLAUDE.md missing"; exit 1; }
[ -f "$PROJECT_PATH/.claude/skills/project-context/SKILL.md" ] && echo "✓ project-context exists" || { echo "✗ project-context missing"; exit 1; }

# Validate agents are .md format
AGENT_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
[ "$AGENT_COUNT" -ge 3 ] && echo "✓ Found $AGENT_COUNT agents" || { echo "✗ Need at least 3 agents"; exit 1; }

# Check for incorrect .json agents
JSON_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
[ "$JSON_COUNT" -eq 0 ] && echo "✓ No JSON agents (correct)" || echo "⚠ Found $JSON_COUNT JSON agents (should be 0)"

echo "✅ Validation complete"
exit 0
