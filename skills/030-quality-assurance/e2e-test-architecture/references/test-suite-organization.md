# Test Suite Organization

Consistent `describe` / `test` naming and hook placement make test output
readable and failures immediately locatable without opening the file.

---

## `describe` Block Naming

Format: **`[Feature]: [Scenario Group]`**

The Feature is the screen, page, or functional area. The Group is a sub-context
(state, user role, action type).

```typescript
// Good
test.describe('Login: Valid credentials', () => { ... });
test.describe('Login: Invalid credentials', () => { ... });
test.describe('Ticket Board: Create ticket', () => { ... });
test.describe('Ticket Board: Real-time sync', () => { ... });
test.describe('Chat: Send message', () => { ... });
test.describe('Chat: as admin', () => { ... });

// Bad — vague, no feature context
test.describe('tests', () => { ... });
test.describe('login stuff', () => { ... });
test.describe('it should work', () => { ... });
```

---

## `test` / `it` Naming

Format: **`should [observable outcome] when [condition]`**

The outcome is what a user or system would observe. The condition is the trigger or state.
Omit `when [condition]` only when the condition is the default/happy path.

```typescript
// Good
test('should display dashboard when credentials are valid');
test('should show error message when password is empty');
test('should show error message when email format is invalid');
test('should create ticket and appear in board when form is submitted');
test('should sync ticket creation to second user in real time');
test('should disable submit button when title exceeds 255 characters');

// Bad — describes implementation, not observable outcome
test('click submit button');
test('fill email field');
test('check that login works');
test('test1');
```

---

## Nesting Depth

**Maximum 2 levels** (describe → test).  
A 3rd level is permitted **only** for role-based groupings.

```typescript
// 2 levels — standard
test.describe('Ticket Board: Create ticket', () => {
  test('should create ticket when title is provided', async ({ page }) => { ... });
  test('should show validation error when title is empty', async ({ page }) => { ... });
});

// 3 levels — role-based grouping only
test.describe('Project Settings', () => {
  test.describe('as admin', () => {
    test('should allow deleting the project', async ({ page }) => { ... });
  });
  test.describe('as member', () => {
    test('should hide delete button', async ({ page }) => { ... });
  });
});

// Bad — 3 levels for non-role reasons
test.describe('Board', () => {
  test.describe('tickets', () => {
    test.describe('creation', () => {  // ← unnecessary depth
      test('should create ticket', async ({ page }) => { ... });
    });
  });
});
```

---

## Hook Placement Rules

| Hook | Use for | Scope |
|------|---------|-------|
| `test.beforeAll` | One-time setup: seed DB, obtain auth token, create org | describe block |
| `test.beforeEach` | Per-test navigation, page state reset | describe block |
| `test.afterEach` | Clean up entities created during the test | describe block |
| `test.afterAll` | Teardown: delete seeded data, close shared connections | describe block |

```typescript
test.describe('Ticket Board: Create ticket', () => {
  let orgId: string;
  let projectId: string;

  // One-time: create the org and project via API before any test runs
  test.beforeAll(async ({ apiHelper }) => {
    const org = await apiHelper.createOrg(TEST_ORG.name);
    orgId = org.id;
    const project = await apiHelper.createProject(orgId, 'Test Project');
    projectId = project.id;
  });

  // Per-test: navigate to the board fresh
  test.beforeEach(async ({ authenticatedPage }) => {
    const board = new TicketBoardPage(authenticatedPage);
    await board.navigate(orgId, projectId);
  });

  // Per-test cleanup: delete tickets created during the test
  test.afterEach(async ({ apiHelper }) => {
    await apiHelper.deleteAllTickets(projectId);
  });

  // One-time teardown
  test.afterAll(async ({ apiHelper }) => {
    await apiHelper.deleteOrg(orgId);
  });

  test('should create ticket when form is submitted', async ({ authenticatedPage }) => {
    const board = new TicketBoardPage(authenticatedPage);
    await board.openCreateTicketModal();
    await board.createModal.fillField(BOARD_IDS.ticketTitleInput, TICKET_DATA.defaultTitle);
    await board.createModal.clickButton(BOARD_IDS.ticketSaveBtn);

    const ticket = await board.getTicketLocator(TICKET_DATA.defaultTitle);
    await expect(ticket).toBeVisible();
  });
});
```

---

## Grouping Strategies

### Group by action (most common)

Use when tests share a precondition (same screen, same entity state).

```typescript
test.describe('Ticket Board: Create ticket', () => { ... });
test.describe('Ticket Board: Delete ticket', () => { ... });
test.describe('Ticket Board: Real-time sync', () => { ... });
```

### Group by user state

Use when tests differ primarily by who the actor is.

```typescript
test.describe('Project Settings: as admin', () => { ... });
test.describe('Project Settings: as member', () => { ... });
test.describe('Project Settings: as viewer', () => { ... });
```

### Group by scenario outcome

Use when a feature has meaningfully different success vs. error paths.

```typescript
test.describe('Login: Valid credentials', () => { ... });
test.describe('Login: Invalid credentials', () => { ... });
test.describe('Login: Account locked', () => { ... });
```

---

## Good vs. Bad Examples

### Bad

```typescript
// bad-login.e2e.spec.ts
import { test, expect } from '@playwright/test';

test('login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="auth-email-input"]', 'admin@e2e.test');
  await page.fill('[data-testid="auth-password-input"]', 'Test@12345');
  await page.click('[data-testid="auth-submit-btn"]');
  await expect(page).toHaveURL('/dashboard');
});

test('bad login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="auth-email-input"]', 'bad@email.com');
  await page.fill('[data-testid="auth-password-input"]', 'wrong');
  await page.click('[data-testid="auth-submit-btn"]');
  await expect(page.locator('[data-testid="auth-error-message"]')).toBeVisible();
});
```

Problems: inline strings, imports from `@playwright/test`, no describe blocks, vague test names, no hooks.

### Good

```typescript
// login.e2e.spec.ts
import { test, expect } from '../fixtures';
import { LoginPage } from '../page-objects/pages/login.page';
import { AUTH_IDS } from '../constants/test-ids';
import { TEST_USERS, EXPECTED_LABELS } from '../constants/test-data';
import { URLS } from '../constants/urls';

test.describe('Login: Valid credentials', () => {
  test('should navigate to dashboard when credentials are correct', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.loginAs(TEST_USERS.admin);
    await expect(page).toHaveURL(URLS.dashboard);
  });
});

test.describe('Login: Invalid credentials', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.login);
  });

  test('should show error message when password is wrong', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.fillEmail(TEST_USERS.admin.email);
    await loginPage.fillPassword('wrong-password');
    await loginPage.submit();

    await expect(page.locator(`[data-testid="${AUTH_IDS.errorMessage}"]`))
      .toHaveText(EXPECTED_LABELS.loginError);
  });

  test('should show error message when email is empty', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.fillPassword(TEST_USERS.admin.password);
    await loginPage.submit();

    await expect(page.locator(`[data-testid="${AUTH_IDS.errorMessage}"]`))
      .toBeVisible();
  });
});
```
