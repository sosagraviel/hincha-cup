# Architecture

TypeScript-orchestrated workflow automation using LangGraph state machines and skill-first v2.0 architecture.

---

## System Overview

Transforms tickets to production PRs via deterministic LangGraph state machines.

**Key Principles**:
1. **TypeScript Orchestration** - Compile-time safety
2. **Skill-First v2.0** - Frontmatter-based skills with intelligent detection
3. **Disk-First Communication** - Agents communicate via artifact files
4. **Model Tier Flexibility** - Sonnet/Opus/Haiku
5. **LangGraph Determinism** - Predictable workflow execution

---

## TypeScript Orchestration

All workflows use TypeScript (not bash).

```
orchestration/src/
├── cli/              # Entry points (initialize.ts, implement.ts)
├── graphs/           # LangGraph definitions
├── nodes/            # Phase implementations
├── services/         # Business logic
├── state/schemas/    # State definitions with Zod
├── llm/             # Model abstraction
└── utils/           # Shared utilities
```

**Commands**:
```bash
pnpm initialize -- -p <path> -f <framework-path>
pnpm implement -- -p <path> -f <framework-path> --ticket-id PROJ-123
```

**Type Safety**:
```typescript
export const ImplementTicketAnnotation = Annotation.Root({
  ticketId: Annotation<string>,
  projectPath: Annotation<string>,
  currentPhase: Annotation<number>,
  phaseResults: Annotation<PhaseResult[]>,
  errors: Annotation<WorkflowError[]>
});
```

---

## Skill-First v2.0

Skills are primary extension mechanism.

```
skills/
├── {category}/{skill-name}/SKILL.md  # Frontmatter + content
└── skills.config.json                # Registry & detection
```

**Frontmatter Example**:
```yaml
---
name: "mastering-typescript"
description: "TypeScript patterns and best practices"
allowed-tools: Read, Write, Bash
---
```

**Detection**: Skills loaded based on `trigger_mode`:
- `always` - All projects
- `triggered` - Stack-based matching
- `generated` - Auto-created during init

---

## LangGraph State Machines

**Initialize Project** (6 phases):
```typescript
const graph = new StateGraph(InitializeProjectAnnotation)
  .addNode("phase1", phase1ParallelAnalysis)  // 4 parallel analyzers
  .addNode("phase2", phase2Consolidation)
  .addNode("phase3", phase3Synthesis)
  .addNode("phase4", phase4FileWriting)
  .addNode("phase5", phase5ResourceSync)
  .addNode("phase6", phase6Validation)
  .addEdge(START, "phase1")
  .addEdge("phase6", END);
```

**Implement Ticket** (11 sequential phases):
```typescript
const graph = new StateGraph(ImplementTicketAnnotation)
  .addNode("phase0", phase0Context)
  .addNode("phase1", phase1Planning)
  // ... phases 2-9 ...
  .addNode("phase10", phase10Finalization)
  .addEdge(START, "phase0")
  .addEdge("phase10", END);
```

**Benefits**: Deterministic execution, checkpointing, error recovery, state persistence

---

## Model Tier System

**Tiers**:
- `haiku` - Simple tasks, fast
- `sonnet` - Default, balanced
- `opus` - Complex tasks, highest capability

**Usage**:
```bash
MODEL_TIER=opus pnpm implement -- --ticket-id PROJ-123
```

---

## Core Workflows

| Workflow | Pattern | Duration | Output |
|----------|---------|----------|--------|
| Initialize Project | Parallel (Phase 1) → Sequential | 5-10 min | `.claude/` config |
| Implement Ticket | Sequential (11 phases) | 15-35 min | Production PR |

---

## Agent Communication

**Disk-First Artifacts**:
```
.claude-temp/tickets/{TICKET_ID}/artifacts/
├── phase0-context.json
├── phase1-planning.json
├── phase4-implementation-complete.json
└── phase9-visual-diffs/
```

**Stateless**: Each agent invocation communicates via disk artifacts only.

**Validation**: All agent outputs validated with Zod schemas.

---

## Validation & Recovery

**Multi-Layer**:
1. Schema validation (Zod)
2. Agent output parsing
3. Quality gates (linting, type checking)
4. Visual regression (UI changes)

**Auto-Recovery**:
- Phases auto-retry up to 3 times
- Exponential backoff
- Checkpointing enables resume

**Manual**:
```bash
# Resume
pnpm implement -- --ticket-id PROJ-123 --resume

# Clean restart
rm -rf .claude-temp/tickets/PROJ-123
pnpm implement -- --ticket-id PROJ-123
```

---

## Technical Stack

- TypeScript 5.9+ (ESM modules)
- LangGraph ^1.2.3
- DeepAgents ^1.8.4
- Zod ^4.3.6
- Commander ^14.0.3
- Vitest ^4.1.0

**Patterns**: ESM-only (`.js` extensions), disk-first idempotency, state machine orchestration

---

**See Also**: [Orchestration](ORCHESTRATION.md), [Initialize Project](../workflows/INITIALIZE_PROJECT.md)
