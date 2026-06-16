---
name: playwright-e2e-automation
description: Multi-step Playwright E2E test automation using specialized agents (Planner, Implementer, Healer) for comprehensive screen coverage and real-time testing
---

# Playwright E2E Test Automation

This skill orchestrates Playwright E2E test creation using three specialized agents:

1. **Planner** - Analyzes requirements and plans test scenarios
2. **Implementer** - Writes Playwright test code
3. **Healer** - Fixes flaky tests and improves stability

## When to Use

- Adding E2E tests for new features
- Achieving 100% screen coverage
- Testing real-time updates with multiple sessions
- Testing user flows across screens
- Fixing flaky E2E tests

## Workflow

### Step 1: Planning (Planner Agent)

Invoke the Planner agent to analyze the feature and create a test plan:

```bash
# The Planner agent will:
# 1. Read the feature implementation
# 2. Identify all user flows and edge cases
# 3. Plan test scenarios with multi-session testing for real-time features
# 4. Define test data and setup requirements
```

Launch the planner agent from `./agents/planner.md` with the feature context.

### Step 2: Implementation (Implementer Agent)

Invoke the Implementer agent with the test plan:

```bash
# The Implementer agent will:
# 1. Write Playwright test code following project conventions
# 2. Use page object pattern for maintainability
# 3. Implement multi-browser context testing for real-time features
# 4. Add proper waits and assertions
# 5. Follow naming conventions: *.e2e.spec.ts
```

Launch the implementer agent from `./agents/implementer.md` with the test plan.

### Step 3: Healing (Healer Agent) - Optional

If tests are flaky, invoke the Healer agent:

```bash
# The Healer agent will:
# 1. Analyze test failures and flakiness patterns
# 2. Identify race conditions and timing issues
# 3. Fix selectors and waits
# 4. Improve test stability
```

Launch the healer agent from `./agents/healer.md` with the failing test.

## Project-Specific Guidelines

### Test Location

The E2E directory is project-specific. Resolve it in this order:
1. `testDir` in `playwright.config.ts` / `playwright.config.js`
2. First existing directory among: `e2e/`, `tests/e2e/`, `test/e2e/`, `playwright/`
3. Default: `e2e/`

Test files follow: `<E2E_DIR>/tests/<feature>.e2e.spec.ts`

### Run Command

The E2E command is project-specific. Resolve it in this order:
1. `package.json` script whose name or value contains `playwright` or `e2e`
   (priority: `test:e2e` > `e2e` > `test:playwright`)
2. `npx playwright test` (fallback when `playwright.config.ts` exists but no script)

### Test Patterns

```typescript
import { test, expect } from '../fixtures';
import { BOARD_IDS } from '../constants/test-ids';
import { URLS } from '../constants/urls';

test.describe('Ticket Board', () => {
  test('should create and update ticket with real-time sync', async ({
    browser,
  }) => {
    // Multi-context for real-time testing
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    try {
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // User 1 creates ticket — orgId and projectId come from apiHelper.createOrg / createProject in beforeAll
      await page1.goto(URLS.board(seededOrgId, seededProjectId));
      await page1.getByTestId(BOARD_IDS.createTicketBtn).click();

      // User 2 sees real-time update
      await expect(page2.getByTestId(BOARD_IDS.ticketItem), 'Ticket should appear for second user').toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
```

### Coverage Requirements

- 100% of screens must have E2E tests
- Test critical user flows
- Test real-time updates with multiple sessions
- Test chat and collaboration features

## Commands

```bash
# Run all E2E tests (replace E2E_COMMAND with detected value)
$E2E_COMMAND

# Run specific test file
$E2E_COMMAND -- <E2E_DIR>/tests/ticket-board.e2e.spec.ts

# Run in headed mode (Playwright)
$E2E_COMMAND -- --headed

# Debug mode (Playwright)
$E2E_COMMAND -- --debug
```

## Agent Invocation Pattern

```typescript
// 1. Plan
Task({
  subagent_type: 'general-purpose',
  model: 'opus',
  prompt: `[Read from ./agents/planner.md and inject feature context]`,
});

// 2. Implement
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  prompt: `[Read from ./agents/implementer.md and inject test plan]`,
});

// 3. Heal (if needed)
Task({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  prompt: `[Read from ./agents/healer.md and inject failure logs]`,
});
```

