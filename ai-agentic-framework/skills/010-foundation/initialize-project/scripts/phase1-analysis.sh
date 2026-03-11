#!/bin/bash
set -e

# ============================================================================
# PHASE 1: PARALLEL ANALYSIS
# ============================================================================
# Launches 4 analyzer agents in parallel to analyze the project
# Each agent has a specific focus area:
#   1. Structure & Architecture
#   2. Tech Stack & Dependencies
#   3. Code Patterns & Testing
#   4. Data Flows & Integrations
#
# NOTE: This script is designed to be executed by Claude Code, not directly.
# Claude Code will read this script and perform the actions using its tools.
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$SKILL_DIR/agents"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  echo "Usage: phase1-analysis.sh <project-path> <temp-dir>"
  exit 1
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "Error: Project path does not exist: $PROJECT_PATH"
  exit 1
fi

# Create output directory
mkdir -p "$TEMP_DIR/phase1-outputs"

echo "Phase 1: Parallel Analysis"
echo "  Project: $PROJECT_PATH"
echo "  Output:  $TEMP_DIR/phase1-outputs"
echo ""

# ============================================================================
# AGENT DEFINITIONS
# ============================================================================
# Claude Code should read these agent files and launch them in parallel

AGENTS=(
  "01-structure-architecture.md"
  "02-tech-stack-dependencies.md"
  "03-code-patterns-testing.md"
  "04-data-flows-integrations.md"
)

echo "Agents to launch:"
for agent in "${AGENTS[@]}"; do
  echo "  - $AGENTS_DIR/$agent"
done
echo ""

# ============================================================================
# INSTRUCTIONS FOR CLAUDE CODE
# ============================================================================
# The following is a structured instruction set for Claude Code to execute:

cat <<'INSTRUCTIONS'
{
  "phase": "1",
  "action": "launch_agents_parallel",
  "agents": [
    {
      "file": "agents/01-structure-architecture.md",
      "output_file": "phase1-outputs/01-structure-architecture.json",
      "description": "Analyze project structure and architecture"
    },
    {
      "file": "agents/02-tech-stack-dependencies.md",
      "output_file": "phase1-outputs/02-tech-stack-dependencies.json",
      "description": "Analyze tech stack and dependencies"
    },
    {
      "file": "agents/03-code-patterns-testing.md",
      "output_file": "phase1-outputs/03-code-patterns-testing.json",
      "description": "Analyze code patterns and testing"
    },
    {
      "file": "agents/04-data-flows-integrations.md",
      "output_file": "phase1-outputs/04-data-flows-integrations.json",
      "description": "Analyze data flows and integrations"
    }
  ],
  "validation": {
    "schema": "config/schemas/phase1-analysis.schema.json",
    "validator": "utils/validators/validate-agent-output.js"
  },
  "next_steps": [
    "Wait for all 4 agents to complete",
    "Validate each agent output against schema",
    "Save validated outputs to temp directory",
    "If validation fails, apply auto-repair",
    "If auto-repair fails, retry with feedback (max 3 attempts)",
    "If all retries fail, abort with error"
  ]
}
INSTRUCTIONS

# ============================================================================
# VALIDATION STEP (after agents complete)
# ============================================================================

echo ""
echo "Validation will run after agents complete..."
echo ""

# Note: The actual validation is performed by Claude Code after agent execution
# This script provides the structure and instructions

# Check if outputs exist (this would be run after Claude Code executes agents)
VALIDATION_FAILED=0
for agent in "${AGENTS[@]}"; do
  OUTPUT_FILE="$TEMP_DIR/phase1-outputs/${agent%.md}.json"

  if [ -f "$OUTPUT_FILE" ]; then
    echo "✓ Output found: $OUTPUT_FILE"

    # Validate using validator (Claude Code would do this)
    # node "$SKILL_DIR/utils/validators/validate-agent-output.js" \
    #   "$OUTPUT_FILE" \
    #   "phase1-analysis" \
    #   "$SKILL_DIR/config/schemas"
  else
    echo "✗ Output missing: $OUTPUT_FILE"
    VALIDATION_FAILED=1
  fi
done

if [ $VALIDATION_FAILED -eq 1 ]; then
  echo ""
  echo "Error: Some agent outputs are missing"
  exit 1
fi

echo ""
echo "Phase 1 complete!"
echo "  All 4 agents completed successfully"
echo "  Outputs saved to: $TEMP_DIR/phase1-outputs/"
echo ""

exit 0
