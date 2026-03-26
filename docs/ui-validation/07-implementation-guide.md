# Implementation Guide & Verification

---

## Files Created

| # | File | Description |
|---|------|-------------|
| 1 | `orchestration/src/utils/ui-task-detector.ts` | UI task classification utility |
| 2 | `orchestration/src/schemas/ui-visual-testing.schema.ts` | Zod schema for config file |
| 3 | `orchestration/src/services/implement-ticket/figma-export.service.ts` | Figma API + MCP cascading fallback |
| 4 | `skills/030-quality-assurance/ui-testing/SKILL.md` | UI test orchestration skill (4 levels) |
| 5 | `skills/030-quality-assurance/ui-testing/references/test-level-matrix.md` | Decision matrix reference |
| 6 | `skills/030-quality-assurance/ui-testing/references/tool-detection.md` | Tool detection guide |
| 7 | `skills/030-quality-assurance/ui-visual-testing/SKILL.md` | Visual testing skill (dual-mode) |
| 8 | `skills/030-quality-assurance/ui-visual-testing/references/figma-mapping.md` | Mapping convention docs |
| 9 | `skills/030-quality-assurance/ui-visual-testing/references/renderer-adapters.md` | Per-framework notes |
| 10 | `skills/030-quality-assurance/ui-visual-testing/references/playwright-components.md` | Playwright CT reference |
| 11 | `skills/030-quality-assurance/ui-visual-testing/templates/ui-visual-testing.json` | Starter mapping template |
| 12 | `skills/040-integrations/figma-design-fetcher/SKILL.md` | Figma design fetch skill |
| 13 | `skills/040-integrations/figma-design-fetcher/references/figma-api-guide.md` | Figma REST API patterns |
| 14 | `skills/040-integrations/figma-design-fetcher/references/design-token-extraction.md` | Token extraction guide |
| 15 | `skills/050-language-frameworks/mastering-vitest/SKILL.md` | Vitest mastery skill |

## Files Modified

| # | File | Change |
|---|------|--------|
| 16 | `skills/skills.config.json` | Register `ui-testing`, `ui-visual-testing`, `figma-design-fetcher`, `mastering-vitest` |
| 17 | `agents/templates/visual-verifier.template.md` | Dual-mode vars + Figma constraints |
| 18 | `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts` | Config detection + delegation + user prompts |
| 19 | `orchestration/src/services/implement-ticket/screenshot.service.ts` | `captureWithConfig` + P0 bug fixes |
| 20 | `orchestration/src/services/implement-ticket/agent-invoker.service.ts` | Mode + constraints params |
| 21 | `orchestration/src/state/schemas/implement-ticket.schema.ts` | Mode/mapping/constraints in Phase6 |
| 22 | `skills/020-development-workflow/create-sdd-ticket/SKILL.md` | Strategy 5 (UI detection + test level injection) |
| 23 | `skills/020-development-workflow/create-sdd-ticket/templates/sdd-ticket-template.md` | UI Testing section with 4 levels |

---

## Implementation Sequence

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

---

## Verification Checklist

| # | Test | How |
|---|------|-----|
| 1 | UI Task Detector accuracy | Unit tests with various ticket types (pure backend, UI component, mixed, page feature) |
| 2 | Config schema validation | Unit tests for valid/invalid `ui-visual-testing.json` |
| 3 | Tool detection — unit test runner | Verify Vitest detected in project with vitest.config.ts, Jest with jest.config.*, prompt when neither found |
| 4 | Tool detection — Playwright | Verify @playwright/test detected, CT package detection, install prompt when missing |
| 5 | Test level decision matrix | Verify correct levels suggested for each task type |
| 6 | Figma access cascade | Integration test: verify each fallback step (MCP → token → setup → manual → skip) |
| 7 | Config creation flow | Run Phase 6 without config on a UI task → verify prompt + auto-generation |
| 8 | Figma mode comparison | Create mapping, mock Figma exports, verify pixelmatch comparison and report |
| 9 | Screenshot mode comparison | Capture before/after of a real page, verify regression detection |
| 10 | Dual visual mode execution | Enable both modes for a screen, verify both comparisons run independently |
| 11 | Iteration loop | Mock a failing frame, verify visual-verifier invocation and fix application |
| 12 | create-sdd-ticket injection | Run with UI-heavy description, verify test level table + DoD + AC + tasks injected |
| 13 | DoD enforcement at runtime | Run implement-ticket on ticket without test levels defined → verify user is prompted |
| 14 | mastering-vitest skill loading | Verify skill loads when vitest detected in project stack |
| 15 | End-to-end | On recognize-dop: create mapping for set-password, run `/ui-visual-testing`, verify artifacts |
