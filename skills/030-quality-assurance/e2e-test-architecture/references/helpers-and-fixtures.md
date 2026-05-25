# Helpers and Fixtures

Helpers are stateless utilities. Fixtures inject scoped, auto-cleaned-up resources
into tests. Together they eliminate `beforeEach` boilerplate and make tests DRY
without creating hidden coupling between them.

---

## Fixtures — `fixtures/index.ts`

Extend Playwright's base `test` object to inject an authenticated page, API client,
and any other per-test resource. **All test files import `test` and `expect` from
here**, not from `@playwright/test`.

```typescript
// e2e/fixtures/index.ts
import { test as base, expect, type Page } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { ApiHelper } from '../helpers/api.helper';
import { TEST_USERS } from '../constants/test-data';

// Test-scoped fixtures: created fresh for every test
type TestFixtures = {
  authenticatedPage: Page;
};

// Worker-scoped fixtures: shared across tests in the same worker.
// REQUIRED for any fixture used in beforeAll / afterAll — Playwright silently
// delivers an empty/recycled instance if a test-scoped fixture is injected
// into beforeAll/afterAll, with no compile-time error.
type WorkerFixtures = {
  apiHelper: ApiHelper;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await AuthHelper.login(page, TEST_USERS.admin);
    await use(page);
  },

  apiHelper: [
    async ({ request }, use) => {
      const helper = new ApiHelper(request);
      await use(helper);
    },
    { scope: 'worker' }, // ← mandatory: enables injection in beforeAll/afterAll
  ],
});

export { expect };
```

### Usage in tests

```typescript
// e2e/tests/ticket-board.e2e.spec.ts
import { test, expect } from '../fixtures';  // ← always from fixtures, not @playwright/test
import { TicketBoardPage } from '../page-objects/pages/ticket-board.page';

test.describe('Ticket Board: Create ticket', () => {
  test('should create ticket', async ({ authenticatedPage, apiHelper }) => {
    const board = new TicketBoardPage(authenticatedPage);
    // ...
  });
});
```

---

## `helpers/auth.helper.ts`

Handles login flows — reads credentials from constants, handles redirects.
Static methods so it can be used both inside fixtures and in page objects.

```typescript
// e2e/helpers/auth.helper.ts
import { type Page } from '@playwright/test';
import { AUTH_IDS } from '../constants/test-ids';
import { URLS } from '../constants/urls';
import { TEST_USERS } from '../constants/test-data';

type UserCredentials = { email: string; password: string };

export class AuthHelper {
  static async login(
    page: Page,
    credentials: UserCredentials = TEST_USERS.admin,
  ): Promise<void> {
    await page.goto(URLS.login);
    await page.fill(`[data-testid="${AUTH_IDS.emailInput}"]`, credentials.email);
    await page.fill(`[data-testid="${AUTH_IDS.passwordInput}"]`, credentials.password);
    await page.click(`[data-testid="${AUTH_IDS.submitBtn}"]`);
    await page.waitForURL(URLS.dashboard);
  }

  static async logout(page: Page): Promise<void> {
    await page.goto(URLS.logout);
    await page.waitForURL(URLS.login);
  }

  // For auth flows with external IdP redirect (e.g. Keycloak, Auth0)
  static async loginViaRedirect(
    page: Page,
    credentials: UserCredentials = TEST_USERS.admin,
  ): Promise<void> {
    await page.goto(URLS.login);
    // Wait for redirect to IdP
    await page.waitForURL(/\/auth\/realms\//);
    await page.fill('#username', credentials.email);
    await page.fill('#password', credentials.password);
    await page.click('#kc-login');
    await page.waitForURL(URLS.dashboard);
  }
}
```

---

## `helpers/api.helper.ts`

Wraps Playwright's `APIRequestContext` for seeding and tearing down test data.
Use API setup instead of UI navigation whenever possible — it's faster and more reliable.

