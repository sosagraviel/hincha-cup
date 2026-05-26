---
name: e2e-test-architecture
description: >
  E2E test automation architecture patterns for Playwright and Cypress suites.
  Use when setting up, extending, or reviewing an E2E test project. Covers Page
  Object Model (POM), constants/selector files, describe block naming conventions,
  and helper/fixture patterns. Invoke as a mandatory reference before writing any
  E2E test code. Triggers on: playwright, cypress, e2e, page object, POM,
  test architecture, test structure, selectors, test helpers, test fixtures.
version: 1.0.0
last-updated: 2026-05-11
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
user-invokable: true
is_linkable_to_agents: true
---

# E2E Test Architecture

Architecture patterns that every AI-generated E2E test suite must follow.
Flat test files with inline strings and no structure do not scale — this skill
defines the folder layout, class hierarchies, and conventions that make suites
maintainable across dozens of features.

## Contents

| Reference | Purpose |
|-----------|---------|
| [page-object-model.md](references/page-object-model.md) | BasePage, Page classes, Component objects |
| [constants-and-selectors.md](references/constants-and-selectors.md) | test-ids, URLs, test-data constants |
| [test-suite-organization.md](references/test-suite-organization.md) | describe/test naming, nesting, hook placement |
| [helpers-and-fixtures.md](references/helpers-and-fixtures.md) | Auth helpers, API helpers, data factories, custom matchers |

---

## Canonical Folder Structure

Every E2E test project must follow this layout. Create missing directories upfront — do not scatter files.

```
e2e/
├── constants/
│   ├── test-ids.ts          ← all data-testid values, grouped by feature
│   ├── urls.ts              ← all app routes / URL builders
│   └── test-data.ts         ← users, passwords, seed data, expected labels
├── page-objects/
│   ├── base.page.ts         ← BasePage class (shared methods)
│   ├── pages/
│   │   └── *.page.ts        ← one class per route/screen
│   └── components/
│       └── *.component.ts   ← reusable UI pieces (modal, table, nav, toast)
├── helpers/
│   ├── auth.helper.ts       ← login/logout, token management
│   ├── api.helper.ts        ← REST calls for test data setup/teardown
│   └── data-factory.ts      ← typed entity factories using api.helper
├── fixtures/
│   └── index.ts             ← extended test object with injected helpers
└── tests/
    └── **/*.e2e.spec.ts     ← test files (import from fixtures/index.ts)
```

> **Rule**: tests import from `fixtures/index.ts`, not from `@playwright/test` directly. This ensures every test automatically has access to auth, API client, and page factories.

---

## Architecture Decision Tree

Use this before writing a single line of test code.

### Should I create a new Page Object class?
- Does the test navigate to a new route or full-page view? → **Yes**, create `pages/[name].page.ts`
- Is it a modal, drawer, or reusable panel used across pages? → **No**, create `components/[name].component.ts`
- Does an existing page class already have 10+ methods? → **Split it**

### Should I add to constants?
- Is a `data-testid` string used anywhere in test code? → `constants/test-ids.ts`
- Is a URL or path string used anywhere in test code? → `constants/urls.ts`
- Is a user credential, name, email, or expected label used anywhere? → `constants/test-data.ts`
- **Rule**: if a string appears more than once, it belongs in constants. If it appears once but is a selector or URL, it still belongs in constants.

### Should I create a helper vs. a fixture?
- Is it a stateless utility function (login steps, API call)? → `helpers/`
- Does it need to be injected per-test and auto-cleaned up? → `fixtures/index.ts`
- Does it create test entities that need teardown? → `helpers/data-factory.ts` + teardown in `afterEach`

---

## Non-Negotiable Rules

These apply to every file an agent creates or edits in an E2E test suite:

1. **No inline selector strings** — all `data-testid` values come from `constants/test-ids.ts`
2. **No inline URLs** — all routes come from `constants/urls.ts`
3. **No inline credentials or test data** — all come from `constants/test-data.ts`
4. **No assertions inside Page Object methods** — POM methods perform actions, tests do assertions
5. **No `@playwright/test` import in test files** — import from `fixtures/index.ts`
6. **No UI-only test data setup** — use `helpers/api.helper.ts` to seed data before tests
7. **No flat test files** — every test lives inside at least one `describe` block
8. **`describe` names follow** `[Feature]: [Group]` convention
9. **`test` names follow** `should [observable outcome] when [condition]` convention
10. **Auth setup is a fixture**, not a `beforeEach` with inline credentials
