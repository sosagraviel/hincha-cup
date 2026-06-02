---
sidebar_position: 3
title: Agents Reference
description: Complete reference for AI agents in the Qubika Agentic Framework
---

# Agents Reference

Agents are specialized role prompts that handle specific tasks in the `/implement-ticket` workflow. The framework generates agents tailored to the languages and frameworks detected in your project.

---

## How Agents Work

Each agent is a markdown file with YAML frontmatter that configures:

- **`name`** — the agent identifier (e.g. `implementer-typescript`)
- **`description`** — a one-line summary of the agent's role
- **`model`** — the model to use (`opus` or `sonnet`)
- **`tools`** — the tools the agent may call (including `mcp__code_graph__*` graph tools)
- **`skills`** — skills auto-loaded into the agent's context

**Key Characteristics**:
- **Specialized**: Each agent has a focused responsibility within one phase of the workflow.
- **Stack-aware**: Implementer agents are generated per detected language.
- **Graph- and wiki-aware**: The planner and implementers query the code graph and read the LLM wiki.
- **Composable**: They work together across the phases of `/implement-ticket`.

---

## Agent Types

The framework generates four kinds of agents. They are written to `.claude/agents/` during `/initialize-project` (see the [Project Structure reference](./project-structure.md) for the full generated tree).

### planner

**Purpose**: Produces the `Implementation Plan` for a ticket — the sole planning artifact for the workflow.

**When used**: Phase 3 (Planning) of `/implement-ticket`.

**Model**: `opus`

**Skills** (assigned at generation time based on detected stack, e.g.):
- `mastering-typescript`
- `mastering-python-skill`
- `code-conventions`
- `multi-file-workflows`
- `testing-conventions`

**Tools**: `Read`, `Grep`, `Glob`, and the `mcp__code_graph__*` graph tools (no write access).

