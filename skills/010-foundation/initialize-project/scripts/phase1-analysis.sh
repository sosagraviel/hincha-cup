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

# Track background PIDs for cleanup
BACKGROUND_PIDS=()
CLEANUP_IN_PROGRESS=false

# Signal handler for CTRL+C - kill all background jobs
cleanup() {
    if [ "$CLEANUP_IN_PROGRESS" = true ]; then
        return
    fi
    CLEANUP_IN_PROGRESS=true

    echo ""
    echo "Phase 1 interrupted. Stopping agents..."

    # Kill all tracked background processes
    for pid in "${BACKGROUND_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            # Kill the entire process group of each background job
            kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
        fi
    done

    # Also kill any remaining jobs
    jobs -p | xargs -r kill -TERM 2>/dev/null

    exit 130
}

trap cleanup SIGINT SIGTERM

echo "Phase 1: Analyzer Agents with Retry"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

# ============================================================================
# CHECK/INSTALL DEPENDENCIES
# ============================================================================

echo "Checking dependencies..."

# Get the framework root directory (parent of skills/010-foundation/initialize-project)
FRAMEWORK_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"

# Check if ajv is installed in framework directory
cd "$FRAMEWORK_ROOT"

if ! node -e "require('ajv')" 2>/dev/null || ! node -e "require('ajv-formats')" 2>/dev/null; then
  echo "Installing validation dependencies in framework directory..."
  echo "  Location: $FRAMEWORK_ROOT"
  npm install --no-save ajv ajv-formats 2>&1 | grep -E "^(\+|added)" || true
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# Return to project directory
cd "$PROJECT_PATH"

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

# ============================================================================
# RUN AGENTS IN PARALLEL
# ============================================================================

echo "Launching 4 agents in parallel..."
echo ""

# Function to run a single agent with retry logic
run_agent() {
  local agent_file="$1"
  local AGENT_PATH="$AGENTS_DIR/$agent_file"
  local AGENT_NAME=$(basename "$agent_file" .md)

  if [ ! -f "$AGENT_PATH" ]; then
    echo "✗ Agent file not found: $AGENT_PATH"
    return 1
  fi

  printf "═══════════════════════════════════════════════════════════\nAgent: $AGENT_NAME (running in parallel)\n═══════════════════════════════════════════════════════════\n"

  local AGENT_CONTENT=$(cat "$AGENT_PATH")
  local attempt=1
  local SUCCESS=false

  while [ $attempt -le $MAX_ATTEMPTS ]; do
    echo "[$AGENT_NAME] Attempt $attempt of $MAX_ATTEMPTS..."

    local OUTPUT_FILE="$OUTPUT_DIR/${AGENT_NAME}-attempt${attempt}.json"
    local ERROR_FILE="$OUTPUT_DIR/${AGENT_NAME}-attempt${attempt}.err"
    local FEEDBACK=""

    # Add feedback from previous attempt
    if [ $attempt -gt 1 ]; then
      local PREV_VALIDATION="$OUTPUT_DIR/${AGENT_NAME}-validation-attempt$((attempt-1)).log"

      if [ -f "$PREV_VALIDATION" ]; then
        echo "[$AGENT_NAME] Including validation feedback from previous attempt..."
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
    local PROMPT="You are the $AGENT_NAME agent.

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
    # Use --foreground to ensure SIGINT propagates properly to claude process
    if timeout --foreground 300s claude --model sonnet --dangerously-skip-permissions <<< "$PROMPT" > "$OUTPUT_FILE" 2> "$ERROR_FILE"; then

      # Clean output (extract JSON if wrapped)
      local temp_file="${OUTPUT_FILE}.cleaned"

      if grep -q '```json' "$OUTPUT_FILE"; then
        echo "[$AGENT_NAME] Extracting JSON from markdown block..."
        sed -n '/```json/,/```/p' "$OUTPUT_FILE" | sed '1d;$d' > "$temp_file"
      else
        # Find first { and extract from there
        local first_brace=$(grep -n '^{' "$OUTPUT_FILE" | head -1 | cut -d: -f1)
        if [ -n "$first_brace" ]; then
          echo "[$AGENT_NAME] Extracting JSON from line $first_brace..."
          tail -n +$first_brace "$OUTPUT_FILE" > "$temp_file"
        else
          cp "$OUTPUT_FILE" "$temp_file"
        fi
      fi

      # Validate with schema
      local VALIDATION_LOG="$OUTPUT_DIR/${AGENT_NAME}-validation-attempt${attempt}.log"

      if node "$VALIDATOR" "$temp_file" "phase1-analysis" "$SCHEMA_DIR" > "$VALIDATION_LOG" 2>&1; then
        echo "[$AGENT_NAME] ✓ Validation passed!"

        # Copy successful output to final location
        mv "$temp_file" "$OUTPUT_DIR/${AGENT_NAME}.json"
        SUCCESS=true
        break
      else
        echo "[$AGENT_NAME] ✗ Validation failed"
        echo ""
        head -20 "$VALIDATION_LOG" | sed "s/^/[$AGENT_NAME]   /"
        echo ""
        rm "$temp_file"

        if [ $attempt -lt $MAX_ATTEMPTS ]; then
          echo "[$AGENT_NAME] Will retry with validation feedback..."
          sleep $((attempt * 2))  # Exponential backoff: 2s, 4s, 6s, 8s, 10s
        fi
      fi
    else
      echo "[$AGENT_NAME] ✗ Agent execution failed or timed out"

      if [ -s "$ERROR_FILE" ]; then
        echo "[$AGENT_NAME] Error output:"
        head -10 "$ERROR_FILE" | sed "s/^/[$AGENT_NAME]   /"
      fi

      if [ $attempt -lt $MAX_ATTEMPTS ]; then
        echo "[$AGENT_NAME] Will retry..."
        sleep $((attempt * 2))
      fi
    fi

    attempt=$((attempt + 1))
  done

  if [ "$SUCCESS" = true ]; then
    echo "[$AGENT_NAME] ✓ Completed successfully (attempts: $((attempt - 1)))"
    echo ""
    return 0
  else
    echo "[$AGENT_NAME] ✗ Failed after $MAX_ATTEMPTS attempts"
    echo ""
    return 1
  fi
}

# Export function and variables for parallel execution
export -f run_agent
export PROJECT_PATH AGENTS_DIR OUTPUT_DIR MAX_ATTEMPTS VALIDATOR SCHEMA_DIR TEMP_DIR SKILL_DIR

# Launch all agents in parallel
pids=()
for agent_file in "${AGENTS[@]}"; do
  run_agent "$agent_file" &
  pids+=($!)
  BACKGROUND_PIDS+=($!)
done

# Wait for all agents to complete
echo "Waiting for all 4 agents to complete..."
echo ""

ALL_SUCCESS=true
for i in "${!pids[@]}"; do
  pid=${pids[$i]}
  agent_file=${AGENTS[$i]}
  agent_name=$(basename "$agent_file" .md)

  if wait $pid; then
    echo "✓ $agent_name completed successfully"
  else
    echo "✗ $agent_name failed"
    ALL_SUCCESS=false
  fi
done

echo ""

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
