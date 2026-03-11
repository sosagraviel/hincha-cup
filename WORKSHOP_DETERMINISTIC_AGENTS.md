# Building Deterministic Multi-Agent Systems: A Workshop Guide

**Author**: AI Framework Team
**Date**: 2026-03-10
**Purpose**: Workshop on deterministic agent architecture decisions
**Context**: AI Agentic Framework - Initialize-Project Skill v2.0

---

## Table of Contents

1. [The Problem We Were Solving](#1-the-problem-we-were-solving)
2. [Research Conducted](#2-research-conducted)
3. [Key Concept: Workflows vs Agents](#3-key-concept-workflows-vs-agents)
4. [Agent Teams: Why We Chose NOT to Use Them](#4-agent-teams-why-we-chose-not-to-use-them)
5. [Our Architecture Decision: Workflow-Orchestrated Subagents](#5-our-architecture-decision-workflow-orchestrated-subagents)
6. [Determinism: The Core Principle](#6-determinism-the-core-principle)
7. [Industry Best Practices Applied](#7-industry-best-practices-applied)
8. [Validation Strategy](#8-validation-strategy)
9. [Trade-offs and Justification](#9-trade-offs-and-justification)
10. [Comparison Matrix](#10-comparison-matrix)
11. [Implementation Highlights](#11-implementation-highlights)
12. [Lessons Learned](#12-lessons-learned)

---

## 1. The Problem We Were Solving

### 1.1 Initial State (v1.0)

The initialize-project skill was **AI-driven**:
- Single 800+ line SKILL.md prompt
- Claude interprets instructions non-deterministically
- Steps could be skipped or reordered
- Agent outputs not validated
- Phase 5/6 frequently incomplete
- No retry mechanisms

### 1.2 Observed Failures

**Run on stride-origin project (TypeScript + Python + JavaScript):**

❌ **Wrong agents launched**:
- "Analyze web app architecture" (improvised)
- "Analyze Firebase backend" (improvised)
- "Analyze Chrome extension" (improvised)
- NOT the 4 defined analysis agents

❌ **Missing Python support**:
- Only generated `implementer-typescript` and `implementer-javascript`
- No `implementer-python` despite Python Cloud Functions
- No `tester-unit-python`

❌ **Wrong file formats**:
- Generated `project-context` as JSON instead of SKILL.md
- CLAUDE.md was 400+ lines instead of < 200

❌ **Missing skill linking**:
- `mastering-typescript` skill not linked
- `react-frontend` and `atomic-design-react` skills not linked

### 1.3 Core Requirements

For **1000+ diverse projects** (Django, NestJS, Phoenix, Go, Rust, Elixir), we needed:

1. **Deterministic Process** - Same inputs always execute same workflow
2. **Flexible Outputs** - Content tailored to each stack
3. **Validation Gates** - Format, length, schema enforcement
4. **Retry/Repair** - Auto-fix common issues, retry with feedback
5. **Language Agnostic** - Support ANY language/framework
6. **Reliable Completion** - All 6 phases complete every time

---

## 2. Research Conducted

### 2.1 Research Sources

| Source | Focus Area | Key Insights |
|--------|-----------|--------------|
| **Anthropic - Building Effective Agents** | Workflows vs Agents | "Workflows offer predictability and consistency for well-defined tasks" |
| **GitHub Engineering Blog** | Multi-Agent Workflows | "Most failures come down to missing structure, not model capability" |
| **obra/superpowers** | Forcing Functions | "Mandatory workflows, not suggestions" |
| **Microsoft Azure AI** | Agent Orchestration | Error classification and state management |
| **LLM Structured Output Research** | Output Validation | "Constrained decoding restricts generation to valid sequences" |
| **Claude Code Documentation** | Agent Teams Feature | How agent teams work and when to use them |

### 2.2 Research Questions Asked

1. Should we use **workflows** (scripts) or **agents** (LLM orchestration)?
2. Are **agent teams** suitable for our deterministic use case?
3. How do we enforce **constraints** (file length, format, required sections)?
4. What **validation strategies** prevent bad outputs?
5. How do we implement **retry logic** with feedback?

---

## 3. Key Concept: Workflows vs Agents

### 3.1 The Fundamental Distinction

From Anthropic's research:

> **"Workflows offer predictability and consistency for well-defined tasks"**

| Aspect | Workflows | Agents |
|--------|-----------|--------|
| **Control** | Programmatic (scripts) | LLM decision-making |
| **Predictability** | Deterministic | Non-deterministic |
| **Use Case** | Known process, fixed steps | Unknown process, exploration |
| **Retries** | Explicit retry logic | LLM decides to retry |
| **Validation** | Programmatic validation gates | LLM self-validation |
| **Best For** | Production systems | Research/exploration |

### 3.2 Our Use Case Analysis

**Initialize-Project Skill**:
- ✅ **Well-defined task** - Always 26 steps across 6 phases
- ✅ **Known process** - We know exactly what needs to happen
- ✅ **Fixed structure** - Always need CLAUDE.md, project-context, skills, agents
- ✅ **Validation required** - Strict constraints on length, format, content
- ❌ **NOT exploratory** - Not discovering new approaches

**Conclusion**: This is a **workflow**, not an agentic task.

### 3.3 The "Junior Engineer" Standard

From obra/superpowers:

> **"Plans assume 'an enthusiastic junior engineer with poor taste, no judgement, no project context'"**

This means:
- Instructions must be **explicit enough for literal execution**
- No room for interpretation
- No assumption of context
- **Scripts enforce this better than prompts**

### 3.4 Prompt Chaining vs Agent Orchestration

| Approach | How It Works | Determinism | Our Choice |
|----------|-------------|-------------|------------|
| **Prompt Chaining** | Sequential prompts with programmatic handoff | High - scripts control flow | ✅ Yes |
| **Agent Orchestration** | LLM decides next steps | Low - LLM interprets flow | ❌ No |

**Example**:

**Prompt Chaining (Workflow)**:
```bash
# Step 1: Launch agents (script controls)
bash phase1-analysis.sh

# Step 2: Validate outputs (script validates)
node validate-agent-output.js

# Step 3: Consolidate (script merges)
node merge-analyses.js
```

**Agent Orchestration (LLM-driven)**:
```
You are orchestrating a project initialization.

Steps:
1. Launch 4 analysis agents
2. Consolidate their findings
3. Generate documentation

Proceed.
```
→ LLM might skip steps, reorder, or improvise

---

## 4. Agent Teams: Why We Chose NOT to Use Them

### 4.1 What Are Agent Teams?

**Agent Teams** (experimental Claude Code feature):
- Multiple Claude instances working as a team
- **Team lead** coordinates work
- **Teammates** self-organize and claim tasks
- Direct peer-to-peer communication
- Shared task list

### 4.2 When Agent Teams Are Good

Agent teams excel at:
- **Exploratory research** - Multiple hypotheses tested in parallel
- **Debate and discussion** - Teammates challenge each other's ideas
- **Self-organizing work** - Optimal approach is unknown
- **Complex collaboration** - Teammates need to coordinate on shared files

**Example use case**: "Debug this performance issue by testing competing hypotheses in parallel"

### 4.3 Why Agent Teams DON'T Fit Our Use Case

| Requirement | Agent Teams Behavior | Match? |
|-------------|---------------------|--------|
| **Launch exactly 4 agents** | Team lead decides how many | ❌ No |
| **Specific agent definitions** | Claude chooses based on prompt | ❌ No |
| **Parallel execution** | Self-organize task claiming | ❌ No |
| **Validation gates** | Only via hooks (limited) | ❌ No |
| **Deterministic order** | Teammates self-coordinate | ❌ No |
| **Guaranteed completion** | Team decides when done | ❌ No |

### 4.4 The Core Problem: Autonomy

Agent teams are designed for **autonomous self-organization**.

We need **deterministic execution**.

From the documentation:

> "There are two ways agent teams get started: You request a team... or Claude proposes a team. In both cases, you stay in control. Claude won't create a team without your approval."

But once approved, **the team self-organizes**:
- Team lead decides how many teammates
- Teammates claim tasks autonomously
- Execution order is non-deterministic
- We can't guarantee exactly 4 agents run

### 4.5 Could Hooks Fix This?

Agent teams support hooks:
- `TeammateIdle` - When teammate is about to exit
- `TaskCompleted` - When task is marked complete

**But this is insufficient**:
- Hooks are **reactive** (respond to events), not **proactive** (control flow)
- Can block bad state but can't enforce "launch exactly these 4 agents"
- Validation is limited to what hooks can check

### 4.6 Decision: Use Subagents with Task Tool Instead

**Subagents** (Claude Code's Task tool):
- We explicitly invoke each agent
- We control model selection (`model: haiku`, `model: opus`)
- We control tool access (`tools: Read, Grep, Glob`)
- We control execution (`run_in_background: true`)
- We validate outputs before proceeding

**This gives us determinism while keeping agent intelligence.**

---

## 5. Our Architecture Decision: Workflow-Orchestrated Subagents

### 5.1 The Hybrid Approach

We chose a **hybrid architecture**:

```
┌─────────────────────────────────────────────┐
│         ORCHESTRATION LAYER                  │
│         (Bash/Node Scripts)                  │
│  ┌───────────────────────────────────────┐  │
│  │  Deterministic Flow Control            │  │
│  │  - Phase gates                         │  │
│  │  - Sequential execution                │  │
│  │  - Error handling                      │  │
│  └───────────────────────────────────────┘  │
└────────────────┬────────────────────────────┘
                 │
                 ├─── Phase 1 Script ──┐
                 ├─── Phase 2 Script   │
                 ├─── Phase 3 Script   │  Sequential
                 ├─── Phase 4 Script   │  Execution
                 ├─── Phase 5 Script   │
                 └─── Phase 6 Script ──┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │     SUBAGENT LAYER             │
         │     (Task Tool)                │
         │  ┌──────────┐  ┌──────────┐   │
         │  │ Analyzer │  │ Analyzer │   │  Parallel
         │  │    01    │  │    02    │   │  Execution
         │  └──────────┘  └──────────┘   │
         │  ┌──────────┐  ┌──────────┐   │
         │  │ Analyzer │  │ Analyzer │   │
         │  │    03    │  │    04    │   │
         │  └──────────┘  └──────────┘   │
         │         │                      │
         │         ▼                      │
         │  ┌──────────────┐             │
         │  │ Synthesizer  │             │
         │  │   (Opus)     │             │
         │  └──────────────┘             │
         └───────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │     VALIDATION LAYER           │
         │  - JSON Schema validation      │
         │  - Length enforcement          │
         │  - Auto-repair                 │
         │  - Retry with feedback         │
         └───────────────────────────────┘
```

### 5.2 Why This Works

**Workflow Layer** (scripts):
- ✅ Deterministic execution order
- ✅ Programmatic validation gates
- ✅ Explicit error handling
- ✅ Retry logic with exponential backoff

**Subagent Layer** (AI):
- ✅ Parallel analysis of codebase
- ✅ Intelligent synthesis
- ✅ Stack-agnostic flexibility

**Validation Layer** (validators):
- ✅ Schema enforcement
- ✅ Auto-repair common issues
- ✅ Retry with feedback

### 5.3 What We Control vs What LLM Controls

| Aspect | Controlled By | Method |
|--------|--------------|--------|
| **Which agents run** | Scripts | Explicit Task tool invocation |
| **When agents run** | Scripts | Phase gates |
| **How many agents** | Scripts | Fixed: 4 analyzers + 1 synthesizer |
| **Agent model** | Scripts | Frontmatter: `model: haiku` or `model: opus` |
| **Agent tools** | Scripts | Frontmatter: `tools: Read, Grep, Glob` |
| **Output format** | Validators | JSON Schema enforcement |
| **File length** | Validators | Line counting + truncation |
| **What to analyze** | LLM | Agent explores codebase |
| **What to write** | LLM | Synthesizer generates content |

### 5.4 Concrete Example: Phase 1

**OLD (AI-driven)**:
```markdown
## Phase 1

Launch 4 subagents in parallel using the Task tool...

For EACH agent:
- Use Task tool with specific configuration
- run_in_background: true
```
→ LLM interprets, might skip, reorder, or improvise

**NEW (Workflow-orchestrated)**:
```bash
# scripts/phase1-analysis.sh

# Read agent definitions
AGENTS=(
  "01-structure-architecture.md"
  "02-tech-stack-dependencies.md"
  "03-code-patterns-testing.md"
  "04-data-flows-integrations.md"
)

# Launch each agent programmatically
for agent_file in "${AGENTS[@]}"; do
  # Extract frontmatter
  AGENT_MODEL=$(grep "^model:" "$agent_file" | cut -d' ' -f2)

  # Launch via Task tool (programmatically, not via LLM)
  AGENT_ID=$(claude-code task create \
    --file="$agent_file" \
    --model="$AGENT_MODEL" \
    --background)

  AGENT_IDS+=("$AGENT_ID")
done

# Wait for ALL agents
for agent_id in "${AGENT_IDS[@]}"; do
  claude-code task wait "$agent_id"
done
```
→ Script controls exactly which, when, how

---

## 6. Determinism: The Core Principle

### 6.1 What Is Determinism in Agent Systems?

**Deterministic** = Same inputs produce same process

**NOT** same outputs (content varies per stack)

| Aspect | Deterministic (✅) | Non-Deterministic (❌) |
|--------|-------------------|----------------------|
| **Steps executed** | Always 26 steps | Varies (might skip) |
| **Phase order** | Always 1→2→3→4→5→6 | Varies (might reorder) |
| **Agents launched** | Always 4 analyzers + 1 synthesizer | Varies (LLM decides) |
| **Validation** | Always validates | Might skip |
| **File formats** | Always YAML + Markdown | Varies (might be JSON) |
| **Length constraints** | Always enforced | Might be ignored |
| **Content** | Varies per project ✅ | Varies per project ✅ |

### 6.2 The Forcing Function Principle

From obra/superpowers:

> **"Mandatory workflows, not suggestions"**

Examples of forcing functions:

| Forcing Function | How It Works | Without It |
|-----------------|-------------|-----------|
| **Phase gates** | Script blocks until phase completes | LLM might skip phases |
| **JSON Schema** | Validator rejects invalid format | LLM might return JSON instead of YAML |
| **Line counting** | Validator truncates if exceeded | LLM might ignore line limits |
| **Required fields** | Validator fails if missing | LLM might omit sections |
| **Retry with feedback** | Validator retries with errors | LLM sees no feedback |

### 6.3 Poka-Yoke: Making Mistakes Impossible

**Poka-yoke** (error-proofing) from manufacturing:

From Anthropic's research:

> **"Modify tool arguments to make mistakes harder"**

Examples in our implementation:

1. **Absolute file paths** - Prevents wrong directory operations
2. **Enum validation** - Agent name must be one of 4 values
3. **Max items** - NEEDS_VERIFICATION limited to 3 items
4. **Format detection** - Auto-detect and reject JSON where markdown expected
5. **Frontmatter validation** - Must start with `---`, have required fields

### 6.4 The Junior Engineer Test

Ask: **"Could an enthusiastic junior engineer follow these instructions?"**

**BAD (AI-driven)**:
```
Generate a CLAUDE.md file with quick reference information.
Keep it concise.
```
→ Junior might write 500 lines ("thorough = good!")

**GOOD (Workflow with forcing function)**:
```javascript
const lineCount = countLines(claudeContent);
if (lineCount > 200) {
  claudeContent = truncateToLines(claudeContent, 200);
  console.warn(`Truncated from ${lineCount} to 200 lines`);
}
```
→ Impossible to exceed limit

---

## 7. Industry Best Practices Applied

### 7.1 Schema-Based Contract Enforcement

**Source**: GitHub Engineering Blog

> **"Treat schema violations like contract failures: retry, repair, or escalate"**

**Our Implementation**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["agent_name", "timestamp", "findings"],
  "properties": {
    "agent_name": {
      "enum": [
        "structure-architecture-analyzer",
        "tech-stack-dependencies-analyzer",
        "code-patterns-testing-analyzer",
        "data-flows-integrations-analyzer"
      ]
    },
    "needs_verification": {
      "type": "array",
      "maxItems": 3
    }
  }
}
```

**Benefits**:
- Explicit contract
- Machine-validateable
- Clear error messages
- Enables retry with feedback

### 7.2 Two-Step Reasoning and Formatting

**Source**: LLM Structured Output Research

> **"Step 1: Free-form thinking, Step 2: Structured formatting - constraining early degrades reasoning 10-15%"**

**Our Implementation**:

Phase 3 (Synthesis) uses Opus **without format constraints** during thinking:
```markdown
Analyze the consolidated findings and generate documentation...

Think deeply about:
- Architecture patterns
- Critical workflows
- Gotchas and non-obvious patterns

After thinking, output in this EXACT format:
# CLAUDE.md Content
[content]
---
# project-context/SKILL.md Content
[content]
```

Then Phase 4 **validates format** and retries if needed.

### 7.3 Retry with Exponential Backoff

**Source**: Microsoft Azure AI, Sparkco

> **"Exponential backoff with jitter, ensuring system stability"**

**Our Implementation**:
```json
{
  "strategy": "exponential_backoff",
  "global": {
    "max_attempts": 3,
    "initial_delay_ms": 1000,
    "backoff_multiplier": 2,
    "jitter": true,
    "jitter_factor": 0.1
  }
}
```

**Why it works**:
- Transient errors resolve over time
- Jitter prevents thundering herd
- Feedback improves next attempt

### 7.4 Error Classification

**Source**: Microsoft Azure AI

> **"Classify errors: transient (retry), policy (needs approval), semantic (needs plan change)"**

**Our Implementation**:
```json
{
  "error_handling": {
    "transient_errors": [
      "network_error",
      "timeout",
      "rate_limit"
    ],
    "fatal_errors": [
      "missing_required_dependency",
      "invalid_project_path",
      "framework_not_installed"
    ]
  }
}
```

- **Transient** → Retry automatically
- **Fatal** → Fail immediately with clear error

### 7.5 Hooks as Quality Gates

**Source**: Claude Code documentation

**Our Implementation**:

```python
# hooks/validate-subagent-output.py
def validate(agent_output):
    # Check required sections
    if "findings" not in agent_output:
        return {"decision": "block", "reason": "Missing findings"}

    # Check NEEDS_VERIFICATION count
    if len(agent_output.get("needs_verification", [])) > 3:
        return {"decision": "block", "reason": "Too many NEEDS_VERIFICATION"}

    return {"decision": "allow"}
```

**Exit codes**:
- `0` → Allow (continue)
- `2` → Block (retry or fail)

---

## 8. Validation Strategy

### 8.1 Validation at Every Boundary

From GitHub Engineering Blog:

> **"Most multi-agent workflow failures come down to missing structure, not model capability"**

**Our validation boundaries**:

```
Agent Output → Validator → Consolidation
                   ↓
              [BLOCK if invalid]
              [REPAIR if fixable]
              [RETRY with feedback]

Synthesis → Validator → File Write
              ↓
         [Same checks]

File Write → Validator → Phase Complete
              ↓
         [Final checks]
```

### 8.2 The Validation Pyramid

```
              ┌──────────────┐
              │ Format Valid │  ← Must be YAML, not JSON
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ Schema Valid │  ← Must match JSON Schema
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │ Length Valid │  ← Must be within limits
              └──────┬───────┘
                     │
              ┌──────▼───────┐
              │Content Valid │  ← Must have required sections
              └──────────────┘
```

Each layer builds on the previous.

### 8.3 Auto-Repair Strategy

**Philosophy**: Fix what we can, fail fast on what we can't

**Auto-repairable**:
- ✅ Missing frontmatter delimiters (`---`)
- ✅ NEEDS_VERIFICATION markers (remove)
- ✅ Malformed JSON (parse and restructure)
- ✅ Content too long (smart truncation)
- ✅ Extra whitespace (trim)

**Not auto-repairable (fail fast)**:
- ❌ Missing required sections (need LLM to generate)
- ❌ Wrong language detected (need re-analysis)
- ❌ Corrupted data structures (need regeneration)

### 8.4 Retry with Feedback Loop

```
┌─────────────┐
│ Generation  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Validation  │
└──────┬──────┘
       │
       ├─ Valid → Continue
       │
       └─ Invalid ──┐
                    │
         ┌──────────▼──────────┐
         │ Auto-Repair Attempt │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │ Revalidate          │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────────────┐
         │ Still Invalid?              │
         │                             │
         │ Attempts < Max?             │
         │   ├─ Yes → Retry with       │
         │   │         error feedback  │
         │   │                         │
         │   └─ No → Fail with         │
         │            detailed errors  │
         └─────────────────────────────┘
```

---

## 9. Trade-offs and Justification

### 9.1 Complexity vs Reliability

| Approach | Complexity | Reliability | Our Choice |
|----------|-----------|-------------|------------|
| **Single prompt (v1.0)** | Low (1 file) | Low (skips steps) | ❌ |
| **Agent teams** | Medium (team config) | Medium (self-org) | ❌ |
| **Workflow + subagents (v2.0)** | High (22 files) | High (deterministic) | ✅ |

**Justification**: For a system used by **1000+ projects**, reliability >> simplicity.

### 9.2 Maintenance Burden

**v1.0 (Single prompt)**:
- Easy to edit (1 file)
- Hard to debug (no visibility)
- Hard to test (prompt changes break unpredictably)

**v2.0 (Workflow)**:
- Hard to edit (22 files)
- Easy to debug (logs at every step)
- Easy to test (unit test each validator)

**Justification**: Production systems prioritize debuggability and testability.

### 9.3 Token Cost

**v1.0**:
- Main context: 800 lines (high)
- No parallelization
- Retries re-process everything

**v2.0**:
- 4 Haiku agents in parallel (cheaper per agent)
- Smaller context per agent
- Targeted retries (only failed component)

**Result**: v2.0 is actually **cheaper** due to parallelization.

### 9.4 Time to Complete

**v1.0**: 180-300 seconds (sequential, single-threaded)

**v2.0**: < 180 seconds target
- Phase 1: 4 agents in parallel (~60s)
- Phase 3: Opus synthesis (~45s)
- Other phases: ~30s each

**Result**: v2.0 is **faster** due to parallelization.

---

## 10. Comparison Matrix

### 10.1 Architecture Approaches

| Aspect | AI-Driven Prompt | Agent Teams | Workflow + Subagents |
|--------|-----------------|-------------|---------------------|
| **Determinism** | Low | Medium | High ✅ |
| **Validation** | Self-validation | Hooks only | Multi-layer ✅ |
| **Retry logic** | Implicit | Via hooks | Explicit ✅ |
| **Control** | Interpret prompt | Self-organize | Programmatic ✅ |
| **Parallelization** | No | Yes | Yes ✅ |
| **Debugging** | Hard (black box) | Medium | Easy ✅ |
| **Testing** | Hard | Medium | Easy ✅ |
| **Complexity** | Low | Medium | High ⚠️ |
| **Best for** | Prototypes | Exploration | Production ✅ |

### 10.2 When to Use What

| Use Case | Recommended Approach |
|----------|---------------------|
| **Prototype/Demo** | AI-driven prompt |
| **Research/Exploration** | Agent teams |
| **Production system (1000+ users)** | Workflow + subagents ✅ |
| **Known process, fixed steps** | Workflow + subagents ✅ |
| **Unknown process, discovery** | Agent teams |

---

## 11. Implementation Highlights

### 11.1 Directory Structure

```
initialize-project/
├── SKILL.md                    # 82 lines (was 800+)
├── scripts/
│   ├── orchestrate-initialization.sh   # Main entry
│   ├── phase1-analysis.sh              # Launch 4 agents
│   ├── phase2-consolidation.sh         # Merge + gaps
│   ├── phase3-synthesis.sh             # Opus synthesis
│   ├── phase4-filewriting.sh           # Write files
│   ├── phase5-resources.sh             # Copy skills/agents
│   └── phase6-validation.sh            # Final validation
├── utils/validators/
│   ├── validate-agent-output.js        # JSON Schema
│   ├── auto-repair.js                  # Fix common issues
│   ├── validate-synthesis.js           # Length/format
│   ├── validate-file-links.js          # Skill references
│   └── retry-with-feedback.js          # Retry mechanism
├── config/
│   ├── schemas/                        # JSON Schemas
│   ├── validation-rules.json           # Constraints
│   ├── retry-config.json               # Retry config
│   └── skill-requirements.json         # Required skills
└── hooks/
    ├── validate-subagent-output.py     # Quality gate
    └── validate-phase-completion.py    # Phase gate
```

### 11.2 Execution Flow

```bash
# User invokes
/initialize-project /path/to/project

# Calls
bash orchestrate-initialization.sh /path/to/project

# Which calls (sequentially)
├─ phase1-analysis.sh
│   ├─ Launch agent 01 (background)
│   ├─ Launch agent 02 (background)
│   ├─ Launch agent 03 (background)
│   ├─ Launch agent 04 (background)
│   ├─ Wait for all 4
│   └─ Validate each output
│
├─ phase2-consolidation.sh
│   ├─ Merge 4 outputs
│   ├─ Identify gaps
│   └─ Ask user questions (if needed)
│
├─ phase3-synthesis.sh
│   ├─ Invoke Opus synthesizer
│   ├─ Validate output
│   └─ Retry if needed
│
├─ phase4-filewriting.sh
│   ├─ Parse synthesis
│   ├─ Validate CLAUDE.md
│   ├─ Validate project-context
│   └─ Write files
│
├─ phase5-resources.sh
│   ├─ Detect stack
│   ├─ Copy skills
│   ├─ Generate agents
│   └─ Copy commands
│
└─ phase6-validation.sh
    ├─ Validate all files exist
    ├─ Validate formats correct
    ├─ Count skills/agents
    └─ Display metrics
```

### 11.3 Key Metrics

**Success Criteria**:
- Format validation: 100% pass rate (with auto-repair)
- CLAUDE.md length: < 200 lines (target 100-150)
- project-context length: 250-400 lines (target 300)
- Required skills linked: 100%
- Phase completion: 100% (all 6 phases)
- Time to completion: < 180 seconds
- NEEDS_VERIFICATION: 0 per output

---

## 12. Lessons Learned

### 12.1 Key Takeaways

1. **"Use workflows for deterministic phases"** (Anthropic)
   - Don't ask LLM to orchestrate well-defined processes
   - Use scripts for control flow
   - Use LLM for intelligence (analysis, synthesis)

2. **"Most failures come from missing structure"** (GitHub)
   - Add validation at every boundary
   - Enforce contracts with schemas
   - Auto-repair when possible

3. **"Mandatory workflows, not suggestions"** (obra/superpowers)
   - Make mistakes impossible (poka-yoke)
   - Use forcing functions
   - Junior engineer test

4. **"Constrain later, not earlier"** (LLM Research)
   - Let LLM think freely
   - Enforce format afterward
   - Retry with feedback

5. **Agent teams ≠ Production orchestration**
   - Great for exploration
   - Not for deterministic workflows
   - Use subagents with explicit control

### 12.2 When to Deviate

**Use AI orchestration when**:
- Process is unknown (discovery required)
- Requirements emerge during execution
- Flexibility > predictability
- Prototype/research phase

**Use workflow orchestration when**:
- Process is well-defined
- Requirements are fixed
- Predictability > flexibility
- Production system

### 12.3 The Hybrid Sweet Spot

**Best of both worlds**:
- Workflow layer: Deterministic control
- Subagent layer: Intelligent analysis
- Validation layer: Quality enforcement

This gives us:
- ✅ Determinism (same process every time)
- ✅ Intelligence (AI analyzes and synthesizes)
- ✅ Flexibility (content varies per stack)
- ✅ Reliability (validation + retry)

---

## Conclusion

**The core insight**: Building production AI systems requires **structure**, not just **intelligence**.

**Agent teams** are powerful for exploration.

**Workflow orchestration** is essential for production.

**Our architecture** combines both: workflows control flow, agents provide intelligence.

**Result**: A system that works reliably for 1000+ diverse projects.

---

## References

1. [Anthropic - Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
2. [GitHub Blog - Multi-Agent Workflows](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/)
3. [obra/superpowers - Forcing Functions](https://github.com/obra/superpowers)
4. [Microsoft Azure AI - Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
5. [Agenta - Structured Outputs Guide](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)
6. [Claude Code - Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams.md)

---

**For Workshop Q&A**:

**Q**: Why not use agent teams?
**A**: Agent teams self-organize. We need deterministic execution. See section 4.

**Q**: Isn't workflow orchestration more complex?
**A**: Yes (22 files vs 1), but production systems prioritize reliability over simplicity. See section 9.1.

**Q**: When SHOULD we use agent teams?
**A**: Exploratory research, competing hypotheses, unknown optimal approach. See section 4.2.

**Q**: How do you ensure determinism with AI?
**A**: Forcing functions - make mistakes impossible through validation, not prompts. See section 6.3.

**Q**: What if a new use case doesn't fit workflows?
**A**: Evaluate: well-defined task? Known process? If yes → workflow. If no → agent teams. See section 10.2.