**Output**: A markdown `Implementation Plan` containing:
- `Summary`
- `Wiki Evidence` (cited with each source's `confidence` level)
- `Graph Evidence`
- `Impact Analysis`
- `Implementation Steps`
- `Risk Assessment` (overall risk + per-risk severity/mitigation)
- `Testing Strategy`
- `Recommended Implementers` (per-service, ordered — drives Phase 5)
- `Assumptions And Open Questions`

---

### implementer-[language]

**Purpose**: Implements code in a specific language following project conventions.

**When used**: Phase 5 (Implementation) of `/implement-ticket`. Also re-invoked in Phase 6 (Testing) to fix failing tests and in Phase 10 (Review Loop) to address review findings — in each case scoped to the files the implementer owns.

**Model**: `sonnet`

**Generated for**: Each detected language with a dedicated implementer agent.

**Skills** (example for TypeScript):
- `mastering-typescript`
- `mastering-vitest`
- `mastering-langgraph-agent-skill`
- `code-conventions`
- `multi-file-workflows`
- `testing-conventions`

**Tools**: `Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Grep`, `Glob`, and the `mcp__code_graph__*` graph tools.

**Output**: Code changes plus a required `## Wiki Delta Hints` block (one JSON object per line) summarizing facts the wiki may need to absorb. Omitting this block is a Phase 5 completion failure.

**Languages with a dedicated implementer agent**:

| Agent | Language |
|-------|----------|
| `implementer-typescript` | TypeScript |
| `implementer-python` | Python |
| `implementer-go` | Go |
| `implementer-java` | Java |
| `implementer-rust` | Rust |
| `implementer-ruby` | Ruby |
| `implementer-csharp` | C# |
| `implementer-scala` | Scala |
| `implementer-swift` | Swift |

Languages outside this set are handled by `implementer-generic` (see below).

---

### implementer-generic

**Purpose**: Implements changes to any file type that does not map to a dedicated language implementer (config, infrastructure, docs, shell, etc.).

**When used**: Phase 5 (Implementation), as the fallback when a file's language has no dedicated implementer agent.

**Model**: `sonnet`

**Skills**:
- `code-conventions`
- `multi-file-workflows`
- `testing-conventions`

---

### visual-verifier

**Purpose**: Compares screenshots against expected designs and produces actionable fix suggestions for UI implementations.

**When used**: Phase 7 (Visual Verification) of `/implement-ticket`.

**Model**: `opus`

**Generated for**: Projects that have a detected frontend service. If no frontend service is detected, this agent is not generated.

**Tools**: `Read`, `Grep`, `Glob`, `Bash`, `Edit`.

---

### Review and security analysis

Code review and security analysis are **not** performed by generated agents. They are handled by skills invoked during Phase 10 (Review Loop):

- `/pr-reviewer` — code quality and convention review (once per PR URL)
- `/security-review` — hybrid SAST + LLM security analysis (once per PR URL)

See the [Skills Reference](./skills-catalog.md) for details.

---

## Agent Skill Mapping

Skills are assigned to each agent at generation time, based on the detected stack. The mappings below reflect a typical TypeScript + Python project.

### planner (cross-language)

```yaml
skills:
  - mastering-typescript     # one per detected language
  - mastering-python-skill
  - code-conventions
  - multi-file-workflows
  - testing-conventions
```

**Why**: Plans may span multiple languages, so the planner receives language skills for every detected stack plus the generated convention skills.

---

### implementer-typescript (single-language)

```yaml
skills:
  - mastering-typescript
  - mastering-vitest
  - mastering-langgraph-agent-skill
  - code-conventions
  - multi-file-workflows
  - testing-conventions
```

**Why**: Focuses on TypeScript implementation with its test framework and the shared convention skills.

---

### implementer-python (single-language)

```yaml
skills:
  - mastering-python-skill
  - mastering-langgraph-agent-skill
  - code-conventions
  - multi-file-workflows
  - testing-conventions
```

**Why**: Focuses on Python implementation with the shared convention skills.

---

## Agent Lifecycle

### 1. Generation

Agents are generated during Phase 5 of `/initialize-project`:

```
Detect TypeScript          → Generate implementer-typescript
Detect Python              → Generate implementer-python
(always)                   → Generate planner, implementer-generic
Detect frontend service    → Generate visual-verifier
```

**Location**: `.claude/agents/`

---

### 2. Invocation

Agents are applied as role prompts during `/implement-ticket`:

```
Phase 3:  Planning             → planner
Phase 5:  Implementation       → implementer-<language> / implementer-generic
Phase 6:  Testing              → implementer-<language> (fixes only)
Phase 7:  Visual Verification  → visual-verifier
Phase 10: Review Loop          → /pr-reviewer, /security-review (skills)
```

---

### 3. Execution

Agents receive:
- The ticket context and the planner's `Implementation Plan`
- Their assigned skills (auto-loaded via frontmatter)
- Access to the code graph and LLM wiki

Agents produce:
- The planner emits a markdown `Implementation Plan`
- Implementers emit code changes plus a `## Wiki Delta Hints` JSONL block
- The visual-verifier emits diff analysis and fix suggestions

---

## Multi-Language Routing

For multi-language projects, the **planner** maps affected files to language buckets in its `Recommended Implementers` section. The routing is driven by `framework-config.json::stack_profile.services` using a longest-prefix file→service match, deduplicated by language:

```
python                  → implementer-python
typescript / javascript → implementer-typescript
anything else/unmapped  → implementer-generic
```

Phase 5 then dispatches each entry **sequentially in the listed order** (producers before consumers — e.g. a backend stack before a frontend that consumes its endpoints).

### Example: Full-Stack TypeScript + Python Project

**Detected Stack**:
- Frontend: TypeScript + React
- Backend: Python + FastAPI

**Generated Agents**:
- `planner` — plans across both languages
- `implementer-typescript` — frontend implementation
- `implementer-python` — backend implementation
- `implementer-generic` — non-code files
- `visual-verifier` — UI verification (frontend detected)

**Recommended Implementers (produced by the planner)**:

```
Frontend service (*.tsx, *.ts)  → implementer-typescript
Backend service (*.py)          → implementer-python
```

---

## Agent Configuration

Agents are configured via markdown files in `.claude/agents/`.

### Example Agent File

**File**: `.claude/agents/implementer-typescript.md`

```markdown
---
name: implementer-typescript
description: Expert typescript developer implementing features following best practices
model: sonnet
tools: Read, Write, Edit, MultiEdit, Bash, Grep, Glob, mcp__code_graph__get_minimal_context_tool, ...
skills:
  - mastering-typescript
  - mastering-vitest
  - mastering-langgraph-agent-skill
  - code-conventions
  - multi-file-workflows
  - testing-conventions
---

# typescript Implementer

You are an expert TypeScript developer. Implement features following project conventions...
```

---

## Model Assignment

Generated agents are assigned a model at generation time:

| Agent | Model |
|-------|-------|
| `planner` | `opus` |
| `implementer-[language]` | `sonnet` |
| `implementer-generic` | `sonnet` |
| `visual-verifier` | `opus` |

The default models and tiers used across the framework are also influenced by the `NODE_ENV` environment preset (`development` / `staging` / `production`). See [Environment Variables](../configuration/environment-variables.md#model-configuration) for details.

---

## Agent Outputs

### Planner Output

The planner produces a markdown `Implementation Plan`, for example:

```markdown
# Implementation Plan

## Summary
Add a UserService with dependency injection.

## Impact Analysis
- src/services/user.service.ts (new)
- src/app.module.ts (modified)

## Implementation Steps
1. Create UserService class
2. Wire dependency injection
3. Add unit tests

## Risk Assessment
- Overall risk: Medium

## Testing Strategy
Unit tests with Vitest.

## Recommended Implementers
1. implementer-typescript — services/* — UserService + DI wiring
```

---

### Implementer Output

Implementers apply code changes directly to the working tree and end their summary with a required JSONL block:

````markdown
## Wiki Delta Hints
```
{"page": "services/user", "change": "Added UserService with DI"}
```
````

---

## Best Practices

1. **Let the framework generate agents**: Don't create agents manually — run `/initialize-project`.
2. **Trust the routing**: The planner's `Recommended Implementers` section drives Phase 5 dispatch.
3. **Re-generate after stack changes**: Run `/initialize-project` again when you add a language or framework.
4. **Review agent outputs**: Validate plans and code changes before merging.

---

## Troubleshooting

### Agent Not Found

```
Error: Agent implementer-typescript not found

Solution: Run /initialize-project to generate agents for your stack.
```

---

### Unsupported Language

```
A file's language has no dedicated implementer agent.

Solution: implementer-generic handles any file type without a dedicated
language agent. To add a dedicated agent, ensure the language is detected
and re-run /initialize-project.
```

---

## Further Reading

- [Skills Reference](./skills-catalog.md) - Invokable skills (commands) and the skills agents use
- [Environment Variables](../configuration/environment-variables.md) - Model configuration
- [Project Structure](./project-structure.md) - Where agents are stored