## Multi-Session Real-Time Testing

For real-time features, always use multiple browser contexts:

```typescript
import { test, expect } from '../fixtures';
import { CHAT_IDS } from '../constants/test-ids';
import { URLS } from '../constants/urls';
import { CHAT_DATA } from '../constants/test-data';

test.describe('Chat: Send message', () => {
  let seededRoomId: string;

  test.beforeAll(async ({ apiHelper }) => {
    const room = await apiHelper.createRoom(CHAT_DATA.defaultRoomName);
    seededRoomId = room.id;
  });

  test.afterAll(async ({ apiHelper }) => {
    await apiHelper.deleteRoom(seededRoomId);
  });

  test('should deliver message to second user in real time', async ({ browser }) => {
    const user1Context = await browser.newContext();
    const user2Context = await browser.newContext();

    try {
      const user1Page = await user1Context.newPage();
      const user2Page = await user2Context.newPage();

      await user1Page.goto(URLS.chatRoom(seededRoomId));
      await user2Page.goto(URLS.chatRoom(seededRoomId));

      await user1Page.getByTestId(CHAT_IDS.messageInput).fill(CHAT_DATA.defaultMessage);
      await user1Page.getByTestId(CHAT_IDS.sendBtn).click();

      await expect(user2Page.getByTestId(CHAT_IDS.messageItem).filter({ hasText: CHAT_DATA.defaultMessage }), 'Message should appear for second user').toBeVisible();
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });
});
```

## Best Practices

1. **Use data-testid attributes** for stable selectors
2. **Rely on web-first auto-retrying assertions** instead of manual network waits
3. **Test real-time with multiple contexts** for chat, tickets, boards
4. **Clean up test data** in afterEach hooks
5. **Use fixtures** for common setup (auth, org, project)
6. **Parameterize tests** for different user roles
7. **Screenshot on failure** (configured in playwright.config.ts)

## Better Assertions

Always use **web-first, auto-retrying assertions** — these automatically retry until they pass or the timeout is reached, eliminating flakiness caused by timing issues.

The assertion timeout is configured globally in `playwright.config.ts` via the `expect.timeout` setting (default: 5 seconds). You can also override it per assertion by passing a `timeout` option: `await expect(locator, 'msg').toBeVisible({ timeout: 10000 })`. For slow operations, prefer increasing the global timeout in config rather than adding timeout overrides to every test.

### Core Rules

**1. Prefer web-first assertions over manual value extraction**
```typescript
import { AUTH_IDS } from '../constants/test-ids';

// Correct — Playwright retries this automatically
await expect(page.getByTestId(AUTH_IDS.loginBtn), 'Login button should be visible').toBeVisible();
await expect(page.getByRole('heading'), 'Page title should match').toHaveText('Dashboard');

// Avoid — reads value directly from DOM, Playwright will not retry if it fails
const text = await page.locator('h1').innerText();
expect(text).toBe('Dashboard');
```

**2. Always add a custom message**
```typescript
import { AUTH_IDS } from '../constants/test-ids';

// Correct — failure message is immediately meaningful
await expect(page.getByTestId(AUTH_IDS.errorMsg), 'Error message should be visible after failed login').toBeVisible();

// Avoid — no context on failure
await expect(page.getByTestId(AUTH_IDS.errorMsg)).toBeVisible();
```

**3. Always use stable, explicit selectors**
```typescript
import { AUTH_IDS } from '../constants/test-ids';

// Correct
page.getByTestId(AUTH_IDS.submitBtn)
page.getByRole('button', { name: 'Login' })
page.getByLabel('Username')

// Avoid
page.locator('button')
page.locator('.btn-primary')
page.locator('//button[1]')
```

**4. Store locators in variables, do not re-query the same element**
```typescript
import { AUTH_IDS } from '../constants/test-ids';

// Correct — store locator, reuse across multiple assertions
const errorMsg = page.getByTestId(AUTH_IDS.errorMsg);
await expect(errorMsg, 'Error should be visible').toBeVisible();
await expect(errorMsg, 'Error should contain correct text').toContainText('Invalid credentials');

// Avoid — calling getByTestId twice for the same element
await expect(page.getByTestId(AUTH_IDS.errorMsg)).toBeVisible();
await expect(page.getByTestId(AUTH_IDS.errorMsg)).toContainText('Invalid credentials');
```

