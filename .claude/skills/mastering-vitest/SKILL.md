---
name: mastering-vitest
description: Vitest testing patterns, configuration, and best practices for TypeScript/JavaScript project. Use when writing unit tests with Vitest, configuring test environments, or improving test coverage.
---

# Mastering Vitest

Fast, Vite-native testing for TypeScript and JavaScript projects.

> **Compatibility:** Vitest 3.x, TypeScript 5.x, Node.js 20+, Vite 6+, React 19

## Quick Start

```bash
pnpm add -D vitest
# package.json: "scripts": { "test": "vitest", "test:run": "vitest run" }
```

```ts
import { describe, it, expect } from 'vitest';

describe('sum', () => {
  it('adds two numbers', () => {
    expect(1 + 2).toBe(3);
  });
});
```

## When to Use This Skill

Use when:

- Writing unit or integration tests for TypeScript/JavaScript projects
- Configuring Vitest for monorepos, workspaces, or custom environments
- Mocking modules, functions, or timers in tests
- Setting up coverage thresholds and reporting
- Testing React components with Testing Library
- Migrating from Jest to Vitest

## Configuration

### Basic `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // 'node' | 'jsdom' | 'happy-dom' | 'edge-runtime'
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    typecheck: { enabled: true },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

When your project already has a `vite.config.ts`, Vitest reads it automatically -- just add the `test` key there instead.

### Workspace Configuration

For monorepos, use `vitest.workspace.ts`:

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'components',
      include: ['src/**/*.test.tsx'],
      environment: 'jsdom',
    },
  },
]);
```

### Environment Selection

| Environment    | Use Case                             | Package                        |
| -------------- | ------------------------------------ | ------------------------------ |
| `node`         | Utility functions, API logic, models | built-in                       |
| `jsdom`        | React/DOM component testing          | built-in                       |
| `happy-dom`    | Faster DOM testing (less complete)   | `vitest-environment-happy-dom` |
| `edge-runtime` | Edge function / middleware testing   | `@edge-runtime/vm`             |

Per-file override: add `// @vitest-environment jsdom` at the top of the file.

## Test Patterns

### describe / it / expect

```ts
describe('Calculator', () => {
  describe('add', () => {
    it('returns sum of two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });
    it('handles negative numbers', () => {
      expect(add(-1, -2)).toBe(-3);
    });
  });
});
```

### Lifecycle Hooks

```ts
beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.disconnect();
});
beforeEach(async () => {
  await db.seed();
});
afterEach(async () => {
  await db.clear();
});
```

### Parameterized Tests (`.each`)

```ts
it.each([
  { a: 1, b: 2, expected: 3 },
  { a: -1, b: 1, expected: 0 },
])('add($a, $b) returns $expected', ({ a, b, expected }) => {
  expect(add(a, b)).toBe(expected);
});

describe.each([
  { role: 'admin', canDelete: true },
  { role: 'viewer', canDelete: false },
])('role=$role', ({ role, canDelete }) => {
  it(`canDelete is ${canDelete}`, () => {
    expect(getPermissions(role).canDelete).toBe(canDelete);
  });
});
```

### Async & Concurrent

```ts
it('fetches user data', async () => {
  const user = await fetchUser('123');
  expect(user.name).toBe('Alice');
});

it('rejects on not found', async () => {
  await expect(fetchUser('999')).rejects.toThrow('Not found');
});

// Run tests in parallel within a describe block
it.concurrent('fetches users', async () => {
  expect(await getUsers()).toBeDefined();
});
it.concurrent('fetches posts', async () => {
  expect(await getPosts()).toBeDefined();
});
```

## Mocking

### `vi.fn()` - Function Mocks

```ts
const callback = vi.fn();
processData([1, 2, 3], callback);
expect(callback).toHaveBeenCalledTimes(3);
expect(callback).toHaveBeenCalledWith(1);

// Typed mock with return value
const getPrice = vi.fn<(id: string) => Promise<number>>();
getPrice.mockResolvedValue(29.99);
```

### `vi.mock()` - Module Mocking

```ts
import { fetchUser } from '@/shared/api/user';

vi.mock('@/shared/api/user'); // auto-mock: all exports become vi.fn()

it('calls fetchUser', async () => {
  vi.mocked(fetchUser).mockResolvedValue({ id: '1', name: 'Alice' });
  const user = await fetchUser('1');
  expect(user.name).toBe('Alice');
});
```

### Partial Module Mocking

```ts
vi.mock('@/shared/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/utils')>();
  return { ...actual, formatDate: vi.fn(() => '2026-01-01') };
});
```

### `vi.spyOn()` - Spy on Methods

```ts
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
doSomethingThatLogs();
expect(consoleSpy).toHaveBeenCalledWith('Something went wrong');
consoleSpy.mockRestore();
```

### Manual Mocks

Place in `__mocks__/` adjacent to the module. Used automatically when `vi.mock()` is called for that path.

### Timer Mocking

```ts
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('debounces the callback', () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 300);
  debounced();
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(fn).toHaveBeenCalledOnce();
});
```

