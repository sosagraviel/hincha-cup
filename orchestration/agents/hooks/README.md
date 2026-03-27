# Agent Hooks

This directory contains validation hooks used by agents during the initialization workflow.

## Purpose

Hooks are external scripts that agents reference to validate their output before it's accepted. This keeps validation logic separate from agent definitions and makes it reusable and maintainable.

## Available Hooks

### validate-analyzer-json.ts

**Purpose**: Validates Phase 1 analyzer agent output against JSON schema.

**Used by**:
- `01-structure-architecture.md`
- `02-tech-stack-dependencies.md`
- `03-code-patterns-testing.md`
- `04-data-flows-integrations.md`

**Validation checks**:
- Output is valid JSON
- Matches Zod schema for analyzer output
- Contains required fields (agent_name, findings, questions)

**Exit codes**:
- `0`: Validation passed, output is accepted
- `1`: Validation failed, agent will retry with feedback

### validate-extraction-json.ts

**Purpose**: Validates Phase 2 consolidator agent output against JSON schema.

**Used by**: `06-question-consolidator.md`

**Validation checks**:
- Output is valid JSON
- Matches Zod schema for consolidated questions
- Contains properly merged and deduplicated questions

**Exit codes**:
- `0`: Validation passed, output is accepted
- `1`: Validation failed, agent will retry with feedback

### validate-synthesis.sh

**Purpose**: Validates Phase 3 synthesis agent output to ensure it follows the correct markdown format.

**Used by**: `05-architect-synthesizer.md`

**Validation checks**:
- Output is markdown format (not JSON)
- Contains required section headers
- CLAUDE.md section is 30-250 lines
- project-context section is 50-600 lines
- Contains required subsections (Tech Stack, File Placement Guide, Essential Commands)
- project-context starts with YAML frontmatter

**Exit codes**:
- `0`: Validation passed, output is accepted
- `1`: Validation failed, agent will retry with feedback

## How Hooks Work

### Stop Hooks and Native Internal Iteration

These are **Stop hooks** - they run when an agent attempts to finish (at the "Stop" event). This enables **native internal iteration** where Claude CLI automatically manages retry loops:

1. Agent produces output
2. **Stop hook validates output** (before agent finishes)
3. If **valid** → Hook allows (exit 0), agent completes
4. If **invalid** → Hook blocks (exit 1) with feedback message
5. **Claude CLI automatically**:
   - Injects feedback into conversation as system message
   - Agent sees error in **SAME session** (context preserved!)
   - Agent produces corrected output
   - Hook validates again
6. Process repeats until:
   - Hook allows (validation passes), OR
   - Claude determines it can't fix the issue (gives up)

**Key Advantage**: Agent sees full conversation history including previous failed attempts, enabling progressive self-correction without losing context.

### Two-Layer Validation Architecture

The framework uses a two-layer validation approach for robustness:

**Layer 1: Stop Hooks (Native Internal Retry - Context Preserved)**
- Validates output BEFORE agent finishes
- Claude CLI manages retry loop automatically
- Agent sees errors in same session (context preserved)
- Handles 90%+ of validation failures
- No manual iteration tracking needed

**Layer 2: External Retry (Orchestrator Fallback - Context Lost)**
- TypeScript validation in orchestrator (`enhanced-retry.ts`)
- Spawns NEW agent session if Layer 1 exhausts
- Loses context (fresh session each time)
- Safety net for: hook crashes, timeouts, or DeepAgents mode (no hooks)
- Max 5 attempts (configurable)

**When External Retry Triggers**:
1. Stop hook blocked until Claude gave up (rare - Claude is persistent)
2. Hook script crashed or timed out (emergency failsafe)
3. DeepAgents mode (API key authentication - hooks not available)

**Result**: 95% of retries happen in Layer 1 (context preserved), 5% in Layer 2 (fallback).

### Logging Behavior

**Internal Retry (Layer 1 - Stop Hooks)**:
- **Silent operation**: No logs printed to orchestrator terminal
- Agent and Claude CLI handle retry internally
- Hook feedback goes only to agent's conversation
- Appears as single agent invocation to orchestrator