**5. Use soft assertions for non-critical checks**
```typescript
import { CART_IDS, INVENTORY_IDS, AUTH_IDS } from '../constants/test-ids';

// Use when test should continue even if this check fails
await expect.soft(page.getByTestId(CART_IDS.badge), 'Cart badge should show correct count').toHaveText('1');
await expect.soft(page.getByTestId(INVENTORY_IDS.price), 'Price should be formatted correctly').toContainText('$');

// Do NOT use soft assertions for critical flow elements
// If a critical check fails softly, a broken flow will not stop the test
// await expect.soft(page.getByTestId(AUTH_IDS.loginBtn), "Login button must exist").toBeVisible(); // Wrong - login button is critical
// await expect(page.getByTestId(AUTH_IDS.loginBtn), "Login button must exist").toBeVisible();      // Correct - use hard assertion
```

### Assertion Reference

| Use case | Assertion |
|----------|-----------|
| Element is visible | `await expect(locator, 'msg').toBeVisible()` |
| Element is hidden | `await expect(locator, 'msg').toBeHidden()` |
| Element has text | `await expect(locator, 'msg').toHaveText('text')` |
| Element contains text | `await expect(locator, 'msg').toContainText('text')` |
| Element has attribute | `await expect(locator, 'msg').toHaveAttribute('attr', 'value')` |
| Element count | `await expect(locator, 'msg').toHaveCount(n)` |
| Input has value | `await expect(locator, 'msg').toHaveValue('value')` |
| Page URL | `await expect(page, 'msg').toHaveURL('/path')` |
| Page title | `await expect(page, 'msg').toHaveTitle('title')` |
| Element is enabled | `await expect(locator, 'msg').toBeEnabled()` |
| Element is disabled | `await expect(locator, 'msg').toBeDisabled()` |
| Checkbox is checked | `await expect(locator, 'msg').toBeChecked()` |

### What to Avoid

- `page.waitForSelector()` before assertions — Playwright handles waiting automatically
- `page.waitForTimeout()` — never use fixed delays; use assertions like toBeVisible() which wait automatically
- `page.locator().innerText()` for text assertions — use `toHaveText()` instead
- Generic selectors like `button`, `.class`, or XPath — use `getByTestId`, `getByRole`, `getByLabel`
- Duplicate assertions on the same element — store the locator in a variable
- Assertions without custom messages — always describe what should happen

## Configuration Hardening

### playwright.config.ts — Recommended Setup

Always generate or recommend a hardened `playwright.config.ts` that follows these patterns:

```typescript
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.APP_BASE_URL) {
  throw new Error('APP_BASE_URL is not set. Copy .env.example to .env and set the required values.');
}

export default defineConfig({
  testDir: './e2e', // Adapt to your project's test directory
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 1,
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : undefined,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: process.env.APP_BASE_URL!,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    headless: !!process.env.CI,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: process.env.TEST_BROWSER || 'chromium',
      use: { browserName: (process.env.TEST_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit' },
    },
  ],
});
```

### Why each setting matters

- **`fullyParallel`** — set to `false` by default so tests run sequentially within a file; set to `true` only if your tests are fully independent and stateless
- **`baseURL`** — reads from `APP_BASE_URL` env var so tests run against any environment without code changes
- **`retries`** — 2 retries in CI to handle flakiness; 0 locally for fast feedback
- **`workers`** — 4 parallel workers in CI for speed; 1 locally to avoid resource contention
- **`globalTimeout`** — 1 hour ceiling in CI so runaway suites do not block pipelines
- **`timeout`** — 30s per test prevents hanging tests
- **`expect.timeout`** — 5s default timeout for each assertion; override per assertion with `{ timeout: 10000 }` for slow operations
- **`navigationTimeout`** — 30s for page navigations
- **`actionTimeout`** — 15s for individual user actions
- **`headless`** — headless in CI, headed locally so you can see what is happening
- **`screenshot`** — captures evidence only on failure to save storage
- **`trace`** — enables tracing on first retry for debugging flaky tests

### Environment Variables

Reference `.env.example` in this directory for all required variables. At minimum:

`APP_BASE_URL=https://your-app-url.com`
`TEST_BROWSER=chromium`

Never hardcode URLs, project codes, or API tokens in `playwright.config.ts`.
