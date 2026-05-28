---
name: testing-conventions
description: Project-specific testing conventions, fixture rules, mocking rules, and examples
disable-model-invocation: false
version: 1.0
---

# Testing Conventions

## Testing Philosophy

- Test LangGraph node functions by passing a constructed `AgentState` and asserting on the returned partial state.
- Do NOT test LangGraph routing logic — that is the framework's responsibility, not the project's.
- Test prompt-loading utilities with real file reads; the path-resolution behaviour is precisely what must be verified.

## Unit Test Patterns

Tests live at `orchestration/test/unit/`, mirroring the `src/` directory structure exactly.

```typescript
// orchestration/test/unit/utils/shared/prompt-loader.test.ts
import { loadPrompt } from '../../../../src/utils/shared/prompt-loader';

describe('loadPrompt', () => {
  it('returns the template string for a known prompt key', async () => {
    const result = await loadPrompt('analyze');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

## What NOT to Mock

- **`prompt-loader`**: mock it and you miss the path-resolution logic that causes most loader bugs.
- **SQLite checkpoint adapter**: use an in-memory SQLite instance; mocking the interface hides schema incompatibilities.

## Fixture Conventions

- Fixtures are plain TypeScript objects or JSON files placed in a `__fixtures__/` directory co-located with the test.
- Name fixtures after the entity they represent: `agent-state.fixture.ts`, not `testData.ts`.
- Build minimal fixtures — only populate the keys the test actually reads.

## Coverage Expectations

- All functions in `orchestration/src/utils/shared/` require unit tests.
- Node functions need at least one test per exit path (normal return and error-state return).
- Shell scripts in `scripts/` are not unit-tested; validate them through integration smoke runs.