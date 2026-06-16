---
name: code-conventions
description: LangGraph orchestration patterns, TypeScript conventions, and node/service structure rules
disable-model-invocation: false
version: 1.0
---

# Code Conventions

## LangGraph Node Structure

Each phase node must export a `StateGraph`-compatible runnable with input/output ports clearly defined. Node files follow the pattern `{feature}.node.ts` and declare both the node function and the graph assembly.

```typescript
// orchestration/src/nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";
import { ProjectState } from "../../types";

export async function structureAnalyzerNode(state: ProjectState, config?: RunnableConfig) {
  // Node implementation — agents call service layers here, not direct LLM
  return { findings: {...}, nextPhase: "phase2" };
}

export function buildStructureAnalyzerGraph(): StateGraph<ProjectState> {
  const graph = new StateGraph<ProjectState>();
  graph.addNode("analyzer", structureAnalyzerNode);
  return graph;
}
```

## Service Layer Organization

Business logic lives in `orchestration/src/services/{domain}/{feature}.service.ts`. Services are instantiated once and injected into nodes; they do NOT import nodes.

```typescript
// WRONG — service importing from nodes creates circular coupling
import { someNode } from "../../nodes/initialize-project/phase1/some.node";

// CORRECT — nodes import and call services
import { IncrementalService } from "../../services/discovery/incremental.service";
const service = new IncrementalService();
const result = await service.inspectProject(projectPath);
```

## Module Imports

All TypeScript files use absolute imports via pnpm workspace paths. Relative imports are forbidden at the package boundary; prefer `@orchestration/...` when referring to sibling monorepo packages.

```typescript
// WRONG
import { something } from "../../../../services/foo";

// CORRECT
import { ProjectInspector } from "@orchestration/services/framework/project-inspection/inspector.service";
```

## Async Error Handling in Nodes

Nodes run in LangGraph's execution context and must propagate errors via `state.error` or throw synchronously. Do NOT swallow exceptions.

```typescript
// WRONG — error silently logged, graph continues
try {
  await riskyOperation();
} catch (e) {
  console.error(e);
}

// CORRECT — error surface to LangGraph decision logic
try {
  await riskyOperation();
} catch (e) {
  return { ...state, error: e.message, status: "failed" };
}
```

## Code-Style Conventions

- **File naming:** kebab-case for files (`structure-analyzer.node.ts`), PascalCase for classes/types, camelCase for functions/variables.
- **Imports:** group by external packages, then absolute workspace paths, then relative; alphabetize within groups.
- **Exports:** named exports for services/helpers, default export only for node functions.
- **Comments:** only explain non-obvious intent (why we skip a check, why we call service X before Y); don't repeat what the code says.