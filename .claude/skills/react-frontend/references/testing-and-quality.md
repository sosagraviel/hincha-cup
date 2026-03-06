> **Load when:** Writing tests, setting up testing infrastructure, handling errors, or improving code quality.

# Testing & Quality

## Testing Strategy (Testing Trophy)

```
     /‾‾‾‾‾‾‾‾\
    /   E2E     \      ← Few: Critical user journeys (Playwright, Cypress)
   /‾‾‾‾‾‾‾‾‾‾‾‾\
  / Integration   \    ← Most: Component interactions (Testing Library)
 /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
/      Unit          \  ← Some: Pure functions, complex logic
‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
  Static Analysis      ← Base: TypeScript strict + ESLint
```

Invest most in **integration tests** — they give the most confidence per test written.

## What to Test

| Do Test | Don't Test |
|---------|-----------|
| User interactions (click, type, submit) | Internal component state |
| Rendered output visible to users | CSS classes or styles |
| Error states and edge cases | Implementation details |
| Form validation behavior | Private methods |
| Navigation after actions | Third-party library internals |
| Loading and empty states | Snapshot of entire components |

## Component Tests (Testing Library)

### Setup

Use a test runner (Vitest, Jest) with React Testing Library:

```tsx
// test runner config (example with Vitest)
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
```

```tsx
// src/test/setup.ts
import '@testing-library/jest-dom';
```

### Test Pattern

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('CreateOrderDialog', () => {
  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<CreateOrderDialog open onOpenChange={vi.fn()} workspaceId="1" />);

    // Use getByRole — tests accessibility alongside functionality
    await user.type(screen.getByRole('textbox', { name: /title/i }), 'New order');
    await user.click(screen.getByRole('button', { name: /create/i }));

    // Assert on behavior, not implementation
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New order' })
    );
  });

  it('shows validation error for empty title', async () => {
    const user = userEvent.setup();
    render(<CreateOrderDialog open onOpenChange={vi.fn()} workspaceId="1" />);

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it('shows loading state while submitting', async () => {
    render(<CreateOrderDialog open onOpenChange={vi.fn()} workspaceId="1" />);

    // When mutation is pending, button should be disabled
    expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled();
  });
});
```

### Query Testing Rules

1. **Use `screen.getByRole()`** — primary query for all interactive elements
2. **Use `screen.getByText()`** — for non-interactive text content
3. **Use `screen.getByLabelText()`** — for form fields (tests label association)
4. **Use `screen.findByRole()`** — for async content (waits automatically)
5. **Avoid `getByTestId()`** — last resort when no semantic query works
6. **Never use `container.querySelector()`** — bypasses accessibility testing

### Event Testing Rules

```tsx
// WRONG — fireEvent dispatches DOM events directly
fireEvent.click(button);
fireEvent.change(input, { target: { value: 'test' } });

// RIGHT — userEvent simulates real user behavior
const user = userEvent.setup();
await user.click(button);
await user.type(input, 'test');
await user.selectOptions(select, 'option-value');
await user.keyboard('{Enter}');
```

## Unit Tests

For pure functions and complex logic:

```tsx
import { describe, it, expect } from 'vitest';  // or jest
import { formatDate, cn } from '@/shared/lib/utils';

describe('formatDate', () => {
  it('formats ISO date string', () => {
    expect(formatDate('2024-01-15T10:30:00Z'))
      .toBe('Jan 15, 2024 10:30 AM');
  });

  it('handles null input', () => {
    expect(formatDate(null)).toBe('—');
  });
});
```

## Mocking API Calls

Use **MSW (Mock Service Worker)** for API mocking — intercepts at the network level:

```tsx
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/v1/workspaces/:workspaceId/orders', () => {
    return HttpResponse.json({
      items: [
        { id: '1', title: 'Order 1', status: 'PENDING' },
        { id: '2', title: 'Order 2', status: 'COMPLETED' },
      ],
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**Prefer MSW over module mocking** — it tests the full request/response cycle without coupling tests to implementation.

## E2E Tests (Playwright / Cypress)

For critical user journeys:

```tsx
import { test, expect } from '@playwright/test';

test('user can create an order', async ({ page }) => {
  await page.goto('/workspaces/1');

  // Click create button
  await page.getByRole('button', { name: /create/i }).click();

  // Fill form
  await page.getByRole('textbox', { name: /title/i }).fill('New order');
  await page.getByRole('combobox', { name: /priority/i }).selectOption('HIGH');

  // Submit
  await page.getByRole('button', { name: /create/i }).click();

  // Verify item appears
  await expect(page.getByText('New order')).toBeVisible();
});
```

## Error Handling

### Error Boundary Strategy

```tsx
// Nest boundaries at different granularity levels
<ErrorBoundary FallbackComponent={AppError}>
  <Header />
  <main>
    <ErrorBoundary FallbackComponent={SectionError}>
      <Sidebar />
    </ErrorBoundary>
    <ErrorBoundary FallbackComponent={SectionError}>
      <MainContent />
    </ErrorBoundary>
  </main>
</ErrorBoundary>
```

**Rules**:
- Never use a single top-level boundary — a sidebar error shouldn't crash the page
- Provide retry functionality via `resetErrorBoundary`
- Log all errors to an error tracking service (Sentry, Datadog, etc.)
- Pair error boundaries with Suspense boundaries

### Async Error Bridge

Error boundaries don't catch event handler errors. Bridge them:

```tsx
function useThrowAsyncError() {
  const [, setState] = useState();
  return useCallback((error: Error) => {
    setState(() => { throw error; });
  }, []);
}

// In an event handler
const throwError = useThrowAsyncError();
try {
  await submitForm(data);
} catch (error) {
  throwError(error as Error);  // Triggers nearest ErrorBoundary
}
```

### Data-Fetching Error Handling

```tsx
// Option 1: throwOnError — delegate to ErrorBoundary
useQuery({
  queryKey: ['critical-data'],
  queryFn: fetchCriticalData,
  throwOnError: true,  // Error propagates to nearest ErrorBoundary
});

// Option 2: Handle in component
const { data, error, isError } = useQuery({
  queryKey: ['optional-data'],
  queryFn: fetchOptionalData,
});

if (isError) {
  return <Alert variant="destructive">{error.message}</Alert>;
}
```

> **Note**: The examples above show generic data-fetching hook patterns. The exact API varies by library (TanStack Query, SWR, Apollo Client, etc.).

### Form Validation Errors

Handled separately from runtime errors — through validation schemas:

```tsx
// Schema errors display inline via FormField's error prop
// No error boundary involvement
const error = errors[field.name]?.message as string | undefined;
<FormField label={field.label} error={error}>
  <Input {...register(fieldPath)} />
</FormField>
```

## ESLint Configuration

```json
// Zero warnings tolerance
{ "scripts": { "lint:check": "eslint --max-warnings=0" } }
```

Key rules to enforce:
- `@typescript-eslint/no-explicit-any` — error
- `@typescript-eslint/no-unused-vars` — error
- `react-hooks/rules-of-hooks` — error
- `react-hooks/exhaustive-deps` — warn
- `import/no-restricted-paths` — enforce layer dependencies

## Accessibility Testing

```tsx
// In component tests — getByRole tests ARIA implicitly
screen.getByRole('button', { name: /submit/i });  // Tests: button exists, has accessible name
screen.getByRole('dialog', { name: /create order/i });  // Tests: dialog landmark, title

// Automated auditing in E2E
import AxeBuilder from '@axe-core/playwright';

test('page has no accessibility violations', async ({ page }) => {
  await page.goto('/workspaces/1');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```
