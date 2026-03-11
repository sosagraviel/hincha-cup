#!/bin/bash
# Integration test runner for initialize-project skill (Phases 1-4)
# Tests the complete analysis → consolidation → synthesis → file writing pipeline

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="$SCRIPT_DIR/integration/initialize-project/projects"
SKILL_DIR="$SCRIPT_DIR/../skills/010-foundation/initialize-project"
AGENTS_DIR="$SKILL_DIR/agents"
HELPERS_DIR="$SKILL_DIR/scripts/helpers"
VALIDATOR="$SKILL_DIR/utils/validators/validate-agent-output.js"
SCHEMA_DIR="$SKILL_DIR/config/schemas"
SYNTHESIS_VALIDATOR="$SKILL_DIR/utils/validators/validate-synthesis.js"
VALIDATION_CONFIG="$SKILL_DIR/config/validation-rules.json"
OUTPUT_DIR="/tmp/agent-outputs"
ERROR_DIR="/tmp/agent-errors"
TEST_TEMP_DIR="/tmp/integration-test-temp"

mkdir -p "$OUTPUT_DIR" "$ERROR_DIR" "$TEST_TEMP_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Initialize-Project Integration Tests (Phases 1-4)      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get projects
PROJECTS=($(ls -d "$PROJECTS_DIR"/*/ 2>/dev/null | xargs -n 1 basename))
echo "Projects: ${PROJECTS[@]}"
echo ""

# ============================================================================
# PHASE 1: ANALYZER AGENTS
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 1: Running Analyzer Agents${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Arrays to track background processes
declare -a PIDS
declare -a TEST_NAMES
declare -a OUTPUT_FILES
declare -a ERROR_FILES

# Launch all agents in parallel
idx=0
for project in "${PROJECTS[@]}"; do
    PROJECT_PATH="$PROJECTS_DIR/$project"
    PROJECT_TEMP="$TEST_TEMP_DIR/$project"
    mkdir -p "$PROJECT_TEMP/phase1-outputs"

    for agent_file in "$AGENTS_DIR"/0[1-4]-*.md; do
        [ -f "$agent_file" ] || continue

        AGENT_NUM=$(basename "$agent_file" | cut -d'-' -f1)
        AGENT_NAME=$(basename "$agent_file" .md | cut -d'-' -f2-)
        OUTPUT_FILE="$PROJECT_TEMP/phase1-outputs/${AGENT_NUM}-${AGENT_NAME}.json"
        ERROR_FILE="$ERROR_DIR/agent${AGENT_NUM}-${project}.err"

        test_name="Phase 1: Agent $AGENT_NUM ($AGENT_NAME) on $project"
        echo "Launching: $test_name"

        # Read agent instructions
        AGENT_CONTENT=$(cat "$agent_file")

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
}

=== AGENT INSTRUCTIONS ===
$AGENT_CONTENT"

        # Run agent in background with 5 min timeout
        (
            if timeout 300s claude --model sonnet --dangerously-skip-permissions <<< "$PROMPT" > "$OUTPUT_FILE" 2> "$ERROR_FILE"; then
                exit 0
            else
                exit 1
            fi
        ) &

        PID=$!
        PIDS[$idx]=$PID
        TEST_NAMES[$idx]="$test_name"
        OUTPUT_FILES[$idx]="$OUTPUT_FILE"
        ERROR_FILES[$idx]="$ERROR_FILE"
        idx=$((idx + 1))
    done
done

total=${#PIDS[@]}
echo ""
echo -e "${YELLOW}Waiting for $total agents to complete (5 min timeout each)...${NC}"
echo ""

# Wait for all background processes
phase1_passed=0
phase1_failed=0

for i in "${!PIDS[@]}"; do
    pid=${PIDS[$i]}
    test_name=${TEST_NAMES[$i]}
    output_file=${OUTPUT_FILES[$i]}
    error_file=${ERROR_FILES[$i]}

    if wait $pid; then
        # Process succeeded, validate output
        if [ ! -s "$output_file" ] || [ "$(wc -c < "$output_file")" -lt 10 ]; then
            echo -e "${RED}✗${NC} $test_name (empty output)"
            phase1_failed=$((phase1_failed + 1))
            if [ -s "$error_file" ]; then
                echo -e "${RED}  Error:${NC}"
                head -20 "$error_file" | sed 's/^/    /'
            fi
        else
            # Try to extract JSON from markdown or clean preamble
            temp_file="${output_file}.cleaned"

            if grep -q '```json' "$output_file"; then
                sed -n '/```json/,/```/p' "$output_file" | sed '1d;$d' > "$temp_file"
            else
                first_brace=$(grep -n '^{' "$output_file" | head -1 | cut -d: -f1)
                if [ -n "$first_brace" ]; then
                    tail -n +$first_brace "$output_file" > "$temp_file"
                else
                    cp "$output_file" "$temp_file"
                fi
            fi

            # Validate with proper schema validator
            if [ -f "$VALIDATOR" ]; then
                validation_output=$(node "$VALIDATOR" "$temp_file" "phase1-analysis" "$SCHEMA_DIR" 2>&1)
                validation_exit=$?

                if [ $validation_exit -eq 0 ]; then
                    if [ "$temp_file" != "$output_file" ]; then
                        mv "$temp_file" "$output_file"
                        echo -e "${GREEN}✓${NC} $test_name (extracted & validated)"
                    else
                        rm "$temp_file"
                        echo -e "${GREEN}✓${NC} $test_name"
                    fi
                    phase1_passed=$((phase1_passed + 1))
                else
                    rm "$temp_file"
                    echo -e "${RED}✗${NC} $test_name (schema validation failed)"
                    phase1_failed=$((phase1_failed + 1))
                    echo -e "${RED}  Validation error:${NC}"
                    echo "$validation_output" | head -10 | sed 's/^/    /'
                fi
            else
                if jq empty "$temp_file" 2>/dev/null; then
                    mv "$temp_file" "$output_file" 2>/dev/null || rm "$temp_file"
                    echo -e "${GREEN}✓${NC} $test_name (JSON valid, no schema validator)"
                    phase1_passed=$((phase1_passed + 1))
                else
                    rm "$temp_file"
                    echo -e "${RED}✗${NC} $test_name (invalid JSON)"
                    phase1_failed=$((phase1_failed + 1))
                    echo -e "${RED}  First 5 lines:${NC}"
                    head -5 "$output_file" | sed 's/^/    /'
                fi
            fi
        fi
    else
        echo -e "${RED}✗${NC} $test_name (timeout or error)"
        phase1_failed=$((phase1_failed + 1))
        if [ -s "$error_file" ]; then
            echo -e "${RED}  Error:${NC}"
            head -20 "$error_file" | sed 's/^/    /'
        fi
    fi
done

echo ""
echo -e "${BLUE}Phase 1 Summary:${NC} $phase1_passed passed, $phase1_failed failed"
echo ""

if [ $phase1_failed -gt 0 ]; then
    echo -e "${RED}✗ Phase 1 failed, aborting subsequent phases${NC}"
    exit 1
fi

# ============================================================================
# PHASE 2: CONSOLIDATION
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 2: Consolidating Analyses${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

phase2_passed=0
phase2_failed=0

for project in "${PROJECTS[@]}"; do
    PROJECT_TEMP="$TEST_TEMP_DIR/$project"

    test_name="Phase 2: Consolidation for $project"
    echo "Running: $test_name"

    # Check all Phase 1 outputs exist
    CONSOLIDATION_FILE="$PROJECT_TEMP/consolidation.json"
    AGENT_FILES=(
        "$PROJECT_TEMP/phase1-outputs/01-structure-architecture.json"
        "$PROJECT_TEMP/phase1-outputs/02-tech-stack-dependencies.json"
        "$PROJECT_TEMP/phase1-outputs/03-code-patterns-testing.json"
        "$PROJECT_TEMP/phase1-outputs/04-data-flows-integrations.json"
    )

    all_exist=true
    for f in "${AGENT_FILES[@]}"; do
        if [ ! -f "$f" ]; then
            echo -e "${RED}✗${NC} $test_name (missing input: $(basename $f))"
            phase2_failed=$((phase2_failed + 1))
            all_exist=false
            break
        fi
    done

    if [ "$all_exist" = false ]; then
        continue
    fi

    # Run merge
    if node "$HELPERS_DIR/merge-analyses.js" "$CONSOLIDATION_FILE" "${AGENT_FILES[@]}" 2>&1 | tee "$ERROR_DIR/phase2-$project.log"; then
        if [ -f "$CONSOLIDATION_FILE" ] && jq empty "$CONSOLIDATION_FILE" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $test_name"
            phase2_passed=$((phase2_passed + 1))
        else
            echo -e "${RED}✗${NC} $test_name (invalid output)"
            phase2_failed=$((phase2_failed + 1))
        fi
    else
        echo -e "${RED}✗${NC} $test_name (merge failed)"
        phase2_failed=$((phase2_failed + 1))
    fi
done

echo ""
echo -e "${BLUE}Phase 2 Summary:${NC} $phase2_passed passed, $phase2_failed failed"
echo ""

if [ $phase2_failed -gt 0 ]; then
    echo -e "${RED}✗ Phase 2 failed, aborting subsequent phases${NC}"
    exit 1
fi

# ============================================================================
# PHASE 3: SYNTHESIS (Opus Agent) - Run in Parallel
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 3: Running Synthesizer Agent${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

SYNTHESIZER_AGENT="$AGENTS_DIR/05-architect-synthesizer.md"

if [ ! -f "$SYNTHESIZER_AGENT" ]; then
    echo -e "${RED}✗ Synthesizer agent not found: $SYNTHESIZER_AGENT${NC}"
    exit 1
fi

# Read agent instructions once
AGENT_CONTENT=$(cat "$SYNTHESIZER_AGENT")

# Arrays to track background synthesis processes
declare -a SYNTH_PIDS
declare -a SYNTH_NAMES
declare -a SYNTH_OUTPUTS
declare -a SYNTH_ERRORS
declare -a SYNTH_CONSOLIDATIONS

# Launch synthesizers in parallel
synth_idx=0
for project in "${PROJECTS[@]}"; do
    PROJECT_TEMP="$TEST_TEMP_DIR/$project"
    PROJECT_PATH="$PROJECTS_DIR/$project"
    CONSOLIDATION_FILE="$PROJECT_TEMP/consolidation.json"
    SYNTHESIS_OUTPUT="$PROJECT_TEMP/synthesis-raw.md"

    test_name="Phase 3: Synthesis for $project"
    echo "Launching: $test_name"

    if [ ! -f "$CONSOLIDATION_FILE" ]; then
        echo -e "${RED}✗${NC} $test_name (consolidation missing)"
        continue
    fi

    # Run synthesizer in background with 10 min timeout (opus is slower)
    (
        CONSOLIDATION_CONTENT=$(cat "$CONSOLIDATION_FILE")

        PROMPT="You are the architect synthesizer agent.

Analyze the project at: $PROJECT_PATH

Use the consolidated analysis below.

Follow ALL instructions in the agent file.

CONSOLIDATED ANALYSIS:
$CONSOLIDATION_CONTENT

=== AGENT INSTRUCTIONS ===
$AGENT_CONTENT"

        if timeout 600s claude --model opus --dangerously-skip-permissions <<< "$PROMPT" > "$SYNTHESIS_OUTPUT" 2> "$ERROR_DIR/phase3-$project.err"; then
            exit 0
        else
            exit 1
        fi
    ) &

    PID=$!
    SYNTH_PIDS[$synth_idx]=$PID
    SYNTH_NAMES[$synth_idx]="$test_name"
    SYNTH_OUTPUTS[$synth_idx]="$SYNTHESIS_OUTPUT"
    SYNTH_ERRORS[$synth_idx]="$ERROR_DIR/phase3-$project.err"
    SYNTH_CONSOLIDATIONS[$synth_idx]="$CONSOLIDATION_FILE"
    synth_idx=$((synth_idx + 1))
done

total_synth=${#SYNTH_PIDS[@]}
echo ""
echo -e "${YELLOW}Waiting for $total_synth synthesizer agents to complete (10 min timeout each)...${NC}"
echo ""

# Wait for all synthesis processes
phase3_passed=0
phase3_failed=0

for i in "${!SYNTH_PIDS[@]}"; do
    pid=${SYNTH_PIDS[$i]}
    test_name=${SYNTH_NAMES[$i]}
    output_file=${SYNTH_OUTPUTS[$i]}
    error_file=${SYNTH_ERRORS[$i]}

    if wait $pid; then
        # Process succeeded, validate output with proper validator
        if [ -s "$output_file" ] && [ "$(wc -c < "$output_file")" -gt 100 ]; then
            # Use proper schema validator (same as phase3-synthesis.sh)
            validation_log="$ERROR_DIR/phase3-validation-$i.log"

            if [ -f "$SYNTHESIS_VALIDATOR" ]; then
                if node "$SYNTHESIS_VALIDATOR" "$output_file" "$VALIDATION_CONFIG" > "$validation_log" 2>&1; then
                    echo -e "${GREEN}✓${NC} $test_name (schema validated)"
                    phase3_passed=$((phase3_passed + 1))
                else
                    echo -e "${RED}✗${NC} $test_name (schema validation failed)"
                    phase3_failed=$((phase3_failed + 1))
                    echo -e "${RED}  Validation errors:${NC}"
                    head -20 "$validation_log" | sed 's/^/    /'
                fi
            else
                # Fallback to header check if validator not found
                if grep -q "# CLAUDE.md Content" "$output_file" && grep -q "# project-context/SKILL.md Content" "$output_file"; then
                    echo -e "${GREEN}✓${NC} $test_name (header check only)"
                    phase3_passed=$((phase3_passed + 1))
                else
                    echo -e "${RED}✗${NC} $test_name (missing required sections)"
                    phase3_failed=$((phase3_failed + 1))
                    echo -e "${RED}  Expected: '# CLAUDE.md Content' and '# project-context/SKILL.md Content'${NC}"
                    echo -e "${RED}  Found sections:${NC}"
                    grep "^# " "$output_file" | head -5 | sed 's/^/    /'
                fi
            fi
        else
            echo -e "${RED}✗${NC} $test_name (output too short or empty)"
            phase3_failed=$((phase3_failed + 1))
        fi
    else
        # Process failed
        echo -e "${RED}✗${NC} $test_name (timeout or error)"
        phase3_failed=$((phase3_failed + 1))
        if [ -s "$error_file" ]; then
            echo -e "${RED}  Error:${NC}"
            head -20 "$error_file" | sed 's/^/    /'
        fi
    fi
done

echo ""
echo -e "${BLUE}Phase 3 Summary:${NC} $phase3_passed passed, $phase3_failed failed"
echo ""

if [ $phase3_failed -gt 0 ]; then
    echo -e "${RED}✗ Phase 3 failed, aborting Phase 4${NC}"
    exit 1
fi

# ============================================================================
# PHASE 4: FILE WRITING & VALIDATION
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 4: Parsing & Validating Output Files${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

phase4_passed=0
phase4_failed=0

for project in "${PROJECTS[@]}"; do
    PROJECT_TEMP="$TEST_TEMP_DIR/$project"
    SYNTHESIS_OUTPUT="$PROJECT_TEMP/synthesis-raw.md"
    CLAUDE_MD="$PROJECT_TEMP/CLAUDE.md"
    PROJECT_CONTEXT="$PROJECT_TEMP/project-context.md"

    test_name="Phase 4: File writing for $project"
    echo "Running: $test_name"

    if [ ! -f "$SYNTHESIS_OUTPUT" ]; then
        echo -e "${RED}✗${NC} $test_name (synthesis output missing)"
        phase4_failed=$((phase4_failed + 1))
        continue
    fi

    # Parse opus output
    if node "$HELPERS_DIR/parse-opus-output.js" "$SYNTHESIS_OUTPUT" "$CLAUDE_MD" "$PROJECT_CONTEXT" 2>&1 | tee "$ERROR_DIR/phase4-$project.log"; then
        # Validate both files exist
        if [ ! -f "$CLAUDE_MD" ]; then
            echo -e "${RED}✗${NC} $test_name (CLAUDE.md not created)"
            phase4_failed=$((phase4_failed + 1))
            continue
        fi

        if [ ! -f "$PROJECT_CONTEXT" ]; then
            echo -e "${RED}✗${NC} $test_name (project-context not created)"
            phase4_failed=$((phase4_failed + 1))
            continue
        fi

        # Validate CLAUDE.md with schema (same validation as phase4-filewriting.sh)
        claude_validation_log="$ERROR_DIR/phase4-claude-$project.log"
        if node "$SYNTHESIS_VALIDATOR" "$CLAUDE_MD" "$VALIDATION_CONFIG" "claude-md-only" > "$claude_validation_log" 2>&1; then
            CLAUDE_MD_LINES=$(wc -l < "$CLAUDE_MD")
            claude_valid=true
        else
            CLAUDE_MD_LINES=$(wc -l < "$CLAUDE_MD")
            echo -e "${RED}✗${NC} $test_name (CLAUDE.md schema validation failed)"
            phase4_failed=$((phase4_failed + 1))
            echo -e "${RED}  Validation errors:${NC}"
            head -10 "$claude_validation_log" | sed 's/^/    /'
            continue
        fi

        # Validate project-context with schema (same validation as phase4-filewriting.sh)
        context_validation_log="$ERROR_DIR/phase4-context-$project.log"
        if node "$SYNTHESIS_VALIDATOR" "$PROJECT_CONTEXT" "$VALIDATION_CONFIG" "project-context-only" > "$context_validation_log" 2>&1; then
            CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT")
            echo -e "${GREEN}✓${NC} $test_name (CLAUDE.md: $CLAUDE_MD_LINES lines, project-context: $CONTEXT_LINES lines)"
            phase4_passed=$((phase4_passed + 1))
        else
            CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT")
            echo -e "${RED}✗${NC} $test_name (project-context schema validation failed)"
            phase4_failed=$((phase4_failed + 1))
            echo -e "${RED}  Validation errors:${NC}"
            head -10 "$context_validation_log" | sed 's/^/    /'
            continue
        fi
    else
        echo -e "${RED}✗${NC} $test_name (parsing failed)"
        phase4_failed=$((phase4_failed + 1))
    fi
done

echo ""
echo -e "${BLUE}Phase 4 Summary:${NC} $phase4_passed passed, $phase4_failed failed"
echo ""

# ============================================================================
# FINAL SUMMARY
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    FINAL SUMMARY                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}Phase 1 (Analyzers):${NC}     $phase1_passed passed, $phase1_failed failed"
echo -e "${BLUE}Phase 2 (Consolidation):${NC} $phase2_passed passed, $phase2_failed failed"
echo -e "${BLUE}Phase 3 (Synthesis):${NC}     $phase3_passed passed, $phase3_failed failed"
echo -e "${BLUE}Phase 4 (File Writing):${NC}  $phase4_passed passed, $phase4_failed failed"
echo ""

total_passed=$((phase1_passed + phase2_passed + phase3_passed + phase4_passed))
total_failed=$((phase1_failed + phase2_failed + phase3_failed + phase4_failed))
total_tests=$((total_passed + total_failed))

echo "────────────────────────────────────────────────────────────"
echo "Total tests: $total_tests"
echo -e "${GREEN}✓ Passed: $total_passed${NC}"
[ $total_failed -gt 0 ] && echo -e "${RED}✗ Failed: $total_failed${NC}" || true
echo ""

if [ $total_failed -eq 0 ]; then
    echo "✓ All tests passed!"
    echo ""
    echo "Test artifacts saved to: $TEST_TEMP_DIR"
    exit 0
else
    echo "✗ $total_failed test(s) failed"
    exit 1
fi
