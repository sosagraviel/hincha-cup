# TypeScript Orchestration

LangGraph state machines and DeepAgents coordination for TypeScript-based workflows.

---

## Overview

TypeScript orchestration provides type safety and deterministic workflow execution.

**Benefits**:
1. **Type Safety** - Compile-time validation
2. **Deterministic Execution** - Same input → same workflow
3. **Built-in Checkpointing** - Resume from failures
4. **Maintainability** - TypeScript vs bash scripts

---

## LangGraph State Machines

**Core Pattern**:
```typescript
export const ImplementTicketAnnotation = Annotation.Root({
  ticketId: Annotation<string>,
  projectPath: Annotation<string>,
  currentPhase: Annotation<number>,
  phaseResults: Annotation<PhaseResult[]>,
  errors: Annotation<WorkflowError[]>
});

const graph = new StateGraph(ImplementTicketAnnotation)
  .addNode("phase0", phase0ContextNode)
  .addNode("phase1", phase1PlanningNode)
  .addEdge(START, "phase0")
  .addEdge("phase0", "phase1");
```

**State Transitions**: Explicit edges define phase order, ensuring predictable execution.

---

## Phase Node Architecture

**Structure**:
```typescript
export async function phase1Planning(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  // 1. Load context
  const context = state.ticketContext;

  // 2. Invoke agent
  const result = await invokeAgent('planner', {
    ticketContext: context,
    projectProfile: await loadProjectProfile(state.projectPath)
  });

  // 3. Validate output
  const validated = await validateAndParseAgentOutput(
    result,
    implementationPlanSchema
  );

  // 4. Return state update
  return {
    currentPhase: 2,
    implementationPlan: validated,
    phaseResults: [...state.phaseResults, { phase: 1, completed: true }]
  };
}
```

**Pattern**: Load → Invoke → Validate → Update

---

## State Management

**Annotations**:
```typescript
// Initialize Project
export const InitializeProjectAnnotation = Annotation.Root({
  projectPath: Annotation<string>,
  frameworkPath: Annotation<string>,
  currentPhase: Annotation<number>,
  analysisResults: Annotation<AnalysisResults>().optional(),
  errors: Annotation<WorkflowError[]>
});

// Implement Ticket
export const ImplementTicketAnnotation = Annotation.Root({
  ticketId: Annotation<string>,
  projectPath: Annotation<string>,
  currentPhase: Annotation<number>,
  ticketContext: Annotation<TicketContext>().optional(),
  implementationPlan: Annotation<ImplementationPlan>().optional(),
  errors: Annotation<WorkflowError[]>
});
```

**Immutability**: State updates return partial state; LangGraph merges with existing state.

---

## Agent Coordination

**DeepAgents Integration**:
```typescript
import { invokeAgent } from '../services/deep-agents.service.js';

const result = await invokeAgent('implementer-typescript', {
  implementationPlan: plan,
  projectProfile: profile,
  skills: ['mastering-typescript', 'react-frontend']
});
```

**Validation**:
```typescript
const validated = await validateAndParseAgentOutput(
  agentOutput,
  schema
);
```

**Disk Artifacts**: Agents read/write to `.claude-temp/tickets/{TICKET_ID}/artifacts/`

---

## Checkpoint System

**Automatic Checkpoints**:
```typescript
// Phase completion writes checkpoint
return {
  currentPhase: nextPhase,
  phaseResults: [
    ...state.phaseResults,
    { phase: currentPhase, completed: true, timestamp: new Date().toISOString() }
  ]
};
```

**Resume Logic**:
```typescript
// Detect last complete phase
const lastPhase = Math.max(...state.phaseResults.filter(r => r.completed).map(r => r.phase));
graph.resume(lastPhase + 1);
```

---

## Error Handling

**Auto-Retry**:
```typescript
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(2 ** i * 1000);  // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}
```

**Error State**:
```typescript
return {
  errors: [
    ...state.errors,
    {
      phase: currentPhase,
      message: error.message,
      timestamp: new Date().toISOString()
    }
  ]
};
```

---

## Development Patterns

### Node Implementation

**File**: `orchestration/src/nodes/implement-ticket/phase4-implementation.node.ts`

```typescript
export async function phase4Implementation(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  const plan = state.implementationPlan;

  // Determine implementer type
  const implementerType = determineImplementer(plan.fileChanges);

  // Invoke agent
  const result = await invokeAgent(`implementer-${implementerType}`, {
    implementationPlan: plan,
    skills: await getSkills(state.projectPath, implementerType)
  });

  // Validate
  const validated = await validateAndParseAgentOutput(
    result,
    implementationResultSchema
  );

  return {
    currentPhase: 5,
    implementationResult: validated,
    phaseResults: [...state.phaseResults, { phase: 4, completed: true }]
  };
}
```

### Graph Definition

**File**: `orchestration/src/graphs/implement-ticket.graph.ts`

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import { ImplementTicketAnnotation } from '../state/schemas/implement-ticket.schema.js';

export function createImplementTicketGraph() {
  return new StateGraph(ImplementTicketAnnotation)
    .addNode("phase0", phase0Context)
    .addNode("phase1", phase1Planning)
    .addNode("phase4", phase4Implementation)
    .addEdge(START, "phase0")
    .addEdge("phase0", "phase1")
    .addEdge("phase1", "phase4")
    .addEdge("phase10", END);
}
```

---

## Performance Optimizations

**Parallel Execution** (Initialize Project Phase 1):
```typescript
const [structure, stack, patterns, context] = await Promise.all([
  analyzeStructure(projectPath),
  analyzeStack(projectPath),
  analyzePatterns(projectPath),
  analyzeContext(projectPath)
]);
```

**Smart Caching**: Artifact files cached between phases

**Incremental Reads**: Large files read in chunks

---

**See Also**: [Architecture](ARCHITECTURE.md), [Initialize Project](../workflows/INITIALIZE_PROJECT.md), [Implement Ticket](../workflows/IMPLEMENT_TICKET.md)
