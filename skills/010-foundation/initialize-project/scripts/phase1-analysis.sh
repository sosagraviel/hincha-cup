#!/bin/bash
set -e

# ============================================================================
# PHASE 1: ANALYZER AGENTS WITH RETRY
# ============================================================================
# Launches 4 analyzer agents with automatic retry on validation failures
# Each agent gets up to 5 attempts with validation feedback
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 1: Analyzer Agents with Retry"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

AGENTS_DIR="$SKILL_DIR/agents"
VALIDATOR="$SKILL_DIR/utils/validators/validate-agent-output.js"
SCHEMA_DIR="$SKILL_DIR/config/schemas"
OUTPUT_DIR="$TEMP_DIR/phase1-outputs"
mkdir -p "$OUTPUT_DIR"

MAX_ATTEMPTS=5

# Agent files (only Phase 1 analyzers)
AGENTS=(
  "01-structure-architecture.md"
  "02-tech-stack-dependencies.md"
  "03-code-patterns-testing.md"
  "04-data-flows-integrations.md"
)

ALL_SUCCESS=true

for agent_file in "${AGENTS[@]}"; do
  AGENT_PATH="$AGENTS_DIR/$agent_file"
  AGENT_NAME=$(basename "$agent_file" .md)

  if [ ! -f "$AGENT_PATH" ]; then
    echo "✗ Agent file not found: $AGENT_PATH"
    ALL_SUCCESS=false
    continue
  fi

  echo "═══════════════════════════════════════════════════════════"
  echo "Agent: $AGENT_NAME"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  AGENT_CONTENT=$(cat "$AGENT_PATH")
  attempt=1
  SUCCESS=false

  while [ $attempt -le $MAX_ATTEMPTS ]; do
    echo "Attempt $attempt of $MAX_ATTEMPTS..."

    OUTPUT_FILE="$OUTPUT_DIR/${AGENT_NAME}-attempt${attempt}.json"
    ERROR_FILE="$OUTPUT_DIR/${AGENT_NAME}-attempt${attempt}.err"
    FEEDBACK=""

    # Add feedback from previous attempt
    if [ $attempt -gt 1 ]; then
      PREV_VALIDATION="$OUTPUT_DIR/${AGENT_NAME}-validation-attempt$((attempt-1)).log"

      if [ -f "$PREV_VALIDATION" ]; then
        echo "  Including validation feedback from previous attempt..."
        FEEDBACK="

CRITICAL: Your previous attempt failed validation with these errors:

$(cat "$PREV_VALIDATION")

REQUIREMENTS:
- Output ONLY raw JSON starting with { and ending with }
- Do NOT wrap in markdown code blocks
- Do NOT add ANY text before or after the JSON
- Follow the exact schema structure for your agent type
- Ensure all required fields are present

Please fix these issues and provide valid JSON output."
      fi
    fi

    # Create prompt
    PROMPT="You are the $AGENT_NAME agent.

Follow ALL instructions in the agent file below.

Analyze the codebase at: $PROJECT_PATH

CRITICAL OUTPUT FORMAT:
- Output ONLY raw JSON starting with { and ending with }
- Do NOT wrap in markdown code blocks (\`\`\`json)
- Do NOT add ANY text before or after the JSON
- Do NOT add explanatory sentences like \"Here is the output:\" or \"Based on my analysis:\"
- The FIRST character must be { and the LAST character must be }

Required JSON structure:
{
  \"agent_name\": \"string\",
  \"timestamp\": \"ISO 8601 timestamp\",
  \"findings\": {},
  \"needs_verification\": []
}$FEEDBACK

=== AGENT INSTRUCTIONS ===
$AGENT_CONTENT"

    # Run agent with 5 min timeout
    if timeout 300s claude --model sonnet --dangerously-skip-permissions <<< "$PROMPT" > "$OUTPUT_FILE" 2> "$ERROR_FILE"; then

      # Clean output (extract JSON if wrapped)
      temp_file="${OUTPUT_FILE}.cleaned"

      if grep -q '```json' "$OUTPUT_FILE"; then
        echo "  Extracting JSON from markdown block..."
        sed -n '/```json/,/```/p' "$OUTPUT_FILE" | sed '1d;$d' > "$temp_file"
      else
        # Find first { and extract from there
        first_brace=$(grep -n '^{' "$OUTPUT_FILE" | head -1 | cut -d: -f1)
        if [ -n "$first_brace" ]; then
          echo "  Extracting JSON from line $first_brace..."
          tail -n +$first_brace "$OUTPUT_FILE" > "$temp_file"
        else
          cp "$OUTPUT_FILE" "$temp_file"
        fi
      fi

      # Validate with schema
      VALIDATION_LOG="$OUTPUT_DIR/${AGENT_NAME}-validation-attempt${attempt}.log"

      if node "$VALIDATOR" "$temp_file" "phase1-analysis" "$SCHEMA_DIR" > "$VALIDATION_LOG" 2>&1; then
        echo "  ✓ Validation passed!"

        # Copy successful output to final location
        mv "$temp_file" "$OUTPUT_DIR/${AGENT_NAME}.json"
        SUCCESS=true
        break
      else
        echo "  ✗ Validation failed"
        echo ""
        head -20 "$VALIDATION_LOG"
        echo ""
        rm "$temp_file"

        if [ $attempt -lt $MAX_ATTEMPTS ]; then
          echo "  Will retry with validation feedback..."
          sleep $((attempt * 2))  # Exponential backoff: 2s, 4s, 6s, 8s, 10s
        fi
      fi
    else
      echo "  ✗ Agent execution failed or timed out"

      if [ -s "$ERROR_FILE" ]; then
        echo "  Error output:"
        head -10 "$ERROR_FILE" | sed 's/^/    /'
      fi

      if [ $attempt -lt $MAX_ATTEMPTS ]; then
        echo "  Will retry..."
        sleep $((attempt * 2))
      fi
    fi

    attempt=$((attempt + 1))
  done

  if [ "$SUCCESS" = true ]; then
    echo "✓ $AGENT_NAME completed successfully (attempts: $((attempt - 1)))"
    echo ""
  else
    echo "✗ $AGENT_NAME failed after $MAX_ATTEMPTS attempts"
    echo ""
    ALL_SUCCESS=false
  fi
done

if [ "$ALL_SUCCESS" = true ]; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 1 Complete - All Agents Successful                  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Output directory: $OUTPUT_DIR"
  echo "  Validated agents: ${#AGENTS[@]}"
  echo ""
  exit 0
else
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 1 Failed - One or More Agents Failed                ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Check agent outputs in: $OUTPUT_DIR"
  echo "  Review validation logs: $OUTPUT_DIR/*-validation-*.log"
  echo ""
  exit 1
fi
