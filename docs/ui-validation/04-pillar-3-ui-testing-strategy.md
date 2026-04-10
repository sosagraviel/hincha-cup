# Pillar 3: UI Testing Strategy (4 Levels)

Defines which test levels apply to a UI task, detects/installs the required tools, and orchestrates test generation and execution. The applicable test levels **must** be defined in the ticket's DoD and acceptance criteria. If they are not defined, the pipeline asks the user at runtime.

**Skill:** `skills/030-quality-assurance/ui-testing/` (Archetype A — Workflow)

```
skills/030-quality-assurance/ui-testing/
  SKILL.md
  references/
    test-level-matrix.md       # Which levels apply to which UI task types
    tool-detection.md          # How to detect and set up testing tools
```

---

## Level 1: Unit Testing

**What:** Test individual UI components in isolation using a JS test runner + DOM testing library. Validates rendering, props, states, event handlers, accessibility attributes, and design token usage.

**Tool Detection Strategy:**

```
1. Check project for existing unit test setup:
   a. Vitest detected (vitest.config.ts, "vitest" in package.json) → use Vitest + RTL
   b. Jest detected (jest.config.*, "jest" in package.json) → use Jest + RTL
   c. Mocha detected → use Mocha (less common for UI)
   d. None detected → ASK USER:
      "No unit test framework detected. Recommended: Vitest (fast, native ESM).
       Options: (1) Install Vitest + @testing-library/react
                (2) Install Jest + @testing-library/react
                (3) Skip unit tests
                (4) Use another tool: ___"

2. Check for testing library:
   a. @testing-library/react detected → use RTL
   b. @testing-library/vue detected → use VTL
   c. Not detected → recommend installation alongside chosen runner
```

**What Unit Tests Cover:**

| Test Category | Example | When Required |
|---------------|---------|---------------|
| Render test | Component renders without crashing | Always |
| Prop variants | Each variant renders correctly (e.g., `status="ahead"` → "Ahead" text) | When component has variants |
| Accessibility | `aria-*` attributes present, roles correct, keyboard navigable | Always |
| Event handlers | Click/change handlers fire correctly | When component has interactions |
| Design tokens | Correct CSS classes/vars used (e.g., `bg-[var(--color-bg-success)]`) | When Figma specs provided |
| Edge cases | Empty props, long text, missing optional props | Always |

**Mastery Skills:**
- `jest-coverage-automation` (existing, `030-quality-assurance/`) — triggered by `jest`
- `mastering-vitest` (`050-language-frameworks/`) — triggered by `vitest`

---

## Level 2: Component Testing (Playwright CT)

**What:** Mount individual components in a real browser using Playwright Component Testing. Validates visual rendering, interaction behavior, and responsive states in an isolated environment — no full app needed.

**Tool Detection Strategy:**

```
1. Check for Playwright in project:
   a. @playwright/test detected → check for CT
      i.  @playwright/experimental-ct-react (or -vue, -svelte) detected → use CT
      ii. CT not detected → ASK USER:
          "Playwright is installed but Component Testing (CT) is not.
           Options: (1) Install @playwright/experimental-ct-{framework}
                    (2) Skip component testing
                    (3) Use Storybook + test-runner instead"
   b. Playwright not detected → ASK USER:
      "No E2E/component test framework detected. Recommended: Playwright.
       Options: (1) Install @playwright/test + CT for {framework}
                (2) Skip E2E and component testing
                (3) Use another tool: ___"
```

**What Component Tests Cover:**

| Test Category | Example | When Required |
|---------------|---------|---------------|
| Visual render | Component renders matching expected visual output | When component has visual states |
| Interaction | Click button → state changes → UI updates | When component has interactions |
| Responsive | Component at 375px vs 1440px viewport | When responsive behavior specified |
| Composition | Component with slot/children content renders correctly | When component uses slots/children |
| Animation states | Hover/focus/active states render correctly | When design specifies states |

**Playwright CT Config Template:**
```typescript
import { defineConfig, devices } from '@playwright/experimental-ct-react';

export default defineConfig({
  testDir: './src/__tests__/component',
  use: {
    ctPort: 3100,
    ctViteConfig: { /* project vite config */ },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
});
```

---

## Level 3: E2E Testing (Playwright)

**What:** Full browser tests that validate user flows across pages. Navigation, form submissions, state transitions, route changes, and cross-page interactions.

**Tool Detection Strategy:**

