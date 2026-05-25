# Page Object Model

The Page Object Model (POM) decouples test logic from UI implementation details.
When a selector changes, you fix one class method — not every test that used it.

---

## BasePage

All page classes extend `BasePage`. It provides shared navigation and wait utilities.

```typescript
// e2e/page-objects/base.page.ts
import { type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `screenshots/${name}.png` });
  }
}
```

---

## Page Classes

One class per route/screen. Methods describe **user actions** (verbs).
Never put assertions inside a Page class — that belongs in the test.

```typescript
// e2e/page-objects/pages/login.page.ts
import { type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { AUTH_IDS } from '../../constants/test-ids';
import { URLS } from '../../constants/urls';
import { TEST_USERS } from '../../constants/test-data';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto(URLS.login);
  }

  async fillEmail(email: string): Promise<void> {
    await this.page.fill(`[data-testid="${AUTH_IDS.emailInput}"]`, email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.fill(`[data-testid="${AUTH_IDS.passwordInput}"]`, password);
  }

  async submit(): Promise<void> {
    await this.page.click(`[data-testid="${AUTH_IDS.submitBtn}"]`);
  }

  async loginAs(user = TEST_USERS.admin): Promise<void> {
    await this.navigate();
    await this.fillEmail(user.email);
    await this.fillPassword(user.password);
    await this.submit();
    await this.page.waitForURL(URLS.dashboard);
  }
}
```

```typescript
// e2e/page-objects/pages/ticket-board.page.ts
import { type Page, type Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { BOARD_IDS } from '../../constants/test-ids';
import { URLS } from '../../constants/urls';
import { ModalComponent } from '../components/modal.component';

export class TicketBoardPage extends BasePage {
  readonly createModal: ModalComponent;

  constructor(page: Page) {
    super(page);
    this.createModal = new ModalComponent(
      page,
      page.locator(`[data-testid="${BOARD_IDS.createTicketModal}"]`),
    );
  }

  async navigate(orgId: string, projectId: string): Promise<void> {
    await this.goto(URLS.board(orgId, projectId));
  }

  async openCreateTicketModal(): Promise<void> {
    await this.page.click(`[data-testid="${BOARD_IDS.createTicketBtn}"]`);
    await this.createModal.waitForVisible();
  }

  async getTicketLocator(title: string): Promise<Locator> {
    return this.page.locator(`[data-testid="${BOARD_IDS.ticketItem}"]`, {
      hasText: title,
    });
  }

  async ticketCount(): Promise<number> {
    return this.page.locator(`[data-testid="${BOARD_IDS.ticketItem}"]`).count();
  }
}
```

---

## Component Objects

Reusable UI pieces that appear across multiple pages (modals, tables, nav bars, toasts).
A Component Object is scoped to a **root Locator**, not to the full page.

```typescript
// e2e/page-objects/components/modal.component.ts
import { type Page, type Locator } from '@playwright/test';

export class ModalComponent {
  constructor(
    private readonly page: Page,
    private readonly root: Locator,
  ) {}

  async waitForVisible(): Promise<void> {
    await this.root.waitFor({ state: 'visible' });
  }

  async waitForHidden(): Promise<void> {
    await this.root.waitFor({ state: 'hidden' });
  }

  async fillField(testId: string, value: string): Promise<void> {
    await this.root.locator(`[data-testid="${testId}"]`).fill(value);
  }

  async clickButton(testId: string): Promise<void> {
    await this.root.locator(`[data-testid="${testId}"]`).click();
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.waitForHidden();
  }
}
```

```typescript
// e2e/page-objects/components/data-table.component.ts
import { type Locator } from '@playwright/test';

export class DataTableComponent {
  constructor(private readonly root: Locator) {}

  row(index: number): Locator {
    return this.root.locator('tbody tr').nth(index);
  }

  cell(row: number, column: number): Locator {
    return this.row(row).locator('td').nth(column);
  }

  async rowCount(): Promise<number> {
    return this.root.locator('tbody tr').count();
  }

  async getColumnValues(column: number): Promise<string[]> {
    const cells = this.root.locator(`tbody tr td:nth-child(${column + 1})`);
    return cells.allTextContents();
  }
}
```

---

## Folder Convention

```
e2e/page-objects/
├── base.page.ts                    ← shared base class
├── pages/
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── ticket-board.page.ts
│   └── settings.page.ts
└── components/
    ├── modal.component.ts
    ├── data-table.component.ts
    ├── nav-bar.component.ts
    └── toast.component.ts
```

---

## Anti-Patterns

| Anti-Pattern | Why It Breaks | Fix |
|---|---|---|
| Assertions inside POM methods (`expect(...)`) | Hides test intent, makes methods hard to reuse | Move assertions to the test file |
| God-class page object with 30+ methods | Slow to find methods, high change frequency | Split by functional area or extract components |
| Constructor receives data, not `page` | Breaks POM contract | POM takes `page` (and optionally `root` for components) |
| Re-implementing Playwright primitives (`click`, `fill`) without added value | Unnecessary wrapping | Only wrap when you add domain logic (wait, navigate, use constants) |
| Inline `data-testid` strings inside POM methods | Defeats constants pattern | Import from `constants/test-ids.ts` |
