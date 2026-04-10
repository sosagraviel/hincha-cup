# Pillar 2: UI Validation at Ticket Creation

When `create-sdd-ticket` processes a ticket that involves UI work, automatically detect this and inject UI-specific Definition of Done items, acceptance criteria, and technical tasks.

**Integration point:** `skills/020-development-workflow/create-sdd-ticket/SKILL.md` — Phase 3 (Gap Detection)

---

## Strategy 5 — UI Task Detection

Added to the existing 4-strategy gap detection approach:

```
Phase 3: Validate & Detect Gaps
  Strategy 1: Search Project Context        (existing)
  Strategy 2: Deep Codebase Pattern Search   (existing)
  Strategy 3: Find Similar Implementations   (existing)
  Strategy 4: Analyze Existing Tickets       (existing)
  Strategy 5: UI Task Detection              ← NEW
```

### Algorithm

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

---

## Injected Content

### DoD Items

Based on the [Test Level Decision Matrix](./04-pillar-3-ui-testing-strategy.md#test-level-decision-matrix), the appropriate test levels are injected:

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

### Acceptance Criteria

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

### Technical Tasks

```markdown
- [ ] Write unit tests covering all component variants and accessibility
- [ ] Write component tests for visual render and interaction states (if CT level required)
- [ ] Write E2E tests for user flows (if E2E level required)
- [ ] Create/update ui-visual-testing.json with mapping for affected screens (if visual level required):
  - Route(s): [extracted from ticket]
  - Figma node(s): [extracted from Figma URLs if present]
  - Viewport(s): [from design specs or defaults: 1440x900, 375x812]
```

---

## SDD Ticket Template Addition

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