```typescript
// e2e/helpers/api.helper.ts
import { type APIRequestContext } from '@playwright/test';
import { TEST_USERS } from '../constants/test-data';

export class ApiHelper {
  private readonly baseUrl: string;

  constructor(private readonly request: APIRequestContext) {
    this.baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
  }

  private async getAuthToken(): Promise<string> {
    const response = await this.request.post(`${this.baseUrl}/auth/login`, {
      data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
    });
    const body = await response.json();
    return body.token as string;
  }

  async createOrg(name: string): Promise<{ id: string; name: string }> {
    const token = await this.getAuthToken();
    const response = await this.request.post(`${this.baseUrl}/orgs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name },
    });
    return response.json();
  }

  async deleteOrg(orgId: string): Promise<void> {
    const token = await this.getAuthToken();
    await this.request.delete(`${this.baseUrl}/orgs/${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async createProject(orgId: string, name: string): Promise<{ id: string; name: string }> {
    const token = await this.getAuthToken();
    const response = await this.request.post(
      `${this.baseUrl}/orgs/${orgId}/projects`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { name },
      },
    );
    return response.json();
  }

  async deleteAllTickets(projectId: string): Promise<void> {
    const token = await this.getAuthToken();
    const tickets = await this.request.get(
      `${this.baseUrl}/projects/${projectId}/tickets`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const { items } = await tickets.json();
    await Promise.all(
      (items as Array<{ id: string }>).map((t) =>
        this.request.delete(`${this.baseUrl}/tickets/${t.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    );
  }
}
```

---

## `helpers/data-factory.ts`

Typed factory functions that call `ApiHelper` to create entities with sensible defaults.
Tests call factories to set up preconditions without building the full API payload each time.

```typescript
// e2e/helpers/data-factory.ts
import { type APIRequestContext } from '@playwright/test';
import { ApiHelper } from './api.helper';
import { TEST_ORG, TICKET_DATA } from '../constants/test-data';

export class DataFactory {
  private readonly api: ApiHelper;

  constructor(request: APIRequestContext) {
    this.api = new ApiHelper(request);
  }

  async createOrg(overrides?: { name?: string }): Promise<{ id: string; name: string }> {
    return this.api.createOrg(overrides?.name ?? TEST_ORG.name);
  }

  async createProject(
    orgId: string,
    overrides?: { name?: string },
  ): Promise<{ id: string; name: string }> {
    return this.api.createProject(orgId, overrides?.name ?? 'E2E Project');
  }

  async createFullWorkspace(): Promise<{
    orgId: string;
    projectId: string;
  }> {
    const org = await this.createOrg();
    const project = await this.createProject(org.id);
    return { orgId: org.id, projectId: project.id };
  }
}
```

### Usage

```typescript
test.beforeAll(async ({ request }) => {
  const factory = new DataFactory(request);
  const { orgId, projectId } = await factory.createFullWorkspace();
  // store for test use
});
```

---

## Custom Matchers

Extend `expect` with domain-specific matchers for cleaner assertions.

```typescript
// e2e/fixtures/matchers.ts
import { expect } from '@playwright/test';
import { URLS } from '../constants/urls';

expect.extend({
  async toBeOnDashboard(page: import('@playwright/test').Page) {
    const url = page.url();
    const pass = url.includes(URLS.dashboard);
    return {
      pass,
      message: () => `Expected page to be on dashboard, got: ${url}`,
    };
  },

  async toHaveTicketCount(
    page: import('@playwright/test').Page,
    count: number,
    boardTestId: string,
  ) {
    const actual = await page.locator(`[data-testid="${boardTestId}"]`).count();
    return {
      pass: actual === count,
      message: () => `Expected ${count} tickets, got ${actual}`,
    };
  },
});
```

---

## Rules

| Rule | Reason |
|------|--------|
| All tests import `test`/`expect` from `fixtures/index.ts` | Fixtures only apply when extended test is used |
| `beforeEach` auth setup must migrate to `authenticatedPage` fixture | Removes duplication; centralizes login changes |
| Test data seeded via `ApiHelper`, not through UI clicks | API setup is 10-100× faster and not sensitive to UI changes |
| Factory defaults must come from `constants/test-data.ts` | Factories should not introduce new magic strings |
| Helpers are stateless (static or functional) | Stateful helpers cause hidden test coupling |
| `afterEach` / `afterAll` must clean up every entity created by `beforeAll` / `beforeEach` | Leaked data causes test pollution across runs |
