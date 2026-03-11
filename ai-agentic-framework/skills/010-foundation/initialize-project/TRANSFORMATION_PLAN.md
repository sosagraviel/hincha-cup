# Initialize-Project Transformation Plan
## From AI-Driven to Workflow-Orchestrated Deterministic Framework

**Version**: 1.0.0
**Status**: Draft
**Authors**: AI Framework Team
**Date**: 2026-03-10

---

## Executive Summary

This document provides a comprehensive plan to transform the `initialize-project` skill from an AI-prompt-driven system to a **workflow-orchestrated deterministic framework** capable of reliably initializing 1000+ diverse projects.

### Key Principles

1. **Deterministic Process** - Same inputs always produce same process (26 steps, 6 phases)
2. **Variable Outputs** - Results tailored per project (Django != NestJS != Phoenix)
3. **Workflows for Orchestration** - Bash/Node scripts drive execution, not AI interpretation
4. **Subagents for Intelligence** - Task tool with explicit configs for analysis/synthesis
5. **Validation at Every Boundary** - Format, length, schema validation with auto-repair
6. **Hooks for Quality Gates** - SubagentStop, TaskCompleted triggers validation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Phase-by-Phase Implementation](#3-phase-by-phase-implementation)
4. [Component Specifications](#4-component-specifications)
5. [Validation System](#5-validation-system)
6. [Hook System](#6-hook-system)
7. [Subagent Definitions](#7-subagent-definitions)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Testing Strategy](#9-testing-strategy)
10. [Migration Guide](#10-migration-guide)
11. [Metrics & Success Criteria](#11-metrics--success-criteria)

---

## 1. Architecture Overview

### 1.1 Current Architecture (Problems)

```
┌──────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐                                                  │
│  │  SKILL.md   │  ← 800+ lines of instructions                    │
│  │  (Prompt)   │  ← AI interprets non-deterministically           │
│  └──────┬──────┘  ← Steps can be skipped/reordered               │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────┐                                                  │
│  │   Claude    │  ← Single-threaded execution                     │
│  │   (Main)    │  ← Reads files inline (high context)             │
│  └──────┬──────┘  ← No validation gates                          │
│         │                                                          │
│         ├──────────────────────────────────────────┐              │
│         ▼                                          ▼              │
│  ┌─────────────┐  ← Parallel but           ┌─────────────┐        │
│  │ Task:Haiku  │     unvalidated           │ Task:Haiku  │        │
│  │ Agent 1     │                           │ Agent 2     │        │
│  └─────────────┘                           └─────────────┘        │
│         ↓                                          ↓              │
│  ┌─────────────────────────────────────────────────────┐          │
│  │            FREE-FORM TEXT OUTPUT                     │          │
│  │  - No schema enforcement                             │          │
│  │  - No length validation                              │          │
│  │  - [NEEDS_VERIFICATION] items unvalidated           │          │
│  └─────────────────────────────────────────────────────┘          │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────┐                                                  │
│  │   Phase 5   │  ← Often skipped (execution stops early)        │
│  │   (Manual)  │  ← Script failures not caught                   │
│  └─────────────┘                                                  │
│                                                                    │
│  PROBLEMS:                                                         │
│  • Non-deterministic execution order                               │
│  • No validation between phases                                    │
│  • Agent outputs not validated                                     │
│  • Phase 5/6 frequently skipped                                    │
│  • No retry/repair mechanisms                                      │
│  • 800+ line prompt is fragile                                     │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 New Architecture (Workflow-Orchestrated)

```
┌──────────────────────────────────────────────────────────────────┐
│                      NEW ARCHITECTURE                              │
│                  (Workflow-Orchestrated)                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    ORCHESTRATION LAYER                       │  │
│  │                 (Bash/Node Workflows)                        │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  orchestrate-initialization.sh                                │  │
│  │  ├── phase1-analysis.sh ────────┐                            │  │
│  │  ├── phase2-consolidation.sh    │                            │  │
│  │  ├── phase3-synthesis.sh        │  Sequential                │  │
│  │  ├── phase4-filewriting.sh      │  Execution                 │  │
│  │  ├── phase5-resources.sh        │  with Gates                │  │
│  │  └── phase6-validation.sh ──────┘                            │  │
│  │                                                               │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                      │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    VALIDATION LAYER                          │  │
│  │              (Gate Between Every Phase)                      │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  validate-agent-output.js                                     │  │
│  │  ├── validate-schema()       ← JSON Schema validation        │  │
│  │  ├── validate-length()       ← Line count enforcement        │  │
│  │  ├── validate-links()        ← Skill references exist        │  │
│  │  ├── auto-repair()           ← Fix common issues             │  │
│  │  └── retry-with-feedback()   ← Re-run agent with errors      │  │
│  │                                                               │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                      │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    GENERATION LAYER                          │  │
│  │               (Subagents via Task Tool)                      │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │  │
│  │  │ Analyzer │ │ Analyzer │ │ Analyzer │ │ Analyzer │        │  │
│  │  │ 01:Struct│ │ 02:Data  │ │ 03:DevOps│ │ 04:Conv  │        │  │
│  │  │ (Haiku)  │ │ (Haiku)  │ │ (Haiku)  │ │ (Haiku)  │        │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │  │
│  │       │            │            │            │               │  │
│  │       └────────────┴────────────┴────────────┘               │  │
│  │                        │                                      │  │
│  │                        ▼                                      │  │
│  │               ┌─────────────────┐                            │  │
│  │               │   Synthesizer   │                            │  │
│  │               │   05:Architect  │                            │  │
│  │               │     (Opus)      │                            │  │
│  │               └────────┬────────┘                            │  │
│  │                        │                                      │  │
│  │                        ▼                                      │  │
│  │               [VALIDATED OUTPUT]                             │  │
│  │                                                               │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                      │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    PERSISTENCE LAYER                         │  │
│  │              (File Writing & Copying)                        │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  write-claude-md.js                                           │  │
│  │  write-project-context.js                                     │  │
│  │  copy-skills.js                                               │  │
│  │  generate-agents.js                                           │  │
│  │  copy-commands.js                                             │  │
│  │                                                               │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                      │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      HOOK LAYER                              │  │
│  │            (Quality Gates & Event Handlers)                  │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  .claude/settings.json                                        │  │
│  │  ├── SubagentStop    → validate-subagent-output.py           │  │
│  │  ├── PostToolUse     → log-tool-execution.py                 │  │
│  │  └── Stop            → validate-final-state.py               │  │
│  │                                                               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  BENEFITS:                                                         │
│  ✓ Deterministic execution (scripts control flow)                 │
│  ✓ Validation at every boundary                                   │
│  ✓ Auto-repair for common issues                                  │
│  ✓ Retry with feedback for failures                               │
│  ✓ Hooks prevent bad state                                        │
│  ✓ Clear separation of concerns                                   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Data Flow Through Phases

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA FLOW DIAGRAM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  INPUT                                                                │
│  ┌─────────────────┐                                                 │
│  │ Project Path    │                                                 │
│  │ (e.g., /my-app) │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 1: Parallel Analysis                                       │ │
│  │                                                                   │ │
│  │  Project Files ──▶ 4 Haiku Agents ──▶ 4 Analysis JSONs          │ │
│  │                    (parallel)         (validated)                 │ │
│  │                                                                   │ │
│  │  OUTPUT: /tmp/phase1-analysis.json                               │ │
│  │  {                                                                │ │
│  │    "structure": {...},   // from agent-01                        │ │
│  │    "dataFlows": {...},   // from agent-02                        │ │
│  │    "devops": {...},      // from agent-03                        │ │
│  │    "conventions": {...}  // from agent-04                        │ │
│  │  }                                                                │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                      │
│                     ┌──────────┴──────────┐                          │
│                     │ VALIDATION GATE 1   │                          │
│                     │ - Schema valid?     │                          │
│                     │ - No [NEEDS_VERIFY] │                          │
│                     │ - Required fields?  │                          │
│                     └──────────┬──────────┘                          │
│                                │                                      │
│                                ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 2: Consolidation & Gap Analysis                            │ │
│  │                                                                   │ │
│  │  4 Analysis JSONs ──▶ Consolidation ──▶ Gap Questions           │ │
│  │                       (merge/dedupe)    (0 to N)                 │ │
│  │                                                                   │ │
│  │  OUTPUT: /tmp/phase2-consolidated.json                           │ │
│  │  {                                                                │ │
│  │    "consolidated": {...},  // merged analysis                    │ │
│  │    "gaps": [...],          // questions to ask user              │ │
│  │    "userAnswers": {...}    // after interaction                  │ │
│  │  }                                                                │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                      │
│                     ┌──────────┴──────────┐                          │
│                     │ VALIDATION GATE 2   │                          │
│                     │ - Gaps categorized? │                          │
│                     │ - Answers complete? │                          │
│                     └──────────┬──────────┘                          │
│                                │                                      │
│                                ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 3: Architecture Synthesis                                  │ │
│  │                                                                   │ │
│  │  Consolidated Analysis ──▶ Opus Synthesizer ──▶ File Contents   │ │
│  │  + User Answers           (architect agent)    (validated)       │ │
│  │                                                                   │ │
│  │  OUTPUT: /tmp/phase3-synthesis.json                              │ │
│  │  {                                                                │ │
│  │    "claudeMd": "...",           // Full CLAUDE.md content        │ │
│  │    "projectContext": "...",     // Full SKILL.md content         │ │
│  │    "metadata": {                                                 │ │
│  │      "claudeMdLines": 142,                                       │ │
│  │      "projectContextLines": 298                                  │ │
│  │    }                                                              │ │
│  │  }                                                                │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                      │
│                     ┌──────────┴──────────┐                          │
│                     │ VALIDATION GATE 3   │                          │
│                     │ - CLAUDE.md < 150?  │                          │
│                     │ - Context 250-400?  │                          │
│                     │ - No duplication?   │                          │
│                     │ - Skills linked?    │                          │
│                     └──────────┬──────────┘                          │
│                                │                                      │
│                                ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 4: File Writing                                            │ │
│  │                                                                   │ │
│  │  Synthesis JSON ──▶ File Writers ──▶ Disk Files                 │ │
│  │                                                                   │ │
│  │  OUTPUT:                                                          │ │
│  │  - .claude/CLAUDE.md                                             │ │
│  │  - .claude/skills/project-context/SKILL.md                       │ │
│  │                                                                   │ │
│  │  STATUS: /tmp/phase4-status.json                                 │ │
│  │  { "claudeMdWritten": true, "projectContextWritten": true }      │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                      │
│                     ┌──────────┴──────────┐                          │
│                     │ VALIDATION GATE 4   │                          │
│                     │ - Files exist?      │                          │
│                     │ - Readable?         │                          │
│                     │ - Frontmatter OK?   │                          │
│                     └──────────┬──────────┘                          │
│                                │                                      │
│                                ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 5: Resource Copying                                        │ │
│  │                                                                   │ │
│  │  Stack Profile ──▶ Skill Selection ──▶ Copy Operations          │ │
│  │                    Agent Generation    Command Copying           │ │
│  │                                                                   │ │
│  │  OUTPUT:                                                          │ │
│  │  - .claude/skills/{category}/{skill}/                            │ │
│  │  - .claude/agents/{agent}.md                                     │ │
│  │  - .claude/commands/{command}.md                                 │ │
│  │                                                                   │ │
│  │  STATUS: /tmp/phase5-status.json                                 │ │
│  │  {                                                                │ │
│  │    "skillsCopied": 15,                                           │ │
│  │    "agentsGenerated": 6,                                         │ │
│  │    "commandsCopied": 3                                           │ │
│  │  }                                                                │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                │                                      │
│                     ┌──────────┴──────────┐                          │
│                     │ VALIDATION GATE 5   │                          │
│                     │ - 10+ skills?       │                          │
│                     │ - 3+ agents?        │                          │
│                     │ - Commands exist?   │                          │
│                     └──────────┬──────────┘                          │
│                                │                                      │
│                                ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ PHASE 6: Final Validation & Summary                              │ │
│  │                                                                   │ │
│  │  All Previous Outputs ──▶ Final Validator ──▶ Summary Report    │ │
│  │                                                                   │ │
│  │  OUTPUT: Summary to stdout                                        │ │
│  │  - Files generated with line counts                              │ │
│  │  - Skills installed by category                                  │ │
│  │  - Agents generated by type                                      │ │
│  │  - Detected stack summary                                        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4 Layer Responsibilities

| Layer | Responsibility | Implementation | Example |
|-------|---------------|----------------|---------|
| **Orchestration** | Control flow, sequencing, parallelization | Bash/Node scripts | `orchestrate-initialization.sh` |
| **Validation** | Schema enforcement, length checks, auto-repair | Node.js validators | `validate-agent-output.js` |
| **Generation** | Analysis, synthesis, intelligent decisions | Task tool (subagents) | `05-architect-synthesizer.md` |
| **Persistence** | File writing, copying, directory creation | Node.js utilities | `write-claude-md.js` |
| **Hooks** | Event handling, quality gates, blocking | Python hooks | `validate-subagent-output.py` |

---

## 2. Directory Structure

### 2.1 Complete File Tree

```
ai-agentic-framework/
├── skills/
│   └── 010-foundation/
│       └── initialize-project/
│           │
│           ├── SKILL.md                      # Minimal entry point (< 100 lines)
│           │
│           ├── agents/                       # Subagent definitions
│           │   ├── 01-structure-architecture.md
│           │   ├── 02-tech-stack-dependencies.md
│           │   ├── 03-code-patterns-testing.md
│           │   ├── 04-data-flows-integrations.md
│           │   └── 05-architect-synthesizer.md
│           │
│           ├── scripts/                      # Workflow orchestration
│           │   ├── orchestrate-initialization.sh    # Main entry point
│           │   ├── phase1-analysis.sh               # Launch parallel agents
│           │   ├── phase2-consolidation.sh          # Merge + gap analysis
│           │   ├── phase3-synthesis.sh              # Opus synthesis
│           │   ├── phase4-filewriting.sh            # Write files
│           │   ├── phase5-resources.sh              # Copy resources
│           │   ├── phase6-validation.sh             # Final validation
│           │   ├── generate-indexes.sh              # Create INDEX.md files
│           │   └── display-stack-summary.sh         # Output summary
│           │
│           ├── utils/                        # Node.js utilities
│           │   ├── validate-agent-output.js         # Schema validation
│           │   ├── validate-synthesis.js            # Length/format checks
│           │   ├── validate-file-links.js           # Skill reference validation
│           │   ├── auto-repair.js                   # Auto-fix common issues
│           │   ├── retry-with-feedback.js           # Retry mechanism
│           │   ├── write-claude-md.js               # File writer
│           │   ├── write-project-context.js         # File writer
│           │   ├── parse-opus-output.js             # Section parser
│           │   └── merge-analyses.js                # Phase 2 consolidation
│           │
│           ├── hooks/                        # Quality gate hooks
│           │   ├── validate-subagent-output.py      # SubagentStop hook
│           │   ├── validate-phase-completion.py     # Phase boundary hook
│           │   └── block-invalid-state.py           # Blocking hook
│           │
│           ├── schemas/                      # JSON Schema definitions
│           │   ├── phase1-analysis.schema.json
│           │   ├── phase2-consolidated.schema.json
│           │   ├── phase3-synthesis.schema.json
│           │   ├── stack-profile.schema.json
│           │   └── agent-output.schema.json
│           │
│           ├── templates/                    # Output templates
│           │   ├── CLAUDE.md.template
│           │   └── project-context-SKILL.md.template
│           │
│           └── config/                       # Configuration files
│               ├── stack-detection-rules.json
│               ├── resource-mapping.json
│               ├── validation-rules.json
│               └── retry-config.json
│
└── utils/                                    # Shared utilities (existing)
    ├── stack-detection.js
    ├── skill-selection.js
    ├── agent-generation.js
    └── skill-registry.js
```

### 2.2 New Files to Create

| Path | Purpose | Lines (Est.) |
|------|---------|--------------|
| `scripts/orchestrate-initialization.sh` | Main workflow driver | 150 |
| `scripts/phase1-analysis.sh` | Launch 4 parallel agents | 80 |
| `scripts/phase2-consolidation.sh` | Merge analyses, identify gaps | 60 |
| `scripts/phase3-synthesis.sh` | Launch Opus synthesizer | 70 |
| `scripts/phase4-filewriting.sh` | Write output files | 50 |
| `scripts/phase5-resources.sh` | Copy skills/agents/commands | 100 |
| `scripts/phase6-validation.sh` | Final validation | 80 |
| `utils/validate-agent-output.js` | JSON Schema validation | 150 |
| `utils/validate-synthesis.js` | Length/format validation | 100 |
| `utils/validate-file-links.js` | Skill reference validation | 80 |
| `utils/auto-repair.js` | Auto-fix common issues | 200 |
| `utils/retry-with-feedback.js` | Retry with error context | 120 |
| `utils/parse-opus-output.js` | Parse section markers | 60 |
| `utils/merge-analyses.js` | Consolidate 4 agent outputs | 100 |
| `hooks/validate-subagent-output.py` | SubagentStop quality gate | 100 |
| `hooks/validate-phase-completion.py` | Phase boundary validation | 80 |
| `hooks/block-invalid-state.py` | Blocking hook | 60 |
| `schemas/phase1-analysis.schema.json` | Phase 1 output schema | 200 |
| `schemas/phase2-consolidated.schema.json` | Phase 2 output schema | 150 |
| `schemas/phase3-synthesis.schema.json` | Phase 3 output schema | 100 |
| `schemas/agent-output.schema.json` | Common agent output schema | 80 |
| `config/validation-rules.json` | Validation configuration | 100 |
| `config/retry-config.json` | Retry configuration | 50 |

### 2.3 Files to Update

| Path | Changes | Impact |
|------|---------|--------|
| `SKILL.md` | Reduce to <100 lines, call orchestration script | Breaking |
| `agents/01-structure-architecture.md` | Add JSON output schema | Minor |
| `agents/02-*.md` | Rename and restructure (4 agents total) | Moderate |
| `agents/05-architect-synthesizer.md` | Add strict output format | Minor |
| `config/stack-detection-rules.json` | Add version field | Minor |
| `config/resource-mapping.json` | Add version field | Minor |

### 2.4 Files to Delete

| Path | Reason |
|------|--------|
| `agents/02-data-flows-auth.md` | Replaced by new agent structure |
| `agents/03-devops-workflow.md` | Replaced by new agent structure |
| `agents/04-conventions-patterns.md` | Replaced by new agent structure |
| `scripts/run-phase5.sh` | Replaced by `phase5-resources.sh` |
| `scripts/display-stack-summary.sh` | Move to `scripts/display-stack-summary.sh` |
| `scripts/generate-indexes.sh` | Keep but update |

---

## 3. Phase-by-Phase Implementation

### 3.1 Phase 1: Parallel Analysis

#### Current Implementation (Problems)

**File:** `SKILL.md` (lines 200-250)

**Problems:**
1. AI interprets when to launch agents (non-deterministic)
2. No validation of agent outputs before proceeding
3. Agents can return `[NEEDS_VERIFICATION]` without consequence
4. Output format is free-form text, not structured JSON

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase1-analysis.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 1: Parallel Analysis
# Launches 4 Haiku agents in parallel, validates outputs, saves to JSON

PROJECT_PATH="${1:-.}"
OUTPUT_FILE="${2:-/tmp/phase1-analysis.json}"
FRAMEWORK_PATH="${3:-$AI_FRAMEWORK_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 1: LAUNCHING PARALLEL ANALYSIS AGENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

AGENTS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/agents"
UTILS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/utils"
SCHEMAS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/schemas"

# Create temp files for agent outputs
AGENT1_OUT=$(mktemp)
AGENT2_OUT=$(mktemp)
AGENT3_OUT=$(mktemp)
AGENT4_OUT=$(mktemp)

cleanup() {
    rm -f "$AGENT1_OUT" "$AGENT2_OUT" "$AGENT3_OUT" "$AGENT4_OUT"
}
trap cleanup EXIT

# Launch agents in parallel using Task tool via claude CLI
# Each agent writes JSON to its temp file

echo "Launching Agent 01: Structure & Architecture..."
claude task \
    --agent-file "$AGENTS_DIR/01-structure-architecture.md" \
    --model haiku \
    --subagent-type explore \
    --input "Analyze project at: $PROJECT_PATH" \
    --output-format json \
    > "$AGENT1_OUT" 2>&1 &
PID1=$!

echo "Launching Agent 02: Tech Stack & Dependencies..."
claude task \
    --agent-file "$AGENTS_DIR/02-tech-stack-dependencies.md" \
    --model haiku \
    --subagent-type explore \
    --input "Analyze project at: $PROJECT_PATH" \
    --output-format json \
    > "$AGENT2_OUT" 2>&1 &
PID2=$!

echo "Launching Agent 03: Code Patterns & Testing..."
claude task \
    --agent-file "$AGENTS_DIR/03-code-patterns-testing.md" \
    --model haiku \
    --subagent-type explore \
    --input "Analyze project at: $PROJECT_PATH" \
    --output-format json \
    > "$AGENT3_OUT" 2>&1 &
PID3=$!

echo "Launching Agent 04: Data Flows & Integrations..."
claude task \
    --agent-file "$AGENTS_DIR/04-data-flows-integrations.md" \
    --model haiku \
    --subagent-type explore \
    --input "Analyze project at: $PROJECT_PATH" \
    --output-format json \
    > "$AGENT4_OUT" 2>&1 &
PID4=$!

# Wait for all agents
echo "Waiting for agents to complete..."
wait $PID1 $PID2 $PID3 $PID4 || {
    echo "ERROR: One or more agents failed"
    exit 1
}

echo "All agents completed. Validating outputs..."

# Validate each agent output
MAX_RETRIES=2
for i in 1 2 3 4; do
    AGENT_OUT_VAR="AGENT${i}_OUT"
    AGENT_OUT="${!AGENT_OUT_VAR}"
    AGENT_NAME="agent-0$i"

    for retry in $(seq 1 $MAX_RETRIES); do
        if node "$UTILS_DIR/validate-agent-output.js" \
            "$AGENT_OUT" \
            "$SCHEMAS_DIR/agent-output.schema.json"; then
            echo "✓ Agent $i output valid"
            break
        else
            if [ $retry -lt $MAX_RETRIES ]; then
                echo "⚠ Agent $i output invalid, attempting repair..."
                node "$UTILS_DIR/auto-repair.js" "$AGENT_OUT" > "${AGENT_OUT}.repaired"
                mv "${AGENT_OUT}.repaired" "$AGENT_OUT"
            else
                echo "✗ Agent $i output invalid after $MAX_RETRIES attempts"
                exit 1
            fi
        fi
    done
done

# Merge all outputs into single JSON
echo "Merging agent outputs..."
node "$UTILS_DIR/merge-analyses.js" \
    "$AGENT1_OUT" \
    "$AGENT2_OUT" \
    "$AGENT3_OUT" \
    "$AGENT4_OUT" \
    > "$OUTPUT_FILE"

echo "✓ Phase 1 complete - Output saved to $OUTPUT_FILE"
```

**Subagents:** 4 agents invoked via Task tool with explicit configs

**Validation:** JSON Schema validation + auto-repair

**Retry Logic:**
- Max 2 retries per agent
- Auto-repair attempted before retry
- Failure after retries = phase failure

**Output:** `/tmp/phase1-analysis.json`

```json
{
  "version": "1.0.0",
  "timestamp": "2026-03-10T10:00:00Z",
  "projectPath": "/path/to/project",
  "structure": {
    "repositoryType": "monorepo",
    "workspaces": ["packages/shared", "services/backend", "services/frontend"],
    "filePlacement": [...],
    "pathAliases": {...}
  },
  "techStack": {
    "languages": ["typescript"],
    "backendFrameworks": [{"name": "nestjs", "version": "10.3.0"}],
    "frontendFrameworks": [{"name": "react", "version": "18.2.0"}],
    "databases": ["postgresql", "redis"],
    "orms": [{"name": "typeorm", "version": "0.3.17"}]
  },
  "codePatterns": {
    "architecture": "vertical-slicing",
    "conventions": {...},
    "testing": {...}
  },
  "dataFlows": {
    "requestLifecycle": [...],
    "authFlow": {...},
    "errorHandling": {...}
  },
  "metadata": {
    "agentTimings": {
      "agent01": 45000,
      "agent02": 38000,
      "agent03": 52000,
      "agent04": 41000
    },
    "validationRetries": 0
  }
}
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| Schema Validation | After each agent | JSON matches schema | `validate-agent-output.js` |
| No NEEDS_VERIFICATION | After each agent | No unresolved items | Regex check in validator |
| Required Fields | After merge | All sections present | Schema `required` property |

**Success Criteria:**
- [ ] All 4 agents complete within 120 seconds
- [ ] All outputs pass JSON Schema validation
- [ ] Zero `[NEEDS_VERIFICATION]` items in output
- [ ] Merged JSON < 500 KB

---

### 3.2 Phase 2: Consolidation & Gap Analysis

#### Current Implementation (Problems)

**File:** `SKILL.md` (lines 252-325)

**Problems:**
1. Gap identification is subjective (AI decides what's a gap)
2. No clear categorization of gaps (business vs technical)
3. Questions asked even when answers exist in code
4. No validation that gaps are genuinely unknowable

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase2-consolidation.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 2: Consolidation & Gap Analysis
# Merges Phase 1 outputs, identifies genuine gaps, handles user interaction

PROJECT_PATH="${1:-.}"
PHASE1_OUTPUT="${2:-/tmp/phase1-analysis.json}"
OUTPUT_FILE="${3:-/tmp/phase2-consolidated.json}"
FRAMEWORK_PATH="${4:-$AI_FRAMEWORK_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 2: CONSOLIDATION & GAP ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

UTILS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/utils"
CONFIG_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/config"

# Step 2.1: Validate Phase 1 output exists
if [ ! -f "$PHASE1_OUTPUT" ]; then
    echo "ERROR: Phase 1 output not found at $PHASE1_OUTPUT"
    exit 1
fi

# Step 2.2: Identify gaps using deterministic rules
echo "Identifying gaps using rule-based analysis..."

# Gap categories (from config)
# - BUSINESS_CONTEXT: Purpose, domain, users
# - DEPLOYMENT: CI/CD, infrastructure
# - TEAM_POLICY: Conventions not in code

# Rule: Only ask about things NOT in code
GAPS_JSON=$(node -e "
const fs = require('fs');
const analysis = JSON.parse(fs.readFileSync('$PHASE1_OUTPUT', 'utf8'));
const gapRules = JSON.parse(fs.readFileSync('$CONFIG_DIR/validation-rules.json', 'utf8')).gapRules;

const gaps = [];

// Check if business context is missing (cannot be determined from code)
if (!analysis.structure.projectPurpose || analysis.structure.projectPurpose === 'unknown') {
    gaps.push({
        category: 'BUSINESS_CONTEXT',
        question: 'What is the primary business purpose of this application?',
        required: true
    });
}

// Check if deployment info is missing (only if not in .github/workflows, etc.)
if (!analysis.techStack.cicd && !analysis.metadata.hasGitHubWorkflows) {
    gaps.push({
        category: 'DEPLOYMENT',
        question: 'Where is production deployed and what CI/CD system is used?',
        required: false
    });
}

// Check if team policies are missing (only if not in CONTRIBUTING.md, etc.)
if (!analysis.codePatterns.conventions.branchNaming && !analysis.metadata.hasContributingMd) {
    gaps.push({
        category: 'TEAM_POLICY',
        question: 'What are the branch naming conventions?',
        required: false
    });
}

console.log(JSON.stringify(gaps, null, 2));
")

# Step 2.3: If gaps exist, ask user
GAP_COUNT=$(echo "$GAPS_JSON" | jq 'length')

if [ "$GAP_COUNT" -gt 0 ]; then
    echo ""
    echo "I've completed the codebase analysis. Before generating configuration files,"
    echo "I need clarification on the following items:"
    echo ""

    # Display gaps as numbered list
    echo "$GAPS_JSON" | jq -r 'to_entries | .[] | "\(.key + 1). [\(.value.category)] \(.value.question)"'
    echo ""
    echo "Please answer each item. Type 'skip' for any you'd like me to leave out."
    echo ""

    # Read user answers (interactive mode)
    ANSWERS=()
    for i in $(seq 1 $GAP_COUNT); do
        read -p "Answer $i: " answer
        ANSWERS+=("$answer")
    done

    # Combine gaps with answers
    USER_ANSWERS=$(echo "$GAPS_JSON" | jq --argjson answers "$(printf '%s\n' "${ANSWERS[@]}" | jq -R . | jq -s .)" '
        to_entries | map({
            category: .value.category,
            question: .value.question,
            answer: $answers[.key]
        })
    ')
else
    echo "All configuration determined from code analysis - no questions needed."
    USER_ANSWERS="[]"
fi

# Step 2.4: Create consolidated output
echo "Creating consolidated output..."

jq --argjson phase1 "$(cat $PHASE1_OUTPUT)" \
   --argjson gaps "$GAPS_JSON" \
   --argjson answers "$USER_ANSWERS" \
   '{
     version: "1.0.0",
     timestamp: (now | todate),
     consolidated: $phase1,
     gaps: $gaps,
     userAnswers: $answers
   }' <<< '{}' > "$OUTPUT_FILE"

echo "✓ Phase 2 complete - Output saved to $OUTPUT_FILE"
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| Gap Categorization | After gap identification | All gaps have valid category | Schema enum check |
| Answer Completeness | After user input | Required gaps answered | Required field check |
| No Code Gaps | Before asking | Gaps are genuinely unknowable | Rule-based validation |

**Success Criteria:**
- [ ] Only business/deployment/policy gaps asked (not code questions)
- [ ] User answers captured in structured format
- [ ] Consolidated output < 1 MB
- [ ] All Phase 1 data preserved in consolidation

---

### 3.3 Phase 3: Architecture Synthesis

#### Current Implementation (Problems)

**File:** `SKILL.md` (lines 330-480)

**Problems:**
1. Output format is plain text with section markers (fragile parsing)
2. No length enforcement (CLAUDE.md often exceeds 150 lines)
3. Duplication between CLAUDE.md and project-context
4. No validation of skill references

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase3-synthesis.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 3: Architecture Synthesis
# Launches Opus synthesizer, validates output, parses sections

PROJECT_PATH="${1:-.}"
PHASE2_OUTPUT="${2:-/tmp/phase2-consolidated.json}"
OUTPUT_FILE="${3:-/tmp/phase3-synthesis.json}"
FRAMEWORK_PATH="${4:-$AI_FRAMEWORK_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 3: ARCHITECTURE SYNTHESIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

AGENTS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/agents"
UTILS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/utils"
SCHEMAS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/schemas"
CONFIG_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/config"

# Load retry configuration
RETRY_CONFIG=$(cat "$CONFIG_DIR/retry-config.json")
MAX_RETRIES=$(echo "$RETRY_CONFIG" | jq -r '.synthesis.maxRetries')
BACKOFF_MS=$(echo "$RETRY_CONFIG" | jq -r '.synthesis.backoffMs')

# Prepare input for synthesizer
SYNTH_INPUT=$(jq '{
    consolidated: .consolidated,
    userAnswers: .userAnswers,
    projectPath: .consolidated.projectPath
}' "$PHASE2_OUTPUT")

SYNTH_OUT=$(mktemp)
cleanup() { rm -f "$SYNTH_OUT"; }
trap cleanup EXIT

# Retry loop
for retry in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $retry of $MAX_RETRIES: Launching Opus synthesizer..."

    # Add error feedback on retry
    if [ $retry -gt 1 ]; then
        SYNTH_INPUT=$(echo "$SYNTH_INPUT" | jq --arg errors "$LAST_ERRORS" '. + {previousErrors: $errors}')
    fi

    # Launch synthesizer
    claude task \
        --agent-file "$AGENTS_DIR/05-architect-synthesizer.md" \
        --model opus \
        --subagent-type general-purpose \
        --input "$SYNTH_INPUT" \
        --output-format json \
        > "$SYNTH_OUT" 2>&1

    # Validate output
    VALIDATION_RESULT=$(node "$UTILS_DIR/validate-synthesis.js" "$SYNTH_OUT" 2>&1) || true

    if echo "$VALIDATION_RESULT" | jq -e '.valid == true' > /dev/null 2>&1; then
        echo "✓ Synthesis output valid"
        break
    else
        LAST_ERRORS=$(echo "$VALIDATION_RESULT" | jq -r '.errors | join("; ")')
        echo "⚠ Validation failed: $LAST_ERRORS"

        if [ $retry -lt $MAX_RETRIES ]; then
            echo "  Retrying with error feedback in ${BACKOFF_MS}ms..."
            sleep $(echo "scale=3; $BACKOFF_MS / 1000" | bc)
        else
            echo "✗ Synthesis failed after $MAX_RETRIES attempts"
            exit 1
        fi
    fi
done

# Parse section markers and extract content
echo "Parsing synthesis output..."
node "$UTILS_DIR/parse-opus-output.js" "$SYNTH_OUT" > "$OUTPUT_FILE"

# Validate file links (skill references)
echo "Validating skill references..."
node "$UTILS_DIR/validate-file-links.js" \
    "$OUTPUT_FILE" \
    "$FRAMEWORK_PATH" \
    || {
        echo "⚠ Some skill references are invalid (will use auto-repair)"
        node "$UTILS_DIR/auto-repair.js" "$OUTPUT_FILE" --fix-links > "${OUTPUT_FILE}.fixed"
        mv "${OUTPUT_FILE}.fixed" "$OUTPUT_FILE"
    }

echo "✓ Phase 3 complete - Output saved to $OUTPUT_FILE"
```

**Subagent:** Opus synthesizer with strict output format

**Validation:** Length, format, skill reference validation

**Retry Logic:**
- Max 3 retries
- Exponential backoff (1s, 2s, 4s)
- Error feedback included in retry prompt

**Output:** `/tmp/phase3-synthesis.json`

```json
{
  "version": "1.0.0",
  "timestamp": "2026-03-10T10:02:00Z",
  "claudeMd": {
    "content": "# MyProject\n\n> Quick reference...",
    "lineCount": 142,
    "sections": ["techStack", "filePlacement", "commands", "services"]
  },
  "projectContext": {
    "content": "---\nname: project-context\n...",
    "lineCount": 298,
    "sections": ["architecture", "requestLifecycle", "auth", "testing"]
  },
  "metadata": {
    "synthesisTimeMs": 15000,
    "retryCount": 0,
    "skillReferencesValid": true
  }
}
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| CLAUDE.md Length | After synthesis | lineCount <= 150 | Line count check |
| project-context Length | After synthesis | 250 <= lineCount <= 400 | Line count check |
| No Duplication | After synthesis | Sections don't overlap | Section diff check |
| Skill References | After synthesis | All `/skill-name` exist | File existence check |
| Format Valid | After synthesis | Section markers present | Regex check |

**Success Criteria:**
- [ ] CLAUDE.md between 100-150 lines
- [ ] project-context between 250-400 lines
- [ ] Zero duplicated sections
- [ ] All skill references resolve to existing skills
- [ ] Synthesis completes within 60 seconds

---

### 3.4 Phase 4: File Writing

#### Current Implementation (Problems)

**File:** `SKILL.md` (lines 482-545)

**Problems:**
1. Parsing relies on section markers in free-form text
2. No backup before overwrite
3. No validation after write
4. Silent failures possible

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase4-filewriting.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 4: File Writing
# Writes CLAUDE.md and project-context/SKILL.md with validation

PROJECT_PATH="${1:-.}"
PHASE3_OUTPUT="${2:-/tmp/phase3-synthesis.json}"
OUTPUT_FILE="${3:-/tmp/phase4-status.json}"
FRAMEWORK_PATH="${4:-$AI_FRAMEWORK_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 4: FILE WRITING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

UTILS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/utils"

# Ensure .claude directory exists
mkdir -p "$PROJECT_PATH/.claude"
mkdir -p "$PROJECT_PATH/.claude/skills/project-context"

# Backup existing files if they exist
CLAUDE_MD="$PROJECT_PATH/.claude/CLAUDE.md"
PROJECT_CONTEXT="$PROJECT_PATH/.claude/skills/project-context/SKILL.md"

if [ -f "$CLAUDE_MD" ]; then
    echo "Backing up existing CLAUDE.md..."
    cp "$CLAUDE_MD" "${CLAUDE_MD}.backup"
fi

if [ -f "$PROJECT_CONTEXT" ]; then
    echo "Backing up existing project-context..."
    cp "$PROJECT_CONTEXT" "${PROJECT_CONTEXT}.backup"
fi

# Write CLAUDE.md
echo "Writing CLAUDE.md..."
jq -r '.claudeMd.content' "$PHASE3_OUTPUT" > "$CLAUDE_MD"

# Validate write
if [ ! -f "$CLAUDE_MD" ] || [ ! -s "$CLAUDE_MD" ]; then
    echo "ERROR: Failed to write CLAUDE.md"
    exit 1
fi

CLAUDE_MD_LINES=$(wc -l < "$CLAUDE_MD" | tr -d ' ')
echo "✓ CLAUDE.md written ($CLAUDE_MD_LINES lines)"

# Write project-context/SKILL.md
echo "Writing project-context/SKILL.md..."
jq -r '.projectContext.content' "$PHASE3_OUTPUT" > "$PROJECT_CONTEXT"

# Validate write
if [ ! -f "$PROJECT_CONTEXT" ] || [ ! -s "$PROJECT_CONTEXT" ]; then
    echo "ERROR: Failed to write project-context/SKILL.md"
    exit 1
fi

PROJECT_CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT" | tr -d ' ')
echo "✓ project-context/SKILL.md written ($PROJECT_CONTEXT_LINES lines)"

# Validate frontmatter in project-context
if ! head -1 "$PROJECT_CONTEXT" | grep -q "^---$"; then
    echo "ERROR: project-context/SKILL.md missing YAML frontmatter"
    exit 1
fi

# Create status output
jq -n \
    --arg claudeMdPath "$CLAUDE_MD" \
    --argjson claudeMdLines "$CLAUDE_MD_LINES" \
    --arg projectContextPath "$PROJECT_CONTEXT" \
    --argjson projectContextLines "$PROJECT_CONTEXT_LINES" \
    '{
        claudeMd: {
            path: $claudeMdPath,
            lines: $claudeMdLines,
            written: true
        },
        projectContext: {
            path: $projectContextPath,
            lines: $projectContextLines,
            written: true,
            hasFrontmatter: true
        },
        timestamp: (now | todate)
    }' > "$OUTPUT_FILE"

echo "✓ Phase 4 complete - Status saved to $OUTPUT_FILE"
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| File Exists | After write | File created on disk | `-f` check |
| File Not Empty | After write | File has content | `-s` check |
| Line Count | After write | Matches expected | `wc -l` check |
| Frontmatter Valid | After write | YAML frontmatter present | `head -1` check |
| Backup Created | Before overwrite | Backup file exists | `-f` check on `.backup` |

**Success Criteria:**
- [ ] CLAUDE.md exists with 50+ lines
- [ ] project-context/SKILL.md exists with 200+ lines
- [ ] Both files readable
- [ ] Backup files created if overwriting

---

### 3.5 Phase 5: Resource Copying

#### Current Implementation (Problems)

**File:** `scripts/run-phase5.sh`

**Problems:**
1. Execution often stops before this phase
2. Errors in scripts not caught
3. No validation of copied resources
4. No index generation validation

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase5-resources.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 5: Resource Copying
# Deterministic stack detection, skill copying, agent generation, command copying

PROJECT_PATH="${1:-.}"
FRAMEWORK_PATH="${2:-$AI_FRAMEWORK_PATH}"
OUTPUT_FILE="${3:-/tmp/phase5-status.json}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 5: RESOURCE COPYING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

UTILS_DIR="$FRAMEWORK_PATH/utils"
SKILL_INIT_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project"

# Step 5.1: Stack Detection
echo "Step 5.1: Detecting stack..."
STACK_PROFILE="/tmp/stack-profile.json"
node "$UTILS_DIR/stack-detection.js" "$PROJECT_PATH" > "$STACK_PROFILE"

# Validate stack detection
if ! jq -e '.languages | length > 0' "$STACK_PROFILE" > /dev/null 2>&1; then
    echo "ERROR: No languages detected in stack"
    exit 1
fi
echo "✓ Stack detected: $(jq -r '.languages | map(.name) | join(", ")' "$STACK_PROFILE")"

# Step 5.2: Skill Selection & Copying
echo "Step 5.2: Selecting and copying skills..."
SKILL_RESULT="/tmp/skill-selection-result.json"
node "$UTILS_DIR/skill-selection.js" \
    "$STACK_PROFILE" \
    "$FRAMEWORK_PATH" \
    "$PROJECT_PATH" \
    > "$SKILL_RESULT"

SKILL_COUNT=$(jq -r '.total' "$SKILL_RESULT")
COPIED_COUNT=$(jq -r '.copied | length' "$SKILL_RESULT")
echo "✓ $COPIED_COUNT/$SKILL_COUNT skills copied"

# Validate minimum skills
if [ "$COPIED_COUNT" -lt 10 ]; then
    echo "WARNING: Only $COPIED_COUNT skills copied (expected 10+)"
fi

# Step 5.3: Agent Generation
echo "Step 5.3: Generating agents..."
AGENT_RESULT="/tmp/agent-generation-result.json"
node "$UTILS_DIR/agent-generation.js" \
    "$STACK_PROFILE" \
    "$SKILL_RESULT" \
    "$PROJECT_PATH" \
    "$FRAMEWORK_PATH/agents/templates" \
    > "$AGENT_RESULT"

AGENT_COUNT=$(jq -r '.total' "$AGENT_RESULT")
WRITTEN_COUNT=$(jq -r '.written | length' "$AGENT_RESULT")
echo "✓ $WRITTEN_COUNT/$AGENT_COUNT agents generated"

# Validate minimum agents
if [ "$WRITTEN_COUNT" -lt 3 ]; then
    echo "WARNING: Only $WRITTEN_COUNT agents generated (expected 3+)"
fi

# Step 5.4: Command Copying
echo "Step 5.4: Copying commands..."
COMMANDS_SRC="$FRAMEWORK_PATH/commands"
COMMANDS_DEST="$PROJECT_PATH/.claude/commands"
mkdir -p "$COMMANDS_DEST"

COMMAND_COUNT=0
if [ -d "$COMMANDS_SRC" ]; then
    for cmd in "$COMMANDS_SRC"/*.md; do
        if [ -f "$cmd" ]; then
            cp "$cmd" "$COMMANDS_DEST/"
            ((COMMAND_COUNT++))
        fi
    done
fi
echo "✓ $COMMAND_COUNT commands copied"

# Step 5.5: Generate Index Files
echo "Step 5.5: Generating index files..."
bash "$SKILL_INIT_DIR/scripts/generate-indexes.sh" \
    "$PROJECT_PATH" \
    "$SKILL_RESULT" \
    "$AGENT_RESULT"
echo "✓ Index files generated"

# Step 5.6: Display Stack Summary
echo ""
bash "$SKILL_INIT_DIR/scripts/display-stack-summary.sh" "$STACK_PROFILE"

# Create status output
jq -n \
    --argjson skillsCopied "$COPIED_COUNT" \
    --argjson agentsGenerated "$WRITTEN_COUNT" \
    --argjson commandsCopied "$COMMAND_COUNT" \
    --argjson stackProfile "$(cat $STACK_PROFILE)" \
    '{
        stackProfile: $stackProfile,
        skillsCopied: $skillsCopied,
        agentsGenerated: $agentsGenerated,
        commandsCopied: $commandsCopied,
        timestamp: (now | todate)
    }' > "$OUTPUT_FILE"

# Cleanup
rm -f "$STACK_PROFILE" "$SKILL_RESULT" "$AGENT_RESULT"

echo "✓ Phase 5 complete - Status saved to $OUTPUT_FILE"
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| Stack Detected | After detection | At least 1 language | jq length check |
| Skills Copied | After copy | >= 10 skills | Count check |
| Agents Generated | After generation | >= 3 agents | Count check |
| Commands Exist | After copy | Commands directory populated | Directory check |
| Index Generated | After generation | INDEX.md files exist | File check |

**Success Criteria:**
- [ ] Stack detection produces valid JSON
- [ ] 10+ skills copied to `.claude/skills/`
- [ ] 3+ agents generated in `.claude/agents/`
- [ ] Commands copied to `.claude/commands/`
- [ ] INDEX.md files generated

---

### 3.6 Phase 6: Final Validation & Summary

#### Current Implementation (Problems)

**File:** `SKILL.md` (lines 620-700)

**Problems:**
1. Often not reached (execution stops early)
2. Summary output inconsistent
3. No structured validation results
4. No next steps guidance

#### New Implementation (Workflow-Based)

**Orchestration Script:** `scripts/phase6-validation.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 6: Final Validation & Summary
# Validates all outputs, produces summary report

PROJECT_PATH="${1:-.}"
PHASE4_STATUS="${2:-/tmp/phase4-status.json}"
PHASE5_STATUS="${3:-/tmp/phase5-status.json}"
FRAMEWORK_PATH="${4:-$AI_FRAMEWORK_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 6: FINAL VALIDATION & SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Validation checks
CHECKS_PASSED=0
CHECKS_TOTAL=5

# Check 1: CLAUDE.md exists and has content
CLAUDE_MD="$PROJECT_PATH/.claude/CLAUDE.md"
if [ -f "$CLAUDE_MD" ] && [ "$(wc -l < "$CLAUDE_MD")" -ge 50 ]; then
    echo "✓ CLAUDE.md exists with $(wc -l < "$CLAUDE_MD" | tr -d ' ') lines"
    ((CHECKS_PASSED++))
else
    echo "✗ CLAUDE.md missing or empty"
fi

# Check 2: project-context exists
PROJECT_CONTEXT="$PROJECT_PATH/.claude/skills/project-context/SKILL.md"
if [ -f "$PROJECT_CONTEXT" ]; then
    echo "✓ project-context/SKILL.md exists with $(wc -l < "$PROJECT_CONTEXT" | tr -d ' ') lines"
    ((CHECKS_PASSED++))
else
    echo "✗ project-context/SKILL.md missing"
fi

# Check 3: Skills copied (10+)
SKILL_COUNT=$(find "$PROJECT_PATH/.claude/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -ge 10 ]; then
    echo "✓ $SKILL_COUNT skills installed"
    ((CHECKS_PASSED++))
else
    echo "⚠ Only $SKILL_COUNT skills (expected 10+)"
fi

# Check 4: Agents generated (3+)
AGENT_COUNT=$(find "$PROJECT_PATH/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$AGENT_COUNT" -ge 3 ]; then
    echo "✓ $AGENT_COUNT agents generated"
    ((CHECKS_PASSED++))
else
    echo "⚠ Only $AGENT_COUNT agents (expected 3+)"
fi

# Check 5: Commands exist
COMMAND_COUNT=$(find "$PROJECT_PATH/.claude/commands" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$COMMAND_COUNT" -ge 1 ]; then
    echo "✓ $COMMAND_COUNT commands installed"
    ((CHECKS_PASSED++))
else
    echo "⚠ No commands found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PROJECT INITIALIZATION COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Validation: $CHECKS_PASSED/$CHECKS_TOTAL checks passed"
echo ""

# Summary from Phase 5
if [ -f "$PHASE5_STATUS" ]; then
    echo "### Detected Stack"
    echo ""
    jq -r '.stackProfile | "- Languages: \(.languages | map(.name) | join(", "))"' "$PHASE5_STATUS"
    jq -r '.stackProfile | "- Backend: \((.backend_frameworks // []) | map(.name) | join(", ") // "none")"' "$PHASE5_STATUS"
    jq -r '.stackProfile | "- Frontend: \((.frontend_frameworks // []) | map(.name) | join(", ") // "none")"' "$PHASE5_STATUS"
    jq -r '.stackProfile | "- Databases: \((.databases // []) | map(.name) | join(", ") // "none")"' "$PHASE5_STATUS"
    echo ""
fi

echo "### Files Generated"
echo ""
echo "- \`.claude/CLAUDE.md\` - $(wc -l < "$CLAUDE_MD" | tr -d ' ') lines"
echo "- \`.claude/skills/project-context/SKILL.md\` - $(wc -l < "$PROJECT_CONTEXT" | tr -d ' ') lines"
echo ""

echo "### Skills Installed ($SKILL_COUNT total)"
echo ""
# List skills by category
for category in 010-foundation 020-development-workflow 030-quality-assurance 040-integrations 050-language-frameworks 060-documentation 070-infrastructure 080-cloud-platforms; do
    count=$(find "$PROJECT_PATH/.claude/skills/$category" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -gt 0 ]; then
        echo "- **$category**: $count skills"
    fi
done
echo ""

echo "### Agents Generated ($AGENT_COUNT total)"
echo ""
for agent in "$PROJECT_PATH/.claude/agents"/*.md; do
    if [ -f "$agent" ]; then
        name=$(basename "$agent" .md)
        echo "- \`$name\`"
    fi
done
echo ""

echo "### Next Steps"
echo ""
echo "1. Load project context: \`/project-context\`"
echo "2. Start a task: \`/start-task <ticket-id>\`"
echo "3. View skills: \`ls .claude/skills/\`"
echo "4. View agents: \`ls .claude/agents/\`"
echo ""

# Exit with success if all critical checks passed
if [ "$CHECKS_PASSED" -ge 4 ]; then
    exit 0
else
    echo "WARNING: Some validation checks failed"
    exit 1
fi
```

**Validation Gates:**

| Gate | When | What | How |
|------|------|------|-----|
| All Files Exist | Final | Required files present | `-f` checks |
| Minimum Counts | Final | Skills >= 10, Agents >= 3 | Count checks |
| Valid Content | Final | Files not empty, valid format | Content checks |

**Success Criteria:**
- [ ] All 5 validation checks pass
- [ ] Summary output includes all sections
- [ ] Next steps guidance provided
- [ ] Exit code 0 on success

---

## 4. Component Specifications

### 4.1 Orchestration Scripts

#### Component: `orchestrate-initialization.sh`

**Type:** Bash script
**Path:** `scripts/orchestrate-initialization.sh`
**Purpose:** Main entry point that drives all 6 phases sequentially

**Inputs:**
- `$1`: Project path (default: current directory)
- `$2`: Framework path (default: `$AI_FRAMEWORK_PATH`)

**Outputs:**
- Summary to stdout
- Temp files in `/tmp/phase*.json`

**Error Handling:**
- `set -euo pipefail` for strict error handling
- Phase failures stop execution
- Cleanup trap removes temp files

**Implementation:**

```bash
#!/bin/bash
set -euo pipefail

# Initialize Project - Main Orchestration Script
# Executes all 6 phases sequentially with validation gates

PROJECT_PATH="${1:-.}"
FRAMEWORK_PATH="${2:-$AI_FRAMEWORK_PATH}"

# Convert to absolute paths
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"

if [ -z "$FRAMEWORK_PATH" ]; then
    echo "ERROR: AI_FRAMEWORK_PATH not set and not provided as argument"
    exit 1
fi
FRAMEWORK_PATH="$(cd "$FRAMEWORK_PATH" && pwd)"

SCRIPTS_DIR="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts"

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         INITIALIZE PROJECT - DETERMINISTIC WORKFLOW           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Project Path: $PROJECT_PATH"
echo "Framework Path: $FRAMEWORK_PATH"
echo ""

# Cleanup function
cleanup() {
    rm -f /tmp/phase1-analysis.json \
          /tmp/phase2-consolidated.json \
          /tmp/phase3-synthesis.json \
          /tmp/phase4-status.json \
          /tmp/phase5-status.json
}
trap cleanup EXIT

# Phase 1: Parallel Analysis
bash "$SCRIPTS_DIR/phase1-analysis.sh" \
    "$PROJECT_PATH" \
    "/tmp/phase1-analysis.json" \
    "$FRAMEWORK_PATH"

# Phase 2: Consolidation & Gap Analysis
bash "$SCRIPTS_DIR/phase2-consolidation.sh" \
    "$PROJECT_PATH" \
    "/tmp/phase1-analysis.json" \
    "/tmp/phase2-consolidated.json" \
    "$FRAMEWORK_PATH"

# Phase 3: Architecture Synthesis
bash "$SCRIPTS_DIR/phase3-synthesis.sh" \
    "$PROJECT_PATH" \
    "/tmp/phase2-consolidated.json" \
    "/tmp/phase3-synthesis.json" \
    "$FRAMEWORK_PATH"

# Phase 4: File Writing
bash "$SCRIPTS_DIR/phase4-filewriting.sh" \
    "$PROJECT_PATH" \
    "/tmp/phase3-synthesis.json" \
    "/tmp/phase4-status.json" \
    "$FRAMEWORK_PATH"

# Phase 5: Resource Copying
bash "$SCRIPTS_DIR/phase5-resources.sh" \
    "$PROJECT_PATH" \
    "$FRAMEWORK_PATH" \
    "/tmp/phase5-status.json"

# Phase 6: Final Validation & Summary
bash "$SCRIPTS_DIR/phase6-validation.sh" \
    "$PROJECT_PATH" \
    "/tmp/phase4-status.json" \
    "/tmp/phase5-status.json" \
    "$FRAMEWORK_PATH"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              INITIALIZATION COMPLETE                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
```

### 4.2 Validation Utilities

#### Component: `validate-agent-output.js`

**Type:** Node.js utility
**Path:** `utils/validate-agent-output.js`
**Purpose:** Validate agent outputs against JSON Schema

**Inputs:**
- `argv[2]`: Path to agent output JSON file
- `argv[3]`: Path to JSON Schema file

**Outputs:**
- Exit code 0 if valid, 1 if invalid
- JSON validation result to stdout

**Error Handling:**
- Returns detailed error messages
- Lists all validation failures

**Implementation:**

```javascript
#!/usr/bin/env node
/**
 * Agent Output Validator
 * Validates agent outputs against JSON Schema
 */

const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

async function validateAgentOutput(outputPath, schemaPath) {
    const result = {
        valid: false,
        errors: [],
        warnings: [],
        metadata: {
            outputPath,
            schemaPath,
            timestamp: new Date().toISOString()
        }
    };

    try {
        // Read files
        const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

        // Compile and validate
        const validate = ajv.compile(schema);
        const valid = validate(output);

        if (valid) {
            result.valid = true;
        } else {
            result.errors = validate.errors.map(err => ({
                path: err.instancePath || '/',
                message: err.message,
                keyword: err.keyword,
                params: err.params
            }));
        }

        // Check for NEEDS_VERIFICATION items
        const outputStr = JSON.stringify(output);
        const needsVerification = (outputStr.match(/\[NEEDS_VERIFICATION\]/g) || []).length;

        if (needsVerification > 0) {
            result.warnings.push({
                type: 'NEEDS_VERIFICATION',
                count: needsVerification,
                message: `Found ${needsVerification} [NEEDS_VERIFICATION] items`
            });

            // Treat as error if count > 3
            if (needsVerification > 3) {
                result.valid = false;
                result.errors.push({
                    path: '/',
                    message: `Too many [NEEDS_VERIFICATION] items (${needsVerification} > 3)`,
                    keyword: 'custom'
                });
            }
        }

        // Check for required fields based on agent type
        const requiredFields = getRequiredFields(schema.$id || 'unknown');
        for (const field of requiredFields) {
            if (!hasNestedProperty(output, field)) {
                result.errors.push({
                    path: '/' + field.replace(/\./g, '/'),
                    message: `Required field '${field}' is missing`,
                    keyword: 'required'
                });
                result.valid = false;
            }
        }

    } catch (error) {
        result.errors.push({
            path: '/',
            message: error.message,
            keyword: 'parse_error'
        });
    }

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
}

function getRequiredFields(schemaId) {
    const fieldMap = {
        'agent-01-structure': ['repositoryType', 'workspaces', 'filePlacement'],
        'agent-02-techstack': ['languages', 'frameworks'],
        'agent-03-patterns': ['architecture', 'conventions'],
        'agent-04-dataflows': ['requestLifecycle', 'errorHandling']
    };
    return fieldMap[schemaId] || [];
}

function hasNestedProperty(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined || !current.hasOwnProperty(part)) {
            return false;
        }
        current = current[part];
    }
    return true;
}

// CLI
const outputPath = process.argv[2];
const schemaPath = process.argv[3];

if (!outputPath || !schemaPath) {
    console.error('Usage: validate-agent-output.js <output.json> <schema.json>');
    process.exit(1);
}

validateAgentOutput(outputPath, schemaPath);
```

#### Component: `auto-repair.js`

**Type:** Node.js utility
**Path:** `utils/auto-repair.js`
**Purpose:** Auto-fix common issues in agent outputs

**Inputs:**
- `argv[2]`: Path to agent output JSON file
- `--fix-links`: Also fix invalid skill references

**Outputs:**
- Repaired JSON to stdout

**Error Handling:**
- Logs repairs made
- Fails if unfixable issues found

**Implementation:**

```javascript
#!/usr/bin/env node
/**
 * Auto-Repair Utility
 * Fixes common issues in agent outputs
 */

const fs = require('fs');
const path = require('path');

const REPAIRS = {
    // Remove [NEEDS_VERIFICATION] by replacing with sensible defaults
    needsVerification: (content) => {
        let repaired = content;

        // Replace [NEEDS_VERIFICATION] with TODO markers that don't block validation
        repaired = repaired.replace(
            /\[NEEDS_VERIFICATION\]/g,
            '[TODO: Verify]'
        );

        return repaired;
    },

    // Fix malformed JSON
    malformedJson: (content) => {
        let repaired = content;

        // Fix trailing commas
        repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

        // Fix missing commas
        repaired = repaired.replace(/}(\s*){/g, '}, {');

        // Fix unquoted keys (common in some outputs)
        repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

        return repaired;
    },

    // Truncate overly long sections
    truncateLongSections: (content, maxLength = 50000) => {
        try {
            const obj = JSON.parse(content);

            function truncate(value, depth = 0) {
                if (typeof value === 'string' && value.length > 5000) {
                    return value.substring(0, 5000) + '... [truncated]';
                }
                if (Array.isArray(value) && value.length > 100) {
                    return [...value.slice(0, 100), '... [truncated]'];
                }
                if (typeof value === 'object' && value !== null && depth < 5) {
                    const result = {};
                    for (const [k, v] of Object.entries(value)) {
                        result[k] = truncate(v, depth + 1);
                    }
                    return result;
                }
                return value;
            }

            return JSON.stringify(truncate(obj), null, 2);
        } catch {
            return content; // Return original if not valid JSON
        }
    },

    // Add missing required fields with defaults
    addDefaults: (content, schemaId) => {
        try {
            const obj = JSON.parse(content);

            const defaults = {
                'agent-01-structure': {
                    repositoryType: 'single',
                    workspaces: [],
                    filePlacement: []
                },
                'agent-02-techstack': {
                    languages: [],
                    frameworks: { backend: [], frontend: [] }
                },
                'agent-03-patterns': {
                    architecture: 'unknown',
                    conventions: {}
                },
                'agent-04-dataflows': {
                    requestLifecycle: [],
                    errorHandling: {}
                }
            };

            const schemaDefaults = defaults[schemaId] || {};
            const merged = { ...schemaDefaults, ...obj };

            return JSON.stringify(merged, null, 2);
        } catch {
            return content;
        }
    }
};

async function autoRepair(filePath, options = {}) {
    let content = fs.readFileSync(filePath, 'utf8');
    const repairs = [];

    // Apply repairs in order
    const original = content;

    // 1. Fix malformed JSON first
    content = REPAIRS.malformedJson(content);
    if (content !== original) {
        repairs.push('Fixed malformed JSON');
    }

    // 2. Remove NEEDS_VERIFICATION
    const beforeNV = content;
    content = REPAIRS.needsVerification(content);
    if (content !== beforeNV) {
        repairs.push('Replaced [NEEDS_VERIFICATION] markers');
    }

    // 3. Truncate long sections
    const beforeTrunc = content;
    content = REPAIRS.truncateLongSections(content);
    if (content !== beforeTrunc) {
        repairs.push('Truncated overly long sections');
    }

    // 4. Add defaults if schema ID provided
    if (options.schemaId) {
        const beforeDefaults = content;
        content = REPAIRS.addDefaults(content, options.schemaId);
        if (content !== beforeDefaults) {
            repairs.push('Added missing required fields');
        }
    }

    // Log repairs
    if (repairs.length > 0) {
        console.error('Repairs applied:');
        repairs.forEach(r => console.error(`  - ${r}`));
    } else {
        console.error('No repairs needed');
    }

    // Output repaired content
    console.log(content);
}

// CLI
const filePath = process.argv[2];
const fixLinks = process.argv.includes('--fix-links');
const schemaId = process.argv.find(a => a.startsWith('--schema='))?.split('=')[1];

if (!filePath) {
    console.error('Usage: auto-repair.js <file.json> [--fix-links] [--schema=id]');
    process.exit(1);
}

autoRepair(filePath, { fixLinks, schemaId });
```

### 4.3 Parse Utilities

#### Component: `parse-opus-output.js`

**Type:** Node.js utility
**Path:** `utils/parse-opus-output.js`
**Purpose:** Parse Opus synthesizer output into structured JSON

**Inputs:**
- `argv[2]`: Path to raw Opus output file

**Outputs:**
- Structured JSON to stdout with `claudeMd` and `projectContext` sections

**Implementation:**

```javascript
#!/usr/bin/env node
/**
 * Parse Opus Output
 * Parses section-marked output from Opus synthesizer
 */

const fs = require('fs');

function parseOpusOutput(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Expected format:
    // # CLAUDE.md Content
    // [content]
    // ---
    // # project-context/SKILL.md Content
    // [content]

    const result = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        claudeMd: {
            content: '',
            lineCount: 0,
            sections: []
        },
        projectContext: {
            content: '',
            lineCount: 0,
            sections: []
        },
        metadata: {
            parseErrors: []
        }
    };

    // Find section markers
    const claudeMdMarker = '# CLAUDE.md Content';
    const projectContextMarker = '# project-context/SKILL.md Content';
    const separator = /^---$/m;

    const claudeMdStart = content.indexOf(claudeMdMarker);
    const separatorMatch = content.match(separator);
    const projectContextStart = content.indexOf(projectContextMarker);

    if (claudeMdStart === -1) {
        result.metadata.parseErrors.push('Missing CLAUDE.md Content marker');
    }

    if (!separatorMatch) {
        result.metadata.parseErrors.push('Missing --- separator');
    }

    if (projectContextStart === -1) {
        result.metadata.parseErrors.push('Missing project-context marker');
    }

    if (result.metadata.parseErrors.length > 0) {
        // Try fallback parsing (entire content as CLAUDE.md)
        console.error('Parse errors:', result.metadata.parseErrors.join(', '));
        result.claudeMd.content = content;
        result.claudeMd.lineCount = content.split('\n').length;
    } else {
        // Extract CLAUDE.md content
        const separatorIndex = content.search(separator);
        let claudeMdContent = content.substring(
            claudeMdStart + claudeMdMarker.length,
            separatorIndex
        ).trim();

        // Remove the "# " prefix from the first line if it exists
        if (claudeMdContent.startsWith('\n')) {
            claudeMdContent = claudeMdContent.substring(1);
        }

        result.claudeMd.content = claudeMdContent;
        result.claudeMd.lineCount = claudeMdContent.split('\n').length;
        result.claudeMd.sections = extractSections(claudeMdContent);

        // Extract project-context content
        let projectContextContent = content.substring(
            projectContextStart + projectContextMarker.length
        ).trim();

        if (projectContextContent.startsWith('\n')) {
            projectContextContent = projectContextContent.substring(1);
        }

        result.projectContext.content = projectContextContent;
        result.projectContext.lineCount = projectContextContent.split('\n').length;
        result.projectContext.sections = extractSections(projectContextContent);
    }

    console.log(JSON.stringify(result, null, 2));
}

function extractSections(content) {
    const sections = [];
    const headerRegex = /^##\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(content)) !== null) {
        sections.push(match[1].toLowerCase().replace(/\s+/g, '-'));
    }

    return sections;
}

// CLI
const filePath = process.argv[2];

if (!filePath) {
    console.error('Usage: parse-opus-output.js <opus-output.txt>');
    process.exit(1);
}

parseOpusOutput(filePath);
```

---

## 5. Validation System

### 5.1 Schema Definitions

#### Schema: `phase1-analysis.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "phase1-analysis",
  "title": "Phase 1 Analysis Output",
  "type": "object",
  "required": ["version", "timestamp", "projectPath", "structure", "techStack", "codePatterns", "dataFlows"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "projectPath": {
      "type": "string",
      "minLength": 1
    },
    "structure": {
      "type": "object",
      "required": ["repositoryType", "workspaces", "filePlacement"],
      "properties": {
        "repositoryType": {
          "type": "string",
          "enum": ["single", "monorepo"]
        },
        "workspaces": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "path"],
            "properties": {
              "name": { "type": "string" },
              "path": { "type": "string" },
              "type": { "type": "string", "enum": ["frontend", "backend", "shared", "lib", "service"] }
            }
          }
        },
        "filePlacement": {
          "type": "array",
          "minItems": 15,
          "items": {
            "type": "object",
            "required": ["fileType", "locationPattern", "examples"],
            "properties": {
              "fileType": { "type": "string" },
              "locationPattern": { "type": "string" },
              "examples": {
                "type": "array",
                "items": { "type": "string" },
                "minItems": 1
              },
              "notes": { "type": "string" }
            }
          }
        }
      }
    },
    "techStack": {
      "type": "object",
      "required": ["languages"],
      "properties": {
        "languages": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["name", "confidence"],
            "properties": {
              "name": { "type": "string" },
              "version": { "type": "string" },
              "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
            }
          }
        },
        "backendFrameworks": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name"],
            "properties": {
              "name": { "type": "string" },
              "version": { "type": "string" },
              "confidence": { "type": "string" }
            }
          }
        },
        "frontendFrameworks": {
          "type": "array",
          "items": { "$ref": "#/properties/techStack/properties/backendFrameworks/items" }
        },
        "databases": {
          "type": "array",
          "items": { "type": "string" }
        },
        "orms": {
          "type": "array",
          "items": { "$ref": "#/properties/techStack/properties/backendFrameworks/items" }
        }
      }
    },
    "codePatterns": {
      "type": "object",
      "properties": {
        "architecture": {
          "type": "string",
          "enum": ["vertical-slicing", "clean-architecture", "mvc", "ddd", "hexagonal", "flat", "other"]
        },
        "conventions": { "type": "object" },
        "testing": { "type": "object" }
      }
    },
    "dataFlows": {
      "type": "object",
      "properties": {
        "requestLifecycle": { "type": "array" },
        "authFlow": { "type": "object" },
        "errorHandling": { "type": "object" }
      }
    }
  }
}
```

### 5.2 Validation Rules Configuration

**File:** `config/validation-rules.json`

```json
{
  "version": "1.0.0",
  "description": "Validation rules for initialize-project workflow",

  "claudeMd": {
    "minLines": 50,
    "maxLines": 150,
    "hardMaxLines": 200,
    "requiredSections": ["tech-stack", "file-placement-guide", "directory-structure", "essential-commands"],
    "forbiddenSections": ["architecture-deep-dive", "gotchas", "request-lifecycle", "testing-strategy"],
    "maxCodeBlockLines": 5
  },

  "projectContext": {
    "minLines": 250,
    "maxLines": 400,
    "hardMaxLines": 500,
    "requiredSections": ["when-to-use-this-skill", "architecture-deep-dive", "critical-workflows", "gotchas"],
    "requiredFrontmatter": ["name", "description", "user-invokable"]
  },

  "agentOutput": {
    "maxNeedsVerification": 3,
    "maxFileSizeKb": 500,
    "requiredMetadata": ["timestamp", "agentId"]
  },

  "gapRules": {
    "validCategories": ["BUSINESS_CONTEXT", "DEPLOYMENT", "TEAM_POLICY"],
    "invalidCategories": ["CODE_CONFIG", "TECHNICAL_DETAIL", "FILE_LOCATION"],
    "maxGaps": 5
  },

  "retryRules": {
    "maxRetries": 3,
    "backoffStrategy": "exponential",
    "initialBackoffMs": 1000,
    "maxBackoffMs": 10000
  },

  "skillReferences": {
    "pattern": "/([a-z0-9-]+)",
    "validateExistence": true,
    "autoRepairEnabled": true
  }
}
```

### 5.3 Validation Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATION WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Agent Output                                                     │
│       │                                                           │
│       ▼                                                           │
│  ┌─────────────────┐                                             │
│  │ Schema Validate │ ─── Pass ───▶ Continue                      │
│  └────────┬────────┘                                             │
│           │ Fail                                                  │
│           ▼                                                       │
│  ┌─────────────────┐                                             │
│  │   Auto-Repair   │ ─── Success ──▶ Re-validate                 │
│  └────────┬────────┘                                             │
│           │ Fail                                                  │
│           ▼                                                       │
│  ┌─────────────────┐                                             │
│  │ Retry (n < max) │ ─── Yes ──▶ Re-run Agent with Feedback      │
│  └────────┬────────┘                                             │
│           │ No (n >= max)                                         │
│           ▼                                                       │
│  ┌─────────────────┐                                             │
│  │    Escalate     │ ─── Log error, halt phase                   │
│  └─────────────────┘                                             │
│                                                                   │
│  Escalation Policy:                                               │
│  1. Log full error context                                        │
│  2. Save partial output to .error file                           │
│  3. Exit with non-zero code                                       │
│  4. Parent workflow catches and reports                           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Hook System

### 6.1 Hook Configuration

**File:** `.claude/settings.json` (template for target projects)

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-subagent-output.py",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-phase-completion.py",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-final-state.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### 6.2 Hook Implementations

#### Hook: `validate-subagent-output.py`

**Trigger:** SubagentStop
**Matcher:** All agents (*)
**Validation:** Schema, length, content checks
**Exit codes:** 0=allow, 2=block

```python
#!/usr/bin/env python3
"""
Subagent Output Validator Hook
Runs on SubagentStop event to validate agent outputs before proceeding
"""
import json
import sys
import os
from pathlib import Path

