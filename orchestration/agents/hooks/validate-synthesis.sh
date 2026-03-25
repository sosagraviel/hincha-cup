#!/bin/bash
set -e

# Validation hook for synthesis agent output
# This hook validates that the synthesis output is in the correct markdown format
# with all required sections and proper structure.

# Read the agent's output
OUTPUT=$(cat)

validate_synthesis() {
  local content="$1"
  local issues=()

  # Check 1: Must be markdown, not JSON
  if [[ "$content" =~ ^[[:space:]]*\{ ]]; then
    issues+=("⚠️ Output must be MARKDOWN format, not JSON")
    issues+=("   You must return the raw markdown content, not a JSON object")
    printf "%s\n" "${issues[@]}"
    return 1
  fi

  # Check 2: Must contain CLAUDE.md section header
  if ! echo "$content" | grep -q "^# CLAUDE\.md Content"; then
    issues+=("⚠️ Missing required section header: \"# CLAUDE.md Content\"")
  fi

  # Check 3: Must contain project-context section header
  if ! echo "$content" | grep -q "^# project-context/SKILL\.md Content"; then
    issues+=("⚠️ Missing required section header: \"# project-context/SKILL.md Content\"")
  fi

  # Check 4: Must contain separator between sections
  if ! echo "$content" | grep -q "^---$"; then
    issues+=("⚠️ Missing separator \"---\" between CLAUDE.md and project-context sections")
  fi

  # Check 5: Extract and validate CLAUDE.md section
  if echo "$content" | grep -q "^# CLAUDE\.md Content"; then
    # Extract CLAUDE.md content (everything between "# CLAUDE.md Content" and "---")
    local claude_content=$(echo "$content" | awk '/^# CLAUDE\.md Content/,/^---$/{if (!/^# CLAUDE\.md Content/ && !/^---$/) print}')
    local claude_lines=$(echo "$claude_content" | wc -l | tr -d ' ')

    # Must have reasonable length (30-250 lines)
    if [ "$claude_lines" -lt 30 ]; then
      issues+=("⚠️ CLAUDE.md section too short: $claude_lines lines (minimum 30 lines)")
    fi
    if [ "$claude_lines" -gt 250 ]; then
      issues+=("⚠️ CLAUDE.md section too long: $claude_lines lines (maximum 250 lines)")
    fi

    # Must contain important subsections
    if ! echo "$claude_content" | grep -q "^## Tech Stack"; then
      issues+=("⚠️ CLAUDE.md missing required subsection: \"## Tech Stack\"")
    fi
    if ! echo "$claude_content" | grep -q "^## File Placement Guide"; then
      issues+=("⚠️ CLAUDE.md missing required subsection: \"## File Placement Guide\"")
    fi
    if ! echo "$claude_content" | grep -q "^## Essential Commands"; then
      issues+=("⚠️ CLAUDE.md missing required subsection: \"## Essential Commands\"")
    fi
  fi

  # Check 6: Extract and validate project-context section
  if echo "$content" | grep -q "^# project-context/SKILL\.md Content"; then
    # Extract project-context content (everything after "# project-context/SKILL.md Content")
    local context_content=$(echo "$content" | awk '/^# project-context\/SKILL\.md Content/{flag=1; next} flag')
    local context_lines=$(echo "$context_content" | wc -l | tr -d ' ')

    # Must have reasonable length (50-600 lines)
    if [ "$context_lines" -lt 50 ]; then
      issues+=("⚠️ project-context section too short: $context_lines lines (minimum 50 lines)")
    fi
    if [ "$context_lines" -gt 600 ]; then
      issues+=("⚠️ project-context section too long: $context_lines lines (maximum 600 lines)")
    fi

    # Must start with YAML frontmatter
    if ! echo "$context_content" | head -n 1 | grep -q "^---$"; then
      issues+=("⚠️ project-context/SKILL.md must start with YAML frontmatter (---...---)")
    fi
  fi

  # If there are issues, return error message
  if [ "${#issues[@]}" -gt 0 ]; then
    echo ""
    echo "❌ SYNTHESIS OUTPUT VALIDATION FAILED"
    echo ""
    printf "%s\n" "${issues[@]}"
    echo ""
    echo "📋 REQUIRED FORMAT:"
    echo ""
    echo "# CLAUDE.md Content"
    echo ""
    echo "[30-250 lines of markdown content with these subsections:]"
    echo "## Tech Stack"
    echo "## File Placement Guide"
    echo "## Essential Commands"
    echo ""
    echo "---"
    echo ""
    echo "# project-context/SKILL.md Content"
    echo ""
    echo "---"
    echo "[YAML frontmatter here]"
    echo "---"
    echo ""
    echo "[50-600 lines of markdown content]"
    echo ""
    echo "⚠️ CRITICAL: Return MARKDOWN text only, NOT a JSON object!"
    echo ""
    return 1
  fi

  return 0
}

if validate_synthesis "$OUTPUT"; then
  # Validation passed - allow the output
  echo "$OUTPUT"
  exit 0
else
  # Validation failed - block the output
  exit 1
fi