## Snapshot Testing

```ts
// File snapshot (stored in __snapshots__/)
expect(renderToString(<KpiCard value={42} label="Revenue" />)).toMatchSnapshot()

// Inline snapshot (value written into source on first run)
expect(formatCurrency(1234.5)).toMatchInlineSnapshot(`"$1,234.50"`)
```

**Best practices:** Prefer inline snapshots for small outputs. Avoid snapshotting large objects -- test specific properties. Never blindly update snapshots. Use `vitest run --update` locally only.

## Coverage

```bash
pnpm add -D @vitest/coverage-v8    # faster, default
# or: pnpm add -D @vitest/coverage-istanbul   # more accurate edge cases
```

```ts
// vitest.config.ts
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov', 'json-summary'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/**/index.ts', 'src/app/**'],
    all: true,    // include files with zero coverage
    thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
  },
}
```

```bash
pnpm vitest run --coverage
```

## UI Component Testing

### Setup

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

```ts
// src/test-setup.ts
import '@testing-library/jest-dom/vitest';
```

Set `environment: 'jsdom'` and `setupFiles: ['./src/test-setup.ts']` in config.

### Render, Query, and User Events

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('KpiCard', () => {
  it('displays the KPI value and label', () => {
    render(<KpiCard value={42} label='Revenue' trend='up' />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });
});

it('loads data and displays results', async () => {
  render(<UserProfile userId='123' />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
});

it('submits the form', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText('Email'), 'alice@example.com');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(onSubmit).toHaveBeenCalled();
});
```

### Testing Hooks

```tsx
import { renderHook, act } from '@testing-library/react';

it('increments counter', () => {
  const { result } = renderHook(() => useCounter(0));
  act(() => {
    result.current.increment();
  });
  expect(result.current.count).toBe(1);
});
```

## Custom Matchers

```ts
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? 'not ' : ''}to be within range ${floor}..${ceiling}`,
    };
  },
});

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeWithinRange(floor: number, ceiling: number): T;
  }
}
```

## TypeScript Integration

### Type-Level Assertions with `expectTypeOf`

```ts
import { expectTypeOf } from 'vitest';

it('returns the correct type', () => {
  expectTypeOf(add(1, 2)).toBeNumber();
  expectTypeOf(fetchUser).returns.resolves.toMatchTypeOf<{
    id: string;
    name: string;
  }>();
});

it('accepts correct parameters', () => {
  expectTypeOf(add).toBeCallableWith(1, 2);
  expectTypeOf(add).parameter(0).toBeNumber();
});
```

### Typed Mocks

```ts
import type { UserService } from '@/entities/user/model/types';

const mockService: UserService = {
  getUser: vi.fn<UserService['getUser']>(),
  updateUser: vi.fn<UserService['updateUser']>(),
};
```

Enable `typecheck: { enabled: true }` in config for compile-time checks during test runs.

## Common Patterns & Anti-Patterns

### Do

- **AAA structure:** Arrange, Act, Assert in every test.
- **One behavior per test:** Each `it` verifies a single concern.
- **Prefer semantic queries:** `getByRole`, `getByLabelText`, `getByText` over `getByTestId`.
- **Auto-restore mocks:** Set `restoreMocks: true` in config instead of manual cleanup.
- **Test behavior, not implementation:** Assert outputs and side effects, not internal state.
- **Use `vi.mocked()`:** Wraps mocked imports for type-safe autocomplete.

### Avoid

- **Testing implementation details:** No asserting on internal function calls or component state.
- **Snapshot overuse:** Do not snapshot entire component trees.
- **Over-mocking:** Only mock external boundaries (APIs, timers, browser APIs).
- **Missing `await`:** Always await async assertions; use `rejects.toThrow()` for error paths.
- **Shared mutable state:** Never rely on test execution order.
- **`any` in tests:** Tests should be as strictly typed as production code.
- **Giant setup functions:** Large setup means the unit under test does too much.

## Troubleshooting

**"Cannot find module" with path aliases:** Ensure `resolve.alias` in config matches `tsconfig.json` paths.

**Tests hang or timeout:** Check unresolved promises, missing `await`, or fake timers not advanced. Set `testTimeout: 10000` if needed.

**"document is not defined":** Set `environment: 'jsdom'` in config or add `// @vitest-environment jsdom` per-file.

**Mock not applied:** `vi.mock()` is hoisted to file top -- must be at module level, not inside `describe`/`it`. Use `importOriginal()` for partial mocks.

**Coverage not counting files:** Check `include` patterns match sources. Set `all: true` to include untested files.

**ESM/CJS conflicts:** Use `deps.inline: ['problematic-package']` to inline CJS dependencies.

### CLI Reference

```bash
vitest run                    # Single run (CI mode)
vitest watch                  # Watch mode (default)
vitest run --reporter=verbose # Detailed output
vitest run --bail=1           # Stop after first failure
vitest run --changed          # Only test changed files (git)
vitest run --coverage         # Generate coverage report
vitest typecheck              # Run type-level tests only
```