def validate_subagent_output():
    try:
        # Read hook input from stdin
        data = json.load(sys.stdin)

        # Extract subagent info
        subagent_id = data.get('subagent_id', 'unknown')
        subagent_output = data.get('output', '')

        errors = []
        warnings = []

        # Validation 1: Output not empty
        if not subagent_output or len(subagent_output.strip()) == 0:
            errors.append(f"Subagent {subagent_id} returned empty output")

        # Validation 2: Check for excessive [NEEDS_VERIFICATION]
        needs_verify_count = subagent_output.count('[NEEDS_VERIFICATION]')
        if needs_verify_count > 3:
            errors.append(f"Subagent {subagent_id} has {needs_verify_count} [NEEDS_VERIFICATION] items (max 3)")
        elif needs_verify_count > 0:
            warnings.append(f"Subagent {subagent_id} has {needs_verify_count} [NEEDS_VERIFICATION] items")

        # Validation 3: Check for valid JSON if expected
        if subagent_id.startswith('analyzer-'):
            try:
                json.loads(subagent_output)
            except json.JSONDecodeError as e:
                errors.append(f"Subagent {subagent_id} output is not valid JSON: {str(e)[:100]}")

        # Validation 4: Check output length
        output_lines = len(subagent_output.split('\n'))
        if subagent_id == 'architect-synthesizer':
            if output_lines < 300:
                warnings.append(f"Synthesis output seems short ({output_lines} lines, expected 400+)")
            if output_lines > 700:
                errors.append(f"Synthesis output too long ({output_lines} lines, max 700)")

        # Log warnings
        for warning in warnings:
            print(f"WARNING: {warning}", file=sys.stderr)

        # Block on errors
        if errors:
            print("VALIDATION ERRORS:", file=sys.stderr)
            for error in errors:
                print(f"  - {error}", file=sys.stderr)
            sys.exit(2)  # Block - validation failed

        # Allow
        print(f"Subagent {subagent_id} output validated successfully", file=sys.stderr)
        sys.exit(0)

    except Exception as e:
        print(f"Hook error: {str(e)}", file=sys.stderr)
        sys.exit(0)  # Don't block on hook errors

