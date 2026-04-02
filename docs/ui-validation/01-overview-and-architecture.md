# UI Validation Pipeline — Overview & Architecture

**Version**: 1.0 | **Last Updated**: 2026-03-25

---

## Problem

The framework's current visual verification (Phase 6 in `implement-ticket`) only supports **before/after regression comparison**. There is no Figma integration, no design constraint extraction, no UI task detection at ticket creation time, and no awareness of when visual testing should be required.

## Solution: Four-Pillar Pipeline

| Pillar | What | Where |
|--------|------|-------|
| **[UI Task Detection](./02-pillar-1-ui-task-detection.md)** | Deterministic classifier that scores whether a task is UI-related | `orchestration/src/utils/ui-task-detector.ts` |
| **[Ticket-Time Validation](./03-pillar-2-ticket-creation.md)** | Injects UI-specific DoD, acceptance criteria, and test requirements during ticket creation | `create-sdd-ticket` Phase 3 |
| **[UI Testing Strategy](./04-pillar-3-ui-testing-strategy.md)** | Defines which of the 4 test levels apply and orchestrates tool detection/setup | `ui-testing` skill + `implement-ticket` Phase 5 |
| **[Visual Testing Pipeline](./05-pillar-4-visual-testing.md)** | Dual-mode (Figma + Screenshot) visual comparison with iterative fix loop | `ui-visual-testing` skill + `implement-ticket` Phase 6 |

## Four Test Levels

Each UI task may require one or more of these test levels. Which levels apply is determined at ticket creation time (DoD/AC) or at runtime if not specified.

| Level | Tool | What It Validates | When Required |
|-------|------|-------------------|---------------|
| **Unit** | Vitest/Jest + RTL | Component rendering, props, states, accessibility, design token usage | Always for UI components |
| **Component** | Playwright CT | Isolated component visual rendering + interaction in real browser | When component has visual states or complex interactions |
| **E2E** | Playwright | Full user flows across pages, navigation, form submissions | When implementing pages/features with user flows |
| **Visual** | Playwright + pixelmatch | Pixel-level comparison against Figma designs or baseline screenshots | When Figma designs exist or modifying existing screens |

## Two Visual Modes

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

## Component Ownership

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

All skills follow the [SKILLS_SPEC.md](../SKILLS_SPEC.md) contract and are registered in `skills/skills.config.json` per [ADDING_SKILLS.md](../ADDING_SKILLS.md).
