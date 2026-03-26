# UI Validation & Testing Pipeline

Comprehensive UI validation and testing pipeline covering four test levels: **unit**, **component**, **E2E**, and **visual** testing. Detects UI tasks, determines required test levels at ticket creation, and orchestrates test execution during implementation. Integrated into `implement-ticket` Phases 5-6 and `create-sdd-ticket` Phase 3, with standalone invocation via `/ui-visual-testing`.

**Version**: 1.0
**Last Updated**: 2026-03-25

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Pillar 1: UI Task Detection](#pillar-1-ui-task-detection)
4. [Pillar 2: UI Validation at Ticket Creation](#pillar-2-ui-validation-at-ticket-creation)
5. [Pillar 3: UI Testing Strategy (4 Levels)](#pillar-3-ui-testing-strategy-4-levels)
6. [Pillar 4: Visual Testing Pipeline](#pillar-4-visual-testing-pipeline)
7. [Figma Design Fetcher Skill](#figma-design-fetcher-skill)
8. [Configuration Schema](#configuration-schema)
9. [Artifact Storage](#artifact-storage)
10. [Visual-Verifier Agent Dual-Mode](#visual-verifier-agent-dual-mode)
11. [Integration Points](#integration-points)
12. [Implementation Guide](#implementation-guide)
13. [Verification](#verification)

---

## Overview

### Problem

The framework's current visual verification (Phase 6 in `implement-ticket`) only supports **before/after regression comparison**. There is no Figma integration, no design constraint extraction, no UI task detection at ticket creation time, and no awareness of when visual testing should be required.

### Solution

A four-pillar pipeline:

| Pillar | What | Where |
|--------|------|-------|
| **UI Task Detection** | Deterministic classifier that scores whether a task is UI-related | `orchestration/src/utils/ui-task-detector.ts` |
| **Ticket-Time Validation** | Injects UI-specific DoD, acceptance criteria, and test requirements during ticket creation | `create-sdd-ticket` Phase 3 |
| **UI Testing Strategy** | Defines which of the 4 test levels (unit, component, E2E, visual) apply and orchestrates tool detection/setup | `ui-testing` skill + `implement-ticket` Phase 5 |
| **Visual Testing Pipeline** | Dual-mode (Figma + Screenshot) visual comparison with iterative fix loop | `ui-visual-testing` skill + `implement-ticket` Phase 6 |

### Four Test Levels

Each UI task may require one or more of these test levels. Which levels apply is determined at ticket creation time (DoD/AC) or at runtime if not specified.

| Level | Tool | What It Validates | When Required |
|-------|------|-------------------|---------------|
| **Unit** | Vitest/Jest + RTL | Component rendering, props, states, accessibility, design token usage | Always for UI components |
| **Component** | Playwright CT | Isolated component visual rendering + interaction in real browser | When component has visual states or complex interactions |
| **E2E** | Playwright | Full user flows across pages, navigation, form submissions | When implementing pages/features with user flows |
| **Visual** | Playwright + pixelmatch | Pixel-level comparison against Figma designs or baseline screenshots | When Figma designs exist or modifying existing screens |

### Two Visual Modes

Both visual modes can run independently or simultaneously on the same screen.

**Screenshot Mode (Regression)** — Captures before/after snapshots of existing screens. Detects unintended visual regressions introduced by code changes. Default threshold: **5%**.

**Figma Mode (Design Fidelity)** — Fetches Figma designs (images + constraints + tokens) and compares against actual implementation. Validates pixel-level and structural fidelity to the design. Default threshold: **2%**.

When both modes apply (e.g., redesigning an existing screen), both comparisons run and both must pass.

---

## Architecture

```
                                ┌─────────────────────────┐
                                │   UI Task Detector      │
                                │   (shared utility)      │
                                └──────────┬──────────────┘
                         ┌─────────────────┼─────────────────┐
                         ▼                 ▼                  ▼
              ┌──────────────────┐ ┌───────────────┐ ┌───────────────────┐
              │ create-sdd-ticket│ │implement-ticket│ │ /ui-visual-testing│
              │ Phase 3          │ │ Phase 6        │ │ (standalone)      │
              │ Gap Detection    │ │ Visual Verify  │ │                   │
              └──────────────────┘ └───────┬───────┘ └────────┬──────────┘
                                           │                   │
                                           ▼                   ▼
                                   ┌───────────────────────────────┐
                                   │   ui-visual-testing skill     │
                                   │   (dual-mode pipeline)        │
                                   └──────────┬────────────────────┘
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                   ┌──────────────┐ ┌─────────────┐ ┌────────────────┐
                   │Figma Design  │ │ Screenshot   │ │ Visual-Verifier│
                   │Fetcher Skill │ │ Service      │ │ Agent          │
                   │(040-integr.) │ │(Playwright)  │ │(dual-mode)     │
                   └──────────────┘ └─────────────┘ └────────────────┘
```

### Component Ownership

| Component | Type | Location | Archetype |
|-----------|------|----------|-----------|
| UI Task Detector | Utility | `orchestration/src/utils/ui-task-detector.ts` | — |
| ui-testing | Skill | `skills/030-quality-assurance/ui-testing/` | Workflow (A) |
| ui-visual-testing | Skill | `skills/030-quality-assurance/ui-visual-testing/` | Workflow (A) |
| figma-design-fetcher | Skill | `skills/040-integrations/figma-design-fetcher/` | Workflow (A) |
| mastering-vitest | Skill | `skills/050-language-frameworks/mastering-vitest/` | Reference (B) |
| Figma Export Service | Service | `orchestration/src/services/implement-ticket/figma-export.service.ts` | — |
| Screenshot Service | Service | `orchestration/src/services/implement-ticket/screenshot.service.ts` | — |
| Visual-Verifier | Agent | `agents/templates/visual-verifier.template.md` | — |
| Config Schema | Schema | `orchestration/src/schemas/ui-visual-testing.schema.ts` | — |

All skills follow the [SKILLS_SPEC.md](SKILLS_SPEC.md) contract and are registered in `skills/skills.config.json` per [ADDING_SKILLS.md](ADDING_SKILLS.md).

---

## Pillar 1: UI Task Detection

### Purpose

A shared, deterministic function that classifies whether a task involves UI work. Produces a confidence score (0-100) and an `isUI` boolean. Consumed by `create-sdd-ticket`, `implement-ticket`, and the standalone skill.

### Location

`orchestration/src/utils/ui-task-detector.ts`

### Algorithm: Signal-Based Scoring

The detector evaluates five signal categories, each contributing a weighted score capped at its maximum.

#### Signal 1: Ticket Content Keywords (max 30 points)

**Primary keywords** (5 points each, max 20):
`screen`, `page`, `component`, `UI`, `design`, `layout`, `widget`, `dashboard`, `modal`, `dialog`, `form`, `button`, `navigation`, `sidebar`, `header`, `footer`, `responsive`, `mobile`, `tablet`, `desktop`

**Secondary keywords** (3 points each, max 10):
`CSS`, `style`, `color`, `font`, `typography`, `spacing`, `padding`, `margin`, `border`, `animation`, `transition`, `hover`, `icon`, `image`, `figma`, `mockup`, `wireframe`, `pixel`

Detection is case-insensitive and applies to the entire ticket body (title, description, acceptance criteria, technical context, implementation notes).

#### Signal 2: Figma References (max 25 points)

- Presence of `figma.com/design/` or `figma.com/file/` URL pattern: **20 points**
- Presence of `node-id=` parameter in any Figma URL: **+5 bonus**
- Total capped at 25

Also extracts all matched Figma URLs for downstream use (fileKey + nodeId parsing).

#### Signal 3: File Path Signals (max 20 points)

Scans the ticket's "Files to Create/Modify" section, technical approach, or `changedFiles` input for directory patterns:

`components/`, `pages/`, `ui/`, `views/`, `layouts/`, `styles/`, `css/`, `scss/`, `templates/`

**4 points each**, capped at 20.

#### Signal 4: Stack Detection (max 15 points)

Checks the project's detected stack profile for frontend frameworks:
`React`, `Vue`, `Angular`, `Next.js`, `Nuxt`, `Svelte`

If any detected: **15 points**. Otherwise: **0 points**.

Note: Stack detection alone does not classify a task as UI — it's a supporting signal.

#### Signal 5: Acceptance Criteria Visual References (max 10 points)

Scans BDD scenarios and acceptance criteria for visual behavior terms:
`renders`, `displays`, `shows`, `visible`, `hidden`, `screenshot`, `visual`, `pixel`, `diff`, `match`, `align`, `center`, `responsive`

**2 points each**, capped at 10.

### Classification Threshold

| Score | Classification | Recommendation |
|-------|---------------|----------------|
| >= 50 | Strong UI task | `ui-visual-testing` (both modes) |
| 25-49 | Likely UI task | `regression-only` (screenshot mode) |
| < 25  | Not UI | `no-ui` |

`isUI = true` when score **>= 25**.

### Interface

```typescript
export interface UITaskClassification {
  isUI: boolean;
  confidence: number;
  signals: {
    keywordScore: number;
    figmaScore: number;
    filePathScore: number;
    stackScore: number;
    acceptanceCriteriaScore: number;
  };
  figmaReferences: FigmaReference[];
  detectedKeywords: string[];
  recommendation: 'ui-visual-testing' | 'regression-only' | 'no-ui';
}

export interface FigmaReference {
  url: string;
  fileKey: string;
  nodeId?: string;
}

export function classifyUITask(
  ticketContent: string,
  stackProfile?: StackProfile,
  changedFiles?: string[]
): UITaskClassification;
```

### Examples

| Ticket Type | Expected Score | Breakdown |
|------------|---------------|-----------|
| Pure backend API endpoint | ~0-15 | No UI keywords, no Figma, backend paths only |
| React component with Figma link | ~70-85 | Keywords (20) + Figma (25) + paths (12) + stack (15) + AC (8) |
| Bug fix on existing dashboard | ~35-50 | Keywords (15) + paths (8) + stack (15) + AC (4) |
| Database migration | ~0 | Zero signals |

---

## Pillar 2: UI Validation at Ticket Creation

### Purpose

When `create-sdd-ticket` processes a ticket that involves UI work, automatically detect this and inject UI-specific Definition of Done items, acceptance criteria, and technical tasks.

### Integration Point

`skills/020-development-workflow/create-sdd-ticket/SKILL.md` — Phase 3 (Gap Detection)

### New Strategy: Strategy 5 — UI Task Detection

Added to the existing 4-strategy gap detection approach:

```
Phase 3: Validate & Detect Gaps
  Strategy 1: Search Project Context        (existing)
  Strategy 2: Deep Codebase Pattern Search   (existing)
  Strategy 3: Find Similar Implementations   (existing)
  Strategy 4: Analyze Existing Tickets       (existing)
  Strategy 5: UI Task Detection              ← NEW
```

#### Strategy 5 Algorithm

```
1. Run classifyUITask() against the canonical ticket content
2. IF isUI == false → skip (no UI work detected)
3. IF isUI == true:
   a. Check if project already has ui_testing configuration:
      - Search .claude/CLAUDE.md for "ui_testing", "visual testing", "ui-visual-testing"
      - Search project-context skill for same
      - Check for ui-visual-testing.json in project root
   b. IF config NOT found:
      - Add batch question:
        "UI Testing: This ticket involves UI components ({detected keywords}).
         Should visual UI testing against Figma designs be required as part of
         the Definition of Done? (yes / no / not applicable)
         (Searched: CLAUDE.md, project-context — no ui_testing config found)"
   c. IF config found OR engineer answers "yes":
      - Inject DoD items (see below)
      - Inject AC scenario (see below)
      - Inject technical task (see below)
      - IF Figma URLs detected: extract fileKey + nodeIds, pre-populate mapping
   d. IF engineer answers "no" or "not applicable":
      - No changes to ticket
```

#### Injected DoD Items

Based on the [Test Level Decision Matrix](#test-level-decision-matrix), the appropriate test levels are injected:

```markdown
### UI Testing Requirements

#### Required Test Levels
- [ ] Unit: [detected tool] (render, props, variants, accessibility, design tokens)
- [ ] Component: Playwright CT (visual render, interactions, responsive)
- [ ] E2E: Playwright (user flows, navigation, form submission)
- [ ] Visual: Figma comparison + regression (within configured threshold)

#### Unit Tests
- [ ] All component variants render correctly
- [ ] Accessibility attributes present (aria-*, roles)
- [ ] Design token classes match Figma spec
- [ ] Edge cases handled

#### Component Tests (if applicable)
- [ ] Component renders matching expected visual at desktop viewport
- [ ] Component renders matching expected visual at mobile viewport
- [ ] Interaction states work correctly

#### E2E Tests (if applicable)
- [ ] User flow completes successfully
- [ ] Error states render correctly
- [ ] Navigation works as expected

#### Visual Tests (if applicable)
- [ ] Visual UI test passes for all affected screens (within configured threshold)
- [ ] ui-visual-testing.json mapping created for affected screens/components
- [ ] Design constraints from Figma verified against implementation
```

Which levels are marked as required vs "if applicable" depends on the task type per the decision matrix.

#### Injected Acceptance Criteria

```gherkin
Scenario: UI tests pass for all required levels
  Given the implementation is complete
  When unit tests run
  Then all unit tests pass with >= 80% coverage

Scenario: Visual fidelity validation (if visual level required)
  Given the implementation is complete
  And the dev server is running
  When /ui-visual-testing runs against the affected screens
  Then all screens pass within the configured diff threshold
  And no visual regressions are introduced on existing screens
```

#### Injected Technical Tasks

```markdown
- [ ] Write unit tests covering all component variants and accessibility
- [ ] Write component tests for visual render and interaction states (if CT level required)
- [ ] Write E2E tests for user flows (if E2E level required)
- [ ] Create/update ui-visual-testing.json with mapping for affected screens (if visual level required):
  - Route(s): [extracted from ticket]
  - Figma node(s): [extracted from Figma URLs if present]
  - Viewport(s): [from design specs or defaults: 1440x900, 375x812]
```

#### SDD Ticket Template Addition

Optional section added to `sdd-ticket-template.md` after the DoD section:

```markdown
## UI Testing (if applicable)

### Test Levels
| Level | Required | Tool | Status |
|-------|----------|------|--------|
| Unit | Yes/No | Vitest/Jest + RTL | - |
| Component | Yes/No | Playwright CT | - |
| E2E | Yes/No | Playwright | - |
| Visual | Yes/No | Playwright + pixelmatch | - |

### Figma Reference (if visual level)
- [Figma URL]

### Visual Testing Configuration (if visual level)
| Screen | Route | Figma Node | Viewport | Mode |
|--------|-------|------------|----------|------|
| [label] | [route] | [nodeId] | [WxH] | figma / screenshot / both |
```

---

## Pillar 3: UI Testing Strategy (4 Levels)

### Purpose

Define which test levels apply to a UI task, detect/install the required tools, and orchestrate test generation and execution. The applicable test levels **must** be defined in the ticket's DoD and acceptance criteria. If they are not defined, the pipeline asks the user at runtime.

### Skill: `skills/030-quality-assurance/ui-testing/`

A workflow skill (Archetype A per [SKILLS_SPEC.md](SKILLS_SPEC.md)) that coordinates UI test level detection, tool setup, and test orchestration across all four levels.

```
skills/030-quality-assurance/ui-testing/
  SKILL.md                           # Workflow definition
  references/
    test-level-matrix.md             # Which levels apply to which UI task types
    tool-detection.md                # How to detect and set up testing tools
```

**Frontmatter** (per SKILLS_SPEC.md):
```yaml
---
name: ui-testing
description: >
  UI testing orchestration across 4 levels: unit, component, E2E, and visual.
  Detects project testing tools, suggests setup when missing, and coordinates
  test generation for UI tasks. Use when implementing UI components, pages,
  or features that need testing.
version: 1.0.0
category: quality-assurance
keywords: [ui-testing, unit-test, component-test, e2e, visual-testing, playwright, vitest]
user-invocable: true
argument-hint: "[--ticket KEY] [--levels unit,component,e2e,visual]"
triggers: [react, next, nextjs, vue, angular, nuxt, svelte]
compatible_languages: [typescript, javascript]
last_updated: 2026-03-25
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Edit
  - Skill
---
```

**Registration** in `skills/skills.config.json`:
```json
{
  "name": "ui-testing",
  "path": "030-quality-assurance/ui-testing",
  "description": "UI testing orchestration: unit, component, E2E, and visual test levels",
  "trigger_mode": "triggered",
  "triggers": ["react", "next", "nextjs", "vue", "angular", "nuxt", "svelte"],
  "compatible_languages": ["typescript", "javascript"],
  "is_linkable_to_agents": true
}
```

### Level 1: Unit Testing

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

**Mastery Skills Required:**
- `jest-coverage-automation` (existing, `030-quality-assurance/`) — triggered by `jest`
- `playwright-e2e-automation` (existing, `030-quality-assurance/`) — triggered by `playwright`
- **NEW:** `mastering-vitest` (`050-language-frameworks/`) — triggered by `vitest`
  - Reference skill (Archetype B per SKILLS_SPEC.md) covering Vitest configuration, test patterns, mocking, snapshot testing, coverage, workspace support

**What Unit Tests Cover for UI Components:**

| Test Category | Example | When Required |
|---------------|---------|---------------|
| Render test | Component renders without crashing | Always |
| Prop variants | Each variant renders correctly (e.g., `status="ahead"` → "Ahead" text) | When component has variants |
| Accessibility | `aria-*` attributes present, roles correct, keyboard navigable | Always |
| Event handlers | Click/change handlers fire correctly | When component has interactions |
| Design tokens | Correct CSS classes/vars used (e.g., `bg-[var(--color-bg-success)]`) | When Figma specs provided |
| Edge cases | Empty props, long text, missing optional props | Always |

### Level 2: Component Testing (Playwright CT)

**What:** Mount individual components in a real browser using Playwright Component Testing. Validates visual rendering, interaction behavior, and responsive states in an isolated environment — no full app needed.

**Tool Detection Strategy:**

```
1. Check for Playwright in project:
   a. @playwright/test detected in package.json → check for CT
      i.  @playwright/experimental-ct-react (or -vue, -svelte) detected → use CT
      ii. CT not detected → ASK USER:
          "Playwright is installed but Component Testing (CT) is not.
           CT enables isolated component visual + interaction testing.
           Options: (1) Install @playwright/experimental-ct-{framework}
                    (2) Skip component testing
                    (3) Use Storybook + test-runner instead"
   b. Playwright not detected → ASK USER:
      "No E2E/component test framework detected. Recommended: Playwright.
       Options: (1) Install @playwright/test + CT for {framework}
                (2) Skip E2E and component testing
                (3) Use another tool: ___"

2. If user chooses to install:
   - pnpm add -D @playwright/test @playwright/experimental-ct-{framework}
   - npx playwright install chromium
   - Generate playwright-ct.config.ts
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

### Level 3: E2E Testing (Playwright)

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

**What E2E Tests Cover for UI Tasks:**

| Test Category | Example | When Required |
|---------------|---------|---------------|
| Navigation flow | Click link → navigates to correct page | When implementing pages |
| Form submission | Fill form → submit → success/error state | When implementing forms |
| State transitions | Loading → loaded → error states render correctly | When implementing async flows |
| Route guards | Unauthenticated user redirected to login | When implementing protected routes |
| Cross-component | Action in component A updates component B | When implementing connected features |
| Responsive flows | Mobile hamburger menu → navigation works | When responsive behavior specified |

### Level 4: Visual Testing

**What:** Pixel-level comparison against Figma designs (design fidelity) and/or baseline screenshots (regression). Defined in detail in [Pillar 4: Visual Testing Pipeline](#pillar-4-visual-testing-pipeline).

### Test Level Decision Matrix

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

This matrix is encoded in the UI Task Detector and used by `create-sdd-ticket` to auto-suggest test levels in the DoD. If the ticket doesn't specify, `implement-ticket` asks at runtime.

### Test Level Enforcement in DoD

**At ticket creation** (`create-sdd-ticket` Phase 3, Strategy 5):

When a UI task is detected, the pipeline injects test level requirements into the DoD based on the decision matrix above. Example for a new component:

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

**At implementation time** (`implement-ticket` Phase 5/6):

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

### New Mastery Skill: `mastering-vitest`

**Location:** `skills/050-language-frameworks/mastering-vitest/`

Reference skill (Archetype B per SKILLS_SPEC.md) for projects using Vitest as their unit test runner.

```yaml
---
name: mastering-vitest
description: >
  Vitest testing patterns, configuration, and best practices for TypeScript/JavaScript projects.
  Use when writing unit tests with Vitest, configuring test environments, or improving test coverage.
version: 1.0.0
category: programming-languages
keywords: [vitest, testing, unit-test, coverage, typescript]
triggers: [vitest]
compatible_languages: [typescript, javascript]
last_updated: 2026-03-25
---
```

**Covers:** Configuration (vitest.config.ts), test patterns (describe/it/expect), mocking (vi.fn, vi.mock, vi.spyOn), snapshot testing, coverage (v8/istanbul), workspace support, UI component testing with @testing-library, custom matchers, fixture patterns, parameterized tests.

**Registration:**
```json
{
  "name": "mastering-vitest",
  "path": "050-language-frameworks/mastering-vitest",
  "description": "Vitest testing patterns and best practices",
  "trigger_mode": "triggered",
  "triggers": ["vitest"],
  "compatible_languages": ["typescript", "javascript"]
}
```

### Tool Detection Summary

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

## Pillar 4: Visual Testing Pipeline

### Skill: `skills/030-quality-assurance/ui-visual-testing/`

```
skills/030-quality-assurance/ui-visual-testing/
  SKILL.md
  references/
    figma-mapping.md              # Convention docs for ui-visual-testing.json
    renderer-adapters.md          # Per-framework screenshot quirks
    playwright-components.md      # Isolated component testing with Playwright CT
  templates/
    ui-visual-testing.json        # Starter mapping template
```

### CLI Interface

```
/ui-visual-testing [--ticket KEY] [--base-url URL] [--max-iterations N] [--mapping PATH] [--mode figma|screenshot|both]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--ticket` | Current branch slug | Used for artifact folder naming |
| `--base-url` | `http://localhost:3000` | Base URL of running dev server |
| `--max-iterations` | From config or `3` | Max fix-and-retry cycles |
| `--mapping` | Auto-detect | Explicit path to `ui-visual-testing.json` |
| `--mode` | Auto-detect | Force specific mode(s) |

### Exit Codes

| Code | Meaning |
|------|---------|
| `PASS` | All active comparisons within threshold |
| `FAIL` | Max iterations reached with failing frames |
| `SKIP` | No mapping found or no Figma access (not an error) |

### Pipeline Steps

```
Step 1: Resolve Configuration
  └─> Locate ui-visual-testing.json (component dir → project root)
  └─> If NOT found and pipeline needs it → ASK USER to create
      └─> Offer auto-generation from ticket context (routes, viewports, Figma refs)
      └─> Never silently skip — always surface the gap

Step 2: Determine Active Modes
  └─> Figma mode ON if:
      ├─> Config has figmaNodeIds for screen entries
      ├─> Ticket body contains Figma URLs
      ├─> Ticket frontmatter has figma: field
      └─> Acceptance criteria reference Figma
  └─> Screenshot mode ON if:
      ├─> Modifying existing screen (route exists, before snapshots available)
      └─> Config entry has modes: ["screenshot"]

Step 3: Figma Mode — Fetch Design Context (if active)
  └─> Invoke figma-design-fetcher skill (cascading access strategy)
  └─> Outputs to .claude-tmp/ui-validation/{ticketKey}/figma/:
      ├─> {label}.png              (frame export at 2x)
      ├─> {label}-constraints.json (design constraints)
      └─> design-context.md        (human-readable summary)

Step 4: Screenshot Mode — Capture Before (if active)
  └─> Playwright: navigate to route, set viewport, wait for ready
  └─> Capture full-page or selector-scoped screenshot
  └─> Consider Playwright Components for isolated component captures
  └─> Save to .claude-tmp/ui-validation/{ticketKey}/before/

Step 5: Capture After / Actual Screenshots
  └─> Same Playwright capture process as Step 4
  └─> Save to .claude-tmp/ui-validation/{ticketKey}/after/

Step 6: Compare
  └─> Figma comparison: actual vs figma export (pixelmatch)
      └─> Threshold from config.thresholds.figma (default: 2%)
  └─> Regression comparison: before vs after (pixelmatch)
      └─> Threshold from config.thresholds.regression (default: 5%)
  └─> Generate visual-diff-report.json with results from both modes

Step 7: Iteration Loop (for failing frames)
  └─> For each frame exceeding threshold:
      ├─> Invoke visual-verifier agent with:
      │   ├─> Diff images
      │   ├─> Design constraints (if Figma mode)
      │   ├─> Changed files
      │   └─> Mode context
      ├─> Agent returns structured JSON fix plan
      ├─> Apply fixes via implementer
      ├─> Re-capture only affected frames
      ├─> Re-diff
      └─> Repeat up to maxIterations (from config, default 3)

Step 8: Final Verdict
  └─> PASS: all frames within threshold for all active modes
  └─> FAIL: max iterations reached with remaining failures
  └─> Report per-mode results in visual-diff-report.json
```

### Screenshot Capture Details

**Playwright full-page capture:**
- Navigate to `{baseURL}{route}`
- Set viewport to configured dimensions
- Wait for `networkidle` + optional `waitForSelector`
- Apply optional `delay` (for animations/transitions)
- Capture full page or clip to `captureSelector`
- Device pixel ratio: 2x (matches Figma export density)

**Playwright Components (isolated component testing):**
- For component-level validation without full page rendering
- Uses `@playwright/experimental-ct-react` (or framework variant)
- Mounts component in isolation with props
- Captures component screenshot only
- Useful for atoms/molecules that aren't route-accessible

### Diff Comparison Details

**Engine:** `pixelmatch` (already used by existing `screenshot.service.ts`)

**Parameters:**
- `threshold`: 0.1 (per-pixel sensitivity, 0-1 scale)
- `includeAA`: false (ignore anti-aliasing differences)
- Overall diff percentage = `diffPixels / totalPixels * 100`

**Image normalization:**
- If dimensions don't match (Figma vs Playwright): resize to common dimensions before comparison
- Both captures at 2x device pixel ratio for consistent density

---

## Figma Design Fetcher Skill

### Location

`skills/040-integrations/figma-design-fetcher/`

```
skills/040-integrations/figma-design-fetcher/
  SKILL.md
  references/
    figma-api-guide.md              # Figma REST API usage patterns
    design-token-extraction.md      # Extracting constraints/tokens from node data
```

### Purpose

Dedicated skill for fetching Figma designs, exporting frame images, and extracting structured design constraints. Consumed by `ui-visual-testing` and `create-sdd-ticket`.

### Figma Access Strategy (Cascading Fallback)

The skill tries each access method in order, stopping at the first success:

```
1. Figma MCP
   └─> Check .claude/mcp.json for Figma MCP server configuration
   └─> If configured: use MCP tools (richest integration — file browsing, component inspection)
   └─> Advantage: no token management, direct IDE integration

2. FIGMA_ACCESS_TOKEN (environment variable)
   └─> Check process.env.FIGMA_ACCESS_TOKEN
   └─> If set: use Figma REST API directly
   └─> Advantage: simple, works in CI/CD

3. Suggest MCP setup
   └─> If neither available: suggest user install Figma MCP
   └─> Command: npx figma-developer-mcp --setup (or equivalent)
   └─> Wait for user confirmation, then retry step 1

4. Ask user to set token
   └─> If user declines MCP: ask to set FIGMA_ACCESS_TOKEN in .env.local
   └─> Provide instructions:
       echo "FIGMA_ACCESS_TOKEN=figd_xxxx" >> .env.local
   └─> Wait for confirmation, then retry step 2

5. Ask for manual exports
   └─> If user declines all Figma access:
   └─> Ask: "Can you provide exported images of the component/screen?"
   └─> Instruct user to place PNGs in .claude-tmp/ui-validation/{ticketKey}/figma/
   └─> Skill reads from that directory (image-only mode, no constraint extraction)

6. Fall back to screenshot-only
   └─> If user declines everything: disable Figma mode entirely
   └─> Run screenshot (regression) mode only
   └─> Log: "Figma access not available — running in regression mode only"
```

### What the Skill Fetches

#### Frame Images

```
GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png&scale=2
Authorization: Bearer {FIGMA_ACCESS_TOKEN}
```

Response contains an image URL → download and save as PNG.

#### Node Properties (Design Constraints)

```
GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId}
Authorization: Bearer {FIGMA_ACCESS_TOKEN}
```

Extracts from the node tree:

| Category | Properties |
|----------|------------|
| **Layout** | `layoutMode` (HORIZONTAL/VERTICAL), `primaryAxisAlignItems`, `counterAxisAlignItems`, `paddingLeft/Right/Top/Bottom`, `itemSpacing` |
| **Dimensions** | `absoluteBoundingBox.width/height`, `cornerRadius`, `minWidth/maxWidth` |
| **Colors** | `fills[].color` (RGBA), `strokes[].color`, `opacity` |
| **Typography** | `style.fontFamily`, `style.fontSize`, `style.fontWeight`, `style.lineHeightPx`, `style.letterSpacing` |
| **Effects** | `effects[]` (shadows, blurs) |
| **Auto-layout** | `layoutAlign`, `layoutGrow`, `layoutWrap` |

#### Document Styles

```
GET https://api.figma.com/v1/files/{fileKey}/styles
Authorization: Bearer {FIGMA_ACCESS_TOKEN}
```

Maps Figma style IDs to named tokens (colors, typography scales).

### Output Format

Saved to `.claude-tmp/ui-validation/{ticketKey}/figma/`:

**`{label}.png`** — Frame image at 2x scale

**`{label}-constraints.json`** — Structured design data:
```json
{
  "nodeId": "1:23",
  "label": "Dashboard – Desktop",
  "dimensions": {
    "width": 1440,
    "height": 900,
    "cornerRadius": 0
  },
  "layout": {
    "mode": "VERTICAL",
    "padding": { "top": 24, "right": 32, "bottom": 24, "left": 32 },
    "gap": 16,
    "primaryAlign": "MIN",
    "counterAlign": "MIN"
  },
  "colors": [
    { "role": "background", "rgba": [255, 255, 255, 1], "cssVar": "--color-surface" },
    { "role": "text-primary", "rgba": [26, 26, 26, 1], "cssVar": "--color-text-fg" }
  ],
  "typography": [
    {
      "role": "heading",
      "fontFamily": "Hanken Grotesk",
      "fontSize": 16,
      "fontWeight": 700,
      "lineHeight": 24,
      "letterSpacing": 0
    }
  ],
  "children": [
    {
      "name": "SectionHeader",
      "type": "FRAME",
      "constraints": { "..." : "..." }
    }
  ]
}
```

**`design-context.md`** — Human-readable summary:
```markdown
# Design Context: Dashboard – Desktop

## Layout
- Direction: Vertical (column)
- Padding: 24px 32px
- Gap between items: 16px

## Colors
| Role | Value | CSS Variable |
|------|-------|-------------|
| Background | #FFFFFF | --color-surface |
| Primary text | #1A1A1A | --color-text-fg |

## Typography
| Role | Font | Size | Weight | Line Height |
|------|------|------|--------|-------------|
| Heading | Hanken Grotesk | 16px | 700 | 24px |

## Key Components
- SectionHeader (FRAME, auto-layout horizontal)
- KpiCard (COMPONENT, 3 variants)
```

### Registration

Add to `skills/skills.config.json`:

```json
{
  "name": "figma-design-fetcher",
  "path": "040-integrations/figma-design-fetcher",
  "description": "Fetches Figma designs, exports frame images, and extracts structured design constraints (layout, colors, typography, dimensions)",
  "trigger_mode": "triggered",
  "triggers": ["react", "next", "nextjs", "vue", "angular", "nuxt", "svelte"],
  "compatible_languages": ["typescript", "javascript"],
  "is_linkable_to_agents": true
}
```

---

## Configuration Schema

### `ui-visual-testing.json`

Project-level or component-level configuration file that maps screens to Figma frames and Playwright capture targets.

#### Lookup Order

1. `{componentDir}/ui-visual-testing.json` — co-located with the component
2. `{projectRoot}/ui-visual-testing.json` — project-wide fallback

If not found and the pipeline detects a UI task, the user is **asked** to create one. The pipeline offers auto-generation from ticket context.

#### Schema Definition

Location: `orchestration/src/schemas/ui-visual-testing.schema.ts`

```typescript
import { z } from 'zod';

export const ViewportSchema = z.object({
  width: z.number().min(320).max(3840),
  height: z.number().min(240).max(2160),
});

export const ScreenEntrySchema = z.object({
  label: z.string().min(1).max(100),
  figmaNodeId: z.string().optional(),
  route: z.string().min(1),
  viewport: ViewportSchema,
  captureSelector: z.string().optional(),
  waitForSelector: z.string().optional(),
  delay: z.number().min(0).max(30000).optional(),
  modes: z.array(z.enum(['figma', 'screenshot'])).default(['figma', 'screenshot']),
});

export const ThresholdsSchema = z.object({
  figma: z.number().min(0).max(100).default(2),
  regression: z.number().min(0).max(100).default(5),
});

export const FigmaConfigSchema = z.object({
  fileKey: z.string().optional(),
  accessMethod: z.enum(['mcp', 'token', 'manual']).optional(),
});

export const UIVisualTestingConfigSchema = z.object({
  $schema: z.string().optional(),
  figma: FigmaConfigSchema.optional(),
  thresholds: ThresholdsSchema.default({ figma: 2, regression: 5 }),
  maxIterations: z.number().min(1).max(10).default(3),
  screens: z.array(ScreenEntrySchema).min(1),
});
```

#### Example Configuration

```json
{
  "$schema": "https://qubika-agentic-framework/schemas/ui-visual-testing.schema.json",
  "figma": {
    "fileKey": "kIL8VilTn17FQcjchmCj4o"
  },
  "thresholds": {
    "figma": 2,
    "regression": 5
  },
  "maxIterations": 3,
  "screens": [
    {
      "label": "Set Password – Desktop",
      "figmaNodeId": "191-19365",
      "route": "/set-password?token=valid-test-token",
      "viewport": { "width": 1440, "height": 900 },
      "modes": ["figma", "screenshot"]
    },
    {
      "label": "Set Password – Mobile",
      "figmaNodeId": "191-19370",
      "route": "/set-password?token=valid-test-token",
      "viewport": { "width": 375, "height": 812 },
      "modes": ["figma"]
    },
    {
      "label": "Dashboard Overview",
      "route": "/dashboard",
      "viewport": { "width": 1440, "height": 900 },
      "captureSelector": "#main-content",
      "waitForSelector": "[data-loaded='true']",
      "delay": 1000,
      "modes": ["screenshot"]
    }
  ]
}
```

#### Starter Template

Location: `skills/030-quality-assurance/ui-visual-testing/templates/ui-visual-testing.json`

```json
{
  "$schema": "https://qubika-agentic-framework/schemas/ui-visual-testing.schema.json",
  "figma": {
    "fileKey": "<YOUR_FIGMA_FILE_KEY>"
  },
  "thresholds": {
    "figma": 2,
    "regression": 5
  },
  "maxIterations": 3,
  "screens": [
    {
      "label": "Screen Name – Desktop",
      "figmaNodeId": "<FIGMA_NODE_ID>",
      "route": "/your-route",
      "viewport": { "width": 1440, "height": 900 },
      "modes": ["figma", "screenshot"]
    }
  ]
}
```

---

## Artifact Storage

All visual testing artifacts are stored under `.claude-tmp/ui-validation/{ticketKey}/`.

```
.claude-tmp/ui-validation/{ticketKey}/
├── figma/
│   ├── {label}.png                      # Figma-exported frame image (2x)
│   ├── {label}-constraints.json         # Structured design constraints
│   └── design-context.md               # Human-readable design summary
├── before/
│   └── {label}-{viewport}.png           # Screenshot mode: before snapshots
├── after/
│   └── {label}-{viewport}.png           # Both modes: actual implementation
├── diffs/
│   ├── {label}-figma-diff.png           # Figma mode: diff highlight image
│   ├── {label}-regression-diff.png      # Screenshot mode: diff highlight image
│   └── visual-diff-report.json          # Combined results from both modes
└── iterations/
    └── iter-{N}/
        ├── fixes.json                   # Fix plan from visual-verifier agent
        └── re-capture/
            └── {label}-{viewport}.png   # Re-captured screenshots after fixes
```

### `visual-diff-report.json` Structure

```json
{
  "ticketKey": "DOP-207",
  "timestamp": "2026-03-25T14:30:00Z",
  "modes": {
    "figma": {
      "active": true,
      "threshold": 2,
      "comparisons": [
        {
          "label": "Set Password – Desktop",
          "viewport": "1440x900",
          "diffPixels": 1200,
          "totalPixels": 1296000,
          "diffPercent": 0.09,
          "passed": true,
          "diffImage": "diffs/set-password-desktop-figma-diff.png"
        }
      ],
      "overallPassed": true
    },
    "screenshot": {
      "active": true,
      "threshold": 5,
      "comparisons": [
        {
          "label": "Set Password – Desktop",
          "viewport": "1440x900",
          "diffPixels": 0,
          "totalPixels": 1296000,
          "diffPercent": 0,
          "passed": true,
          "diffImage": "diffs/set-password-desktop-regression-diff.png"
        }
      ],
      "overallPassed": true
    }
  },
  "overallVerdict": "PASS",
  "iterationsUsed": 1
}
```

---

## Visual-Verifier Agent Dual-Mode

### File

`agents/templates/visual-verifier.template.md`

### New Template Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `{{VISUAL_MODE}}` | `figma`, `screenshot`, `both` | Which comparison mode(s) are active |
| `{{FIGMA_IMAGES_PATH}}` | Directory path | Location of Figma-exported PNGs |
| `{{FIGMA_CONSTRAINTS}}` | JSON string | Structured design constraints from Figma |
| `{{DIFF_THRESHOLD}}` | Number | Pass threshold percentage for active mode |
| `{{EXPECTED_IMAGES}}` | Comma-separated paths | Figma exports (figma mode) or before-screenshots (screenshot mode) |
| `{{ACTUAL_IMAGES}}` | Comma-separated paths | Current implementation screenshots |

### Mode-Specific Analysis

**Figma Mode** — The agent receives design constraints alongside diff images, enabling:

| Analysis | What the Agent Checks |
|----------|----------------------|
| Design token fidelity | Colors match Figma specs (cross-reference `constraints.colors` with actual CSS) |
| Typography accuracy | Font family, size, weight, line-height match Figma typography constraints |
| Spacing/layout | Padding, margin, gap values match Figma auto-layout properties |
| Dimension accuracy | Width, height, border-radius match Figma bounding box |
| Component structure | Expected child elements present with correct nesting |

**Screenshot Mode** — The agent focuses on:

| Analysis | What the Agent Checks |
|----------|----------------------|
| Regression detection | Unintended visual changes between before/after |
| Layout breakage | Elements shifted, overlapping, or missing |
| Style regression | Colors, fonts, or spacing changed unexpectedly |
| Responsive issues | Viewport-specific rendering problems |

### Updated Output Schema

```json
{
  "mode": "figma | screenshot | both",
  "jiraKey": "{{JIRA_KEY}}",
  "overallAssessment": {
    "totalDifferences": 3,
    "severity": "critical | major | minor",
    "estimatedFixTime": "15-20 minutes",
    "requiresDesignReview": false
  },
  "fixes": [
    {
      "mode": "figma",
      "fileName": "screenshot-name.png",
      "diffPercent": 8.5,
      "severity": "major",
      "problems": [
        {
          "issue": "Padding-left is 16px, Figma spec is 32px",
          "rootCause": "Using p-4 (16px) instead of p-8 (32px)",
          "constraint": { "property": "paddingLeft", "expected": 32, "actual": 16 },
          "affectedFile": "src/widgets/overview-dashboard/ui/OverviewDashboard.tsx",
          "fix": {
            "description": "Change padding class from p-4 to p-8",
            "before": "<div className=\"p-4\">",
            "after": "<div className=\"p-8\">",
            "lineNumbers": "24-26"
          }
        }
      ]
    }
  ],
  "implementationPlan": [
    "1. Fix padding in OverviewDashboard.tsx line 24",
    "2. Fix text color in SectionHeader.tsx line 12"
  ]
}
```

---

## Integration Points

### `implement-ticket` Phase 6 — Visual Verification

**File:** `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts`

#### Decision Flow

```
Phase 5 (Testing) complete
    │
    ▼
1. Check for ui-visual-testing.json
   ├─> In changed file directories (from Phase 4 output)
   └─> In project root
    │
    ├─> NOT FOUND
    │   ├─> Run UI Task Detector against ticket content
    │   │   ├─> isUI == true → ASK USER to create config
    │   │   │   ├─> User says yes → auto-generate from ticket context → proceed
    │   │   │   └─> User says no → skip visual verification
    │   │   └─> isUI == false → skip visual verification
    │   └─> Continue to Phase 7
    │
    └─> FOUND → proceed to mode detection
         │
         ▼
2. Determine active modes (from MULTIPLE sources):

   FIGMA MODE — activated by ANY of:
   a. Config has figmaNodeIds in screen entries
   b. Ticket body contains Figma URLs (figma.com/design/...)
   c. Ticket markdown frontmatter has figma: field
   d. Acceptance criteria reference Figma designs
   e. Ticket metadata from Jira contains Figma links

   Note: This covers tickets from ANY source (--from-jira, --from-markdown,
   raw input) — not just those created by /create-sdd-ticket.

   If Figma refs found in ticket but NOT in config:
   → Offer to update/create config with extracted refs

   SCREENSHOT MODE — activated by:
   a. Before snapshots exist (captured in Phase 3)
   b. Config entry has modes: ["screenshot"]
   c. Route already exists and is navigable
         │
         ▼
3. Invoke figma-design-fetcher (if Figma mode active)
   └─> Cascading access: MCP → Token → Setup → Manual → Skip
         │
         ▼
4. Delegate to ui-visual-testing skill
   └─> Passes: config, mode, ticket context, design constraints
         │
         ▼
5. Process verdict
   ├─> PASS → continue to Phase 7
   ├─> FAIL (interactive) → pause, ask engineer whether to proceed
   ├─> FAIL (autonomous) → include failure in PR description, continue
   └─> SKIP → log reason, continue to Phase 7
```

#### Backward Compatibility

The existing before/after comparison logic in Phase 6 remains **completely untouched** as the fallback path. The new pipeline only activates when `ui-visual-testing.json` is found OR the user explicitly opts in via the prompt.

### `create-sdd-ticket` Phase 3 — Gap Detection

See [Pillar 2](#pillar-2-ui-validation-at-ticket-creation) for full details.

### `implement-ticket` Phase 5 — UI Test Level Orchestration

Phase 5 (Testing) already runs unit, integration, and E2E tests via the TestOrchestrator. The UI testing pipeline extends this:

```
Phase 5 runs →
  1. TestOrchestrator runs existing tests (unchanged)
  2. If UI task detected:
     a. Check ticket DoD for required test levels
     b. If levels not specified → ask user (decision matrix as suggestion)
     c. For each required level:
        - Unit: verify tests exist + pass + coverage >= 80%
        - Component (CT): verify CT tests exist + pass
        - E2E: verify E2E tests exist + pass
     d. If tests missing for a required level → flag for implementer to generate
  3. Coverage gate: 80% minimum (existing)
```

The ui-testing skill can also be invoked standalone to audit which test levels are covered for a given component/page.

### `implement-ticket` Phase 3 — Before Screenshots

Phase 3 (Environment Setup) already captures "before" screenshots when visual verification is flagged in the test plan. The pipeline reuses these as the baseline for screenshot mode. If Phase 3 didn't capture them (e.g., visual verification wasn't planned), the `ui-visual-testing` skill captures them on-demand before implementation begins.

### `implement-ticket` Phase 4 — Design Context Feed

When Figma mode is active, the extracted design constraints (`design-context.md` and `{label}-constraints.json`) are passed to the implementer agent as additional context. This gives the implementer exact specifications (colors, dimensions, typography) to follow during code generation, reducing the need for visual fix iterations.

---

## Implementation Guide

### Files to Create

| # | File | Description | Archetype |
|---|------|-------------|-----------|
| 1 | `orchestration/src/utils/ui-task-detector.ts` | UI task classification utility | — |
| 2 | `orchestration/src/schemas/ui-visual-testing.schema.ts` | Zod schema for config file | — |
| 3 | `orchestration/src/services/implement-ticket/figma-export.service.ts` | Figma API + MCP cascading fallback | — |
| 4 | `skills/030-quality-assurance/ui-testing/SKILL.md` | UI test orchestration skill (4 levels) | Workflow (A) |
| 5 | `skills/030-quality-assurance/ui-testing/references/test-level-matrix.md` | Decision matrix reference | — |
| 6 | `skills/030-quality-assurance/ui-testing/references/tool-detection.md` | Tool detection guide | — |
| 7 | `skills/030-quality-assurance/ui-visual-testing/SKILL.md` | Visual testing skill (dual-mode) | Workflow (A) |
| 8 | `skills/030-quality-assurance/ui-visual-testing/references/figma-mapping.md` | Mapping convention docs | — |
| 9 | `skills/030-quality-assurance/ui-visual-testing/references/renderer-adapters.md` | Per-framework notes | — |
| 10 | `skills/030-quality-assurance/ui-visual-testing/references/playwright-components.md` | Playwright CT reference | — |
| 11 | `skills/030-quality-assurance/ui-visual-testing/templates/ui-visual-testing.json` | Starter mapping template | — |
| 12 | `skills/040-integrations/figma-design-fetcher/SKILL.md` | Figma design fetch skill | Workflow (A) |
| 13 | `skills/040-integrations/figma-design-fetcher/references/figma-api-guide.md` | Figma REST API patterns | — |
| 14 | `skills/040-integrations/figma-design-fetcher/references/design-token-extraction.md` | Token extraction guide | — |
| 15 | `skills/050-language-frameworks/mastering-vitest/SKILL.md` | Vitest mastery skill | Reference (B) |

### Files to Modify

| # | File | Change |
|---|------|--------|
| 16 | `skills/skills.config.json` | Register `ui-testing`, `ui-visual-testing`, `figma-design-fetcher`, `mastering-vitest` |
| 17 | `agents/templates/visual-verifier.template.md` | Dual-mode vars + Figma constraints |
| 18 | `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts` | Config detection + delegation + user prompts |
| 19 | `orchestration/src/services/implement-ticket/screenshot.service.ts` | `captureWithConfig` + CT support |
| 20 | `orchestration/src/services/implement-ticket/agent-invoker.service.ts` | Mode + constraints params |
| 21 | `orchestration/src/state/schemas/implement-ticket.schema.ts` | Mode/mapping/constraints in Phase6 |
| 22 | `skills/020-development-workflow/create-sdd-ticket/SKILL.md` | Strategy 5 (UI detection + test level injection) |
| 23 | `skills/020-development-workflow/create-sdd-ticket/templates/sdd-ticket-template.md` | UI Testing section with 4 levels |

### Implementation Sequence

```
Phase A — Foundation (no deps)
  Files: 1, 2, 3 + unit tests for each

Phase B — Mastery Skill (no deps)
  File: 15 (mastering-vitest)

Phase C — Figma Skill (deps: A)
  Files: 12, 13, 14

Phase D — UI Testing Skill (deps: A, B)
  Files: 4, 5, 6

Phase E — Visual Testing Skill (deps: A, C)
  Files: 7, 8, 9, 10, 11

Phase F — Registration (deps: C, D, E)
  File: 16 (skills.config.json — register all 4 new skills)

Phase G — Agent Template (deps: A)
  File: 17

Phase H — Orchestration Integration (deps: all above)
  Files: 18, 19, 20, 21

Phase I — Create-SDD-Ticket (deps: A, D)
  Files: 22, 23
```

### Existing Code to Reuse

| Component | File | Reuse |
|-----------|------|-------|
| Screenshot capture | `orchestration/src/services/implement-ticket/screenshot.service.ts` | Extend with `captureWithConfig` method |
| pixelmatch comparison | Same file, `compareScreenshots` method | Reuse directly for both modes |
| Visual-verifier template | `agents/templates/visual-verifier.template.md` | Extend, don't replace |
| Phase 6 before/after logic | `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts` | Keep as fallback |
| Gap detector | Referenced in `create-sdd-ticket/SKILL.md` | Add Strategy 5 alongside existing 4 |

### Improvements to Existing `screenshot.service.ts`

The current `ScreenshotService` (`orchestration/src/services/implement-ticket/screenshot.service.ts`) has several limitations that should be addressed as part of this pipeline. These improvements apply to the existing code and benefit both the new pipeline and the legacy before/after comparison.

#### Bug Fix: Threshold vs Pass Percentage Conflation

**Current (line 149, 203):** The `threshold` parameter controls pixelmatch per-pixel sensitivity (0-1 scale), but `passed` is hardcoded to `diffPercentage < 5.0`. The caller cannot configure the pass/fail percentage — it's always 5%.

**Fix:** Separate the two concepts:

```typescript
async compareScreenshots(
  beforePath: string,
  afterPath: string,
  diffOutputPath: string,
  options: {
    pixelThreshold?: number;   // Per-pixel sensitivity (0-1), default 0.1
    passPercentage?: number;   // Overall diff % to pass, default 5.0
    includeAA?: boolean;       // Include anti-aliasing diffs, default false
  } = {}
): Promise<ComparisonResult> {
  const { pixelThreshold = 0.1, passPercentage = 5.0, includeAA = false } = options;
  // ...
  const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
    threshold: pixelThreshold,
    includeAA,
  });
  // ...
  const passed = diffPercentage < passPercentage;
  // ...
}
```

This enables the configurable thresholds defined in `ui-visual-testing.json` (2% Figma, 5% regression) to actually work.

#### Anti-Aliasing Handling

**Current:** pixelmatch's `includeAA` option is not used (defaults to `true` internally). This means sub-pixel rendering and font hinting differences between environments produce false positives.

**Fix:** Default `includeAA: false` in the options. This tells pixelmatch to detect and ignore anti-aliased pixels, significantly reducing noise from cross-browser/cross-OS rendering differences.

Expected false-positive reduction: **30-60%** on typical UI comparisons.

#### Dimension Mismatch Normalization

**Current (line 168-173):** If images have different dimensions, the service throws an error. This is a hard blocker for Figma mode, where Figma exports at `scale=2` may not match Playwright viewport dimensions exactly.

**Fix:** Normalize images to a common dimension before comparison:

```typescript
import sharp from 'sharp'; // or use pngjs resize

async normalizeImageDimensions(
  img1Path: string,
  img2Path: string,
  targetWidth: number,
  targetHeight: number
): Promise<{ img1: Buffer; img2: Buffer }> {
  const img1 = await sharp(img1Path).resize(targetWidth, targetHeight, { fit: 'fill' }).png().toBuffer();
  const img2 = await sharp(img2Path).resize(targetWidth, targetHeight, { fit: 'fill' }).png().toBuffer();
  return { img1, img2 };
}
```

Strategy: resize both images to the **smaller** of the two dimensions to avoid upscaling artifacts. If dimensions differ by more than 20%, log a warning (likely a viewport configuration issue, not just DPI).

#### Capture Readiness: Replace Fixed Wait

**Current (line 78):** `await page.waitForTimeout(2000)` — arbitrary 2-second delay after navigation, regardless of actual page state.

**Fix:** Replace with a configurable, signal-based readiness check:

```typescript
async waitForPageReady(
  page: Page,
  options: {
    waitForSelector?: string;    // CSS selector to wait for
    waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
    delay?: number;              // Additional delay after ready (for animations)
  } = {}
): Promise<void> {
  const { waitForSelector, waitForLoadState = 'domcontentloaded', delay = 0 } = options;

  await page.waitForLoadState(waitForLoadState);

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { state: 'visible', timeout: 10000 });
  }

  if (delay > 0) {
    await page.waitForTimeout(delay);
  }
}
```

This aligns with the `waitForSelector` and `delay` fields already defined in the `ui-visual-testing.json` screen entry schema. Using `domcontentloaded` instead of `networkidle` avoids hanging on analytics, long-poll, or WebSocket connections.

#### Region Masking (Ignore Dynamic Content)

**Current:** No way to exclude regions from comparison. Dynamic content (timestamps, user avatars, ads, live data) causes false positives on every run.

**Fix:** Add optional ignore regions to the comparison:

```typescript
interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Before pixelmatch comparison, paint ignore regions with identical color
// on both images so they produce zero diff
function applyIgnoreRegions(
  img1Data: Buffer,
  img2Data: Buffer,
  width: number,
  regions: IgnoreRegion[]
): void {
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        const idx = (y * width + x) * 4;
        // Set both images to same pixel value in this region
        img1Data[idx] = img2Data[idx] = 0;
        img1Data[idx+1] = img2Data[idx+1] = 0;
        img1Data[idx+2] = img2Data[idx+2] = 0;
        img1Data[idx+3] = img2Data[idx+3] = 255;
      }
    }
  }
}
```

Add `ignoreRegions` as an optional field in the `ui-visual-testing.json` screen entry schema:

```json
{
  "label": "Dashboard",
  "route": "/dashboard",
  "viewport": { "width": 1440, "height": 900 },
  "ignoreRegions": [
    { "x": 1200, "y": 10, "width": 200, "height": 30, "reason": "timestamp" },
    { "x": 50, "y": 50, "width": 48, "height": 48, "reason": "user avatar" }
  ]
}
```

#### SSIM as Secondary Perceptual Metric

**Current:** Only pixelmatch (pixel-level diff). Catches every sub-pixel difference equally, whether it's a 1px font hinting shift or a completely missing component.

**Improvement:** Add Structural Similarity Index (SSIM) as a secondary metric using `ssim.js`. SSIM measures *perceptual* similarity (0-1 scale), weighing luminance, contrast, and structure changes differently from raw pixel counts.

```typescript
import { ssim } from 'ssim.js';

interface EnhancedComparisonResult extends ComparisonResult {
  ssimScore: number;          // 0-1 (1 = identical)
  ssimPassed: boolean;        // ssimScore >= ssimThreshold
  perceptualVerdict: 'match' | 'minor-diff' | 'significant-diff' | 'mismatch';
}

// SSIM thresholds:
// >= 0.99: match (virtually identical)
// 0.95-0.99: minor-diff (anti-aliasing, sub-pixel)
// 0.85-0.95: significant-diff (layout shift, color change)
// < 0.85: mismatch (wrong component, major regression)
```

**How to use together:**
- **pixelmatch** generates the diff image (visual artifact for human/agent review)
- **SSIM** determines the pass/fail verdict (more forgiving of rendering noise)
- If pixelmatch says >2% diff but SSIM says >0.97, it's likely anti-aliasing — flag as warning, not failure
- If SSIM says <0.85, it's a real mismatch regardless of pixel count

This dual approach reduces false positives by ~50% while maintaining sensitivity to real design deviations.

#### Device Scale Factor Support

**Current (line 82-85):** Captures at default device pixel ratio. Figma exports at `scale=2` (2x), so comparing against a 1x Playwright capture produces dimension mismatches.

**Fix:** Support `deviceScaleFactor` in capture options:

```typescript
async captureScreenshot(
  page: Page,
  url: string,
  filename: string,
  viewport: { width: number; height: number } = { width: 1920, height: 1080 },
  deviceScaleFactor: number = 2  // Match Figma's 2x export
): Promise<ScreenshotMetadata> {
  await page.setViewportSize(viewport);
  // Note: deviceScaleFactor is set at browser context level, not page level
  // The caller should create the context with: browser.newContext({ deviceScaleFactor: 2 })
  // ...
}
```

Document in the skill that the Playwright browser context must be created with `deviceScaleFactor: 2` to match Figma exports.

#### Summary of Improvements by Priority

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| **P0** | Fix threshold/passPercentage bug | Low | Correctness — configurable thresholds don't work without this |
| **P0** | Add `includeAA: false` | Low | ~30-60% false positive reduction |
| **P1** | Dimension normalization | Medium | Enables Figma mode (currently hard-fails on size mismatch) |
| **P1** | Configurable wait strategy | Low | Reliability — no more arbitrary 2s waits |
| **P1** | Device scale factor support | Low | Consistent DPI between Figma and Playwright |
| **P2** | Region masking | Medium | Eliminates dynamic content false positives |
| **P2** | SSIM secondary metric | Medium | ~50% false positive reduction with better perceptual accuracy |

---

## Verification

| # | Test | How |
|---|------|-----|
| 1 | UI Task Detector accuracy | Unit tests with various ticket types (pure backend, UI component, mixed, page feature) |
| 2 | Config schema validation | Unit tests for valid/invalid `ui-visual-testing.json` |
| 3 | Tool detection — unit test runner | Verify Vitest detected in project with vitest.config.ts, Jest detected with jest.config.*, prompt shown when neither found |
| 4 | Tool detection — Playwright | Verify @playwright/test detected, CT package detection, install prompt when missing |
| 5 | Test level decision matrix | Verify correct levels suggested for each task type (atom → unit+CT+visual, page → unit+E2E+visual, bug fix → unit+screenshot) |
| 6 | Figma access cascade | Integration test: verify each fallback step (MCP → token → setup → manual → skip) |
| 7 | Config creation flow | Run Phase 6 without config on a UI task → verify prompt + auto-generation |
| 8 | Figma mode comparison | Create mapping, mock Figma exports, verify pixelmatch comparison and report |
| 9 | Screenshot mode comparison | Capture before/after of a real page, verify regression detection |
| 10 | Dual visual mode execution | Enable both modes for a screen, verify both comparisons run independently |
| 11 | Iteration loop | Mock a failing frame, verify visual-verifier invocation and fix application |
| 12 | Create-SDD-Ticket injection — all 4 levels | Run with UI-heavy description, verify test level table + DoD + AC + tasks injected correctly |
| 13 | DoD enforcement at runtime | Run implement-ticket on ticket without test levels defined → verify user is prompted |
| 14 | mastering-vitest skill loading | Verify skill loads when vitest detected in project stack |
| 15 | End-to-end | On recognize-dop: create mapping for set-password, run `/ui-visual-testing`, verify `.claude-tmp/ui-validation/` artifacts + all test levels executed |
