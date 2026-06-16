---
name: multi-file-workflows
description: Ordered checklists for adding LangGraph nodes, services, and CLI commands
disable-model-invocation: false
version: 1.0
---

# Multi-File Workflows

## Adding a New LangGraph Phase Node

1. Create the node file in `orchestration/src/nodes/initialize-project/{phase}/{feature}/{feature}.node.ts`
2. Create a hook validator in `orchestration/src/nodes/initialize-project/{phase}/hooks/validate-{feature}.ts`
3. Create a prompt template in `orchestration/src/nodes/initialize-project/{phase}/{feature}/prompts/agent.md`
4. Create a helper service (if needed) in `orchestration/src/nodes/initialize-project/{phase}/helpers/{helper}.ts`
5. Add the node to the graph in `orchestration/src/graphs/initialize-project.graph.ts`
6. Add unit tests in `orchestration/test/unit/nodes/initialize-project/{phase}/{feature}.node.test.ts`
7. Add integration tests in `orchestration/test/integration/initialize-project/projects/mini-monorepo/{feature}.spec.ts`

> **Gotcha**: Nodes import services but services never import nodes — enforcing this prevents circular dependencies that break graph composition. Always inject the service, never call the node directly.

```typescript
// orchestration/src/nodes/initialize-project/phase1/security-analyzer/security-analyzer.node.ts
import { RunnableConfig } from "@langchain/core/runnables";
import { ProjectState } from "../../types";

export async function securityAnalyzerNode(state: ProjectState, config?: RunnableConfig) {
  const findings = await analyzeSecurityPatterns(state.projectPath);
  return { ...state, security: findings, phase: "phase2" };
}
```

## Adding a New Business Logic Service

1. Create the service file in `orchestration/src/services/{domain}/{feature}.service.ts`
2. Define the service class with public methods that nodes will call
3. Add unit tests in `orchestration/test/unit/services/{domain}/{feature}.service.test.ts`
4. Export the service from `orchestration/src/services/index.ts` if it's a primary boundary

```typescript
// orchestration/src/services/framework/inspection/filesystem.service.ts
import { promises as fs } from "fs";

export class FilesystemService {
  async walkDirectory(path: string): Promise<string[]> {
    const entries = await fs.readdir(path, { recursive: true });
    return entries.filter((e) => !e.includes("node_modules"));
  }
}
```

## Adding a New CLI Command

1. Create the command file in `orchestration/src/cli/{command}.ts`
2. Wire it into `orchestration/src/cli/index.ts` (the entry point)
3. Add an integration test in `orchestration/test/integration/cli/{command}.spec.ts`

> **Gotcha**: CLI commands invoke the graph orchestration — never implement business logic directly in the command file. Delegate to graph nodes.

```typescript
// orchestration/src/cli/inspect.ts
import { Command } from "commander";
import { ProjectInspector } from "@orchestration/services/framework/project-inspection/inspector.service";

export const inspectCommand = new Command("inspect")
  .description("Analyze a project structure")
  .action(async (options) => {
    const inspector = new ProjectInspector();
    const result = await inspector.analyze(options.projectPath);
    console.log(JSON.stringify(result, null, 2));
  });
```