---
name: testing-conventions
description: Unit and integration test patterns for LangGraph nodes and services
disable-model-invocation: false
version: 1.0
---

# Testing Conventions

## Testing Philosophy

- **Unit tests** verify isolated service logic; mock external dependencies (file system, network, LLM).
- **Integration tests** run against real fixture projects in `orchestration/test/integration/initialize-project/projects/`; they exercise the full graph.
- **Nodes** are tested as units with mocked services; graph composition is tested via integration tests.
- **Do NOT mock:** the file system in integration tests (real projects exist on disk), LangGraph's state management, or service-to-service calls within a single orchestration graph.

## Unit Test Patterns

Services and helper functions are tested in isolation with mocked dependencies.

```typescript
// orchestration/test/unit/services/framework/inspection/filesystem.service.test.ts
import { describe, it, expect } from "vitest";
import { FilesystemService } from "@orchestration/services/framework/inspection/filesystem.service";

describe("FilesystemService", () => {
  it("walks the directory tree excluding node_modules", async () => {
    const service = new FilesystemService();
    const files = await service.walkDirectory("./test/fixtures/mini-monorepo");
    expect(files).toContain("package.json");
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});
```

## Integration Test Patterns

Integration tests run the orchestration graph end-to-end against sample projects.

```typescript
// orchestration/test/integration/initialize-project/projects/mini-monorepo/full-flow.spec.ts
import { describe, it, expect } from "vitest";
import { buildInitializeProjectGraph } from "@orchestration/graphs/initialize-project.graph";
import { ProjectState } from "@orchestration/nodes/types";

describe("Full initialize-project flow with mini-monorepo", () => {
  it("completes all phases and generates CLAUDE.md", async () => {
    const graph = buildInitializeProjectGraph();
    const initialState: ProjectState = {
      projectPath: "./test/integration/initialize-project/projects/mini-monorepo",
      phase: "phase1",
    };
    const result = await graph.invoke(initialState);
    expect(result.phase).toBe("phase5_complete");
    expect(result.findings.claude_md).toBeDefined();
  });
});
```

## Fixture Conventions

Fixture projects are real, minimal project structures in `orchestration/test/integration/initialize-project/projects/`. Each fixture (e.g., `mini-monorepo`, `mini-microservices`) is a complete, isolated project that nodes can inspect. Never import code from these fixtures into `orchestration/src/`; they are test data, not libraries.

Fixtures must include:
- `package.json` (or equivalent language manifest)
- Sample source files for language/framework detection
- Optional: `.claude/CLAUDE.md` to validate against expected output

## Coverage Expectations

- **Unit tests:** ≥ 80% coverage for services and helpers; aim for 100% on critical paths (auth, state validation).
- **Integration tests:** ≥ 1 test per phase node and ≥ 1 test per fixture project.
- **Gotcha:** integration tests are slow; use `vitest` parallel mode and tag slow tests so CI can run them separately.

```typescript
// Tag slow tests
it.skip("full initialize-project on large project", async () => {
  // ... integration test ...
});
```