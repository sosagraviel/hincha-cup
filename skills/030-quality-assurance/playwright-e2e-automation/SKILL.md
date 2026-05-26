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
      await page1.click(`[data-testid="${BOARD_IDS.createTicketBtn}"]`);

      // User 2 sees real-time update
      await expect(page2.locator(`[data-testid="${BOARD_IDS.ticketItem}"]`))
        .toBeVisible({ timeout: 5000 });
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

      await user1Page.fill(`[data-testid="${CHAT_IDS.messageInput}"]`, CHAT_DATA.defaultMessage);
      await user1Page.click(`[data-testid="${CHAT_IDS.sendBtn}"]`);

      await expect(
        user2Page.locator(`[data-testid="${CHAT_IDS.messageItem}"]`, {
          hasText: CHAT_DATA.defaultMessage,
        }),
      ).toBeVisible({ timeout: 5000 });
    } finally {
      await user1Context.close();
      await user2Context.close();
    }
  });
});
```

## Best Practices

1. **Use data-testid attributes** for stable selectors
2. **Wait for network idle** before assertions
3. **Test real-time with multiple contexts** for chat, tickets, boards
4. **Clean up test data** in afterEach hooks
5. **Use fixtures** for common setup (auth, org, project)
6. **Parameterize tests** for different user roles
7. **Screenshot on failure** (configured in playwright.config.ts)