**External Retry (Layer 2 - Orchestrator)**:
- **Verbose logging**: Each retry attempt is logged
- Shows validation errors and retry progress
- Logs backoff delays and remaining attempts
- Final summary if all attempts fail

**Example External Retry Logs**:
```
🔄 External retry attempt 1/5 starting...
Previous error: missing timestamp field
❌ Validation failed: Field "timestamp": Required
Retrying with enhanced feedback (4 attempts remaining)...
Waiting 2000ms before retry (exponential backoff)...

🔄 External retry attempt 2/5 starting...
Previous error: Field "timestamp": Required
✓ External retry succeeded after 2 attempts
```

This ensures:
- Clean, silent operation when internal retry succeeds (most cases)
- Full visibility when external retry is needed (debugging/monitoring)

## Creating New Hooks

### Hook Implementation Guidelines

**Keep It Simple**: Hooks should ONLY validate and provide feedback. Claude CLI handles all iteration management natively - you don't need custom retry logic, iteration counting, or state management.

**Basic Pattern**:
```typescript
// 1. Read input
const input = JSON.parse(fs.readFileSync(0, "utf-8"));

// 2. Validate
const validation = validateOutput(input);

// 3. Block with feedback OR allow
if (!validation.valid) {
  blockWithFeedback("Clear error message explaining what's wrong");
} else {
  allow();
}
```

**Feedback Quality Matters**: Since agents see feedback in the same session, clear, actionable error messages help them self-correct faster:
- ❌ Bad: "Validation failed"
- ✅ Good: "Field 'timestamp' missing. Required format: ISO 8601 (e.g., 2026-03-26T10:30:00.000Z)"
- ✅ Best: Numbered error list + example of correct structure + specific guidance

**Example Enhancement**:
```typescript
if (!validation.valid) {
  const errors = validation.errors.map((err, i) => `  ${i+1}. ${err}`).join("\n");

  blockWithFeedback(
    `❌ Validation failed. Fix these issues:\n\n${errors}\n\n` +
    `Expected structure:\n` +
    `{\n  "field1": "value",\n  "field2": 123\n}\n\n` +
    `Please output the corrected JSON.`
  );
}
```

### Steps to Create a Hook

1. Create an executable script in this directory (TypeScript or bash)
2. Read input from stdin: `const input = JSON.parse(fs.readFileSync(0, "utf-8"))`
3. Validate the output against your requirements
4. Print clear, actionable feedback if validation fails
5. Exit with code 0 for success, 1 for failure
6. Make the script executable: `chmod +x your-hook.sh` (bash only)
7. Reference it in your agent's frontmatter: `user-prompt-submit-hook: ./hooks/your-hook.sh`

## Example: Native Retry Flow

Here's what happens when an agent's output fails validation:

**Attempt 1** (Agent produces invalid output):
```
Agent: {"agent_name": "my-analyzer", "findings": {...}}  // Missing timestamp!

Hook: ❌ Validation failed. Fix these issues:
  1. Field "timestamp" missing: Required

Expected structure:
{
  "agent_name": "my-analyzer",
  "timestamp": "2026-03-26T10:30:00.000Z",
  "findings": {...}
}

[Claude CLI automatically adds this feedback to conversation]
```

**Attempt 2** (Agent sees error and corrects in SAME session):
```
Agent: I see I forgot the timestamp field. Here's the corrected output:
{
  "agent_name": "my-analyzer",
  "timestamp": "2026-03-26T14:25:00.000Z",
  "findings": {...}
}

Hook: ✅ Validation passed! [Allows agent to finish]
```

**Context Preserved**: Agent referenced its previous attempt ("I see I forgot..."), confirming it has full conversation history.

**No External Retry Needed**: Claude's native retry handled the error correction in the same session. External retry (Layer 2) never triggered.

## Example Hook Usage

```yaml
---
name: my-agent
# Stop hook: Validates output before agent finishes, enables internal retry within same session
# When validation fails, Claude CLI automatically retries with feedback (context preserved)
user-prompt-submit-hook: ./hooks/validate-my-output.sh
---
```

The path is relative to the agent file location.