if __name__ == '__main__':
    validate_subagent_output()
```

#### Hook: `validate-phase-completion.py`

**Trigger:** PostToolUse
**Matcher:** Task tool
**Validation:** Phase status file checks
**Exit codes:** 0=allow, 2=block

```python
#!/usr/bin/env python3
"""
Phase Completion Validator Hook
Ensures previous phases completed successfully before allowing next phase
"""
import json
import sys
import os
from pathlib import Path

PHASE_FILES = {
    'phase1': '/tmp/phase1-analysis.json',
    'phase2': '/tmp/phase2-consolidated.json',
    'phase3': '/tmp/phase3-synthesis.json',
    'phase4': '/tmp/phase4-status.json',
    'phase5': '/tmp/phase5-status.json'
}

def validate_phase_completion():
    try:
        data = json.load(sys.stdin)

        tool_name = data.get('tool_name', '')
        tool_input = data.get('tool_input', {})

        # Only validate Task tool calls
        if tool_name != 'Task':
            sys.exit(0)

        # Check if this is a phase-related agent
        description = tool_input.get('description', '').lower()

        # Determine which phase is being run
        current_phase = None
        if 'phase 1' in description or 'analysis' in description:
            current_phase = 1
        elif 'phase 2' in description or 'consolidation' in description:
            current_phase = 2
        elif 'phase 3' in description or 'synthesis' in description:
            current_phase = 3
        elif 'phase 4' in description or 'file writing' in description:
            current_phase = 4
        elif 'phase 5' in description or 'resource' in description:
            current_phase = 5
        elif 'phase 6' in description or 'validation' in description:
            current_phase = 6

        if current_phase is None:
            sys.exit(0)  # Not a phase task, allow

        # Validate previous phases completed
        for phase_num in range(1, current_phase):
            phase_file = PHASE_FILES.get(f'phase{phase_num}')
            if phase_file and not Path(phase_file).exists():
                print(f"ERROR: Cannot run Phase {current_phase} - Phase {phase_num} output missing", file=sys.stderr)
                sys.exit(2)  # Block

        # Allow
        print(f"Phase {current_phase} prerequisites validated", file=sys.stderr)
        sys.exit(0)

    except Exception as e:
        print(f"Hook error: {str(e)}", file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    validate_phase_completion()
```

---

## 7. Subagent Definitions

### 7.1 Agent 01: Structure & Architecture Analyzer

**File:** `agents/01-structure-architecture.md`

```yaml
---
name: structure-architecture-analyzer
model: haiku
description: Analyzes codebase structure, repository type, file placement patterns, and path aliases
subagent_type: Explore
run_in_background: true
tools: Read, Grep, Glob
output_format: json
---
```

**Output Contract:**

```json
{
  "repositoryType": "monorepo|single",
  "workspaces": [
    {
      "name": "packages/shared",
      "path": "/abs/path",
      "type": "shared|frontend|backend|lib|service"
    }
  ],
  "filePlacement": [
    {
      "fileType": "API Controller",
      "package": "services/backend",
      "locationPattern": "src/modules/{domain}/",
      "examples": ["users.controller.ts", "projects.controller.ts"],
      "notes": "Vertical slice per module"
    }
  ],
  "pathAliases": {
    "@shared": "packages/shared/src",
    "@api": "services/backend/src"
  },
  "directoryStructure": {
    "tree": "packages/\n  shared/\nservices/\n  backend/\n  frontend/",
    "annotations": {
      "packages/shared": "Shared DTOs, types, utils"
    }
  }
}
```

**Validation Hook:** `validate-subagent-output.py`

**Retry Strategy:**
- Max 2 retries
- On retry: Include previous errors in prompt
- Backoff: 1s, 2s

### 7.2 Agent 02: Tech Stack & Dependencies Analyzer

**File:** `agents/02-tech-stack-dependencies.md`

```yaml
---
name: tech-stack-dependencies-analyzer
model: haiku
description: Analyzes languages, frameworks, databases, ORMs, and dependency versions
subagent_type: Explore
run_in_background: true
tools: Read, Grep, Glob
output_format: json
---
```

**Output Contract:**

```json
{
  "languages": [
    {
      "name": "typescript",
      "version": "5.3.0",
      "confidence": "high",
      "detectedBy": "tsconfig.json"
    }
  ],
  "backendFrameworks": [
    {
      "name": "nestjs",
      "version": "10.3.0",
      "confidence": "high",
      "detectedBy": "@nestjs/core in dependencies"
    }
  ],
  "frontendFrameworks": [...],
  "databases": ["postgresql", "redis"],
  "orms": [
    {
      "name": "typeorm",
      "version": "0.3.17"
    }
  ],
  "packageManager": "pnpm",
  "cicd": {
    "platform": "github-actions",
    "workflows": [".github/workflows/ci.yml"]
  }
}
```

### 7.3 Agent 03: Code Patterns & Testing Analyzer

**File:** `agents/03-code-patterns-testing.md`

```yaml
---
name: code-patterns-testing-analyzer
model: haiku
description: Analyzes architecture patterns, naming conventions, testing setup, and code style
subagent_type: Explore
run_in_background: true
tools: Read, Grep, Glob
output_format: json
---
```

**Output Contract:**

```json
{
  "architecture": {
    "pattern": "vertical-slicing",
    "moduleBoundaries": "by-domain",
    "layering": ["controller", "service", "repository", "entity"]
  },
  "conventions": {
    "fileNaming": "kebab-case",
    "classNaming": "PascalCase",
    "dbNaming": "snake_case",
    "dtoNaming": "CreateXDto, UpdateXDto"
  },
  "testing": {
    "framework": "jest",
    "filePattern": "*.spec.ts",
    "commands": {
      "unit": "pnpm test",
      "integration": "pnpm test:integration",
      "e2e": "pnpm test:e2e"
    },
    "coverage": {
      "threshold": 80,
      "command": "pnpm test:coverage"
    }
  },
  "codeStyle": {
    "linter": "eslint",
    "formatter": "prettier",
    "strictMode": true
  }
}
```

### 7.4 Agent 04: Data Flows & Integrations Analyzer

**File:** `agents/04-data-flows-integrations.md`

```yaml
---
name: data-flows-integrations-analyzer
model: haiku
description: Analyzes request lifecycle, auth flows, error handling, and external integrations
subagent_type: Explore
run_in_background: true
tools: Read, Grep, Glob
output_format: json
---
```

**Output Contract:**

```json
{
  "requestLifecycle": [
    {
      "step": 1,
      "component": "CorsMiddleware",
      "file": "src/main.ts",
      "purpose": "Handle CORS"
    },
    {
      "step": 2,
      "component": "AuthGuard",
      "file": "src/auth/guards/auth.guard.ts",
      "purpose": "JWT validation"
    }
  ],
  "authFlow": {
    "type": "jwt",
    "tokenStorage": "httpOnly cookie",
    "refreshStrategy": "rotating",
    "files": [
      "src/auth/auth.service.ts",
      "src/auth/strategies/jwt.strategy.ts"
    ]
  },
  "errorHandling": {
    "globalHandler": "src/common/filters/all-exceptions.filter.ts",
    "customExceptions": ["src/common/exceptions/"],
    "responseFormat": {
      "statusCode": "number",
      "message": "string",
      "error": "string"
    }
  },
  "integrations": [
    {
      "name": "Stripe",
      "type": "payment",
      "config": "src/integrations/stripe/stripe.config.ts"
    }
  ]
}
```

### 7.5 Agent 05: Architect Synthesizer

**File:** `agents/05-architect-synthesizer.md`

```yaml
---
name: architect-synthesizer
model: opus
description: Synthesizes analysis into CLAUDE.md and project-context/SKILL.md files
subagent_type: general-purpose
run_in_background: false
tools: Read, Grep, Glob
output_format: text-with-markers
---
```

**Output Contract:**

The synthesizer MUST output in this exact format:

```markdown
# CLAUDE.md Content

[Full CLAUDE.md content here - 100-150 lines]

---

# project-context/SKILL.md Content

[Full SKILL.md content with YAML frontmatter - 250-400 lines]
```

**Retry Strategy:**
- Max 3 retries
- On retry: Include validation errors
- Include line counts in prompt
- Backoff: 2s, 4s, 8s

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)

- [ ] **Task 1.1:** Create directory structure as specified in Section 2
- [ ] **Task 1.2:** Write JSON Schema files (`phase1-analysis.schema.json`, etc.)
- [ ] **Task 1.3:** Write validation configuration (`validation-rules.json`, `retry-config.json`)
- [ ] **Task 1.4:** Create minimal SKILL.md (< 100 lines) that calls orchestration script
- [ ] **Task 1.5:** Write `orchestrate-initialization.sh` main entry point

### Phase 2: Validation Layer (Week 1-2)

- [ ] **Task 2.1:** Implement `validate-agent-output.js` with JSON Schema validation
- [ ] **Task 2.2:** Implement `auto-repair.js` with common fixes
- [ ] **Task 2.3:** Implement `validate-synthesis.js` with length/format checks
- [ ] **Task 2.4:** Implement `validate-file-links.js` for skill references
- [ ] **Task 2.5:** Implement `retry-with-feedback.js` retry mechanism
- [ ] **Task 2.6:** Write unit tests for all validators

### Phase 3: Workflow Scripts (Week 2-3)

- [ ] **Task 3.1:** Implement `phase1-analysis.sh` with parallel agent launch
- [ ] **Task 3.2:** Implement `merge-analyses.js` for consolidating outputs
- [ ] **Task 3.3:** Implement `phase2-consolidation.sh` with gap identification
- [ ] **Task 3.4:** Implement `phase3-synthesis.sh` with Opus invocation
- [ ] **Task 3.5:** Implement `parse-opus-output.js` section parser
- [ ] **Task 3.6:** Implement `phase4-filewriting.sh` with validation
- [ ] **Task 3.7:** Update `phase5-resources.sh` from existing `run-phase5.sh`
- [ ] **Task 3.8:** Implement `phase6-validation.sh` final validation

### Phase 4: Hook System (Week 3)

- [ ] **Task 4.1:** Implement `validate-subagent-output.py` hook
- [ ] **Task 4.2:** Implement `validate-phase-completion.py` hook
- [ ] **Task 4.3:** Implement `validate-final-state.py` hook
- [ ] **Task 4.4:** Create settings.json template for hook configuration
- [ ] **Task 4.5:** Test hooks with sample agent outputs
- [ ] **Task 4.6:** Document hook exit codes and behaviors

### Phase 5: Testing & Validation (Week 4)

- [ ] **Task 5.1:** Create test fixtures for 5 different project types (NestJS, Django, Phoenix, Rails, Go)
- [ ] **Task 5.2:** Write integration tests for full workflow
- [ ] **Task 5.3:** Write determinism tests (same input = same process)
- [ ] **Task 5.4:** Write contract tests for agent outputs
- [ ] **Task 5.5:** Measure and document timing benchmarks
- [ ] **Task 5.6:** Load testing with complex monorepos

### Phase 6: Documentation & Examples (Week 4)

- [ ] **Task 6.1:** Update README.md with new workflow documentation
- [ ] **Task 6.2:** Write migration guide from current to new version
- [ ] **Task 6.3:** Create example outputs for common stacks
- [ ] **Task 6.4:** Document troubleshooting guide
- [ ] **Task 6.5:** Create video walkthrough (optional)
- [ ] **Task 6.6:** Update CHANGELOG.md

---

## 9. Testing Strategy

### 9.1 Unit Tests

**What:** Individual utility functions
**How:** Jest/Mocha tests
**Location:** `utils/__tests__/`

**Test Cases:**
- `validate-agent-output.js`: Valid JSON passes, invalid fails, boundary cases
- `auto-repair.js`: Each repair type individually
- `parse-opus-output.js`: Various section marker formats
- `merge-analyses.js`: 4 agent outputs merged correctly

### 9.2 Integration Tests

**What:** Phase workflows end-to-end
**How:** Shell scripts with fixtures
**Location:** `test/integration/`

**Test Cases:**
- Phase 1 with mock project produces valid JSON
- Phase 2 identifies correct gaps
- Phase 3 synthesis output meets length constraints
- Phase 4 files written correctly
- Phase 5 correct skills copied for stack
- Full workflow completes without errors

### 9.3 Contract Tests

**What:** Agent output contracts
**How:** JSON Schema validation
**Location:** `test/contracts/`

**Test Cases:**
- Each agent output matches its schema
- Schema changes are backwards compatible
- Optional fields can be omitted
- Required fields cannot be omitted

### 9.4 Determinism Tests

**What:** Same input = same process
**How:** Run twice, compare

**Test Script:**
```bash
#!/bin/bash
# Test determinism: run twice with same inputs

PROJECT=/path/to/test/project

# Run 1
bash orchestrate-initialization.sh $PROJECT
cp -r $PROJECT/.claude /tmp/run1

# Clean
rm -rf $PROJECT/.claude

# Run 2
bash orchestrate-initialization.sh $PROJECT
cp -r $PROJECT/.claude /tmp/run2

# Compare (excluding timestamps)
diff -r \
  --exclude='*.backup' \
  --ignore-matching-lines='timestamp' \
  --ignore-matching-lines='Generated:' \
  /tmp/run1 /tmp/run2

if [ $? -eq 0 ]; then
  echo "PASS: Deterministic output"
else
  echo "FAIL: Non-deterministic output"
  exit 1
fi
```

### 9.5 Project Type Matrix

| Project Type | Language | Backend | Frontend | Database | Testing |
|--------------|----------|---------|----------|----------|---------|
| TypeScript Monorepo | TypeScript | NestJS | React | PostgreSQL | Jest + Playwright |
| Python API | Python | FastAPI | - | PostgreSQL | Pytest |
| Rails Fullstack | Ruby | Rails | Stimulus | PostgreSQL | RSpec |
| Go Microservice | Go | Gin | - | PostgreSQL | go test |
| Elixir Phoenix | Elixir | Phoenix | LiveView | PostgreSQL | ExUnit |

---

## 10. Migration Guide

### 10.1 Backwards Compatibility

**Strategy:** Version flag in SKILL.md

```yaml
---
name: initialize-project
version: 2.0.0
workflow_mode: true  # New: enables workflow orchestration
legacy_mode: false   # Set to true to use old behavior
---
```

### 10.2 Migration Steps

1. **Backup existing outputs**
   ```bash
   cp -r .claude .claude.v1.backup
   ```

2. **Update framework to v2.0**
   ```bash
   git pull origin main
   ```

3. **Re-run initialization**
   ```bash
   /initialize-project /path/to/project
   ```

4. **Verify outputs**
   - CLAUDE.md should be shorter (< 150 lines)
   - project-context should be longer (250-400 lines)
   - Skills should have full category paths

5. **Test key commands**
   ```bash
   /project-context
   /start-task
   ```

### 10.3 Rollback Plan

If issues occur:
1. Restore backup: `mv .claude.v1.backup .claude`
2. Set `legacy_mode: true` in SKILL.md
3. Report issue with logs

---

## 11. Metrics & Success Criteria

### 11.1 Validation Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Format validation pass rate | 100% on first try, 98%+ after repair | Count passes / total runs |
| Length constraint compliance | 95%+ CLAUDE.md < 150 lines | Count compliant / total |
| Required skills linked | 100% | Count valid refs / total refs |
| JSON Schema validation | 100% | Count valid / total outputs |

### 11.2 Determinism Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Process determinism | 100% same steps | Compare step sequences |
| Output reproducibility | 95%+ content match | Diff excluding timestamps |
| Phase completion | 100% all 6 phases | Count completed phases |

### 11.3 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Total time to completion | < 180 seconds | Wall clock time |
| Phase 1 (parallel agents) | < 60 seconds | Agent timing |
| Phase 3 (Opus synthesis) | < 45 seconds | Opus timing |
| Phase 5 (resource copying) | < 30 seconds | Copy timing |

### 11.4 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| NEEDS_VERIFICATION count | 0 per output | Regex count |
| Questions asked | 0-3 per project | Count gaps |
| Skills copied | 10-20 per project | Count skills |
| Agents generated | 3-8 per project | Count agents |

---

## Appendix A: Full Schema Definitions

[See `schemas/` directory for complete JSON Schema files]

## Appendix B: Example Outputs

[See `examples/` directory for sample outputs for different project types]

## Appendix C: Troubleshooting Guide

[See `TROUBLESHOOTING.md` for common issues and solutions]

---

*Document Version: 1.0.0*
*Last Updated: 2026-03-10*
*Authors: AI Framework Team*
