# UI Validation & Testing Pipeline

Comprehensive UI validation and testing pipeline covering four test levels: **unit**, **component**, **E2E**, and **visual** testing. Detects UI tasks, determines required test levels at ticket creation, and orchestrates test execution during implementation. Integrated into `implement-ticket` Phases 5-6 and `create-sdd-ticket` Phase 3, with standalone invocation via `/ui-visual-testing`.

**Version**: 1.0 | **Last Updated**: 2026-03-25

---

## Documentation

| Document | Contents |
|----------|----------|
| [01 — Overview & Architecture](./ui-validation/01-overview-and-architecture.md) | Four-pillar summary, test levels, two visual modes, component ownership diagram |
| [02 — Pillar 1: UI Task Detection](./ui-validation/02-pillar-1-ui-task-detection.md) | Signal-based scoring algorithm (5 signals), classification thresholds, TypeScript interface |
| [03 — Pillar 2: Ticket Creation](./ui-validation/03-pillar-2-ticket-creation.md) | Strategy 5 gap detection, injected DoD/AC/tasks, SDD ticket template addition |
| [04 — Pillar 3: UI Testing Strategy](./ui-validation/04-pillar-3-ui-testing-strategy.md) | 4 test levels (unit/component/E2E/visual), tool detection, decision matrix, enforcement |
| [05 — Pillar 4: Visual Testing](./ui-validation/05-pillar-4-visual-testing.md) | 8-step dual-mode pipeline, Figma fetcher skill, config schema, artifact storage, visual-verifier agent, screenshot service improvements |
| [06 — Integration Points](./ui-validation/06-integration-points.md) | Phase 3/4/5/6 hooks in `implement-ticket`, `create-sdd-ticket` Phase 3 |
| [07 — Implementation Guide](./ui-validation/07-implementation-guide.md) | All 23 files created/modified, implementation sequence (Phases A-I), verification checklist |

---

## Quick Reference

### Four Test Levels

| Level | Tool | Default Threshold |
|-------|------|-------------------|
| Unit | Vitest/Jest + RTL | 80% coverage |
| Component | Playwright CT | — |
| E2E | Playwright | — |
| Visual | Playwright + pixelmatch | 2% (Figma) / 5% (regression) |

### Key Files

| What | Where |
|------|-------|
| UI task classifier | `orchestration/src/utils/ui-task-detector.ts` |
| Config schema | `orchestration/src/schemas/ui-visual-testing.schema.ts` |
| Figma export service | `orchestration/src/services/implement-ticket/figma-export.service.ts` |
| Phase 6 node | `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts` |
| Starter config template | `skills/030-quality-assurance/ui-visual-testing/templates/ui-visual-testing.json` |
