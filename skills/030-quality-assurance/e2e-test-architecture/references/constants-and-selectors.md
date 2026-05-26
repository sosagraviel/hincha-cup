# Constants and Selectors

Centralizing selectors, URLs, and test data in typed constant files means a single
`data-testid` rename touches one line instead of propagating across fifty test files.

---

## `constants/test-ids.ts`

Every `data-testid` attribute value used in tests must be declared here.
Group by feature area. Use `as const` for TypeScript literal inference.

```typescript
// e2e/constants/test-ids.ts

export const AUTH_IDS = {
  emailInput: 'auth-email-input',
  passwordInput: 'auth-password-input',
  submitBtn: 'auth-submit-btn',
  errorMessage: 'auth-error-message',
  forgotPasswordLink: 'auth-forgot-password-link',
} as const;

export const NAV_IDS = {
  sidebar: 'nav-sidebar',
  logo: 'nav-logo',
  userMenu: 'nav-user-menu',
  logoutBtn: 'nav-logout-btn',
  notificationBell: 'nav-notification-bell',
} as const;

export const BOARD_IDS = {
  createTicketBtn: 'board-create-ticket-btn',
  createTicketModal: 'board-create-ticket-modal',
  ticketTitleInput: 'board-ticket-title-input',
  ticketSaveBtn: 'board-ticket-save-btn',
  ticketItem: 'board-ticket-item',
  ticketDeleteBtn: 'board-ticket-delete-btn',
  emptyState: 'board-empty-state',
} as const;

export const CHAT_IDS = {
  messageInput: 'chat-message-input',
  sendBtn: 'chat-send-btn',
  messageList: 'chat-message-list',
  messageItem: 'chat-message-item',
  typingIndicator: 'chat-typing-indicator',
} as const;
```

### Usage in Page Objects

```typescript
// In a page object — always import, never inline
import { AUTH_IDS } from '../../constants/test-ids';

await this.page.fill(`[data-testid="${AUTH_IDS.emailInput}"]`, email);
await this.page.click(`[data-testid="${AUTH_IDS.submitBtn}"]`);
```

### Naming Convention

- Object names: `SCREAMING_SNAKE_CASE` with `_IDS` suffix
- Keys: `camelCase`
- Values: `kebab-case` matching the actual `data-testid` attribute

---

## `constants/urls.ts`

All routes, paths, and URL builders live here. No hardcoded strings in tests or page objects.

```typescript
// e2e/constants/urls.ts

export const URLS = {
  login: '/login',
  logout: '/logout',
  dashboard: '/dashboard',

  orgs: '/orgs',
  org: (orgId: string) => `/orgs/${orgId}`,

  projects: (orgId: string) => `/orgs/${orgId}/projects`,
  project: (orgId: string, projectId: string) =>
    `/orgs/${orgId}/projects/${projectId}`,

  board: (orgId: string, projectId: string) =>
    `/orgs/${orgId}/projects/${projectId}/board`,

  settings: '/settings',
  profile: '/settings/profile',
} as const;
```

### Usage

```typescript
import { URLS } from '../../constants/urls';

await this.page.goto(URLS.board(orgId, projectId));
await expect(this.page).toHaveURL(new RegExp(URLS.project(orgId, projectId)));
```

---

## `constants/test-data.ts`

User credentials, seed entity IDs, expected UI labels, and any other literal values
used across tests. No real credentials — use dedicated test accounts.

```typescript
// e2e/constants/test-data.ts

export const TEST_USERS = {
  admin: {
    email: 'admin@e2e.test',
    password: 'Test@12345',
    displayName: 'E2E Admin',
  },
  member: {
    email: 'member@e2e.test',
    password: 'Test@12345',
    displayName: 'E2E Member',
  },
  viewer: {
    email: 'viewer@e2e.test',
    password: 'Test@12345',
    displayName: 'E2E Viewer',
  },
} as const;

export const TEST_ORG = {
  name: 'E2E Test Organization',
} as const;

export const TICKET_DATA = {
  defaultTitle: 'E2E Ticket',
  defaultDescription: 'Created by automated E2E test',
  longTitle: 'A'.repeat(255),
} as const;

export const EXPECTED_LABELS = {
  emptyBoardMessage: 'No tickets yet. Create your first ticket.',
  loginError: 'Invalid email or password',
  networkError: 'Connection error. Please try again.',
} as const;
```

### Usage

```typescript
import { TEST_USERS, EXPECTED_LABELS } from '../../constants/test-data';

await loginPage.loginAs(TEST_USERS.admin);
await expect(page.locator(`[data-testid="${AUTH_IDS.errorMessage}"]`))
  .toHaveText(EXPECTED_LABELS.loginError);
```

---

## Rules

| Rule | Reason |
|------|--------|
| Every `data-testid` value comes from `test-ids.ts` | Single source of truth; rename propagates automatically |
| Every URL/path comes from `urls.ts` | Route refactors update one file |
| Every credential and label comes from `test-data.ts` | Prevents magic strings; makes test data auditable |
| String appears more than once → move to constants immediately | Duplication is a maintenance trap |
| String appears once but is a selector or URL → still move to constants | Consistency over "just this once" exceptions |
| Test files must not import from other test files | Constants are the shared leaf layer — importable by page objects, helpers, and test files alike, but never from one test file into another |