```
1. Check for Playwright:
   a. @playwright/test detected → use existing setup
   b. Not detected → same prompt as Level 2 step b (shared detection)

2. Check for playwright.config.ts:
   a. Exists → read and respect existing config
   b. Not exists → generate from template (testDir, baseURL, projects)
```

**Leverages existing skill:** `playwright-e2e-automation` (`030-quality-assurance/`) — Planner/Implementer/Healer agent pattern for E2E test generation.

**What E2E Tests Cover:**

| Test Category | Example | When Required |
|---------------|---------|---------------|
| Navigation flow | Click link → navigates to correct page | When implementing pages |
| Form submission | Fill form → submit → success/error state | When implementing forms |
| State transitions | Loading → loaded → error states render correctly | When implementing async flows |
| Route guards | Unauthenticated user redirected to login | When implementing protected routes |
| Cross-component | Action in component A updates component B | When implementing connected features |
| Responsive flows | Mobile hamburger menu → navigation works | When responsive behavior specified |

---

## Level 4: Visual Testing

**What:** Pixel-level comparison against Figma designs (design fidelity) and/or baseline screenshots (regression). Defined in detail in [Pillar 4: Visual Testing Pipeline](./05-pillar-4-visual-testing.md).

---

## Test Level Decision Matrix

Which levels to require based on the type of UI work:

| UI Task Type | Unit | Component | E2E | Visual |
|-------------|------|-----------|-----|--------|
| New atom/molecule component | Required | Recommended | - | If Figma exists |
| New organism/widget | Required | Required | Recommended | If Figma exists |
| New page/feature | Required | - | Required | If Figma exists |
| Redesign existing screen | Required | - | Required | Required (both modes) |
| Bug fix on existing UI | If behavior changes | - | If flow affected | Screenshot mode |
| Design token/theme change | - | - | - | Required (regression) |
| Accessibility improvement | Required | Recommended | - | - |

This matrix is encoded in the UI Task Detector and used by `create-sdd-ticket` to auto-suggest test levels in the DoD.

---

## Test Level Enforcement

### At ticket creation (`create-sdd-ticket` Phase 3, Strategy 5)

Example DoD injection for a new component:

```markdown
## Testing Requirements

### Required Test Levels
- [x] Unit: Vitest + RTL (project default)
- [x] Component: Playwright CT
- [ ] E2E: Not required (atom component, no route)
- [x] Visual: Figma mode (design link provided)

### Unit Tests
- [ ] Renders all variants correctly
- [ ] Accessibility attributes present
- [ ] Design token classes match Figma spec
- [ ] Edge cases handled (empty props, long text)

### Component Tests
- [ ] Visual render matches at desktop viewport
- [ ] Visual render matches at mobile viewport
- [ ] Interaction states render correctly (hover, focus)

### Visual Tests
- [ ] Figma comparison passes within configured threshold
- [ ] No regression on existing screens
```

### At implementation time (`implement-ticket` Phase 5/6)

If the ticket's DoD does not specify test levels, the pipeline asks:

```
This ticket involves UI work but test levels are not defined in the DoD.
Based on the task type ({detected type}), recommended test levels are:
  - Unit testing: {recommended}
  - Component testing: {recommended}
  - E2E testing: {recommended}
  - Visual testing: {recommended}

Which test levels should be required? (select all that apply, or 'all recommended')
```

---

## Tool Detection Summary

```
UI task detected → determine test levels from DoD/ticket
                 → for each level, detect tool:

Level 1 (Unit):
  Vitest? → use + load mastering-vitest skill
  Jest?   → use + load jest-coverage-automation skill
  None?   → ask user → install chosen tool → load mastery skill

Level 2 (Component):
  Playwright CT? → use
  Playwright (no CT)? → ask to add CT package
  No Playwright? → ask to install or skip

Level 3 (E2E):
  Playwright? → use + load playwright-e2e-automation skill
  Cypress? → use (limited support)
  None? → ask to install or skip

Level 4 (Visual):
  Always uses Playwright + pixelmatch (handled by ui-visual-testing skill)
  No separate tool detection needed
```

---

## `mastering-vitest` Skill

**Location:** `skills/050-language-frameworks/mastering-vitest/`

Reference skill (Archetype B) for projects using Vitest as their unit test runner.

**Covers:** Configuration (`vitest.config.ts`), test patterns (`describe`/`it`/`expect`), mocking (`vi.fn`, `vi.mock`, `vi.spyOn`), snapshot testing, coverage (v8/istanbul), workspace support, UI component testing with `@testing-library`, custom matchers, fixture patterns, parameterized tests.
