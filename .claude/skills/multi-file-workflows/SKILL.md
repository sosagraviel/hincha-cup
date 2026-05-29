---
name: multi-file-workflows
description: Ordered checklists for cross-cutting changes — add LangGraph node, add skill, add shared utility
disable-model-invocation: false
version: 1.0
---

# Multi-File Workflows

## Adding a New LangGraph Phase Node

1. Create the directory `orchestration/src/nodes/{skill}/phase{N}/{feature}/`
2. Implement the node in `orchestration/src/nodes/{skill}/phase{N}/{feature}/index.ts`
3. Add hooks in `orchestration/src/nodes/{skill}/phase{N}/{feature}/hooks/{name}.hook.ts` (if needed)
4. Register the node in the graph builder **before** `graph.compile()` is called
5. Add unit test at `orchestration/test/unit/nodes/{skill}/phase{N}/{feature}/index.test.ts`

```typescript
// orchestration/src/nodes/{skill}/phase{N}/{feature}/index.ts
import type { AgentState } from '../../../types';

export async function {featureName}Node(
  state: AgentState
): Promise<Partial<AgentState>> {
  return {};
}
```

> **Gotcha**: `graph.addNode('{feature}', {featureName}Node)` must run before `graph.compile()` — nodes added after compilation are silently dropped.

## Adding a New Hook

1. Create `orchestration/src/nodes/{skill}/{phase}/{feature}/hooks/{name}.hook.ts`
2. Export a single named function matching the project's `Hook` type
3. Register it in the parent feature's graph definition before `compile()`
4. Add unit test at `orchestration/test/unit/nodes/{skill}/{phase}/{feature}/hooks/{name}.hook.test.ts`

```typescript
// orchestration/src/nodes/{skill}/{phase}/{feature}/hooks/{name}.hook.ts
import type { AgentState } from '../../../../types';

export async function {name}Hook(
  state: AgentState
): Promise<Partial<AgentState>> {
  return {};
}
```

## Adding a New Shared Utility

1. Create `orchestration/src/utils/shared/{name}.ts`
2. Export a single named function — no default exports in utilities
3. Add unit test at `orchestration/test/unit/utils/shared/{name}.test.ts`

```typescript
// orchestration/src/utils/shared/{name}.ts
export async function {name}(input: unknown): Promise<unknown> {
  throw new Error('not implemented');
}
```

## Adding a New Skill Definition

1. Create `.claude/skills/{slug}/SKILL.md` with required frontmatter (`name`, `description`, `disable-model-invocation`, `version`)
2. Write the skill body (checklist or instructions)
3. If the skill drives a new orchestration workflow, complete "Adding a New LangGraph Phase Node" for each backing node
4. Document the skill in `website/docs/` when it is user-facing