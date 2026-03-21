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

1. Agent completes its work and returns output
2. Claude CLI executes the hook script, passing agent output via stdin
3. Hook validates the output
4. If validation passes (exit 0), output is accepted
5. If validation fails (exit 1), agent retries with the hook's feedback message
6. Process repeats until validation passes or max retries are hit

## Creating New Hooks

When creating a new hook:

1. Create an executable bash script in this directory
2. Read input from stdin: `OUTPUT=$(cat)`
3. Validate the output
4. Print validation feedback to stdout if validation fails
5. Exit with code 0 for success, 1 for failure
6. Make the script executable: `chmod +x your-hook.sh`
7. Reference it in your agent's frontmatter: `user-prompt-submit-hook: ./hooks/your-hook.sh`

## Example Hook Usage

```yaml
---
name: my-agent
user-prompt-submit-hook: ./hooks/validate-my-output.sh
---
```

The path is relative to the agent file location.
