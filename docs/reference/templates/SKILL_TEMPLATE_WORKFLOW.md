```yaml
---
name: my-workflow-skill
description: >
  Perform a specific multi-step workflow with validation and error recovery.
  Use when the user needs to automate [specific task] with consistent output.
version: 1.0.0
category: development-workflow
triggers:
  - relevant-trigger
user-invocable: true
argument-hint: "[--flag <value>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Skill
last_updated: 2026-03-23
---

# My Workflow Skill

**Purpose**: Automate [specific task] with validation, gap detection, and structured output.

---

## Table of Contents

1. [Overview](#overview)
2. [Usage](#usage)
3. [Workflow](#workflow)
4. [Output Format](#output-format)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Overview

This skill produces [output] by:
1. **Validating inputs** from [sources]
2. **Analyzing context** via codebase search
3. **Generating output** in [format]

---

## Usage

```bash
/my-workflow-skill --flag value
/my-workflow-skill --from-context ./path/to/file
```

---

## Workflow (N Phases)

### Phase 1: Validate Input

**Actions**:
1. Parse arguments and detect input mode
2. Validate required parameters
3. Load input data from source

**Tools**: `Read`, `Glob`

**Output**: Validated input object ready for processing.

---

### Phase 2: Analyze Context

**Actions**:
1. Search codebase for relevant patterns
2. Extract technical context
3. Identify gaps requiring user input

**Tools**: `Grep`, `Glob`, `Read`

**Output**: Context analysis with identified gaps.

---

### Phase 3: Generate Output

**Actions**:
1. Apply templates to analyzed data
2. Fill gaps with inferred or user-provided values
3. Write structured output

**Tools**: `Write`

**Output**: Final artifact in specified format.

---

## Output Format

```json
{
  "status": "success",
  "artifact": "path/to/output",
  "summary": "Description of what was generated"
}
```

---

## Error Handling

| Phase | Error | Recovery |
|-------|-------|----------|
| 1 | Missing required argument | Display usage hint and exit |
| 2 | No matching patterns found | Fall back to user prompts |
| 3 | Write permission denied | Report error with path |

---

## Best Practices

- Always validate inputs before processing
- Prefer codebase inference over user prompts
- Generate deterministic, reproducible output
```
