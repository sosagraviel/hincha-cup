# Integration Tests

Integration tests for the ai-agentic-framework.

## Directory Structure

```
tests/
├── README.md                           # This file
├── run-integration-tests.sh            # Main test runner (Phase 1 only)
└── integration/
    └── initialize-project/
        └── projects/                   # Test projects for Phase 1
            ├── go-microservice/        # Go test project
            ├── python-fastapi/         # Python FastAPI test project
            └── simple-api/             # Simple Node.js API test project
```

## Available Tests

### Initialize-Project Phases 1-4: Complete Pipeline

**Command**: `/run-integration-tests` or `bash tests/run-integration-tests.sh`

**What it tests**:
Runs the complete initialize-project pipeline for all test projects:

**Phase 1: Analysis (12 tests)**
- Runs 4 analyzer agents against 3 test projects
- Validates JSON output against schema
- Ensures proper formatting and completeness

Agents tested:
1. `01-structure-architecture` - Analyzes codebase structure and architecture
2. `02-tech-stack-dependencies` - Analyzes tech stack and dependencies
3. `03-code-patterns-testing` - Analyzes code patterns and testing
4. `04-data-flows-integrations` - Analyzes data flows and integrations

**Phase 2: Consolidation (3 tests)**
- Runs `merge-analyses.js` to consolidate all 4 agent outputs
- Validates consolidated JSON structure
- Checks for gaps and conflicts

**Phase 3: Synthesis (3 tests)**
- Runs `05-architect-synthesizer` agent (Opus model)
- Generates CLAUDE.md and project-context content
- Validates required section headers

**Phase 4: File Writing & Validation (3 tests)**
- Runs `parse-opus-output.js` to extract files
- Validates CLAUDE.md (50-300 lines recommended)
- Validates project-context (100-600 lines recommended)

**Test projects**:
- `go-microservice` - Go + Gorilla Mux + JWT REST API
- `python-fastapi` - Python + FastAPI + Poetry async API
- `simple-api` - TypeScript + Express + Jest REST API

**Total**: 21 tests per run (12 + 3 + 3 + 3)

## Phases Not Tested

The following phases are tested indirectly when the full skill is executed end-to-end:

- **Phase 5**: Resources (generates additional files)
- **Phase 6**: Validation (final quality checks)

## Running Tests

```bash
# From project root
./tests/run-integration-tests.sh

# Or use the command
/run-integration-tests
```

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║    Initialize-Project Integration Tests (Phases 1-4)      ║
╚════════════════════════════════════════════════════════════╝

Projects: go-microservice python-fastapi simple-api

═══════════════════════════════════════════════════════════
PHASE 1: Running Analyzer Agents
═══════════════════════════════════════════════════════════

Launching: Phase 1: Agent 01 (structure-architecture) on go-microservice
...
Waiting for 12 agents to complete (5 min timeout each)...

✓ Phase 1: Agent 01 (structure-architecture) on go-microservice
...

Phase 1 Summary: 12 passed, 0 failed

═══════════════════════════════════════════════════════════
PHASE 2: Consolidating Analyses
═══════════════════════════════════════════════════════════

Running: Phase 2: Consolidation for go-microservice
✓ Phase 2: Consolidation for go-microservice
...

Phase 2 Summary: 3 passed, 0 failed

═══════════════════════════════════════════════════════════
PHASE 3: Running Synthesizer Agent
═══════════════════════════════════════════════════════════

Running: Phase 3: Synthesis for go-microservice
✓ Phase 3: Synthesis for go-microservice
...

Phase 3 Summary: 3 passed, 0 failed

═══════════════════════════════════════════════════════════
PHASE 4: Parsing & Validating Output Files
═══════════════════════════════════════════════════════════

Running: Phase 4: File writing for go-microservice
✓ Phase 4: File writing for go-microservice (CLAUDE.md: 127 lines, project-context: 285 lines)
...

Phase 4 Summary: 3 passed, 0 failed

╔════════════════════════════════════════════════════════════╗
║                    FINAL SUMMARY                           ║
╚════════════════════════════════════════════════════════════╝

Phase 1 (Analyzers):     12 passed, 0 failed
Phase 2 (Consolidation): 3 passed, 0 failed
Phase 3 (Synthesis):     3 passed, 0 failed
Phase 4 (File Writing):  3 passed, 0 failed

────────────────────────────────────────────────────────────
Total tests: 21
✓ Passed: 21

✓ All tests passed!

Test artifacts saved to: /tmp/integration-test-temp
```

## Test Validation

**Phase 1 - Analyzer Agents**:
1. JSON format validation
2. Schema compliance (`phase1-analysis.schema.json`)
3. Required fields: `agent_name`, `timestamp`, `findings`, `needs_verification`
4. Non-empty output (minimum size check)

**Phase 2 - Consolidation**:
1. Valid JSON output
2. All 4 agent inputs present
3. Successful merge without errors

**Phase 3 - Synthesis**:
1. Non-empty markdown output
2. Required section headers present: `# CLAUDE.md Content` and `# project-context Content`
3. Minimum content length (>100 bytes)

**Phase 4 - File Writing**:
1. CLAUDE.md created and valid (50-300 lines recommended)
2. project-context created and valid (100-600 lines recommended)
3. Both files non-empty and properly formatted

## Output Location

Test artifacts are organized by project in:
- `/tmp/integration-test-temp/<project>/phase1-outputs/` - Analyzer agent JSON outputs
- `/tmp/integration-test-temp/<project>/consolidation.json` - Merged analysis
- `/tmp/integration-test-temp/<project>/synthesis-raw.md` - Synthesizer raw output
- `/tmp/integration-test-temp/<project>/CLAUDE.md` - Final CLAUDE.md
- `/tmp/integration-test-temp/<project>/project-context.md` - Final project-context
- `/tmp/agent-errors/*.err` - Error logs (if any)

## Adding Test Projects

To add a new test project:

1. Create a new directory under `tests/integration/initialize-project/projects/`
2. Add a realistic codebase structure
3. Tests will automatically run against the new project

Example structure:
```
projects/
└── my-new-project/
    ├── package.json (or go.mod, pyproject.toml, etc.)
    ├── src/
    │   └── ... (source files)
    └── tests/
        └── ... (test files)
```
