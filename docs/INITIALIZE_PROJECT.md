# Initialize Project - Comprehensive Documentation

Complete guide to the AI Agentic Framework project initialization system.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Workflow Phases](#workflow-phases)
- [Output Files](#output-files)
- [Validation Criteria](#validation-criteria)
- [Error Handling](#error-handling)
- [Gap Analysis](#gap-analysis)
- [Advanced Usage](#advanced-usage)
- [Standalone Mode](#standalone-mode)
- [CI/CD Integration](#cicd-integration)
- [Debugging](#debugging)
- [References](#references)

## Overview

The Initialize Project system analyzes your codebase and generates:

- `.claude/CLAUDE.md` - Quick reference guide
- `.claude/skills/project-context/SKILL.md` - Deep project knowledge
- `.claude/skills/*` - Language/framework-specific skills
- `.claude/agents/*` - Generated agents for the project
- `.claude/commands/*` - Custom slash commands

### Method

Fully deterministic 6-phase workflow with automatic retry/feedback/validation.

### Key Features

- ✅ **Standalone execution** - No Claude CLI session required
- ✅ **Automatic retry** with validation feedback (up to 5 attempts per phase)
- ✅ **Parallel agent execution** - 4 analysis agents run simultaneously
- ✅ **Deterministic** execution - Can't skip steps
- ✅ **Built-in validation** - Enforced, not optional
- ✅ **Clear error messages** with actionable feedback
- ✅ **Exponential backoff** - Prevents rate limiting
- ✅ **Attempt history** - Full logging for debugging
- ✅ **CI/CD compatible** - Works in automated environments

## Architecture

### Standalone Design

The initialize-project system is designed to run **without requiring an active Claude CLI session**:

```
User → ./scripts/initialize-project.sh (standalone entry point)
     → orchestrate-initialization.sh (6-phase orchestrator)
     → phase1-6 scripts (spawn agents directly)
     → claude --model X --dangerously-skip-permissions (direct agent spawning)
```

**Key Difference from Other Commands:**

- **Other commands**: Require active Claude CLI session to execute
- **Initialize-project**: Standalone bash script, spawns agents directly
- **Agents spawned**: `claude --model sonnet --dangerously-skip-permissions`
- **No circular dependency**: Doesn't require Claude to run Claude

### Workflow Phases

```
orchestrate-initialization.sh
├── phase1-analysis.sh       (4 agents IN PARALLEL, retry/feedback, 5 attempts each)
├── phase2-consolidation.sh  (merge findings, gap analysis)
├── phase3-synthesis.sh      (Opus synthesis, retry/feedback, 5 attempts)
├── phase4-filewriting.sh    (parse & validate, retry/feedback, 5 attempts)
├── phase5-resources.sh  (copy skills/agents/commands, validation)
└── phase6-validation.sh     (final validation, exit on error)
```

## Quick Start

### Setup

```bash
cd /path/to/your-project
git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework
./qubika-agentic-framework/scripts/initialize-project.sh
```

**Duration:** 10-15 minutes

**What it does:**
- Analyzes your codebase (4 parallel agents)
- Generates `.claude/CLAUDE.md` and `.claude/skills/project-context/`
- Installs language-specific skills and agents
- Auto-manages `.gitignore` (`qubika-agentic-framework/`, `.claude-temp/`, `.claude-backups/`)

**What gets committed:**
- `.claude/CLAUDE.md`, `.claude/framework-config.json`, `.claude/skills/`, `.claude/agents/`

**Options:**

```bash
# Skip gap analysis questions
./qubika-agentic-framework/scripts/initialize-project.sh --skip-gap-questions

# Custom timeout (default: 30 minutes)
./qubika-agentic-framework/scripts/initialize-project.sh --timeout 3600

# Clean temp files after completion
./qubika-agentic-framework/scripts/initialize-project.sh --clean

# Re-run from specific phase (skip earlier phases)
./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4
```


## Prerequisites

- **claude CLI** ([install](https://github.com/anthropics/claude-code))
- **Node.js** v14+ with npm
- **bash** v4.0+
- **timeout** (optional, for execution limits)
   - Install on macOS: `brew install coreutils`

### Directory Structure

Your project should be in this structure:

```
your-project/
├── src/           # Your code
├── package.json   # Or other project files
└── qubika-agentic-framework/  # Framework (default location)
    ├── scripts/
    │   └── initialize-project.sh
    ├── skills/
    ├── utils/
    └── ...
```

## Usage

### Command

```bash
./qubika-agentic-framework/scripts/initialize-project.sh [OPTIONS]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--skip-gap-questions` | `false` | Skip gap analysis (CI/CD mode) |
| `--start-phase N` | `1` | Resume from phase N (1-6) |
| `--timeout SECONDS` | `1800` | Max execution time (30 min default) |
| `--clean` | `false` | Remove `.claude-temp/` after completion |

### Common Patterns

```bash
# Standard initialization
./qubika-agentic-framework/scripts/initialize-project.sh

# CI/CD mode (no prompts)
./qubika-agentic-framework/scripts/initialize-project.sh --skip-gap-questions

# Large project (60 min timeout)
./qubika-agentic-framework/scripts/initialize-project.sh --timeout 3600

# Resume from phase 4 (after fixing issues)
./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4
```


## Workflow Phases

### Phase 1: Parallel Analysis

**Duration:** 5-25 minutes (agents run in parallel)

**What it does:**

1. Checks/installs dependencies (`ajv`, `ajv-formats`) automatically
2. Launches 4 analysis agents **in parallel**:
   - Agent 1: Structure & Architecture
   - Agent 2: Tech Stack & Dependencies
   - Agent 3: Code Patterns & Testing
   - Agent 4: Data Flows & Integrations
3. Each agent analyzes different aspects simultaneously
4. Up to 5 retry attempts per agent with validation feedback
5. Validates JSON output against schema
6. Saves validated outputs to `.claude-temp/phase1-outputs/`

**Command:**

```bash
bash phase1-analysis.sh "$PROJECT_PATH" "$TEMP_DIR"
```

**Success criteria:**

- All 4 agents produce valid JSON
- JSON matches schema structure
- No markdown code blocks wrapping JSON
- All required fields present

**Retry logic:**

- Attempt 1: Initial analysis
- Attempt 2-5: Include validation errors from previous attempt
- Exponential backoff: 2s, 4s, 6s, 8s, 10s
- Max 5 attempts per agent

### Phase 2: Consolidation & Gap Analysis

**Duration:** < 1 minute

**What it does:**

1. Merges 4 agent outputs into single `consolidation.json`
2. Identifies gaps in analysis (missing information)
3. Identifies conflicts (contradictory findings)
4. Decides whether to pause for manual review:
   - **Default**: Pauses if gaps (>5) or conflicts (>0) detected
   - **With `SKIP_GAP_QUESTIONS=true`**: Continues without pause

**Command:**

```bash
bash phase2-consolidation.sh "$PROJECT_PATH" "$TEMP_DIR"
```

**Success criteria:**

- Consolidation file created
- Gaps and conflicts identified
- User decision made (pause or continue)

**Pause behavior:**

If paused, script exits with instructions for:
- Reviewing gaps in `consolidation.json`
- Adding clarifications to `user_clarifications` key
- Resuming from Phase 3

### Phase 3: Opus Synthesis

**Duration:** 5-25 minutes (with retries)

**What it does:**

1. Spawns Opus agent with consolidated findings
2. Generates CLAUDE.md (quick reference, 30-200 lines)
3. Generates project-context (deep knowledge, 50-800 lines)
4. Validates line counts and structure
5. Up to 10 retry attempts with feedback

**Command:**

```bash
bash phase3-synthesis.sh "$PROJECT_PATH" "$TEMP_DIR"
```

**Success criteria:**

- CLAUDE.md: 30-200 lines (scales with project size)
- project-context: 50-800 lines (comprehensive for large projects)
- Both have frontmatter (starts with `---`)
- Correct section markers present

**Retry feedback:**

Opus receives specific feedback like:
- "CLAUDE.md has 247 lines (max: 200)"
- "project-context has 187 lines (min: 250)"
- Instructions to condense or expand

### Phase 4: File Writing

**Duration:** < 5 minutes (with retries)

**What it does:**

1. Parses synthesis output into separate files
2. Validates CLAUDE.md
3. Validates project-context
4. Up to 5 retry attempts
5. Provides feedback to Phase 3 if parsing fails

**Command:**

```bash
bash phase4-filewriting.sh "$PROJECT_PATH" "$TEMP_DIR"
```

**Success criteria:**

- Parsing succeeds (extracts both sections)
- CLAUDE.md validation passes
- project-context validation passes
- Files written to `.claude-temp/`

**Retry behavior:**

If parsing fails, re-runs Phase 3 with format feedback.

### Phase 5: Resource Copying

**Duration:** 1-5 minutes

**What it does:**

1. Detects stack profile (languages, frameworks, testing tools)
2. Selects relevant skills based on stack
3. Copies skills to `.claude/skills/`
4. Generates language-specific agents
5. Copies command files
6. **Validates** counts and formats (exits on error if < minimums)

**Command:**

```bash
bash phase5-resources.sh "$PROJECT_PATH" "$FRAMEWORK_PATH"
```

**Success criteria:**

- Skills copied: minimum 5, recommended 10+
- Agents generated: minimum 3, recommended 3-8
- Commands copied: minimum 1
- Agents are .md format (not .json)

**No retry:**

Phase 5 is deterministic (no AI), so no retry logic.
Exits with error if minimums not met.

### Phase 6: Final Validation

**Duration:** < 1 minute

**What it does:**

1. Verifies all core files exist
2. Checks line counts are within ranges
3. Validates frontmatter and structure
4. Generates metrics report
5. **Exits with error** if any validation fails

**Command:**

```bash
bash phase6-validation.sh "$PROJECT_PATH"
```

**Success criteria:**

- All core files exist
- Line counts within ranges
- File formats correct
- Frontmatter valid

**No retry:**

Phase 6 is final check. Previous phases should have caught issues.
If Phase 6 fails, indicates a bug in earlier phases.

## Output Files

### Core Files (Required)

#### `.claude/CLAUDE.md`

Quick reference guide (30-200 lines, scales with project complexity)

**Contains:**

- Project name and description
- Stack summary
- Directory structure
- Available commands
- Minimal explanations

**Does NOT contain:**

- Detailed workflows
- Lengthy explanations
- Multi-step processes

#### `.claude/skills/project-context/SKILL.md`

Deep project knowledge (50-800 lines, comprehensive for large projects)

**Contains:**

- Architecture diagrams
- Request lifecycle flows
- Authentication flows
- Critical workflows with ALL steps
- Gotchas with WRONG/CORRECT examples
- Testing patterns
- Convention rationale
- Multi-file checklists
- Integration points

**Quality indicators:**

- ASCII diagrams showing flow
- Side-by-side WRONG/CORRECT examples
- Step-by-step multi-file workflows
- Rationale for conventions (why, not just what)

### Skills (10-20 expected)

Located in `.claude/skills/`:

**Categories:**

- **Language-specific**: `typescript-best-practices/`, `python-patterns/`
- **Framework-specific**: `react-development/`, `fastapi-patterns/`
- **Testing**: `jest-testing/`, `pytest-patterns/`
- **Foundation**: `git-workflows/`, `code-review/`

**Structure:**

```
.claude/skills/
├── typescript-best-practices/
│   ├── SKILL.md
│   └── examples/
├── react-development/
│   ├── SKILL.md
│   └── templates/
└── ...
```

### Agents (3-8 expected)

Located in `.claude/agents/`:

**Types:**

- Language-specific: `typescript-specialist.md`, `python-expert.md`
- Framework: `react-developer.md`, `fastapi-builder.md`
- General: `code-reviewer.md`, `test-writer.md`

**Format:** Markdown files with agent instructions

### Commands (1-5 expected)

Located in `.claude/commands/`:

**Examples:**

- `/start-task.md` - Start working on a task
- `/implement-ticket.md` - Implement a ticket
- `/code-review.md` - Review code

### Temporary Files (For Debugging)

Located in `.claude-temp/` (deleted unless `--keep-temp`):

**Files:**

- `initialization.log` - Full execution log
- `phase1-outputs/` - Agent analysis outputs (JSON)
- `consolidation.json` - Merged findings
- `synthesis-raw.md` - Opus synthesis output
- `CLAUDE.md`, `project-context.md` - Parsed outputs
- `stack-profile.json` - Detected stack
- `metrics.json` - Final validation metrics

## Validation Criteria

### Phase 1 Validation

**Requirements:**

- ✅ All 4 agents must produce valid JSON
- ✅ JSON must match schema:
  - `agent_name`: string
  - `timestamp`: ISO 8601 timestamp
  - `findings`: object
  - `needs_verification`: array
- ✅ No markdown code blocks wrapping JSON
- ✅ First character is `{`, last is `}`

**Schema validation:**

Uses `ajv` library with JSON Schema Draft 07.

**Max attempts:** 5 per agent with feedback

### Phase 3 Validation

**Requirements:**

- ✅ CLAUDE.md:
  - 30-200 lines (scales with project)
  - Has frontmatter (starts with `---`)
  - No detailed workflows
- ✅ project-context:
  - 50-800 lines (comprehensive for large projects)
  - Has frontmatter
  - Includes diagrams, examples, workflows
- ✅ Correct section markers:
  - `# CLAUDE.md Content`
  - `# project-context/SKILL.md Content`

**Line count validation:**

Exact count excluding blank lines.

**Max attempts:** 5 with line count feedback

### Phase 4 Validation

**Requirements:**

- ✅ Parsing succeeds:
  - Extracts CLAUDE.md section
  - Extracts project-context section
- ✅ CLAUDE.md file validation passes
- ✅ project-context file validation passes
- ✅ Frontmatter in both files

**Max attempts:** 5, feeds back to Phase 3 if parsing fails

### Phase 5 Validation

**Requirements:**

- ✅ Skills copied: minimum 5, recommended 10+
- ✅ Agents generated: minimum 3
- ✅ Commands copied: minimum 1
- ✅ Agents are .md format (not .json)
- ✅ Stack profile exists and is valid JSON

**No retry:** Deterministic operations

**Failure action:** Exits with error and instructions

### Phase 6 Validation

**Requirements:**

- ✅ All core files exist:
  - `.claude/CLAUDE.md`
  - `.claude/skills/project-context/SKILL.md`
- ✅ Line counts within ranges
- ✅ File formats correct
- ✅ Frontmatter valid
- ✅ Metrics saved

**No retry:** Final validation

**Failure action:** Indicates bug in earlier phases

## Error Handling

### Phase 1 Errors

#### Agent Validation Failure

**Symptom:**

```
[agent-name] ✗ Validation failed
data must have required property 'findings'
```

**Cause:** Agent output doesn't match schema

**Solution:**

- Automatic retry with validation feedback (up to 5 attempts)
- Agent receives specific error message
- Check `.claude-temp/phase1-outputs/*-validation-*.log`

#### Agent Timeout

**Symptom:**

```
[agent-name] ✗ Agent execution failed or timed out
```

**Cause:** Agent exceeded 5 minute timeout per attempt

**Solution:**

- Automatic retry (up to 5 attempts)
- If all retries fail, check agent prompts in `agents/0*.md`
- Consider if project is too large

#### JSON Wrapped in Markdown

**Symptom:**

```
Unexpected token '`' at 1:1
```

**Cause:** Agent wrapped JSON in ```json blocks

**Solution:**

- Script automatically extracts JSON from markdown
- If extraction fails, retry with stronger instructions

### Phase 2 Errors

#### Gaps Detected

**Symptom:**

```
⚠ Warning: High number of gaps detected (8)
Phase 2 exiting - manual review required
```

**Cause:** Agents couldn't determine key information

**Solution:**

**Option A - Continue Automated:**

```bash
SKIP_GAP_QUESTIONS=true ./scripts/initialize-project.sh /path/to/project
```

**Option B - Manual Review:**

1. Review `.claude-temp/consolidation.json`
2. Add to `user_clarifications`:
   ```json
   {
     "user_clarifications": {
       "authentication": "JWT in HTTP-only cookies",
       "database": "PostgreSQL 14"
     }
   }
   ```
3. Resume from Phase 3

#### Conflicts Detected

**Symptom:**

```
⚠ Warning: Conflicts detected (2)
```

**Cause:** Agents gave contradictory findings

**Solution:** Same as gaps - review and clarify

### Phase 3 Errors

#### Line Count Exceeded

**Symptom:**

```
✗ CLAUDE.md exceeds max length: 247 lines (max: 200)
```

**Cause:** Opus generated too much content

**Solution:**

- Automatic retry with feedback
- Opus receives: "CLAUDE.md has 247 lines (max: 200)"
- Instructions to condense

#### Line Count Too Low

**Symptom:**

```
✗ project-context below min length: 187 lines (min: 250)
```

**Cause:** Opus didn't generate enough detail

**Solution:**

- Automatic retry with feedback
- Instructions to expand with diagrams, examples

#### Missing Section Markers

**Symptom:**

```
✗ Missing section marker: # CLAUDE.md Content
```

**Cause:** Opus didn't format output correctly

**Solution:**

- Automatic retry with format instructions
- Emphasizes section marker requirements

### Phase 4 Errors

#### Parsing Failed

**Symptom:**

```
✗ Failed to parse synthesis output
Could not find section: # CLAUDE.md Content
```

**Cause:** Phase 3 output missing section markers

**Solution:**

- Automatic retry
- Re-runs Phase 3 with format feedback
- Emphasizes marker requirements

#### Validation Failed After Parsing

**Symptom:**

```
✗ CLAUDE.md validation failed after parsing
Missing frontmatter
```

**Cause:** Extracted section doesn't have frontmatter

**Solution:**

- Automatic retry
- Feeds back to Phase 3
- Emphasizes frontmatter requirement

### Phase 5 Errors

#### Too Few Skills

**Symptom:**

```
⚠ WARNING: Only 2 skills copied (expected 10+)
```

**Cause:**

- Stack detection incorrect
- skill-selection.js bug
- Framework skills directory missing

**Solution:**

1. Check `.claude-temp/stack-profile.json`
2. Verify framework has skills in `skills/` directory
3. Check `utils/skill-selection.js` for bugs
4. No automatic retry (deterministic)
5. Fix issue and re-run from Phase 5:
   ```bash
   bash phase5-resources.sh "$PROJECT_PATH" "$FRAMEWORK_PATH"
   ```

#### Agent Generation Failed

**Symptom:**

```
ReferenceError: extractCommands is not defined
```

**Cause:** Bug in `utils/agent-generation.js`

**Solution:**

1. Check error message for specific issue
2. Fix the utility code
3. Re-run from Phase 5 (no automatic retry)

### Phase 6 Errors

#### File Missing

**Symptom:**

```
❌ ERROR: CLAUDE.md not created
```

**Cause:** Phase 4 didn't write file

**Solution:**

- Indicates bug in Phase 4
- No automatic retry
- Check Phase 4 logs
- May need to re-run entire workflow

#### Line Count Out of Range

**Symptom:**

```
⚠ WARNING: project-context outside 50-800 line range
```

**Cause:** Phase 4 wrote file but validation didn't catch issue

**Solution:**

- Indicates bug in Phase 3/4 validation
- May be acceptable (warning, not error)
- Review file manually

## Gap Analysis

### Overview

Phase 2 analyzes consolidated findings for **gaps** (missing information) and **conflicts** (contradictory findings).

### Default Behavior (Manual Review)

When gaps (>5) or conflicts (>0) detected:

1. **Pauses execution** and exits
2. Saves summary to `.claude-temp/gaps-summary.txt`
3. Displays instructions for review

**When to use:** Production projects where quality matters

### Automated Behavior (Skip Review)

Set `SKIP_GAP_QUESTIONS=true`:

```bash
./scripts/initialize-project.sh --skip-gap-questions /path/to/project
```

Phase 2 continues even with gaps. Synthesis proceeds with available data.

**When to use:** Testing, CI/CD, or when accepting lower quality

### Manual Review Process

#### Step 1: Review Gaps

Open `.claude-temp/consolidation.json`:

```json
{
  "gaps": [
    "Authentication mechanism unclear",
    "Database type not identified",
    "API versioning strategy unknown"
  ],
  "conflicts": [
    "Agent 1 says REST API, Agent 2 says GraphQL"
  ]
}
```

#### Step 2: Add Clarifications

Add `user_clarifications` key:

```json
{
  "gaps": [...],
  "conflicts": [...],
  "user_clarifications": {
    "authentication": "JWT tokens in HTTP-only cookies, refresh token in localStorage",
    "database": "PostgreSQL 14 with PostGIS extension",
    "api_versioning": "URL-based versioning (e.g., /v1/, /v2/)",
    "api_style": "REST API for public endpoints, GraphQL for admin dashboard"
  }
}
```

#### Step 3: Resume from Phase 3

```bash
cd /path/to/project
TEMP_DIR=".claude-temp"
FRAMEWORK_PATH="qubika-agentic-framework"

bash "$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/phase3-synthesis.sh" \
  "$PWD" "$TEMP_DIR"

bash "$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/phase4-filewriting.sh" \
  "$PWD" "$TEMP_DIR"

bash "$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/phase5-resources.sh" \
  "$PWD" "$FRAMEWORK_PATH"

bash "$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/phase6-validation.sh" \
  "$PWD"
```

## Advanced Usage

### Resume from Specific Phase

The `--start-phase` flag allows you to resume initialization from a specific phase (1-6). This is useful for:

- **Re-running after fixes** - Fix an issue and resume without repeating slow AI analysis
- **Iterative development** - Tweak phase outputs and continue from there
- **Debugging** - Test specific phases in isolation

```bash
# Resume from Phase 4 (skip AI analysis phases 1-3)
./scripts/initialize-project.sh --start-phase 4

# Resume from Phase 5 (skip analysis + synthesis)
./scripts/initialize-project.sh --start-phase 5

# Resume from Phase 6 (validation only)
./scripts/initialize-project.sh --start-phase 6
```

**Prerequisites:**
- Previous phases must have completed successfully
- `.claude-temp/` directory must exist with phase outputs
- Temp files are kept by default for this purpose

### Common Resume Scenarios

#### Scenario 1: Fix Agent Generation Issue

```bash
# Initial run fails at Phase 5
./scripts/initialize-project.sh
# Error: Agent generation failed

# Fix the issue in utils/agents/
vim qubika-agentic-framework/utils/agents/index.js

# Resume from Phase 5 (has Phase 1-4 outputs)
./scripts/initialize-project.sh --start-phase 5
```

#### Scenario 2: Update Stack Detection

```bash
# Initial run complete, but detected stack is wrong
./scripts/initialize-project.sh
# Generated wrong agents

# Fix stack detection
vim .claude/framework-config.json

# Re-run from Phase 5 (regenerate agents with correct stack)
./scripts/initialize-project.sh --start-phase 5
```

#### Scenario 3: Tweak Synthesis Output

```bash
# Edit synthesis output directly
vim .claude-temp/synthesis-raw.md

# Re-run from Phase 4 (parse + validate + copy resources)
./scripts/initialize-project.sh --start-phase 4
```

### Manual Phase Execution (Advanced)

For deep debugging, run individual phase scripts directly:

```bash
# Auto-detect paths (framework must be at project root)
cd /path/to/your-project
FRAMEWORK_PATH="./qubika-agentic-framework"
PROJECT_PATH="$(pwd)"
TEMP_DIR="$PROJECT_PATH/.claude-temp"
SKILL_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project"

# Run specific phase
bash "$SKILL_DIR/scripts/phase5-resources.sh" "$PROJECT_PATH" "$FRAMEWORK_PATH"
```

**Note:** Use `--start-phase` instead - it handles environment setup and validation.

### Custom Stack Profile

Override auto-detected stack:

```bash
# Create custom stack profile
cat > "$PROJECT_PATH/.claude-temp/stack-profile.json" << 'EOF'
{
  "languages": ["typescript", "python"],
  "frontend": {
    "framework": "react",
    "version": "18.x"
  },
  "backend": {
    "framework": "fastapi",
    "version": "0.100.x"
  },
  "testing": {
    "framework": "jest",
    "coverage": true
  },
  "database": {
    "type": "postgresql",
    "version": "14"
  }
}
EOF

# Run from Phase 5 (skip analysis/synthesis)
bash "$SKILL_DIR/scripts/phase5-resources.sh" "$PROJECT_PATH" "$FRAMEWORK_PATH"
bash "$SKILL_DIR/scripts/phase6-validation.sh" "$PROJECT_PATH"
```

### Temporary Files Management

**Default behavior:** Temp files are **kept** to allow resuming from later phases.

**To clean up after completion:**

```bash
# Remove temp files after successful completion
./scripts/initialize-project.sh --clean

# Or clean manually later
rm -rf .claude-temp/
```

**Why temp files are kept by default:**

- Allows using `--start-phase` to resume from later phases
- Useful for iterative fixes (fix issue → resume from Phase 5)
- Helpful for debugging (inspect phase outputs)
- `.gitignore` is automatically configured to ignore them

**Temp directory contents:**

```
.claude-temp/
├── initialization.log              # Full execution log
├── phase1-outputs/                 # Agent analysis (JSON)
├── consolidation.json              # Merged findings
├── synthesis-raw.md                # Opus synthesis
├── CLAUDE.md                       # Parsed output
├── project-context.md              # Parsed output
└── metrics.json                    # Validation metrics
```

### Custom Timeout

For very large projects:

```bash
# 60 minute timeout
./scripts/initialize-project.sh --timeout 3600 /path/to/project

# 2 hour timeout
./scripts/initialize-project.sh --timeout 7200 /path/to/project

# No timeout (not recommended)
./scripts/initialize-project.sh /path/to/project
# (remove timeout command from script if needed)
```

## Standalone Mode

### What is Standalone Mode?

Standalone mode means the initialize-project script runs **without requiring an active Claude CLI session**.

**Traditional approach:**

```
User → claude (start CLI)
     → /initialize-project (command in CLI)
     → Claude interprets and executes
     → Claude spawns bash scripts
     → Bash spawns agents
     → Circular: Claude → Bash → Claude
```

**Standalone approach:**

```
User → ./scripts/initialize-project.sh (standalone)
     → Bash orchestrates workflow
     → Spawns agents directly: claude --model sonnet --dangerously-skip-permissions
     → No circular dependency
```

### How It Works

#### Direct Agent Spawning

Phase scripts spawn agents directly:

```bash
# From phase1-analysis.sh
claude --model sonnet --dangerously-skip-permissions <<< "$PROMPT" > "$OUTPUT_FILE"
```

**Key flag:** `--dangerously-skip-permissions`

- Skips interactive permission prompts
- Allows non-interactive execution
- Essential for CI/CD and automation

#### No Session Required

The standalone script:

1. Validates prerequisites (claude CLI, node, npm)
2. Sets up environment variables
3. Calls orchestration script
4. Orchestration calls phase scripts
5. Phase scripts spawn agents directly

**No Claude CLI session needed at any point.**

### Benefits

**Automation:**

- Works in CI/CD pipelines
- Works in cron jobs
- Works in scripts
- Works in non-interactive terminals

**Performance:**

- Faster startup (no CLI session overhead)
- Parallel agent execution
- Direct agent spawning

**Reliability:**

- No dependency on Claude CLI session state
- Deterministic execution
- Clear error messages

**Flexibility:**

- Can be called from any script
- Can be integrated into other tools
- Can run in background

### Comparison with Command Mode

| Feature | Standalone Mode | Command Mode |
|---------|----------------|--------------|
| **Execution** | `./scripts/initialize-project.sh` | `/initialize-project` |
| **Requires CLI session** | No | Yes |
| **CI/CD compatible** | Yes | No |
| **Interactive prompts** | Optional (confirmation) | Yes |
| **Agent spawning** | Direct | Via Claude |
| **Timeout** | Configurable | Fixed |
| **Background execution** | Yes | Limited |
| **Backward compatible** | - | Yes (wraps standalone) |

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Initialize Project

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  initialize:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout project
        uses: actions/checkout@v3
        with:
          path: project

      - name: Checkout framework
        uses: actions/checkout@v3
        with:
          repository: thisisqubika/qubika-agentic-framework
          path: project/qubika-agentic-framework

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Claude CLI
        run: |
          # Install claude CLI
          # (follow installation instructions for your platform)

      - name: Run initialization
        run: |
          cd project
          ./qubika-agentic-framework/scripts/initialize-project.sh \
            --skip-gap-questions \
            --timeout 3600 \
            --clean
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Commit generated files
        run: |
          cd project
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add .claude/
          git commit -m "chore: update Claude configuration"
          git push
```

### GitLab CI Example

```yaml
initialize-project:
  stage: setup
  image: node:18
  before_script:
    - npm install -g @anthropics/claude-cli
  script:
    - ./qubika-agentic-framework/scripts/initialize-project.sh
        --skip-gap-questions
        --timeout 3600
        --clean
  artifacts:
    paths:
      - .claude/
    expire_in: 1 day
  only:
    - main
```

### Jenkins Example

```groovy
pipeline {
    agent any

    stages {
        stage('Initialize') {
            steps {
                sh '''
                    cd ${WORKSPACE}
                    ./qubika-agentic-framework/scripts/initialize-project.sh \
                      --skip-gap-questions \
                      --timeout 3600 \
                      --clean
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: '.claude/**', allowEmptyArchive: true
        }
    }
}
```

### Docker Example

```dockerfile
FROM node:18

# Install dependencies
RUN apt-get update && apt-get install -y \
    bash \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI
RUN npm install -g @anthropics/claude-cli

# Copy project
COPY . /project

WORKDIR /project

# Run initialization
RUN ./qubika-agentic-framework/scripts/initialize-project.sh \
    --skip-gap-questions \
    --clean
```

### Cron Job Example

```bash
#!/bin/bash
# /etc/cron.daily/update-claude-config

PROJECT_PATH="/var/www/myproject"

cd "$PROJECT_PATH"

./qubika-agentic-framework/scripts/initialize-project.sh \
  --skip-gap-questions \
  --timeout 3600 \
  --clean \
  >> /var/log/claude-init.log 2>&1

# Restart services if needed
if [ $? -eq 0 ]; then
    systemctl reload myapp
fi
```

## Debugging

### Enable Verbose Logging

```bash
# Set bash debug mode
bash -x ./scripts/initialize-project.sh /path/to/project
```

### Check Logs

```bash
# Main log
cat /path/to/project/.claude-temp/initialization.log

# Phase 1 agent outputs
ls -la /path/to/project/.claude-temp/phase1-outputs/
cat /path/to/project/.claude-temp/phase1-outputs/*-validation-*.log

# Phase 2 consolidation
cat /path/to/project/.claude-temp/consolidation.json

# Phase 3 synthesis
cat /path/to/project/.claude-temp/synthesis-raw.md

# Validation logs
cat /path/to/project/.claude-temp/*-validation-*.log

# Metrics
cat /path/to/project/.claude-temp/metrics.json
```

### Check Phase Progress

```bash
# Which phases completed?
ls -la /path/to/project/.claude-temp/

# Phase 1 complete?
[ -d ".claude-temp/phase1-outputs" ] && echo "Phase 1 done"

# Phase 2 complete?
[ -f ".claude-temp/consolidation.json" ] && echo "Phase 2 done"

# Phase 3 complete?
[ -f ".claude-temp/synthesis-raw.md" ] && echo "Phase 3 done"

# Phase 4 complete?
[ -f ".claude-temp/CLAUDE.md" ] && echo "Phase 4 done"

# Phase 5 complete?
[ -d ".claude/skills" ] && echo "Phase 5 done"

# Phase 6 complete?
[ -f ".claude-temp/metrics.json" ] && echo "Phase 6 done"
```

### Debug Specific Phase

```bash
# Run phase with debug output
bash -x "$SKILL_DIR/scripts/phase1-analysis.sh" "$PROJECT_PATH" "$TEMP_DIR"

# Check phase exit code
echo $?
# 0 = success, non-zero = failure
```

### Check Agent Outputs

```bash
# List all agent outputs
ls -la .claude-temp/phase1-outputs/

# Check specific agent
cat .claude-temp/phase1-outputs/01-structure-architecture.json | jq .

# Check validation logs
cat .claude-temp/phase1-outputs/01-structure-architecture-validation-attempt1.log
```

### Validate JSON Manually

```bash
# Install jq if not present
# brew install jq  # macOS
# apt-get install jq  # Ubuntu

# Validate JSON syntax
jq . .claude-temp/consolidation.json

# Check specific field
jq '.gaps' .claude-temp/consolidation.json

# Count items
jq '.findings | length' .claude-temp/phase1-outputs/01-structure-architecture.json
```

### Check Dependencies

```bash
# Claude CLI
which claude
claude --version

# Node.js
which node
node --version

# npm
which npm
npm --version

# Validation libraries
node -e "require('ajv')" && echo "ajv installed"
node -e "require('ajv-formats')" && echo "ajv-formats installed"
```

### Common Debug Commands

```bash
# Full diagnostic (temp files kept by default)
bash -x ./scripts/initialize-project.sh /path/to/project 2>&1 | tee debug.log

# Check file sizes
du -h .claude-temp/*

# Count lines in outputs
wc -l .claude-temp/CLAUDE.md .claude-temp/project-context.md

# Check for errors in log
grep -i error .claude-temp/initialization.log

# Check for validation failures
grep -i "validation failed" .claude-temp/initialization.log

# Check retry attempts
grep -i "attempt" .claude-temp/initialization.log
```

## References

### Script Files

- **Standalone entry point**: `/scripts/initialize-project.sh`
- **Orchestration script**: `/skills/010-foundation/initialize-project/scripts/orchestrate-initialization.sh`
- **Phase scripts**: `/skills/010-foundation/initialize-project/scripts/phase*.sh`
- **Validators**: `/skills/010-foundation/initialize-project/utils/validators/*.js`
- **Agents**: `/skills/010-foundation/initialize-project/agents/*.md`

### Utility Files

- **Stack detection**: `/utils/stack-detection.js`
- **Skill selection**: `/utils/skill-selection.js`
- **Agent generation**: `/utils/agent-generation.js`

### Configuration Files

- **Schemas**: `/skills/010-foundation/initialize-project/config/schemas/*.json`
- **Templates**: `/skills/010-foundation/initialize-project/templates/`

### Documentation

- **Command reference**: `/commands/initialize-project.md`
- **This document**: `/docs/INITIALIZE_PROJECT.md`

### Integration Tests

- **Test runner**: `/tests/run-integration-tests.sh`
- **Example**: Shows direct agent spawning pattern

## Success Indicators

Initialization succeeded when you see:

```
========================================================================
  INITIALIZATION COMPLETE ✓
========================================================================

Duration: 12m 47s
Project:  /path/to/project

Generated files:
  ✓ .claude/CLAUDE.md
  ✓ .claude/skills/project-context/SKILL.md
  ✓ .claude/skills/* (language-specific)
  ✓ .claude/agents/*
  ✓ .claude/commands/*

Next steps:
  1. cd /path/to/project
  2. claude  # Start Claude CLI
  3. /project-context  # Load project knowledge
  4. /start-task  # Begin working on tasks

For quick reference, see: .claude/CLAUDE.md
```

**All phases completed:**

- ✅ Phase 1: 4 agents completed
- ✅ Phase 2: Consolidation complete
- ✅ Phase 3: Synthesis successful
- ✅ Phase 4: Files written
- ✅ Phase 5: Skills/agents/commands copied
- ✅ Phase 6: Final validation passed

**File counts:**

- Skills: 10-20 copied
- Agents: 3-8 generated
- Commands: 1-5 copied

**Line counts:**

- CLAUDE.md: 30-200 lines (scales with project)
- project-context: 50-800 lines (comprehensive for large projects)

**Quality indicators in project-context:**

- ASCII diagrams present
- WRONG/CORRECT examples included
- Multi-step workflows documented
- Rationale for conventions explained
