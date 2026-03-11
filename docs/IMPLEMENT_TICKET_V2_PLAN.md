# Implement-Ticket - Comprehensive Refactor Plan

**Status**: Planning Complete - Ready for Implementation
**Created**: 2026-03-09
**Model Used**: Claude Opus 4.5
**Estimated Effort**: 5-6 weeks
**Priority**: P0 (Core Deliverable)
**Note**: This is a direct refactor - no backward compatibility needed

---

## Quick Links

- [Full Plan Details](#full-plan-summary)
- [Implementation Roadmap](#implementation-roadmap-timeline)
- [Critical Files](#critical-files-to-modify)
- [New Utilities Needed](#new-utilities-20-files)
- [Agent Template Updates](#agent-template-updates-5-files)

---

## Executive Summary

This plan transforms the `implement-ticket` skill from a 6-phase workflow into a production-ready 10-phase autonomous development system that:

✅ **Supports 1000+ projects** with stack-agnostic design
✅ **Runs unit, integration, and E2E tests** automatically
✅ **Creates/initializes E2E framework** if missing (Playwright)
✅ **Verifies UI pixel-perfect** with screenshot comparison and iteration
✅ **Collects comprehensive artifacts** (screenshots, videos, test results, coverage)
✅ **Updates documentation automatically** (CLAUDE.md, project-context)
✅ **Supports parallel ticket work** with isolated environments
✅ **Iterates on PR feedback** with automated review loop
✅ **Generates production-ready PRs** with rich visual documentation

---

## Full Plan Summary

### New 10-Phase Architecture

```
Phase 0: Pre-Flight Validation
Phase 1: Context Gathering (with design assets)
Phase 2: Planning (with test planning)
Phase 3: Environment Setup (NEW - isolated environments)
Phase 4: Implementation
Phase 5: Testing (unit + integration + E2E with recording)
Phase 6: Visual Verification (NEW - pixel-perfect UI check)
Phase 7: Documentation Update (NEW - auto-update docs)
Phase 8: PR Creation (with comprehensive artifacts)
Phase 9: Review Loop (NEW - automated feedback iteration)
Phase 10: Cleanup (NEW - environment teardown)
```

### Key Improvements

| Area | Before | After | Impact |
|------|--------|-------|--------|
| **Testing** | Manual test creation | Automatic unit/integration/E2E test generation | 100% test coverage |
| **UI Verification** | None | Automated screenshot comparison with iteration | Pixel-perfect UI |
| **Parallel Work** | Not supported | Isolated environments per ticket | 10x throughput |
| **PR Quality** | Basic description | Rich artifacts, visual diffs, test videos | 5x faster review |
| **Doc Maintenance** | Manual | Automatic detection & update | Always current |
| **Review Iteration** | Manual | Automated fix & re-review loop (max 3x) | 3x faster merge |

---

## New Utilities (20 Files)

### P0 - Critical (Week 1-2)

1. **`utils/test-framework-detection.js`** - Detects Jest, Vitest, Pytest, Go test, etc.
2. **`utils/environment-detection.js`** - Detects Docker Compose, Makefile, npm scripts
3. **`utils/environment-manager.js`** - Manages isolated environments with port allocation
4. **`utils/test-orchestrator.js`** - Executes tests stack-agnostically
5. **`utils/artifact-collector.js`** - Collects screenshots, videos, test results, coverage
6. **`utils/screenshot-capture.js`** - Playwright-based screenshot capture with auth handling
7. **`utils/screenshot-comparator.js`** - Visual diff calculation with pixelmatch

### P1 - Important (Week 3-4)

8. **`utils/doc-change-detector.js`** - Detects when docs need updates
9. **`utils/pr-description-generator.js`** - Generates rich PR descriptions
10. **`utils/review-loop-orchestrator.js`** - Orchestrates post-PR review iteration
11. **`utils/init-e2e-framework.js`** - Initializes Playwright if missing (enhance existing)

---

## Agent Template Updates (5 Files)

### New Templates

1. **`agents/templates/visual-verifier.template.md`** (NEW)
   - Screenshot comparison with Opus for visual analysis
   - Generates visual-diff-report.json
   - Provides actionable fix suggestions

2. **`agents/templates/doc-updater.template.md`** (NEW)
   - Updates .claude/CLAUDE.md and project-context based on code changes
   - Detects architectural changes, new patterns, API changes
   - Maintains documentation consistency

### Updated Templates

3. **`agents/templates/planner.template.md`** → **`planner-v2.template.md`**
   - Add test planning output (test-plan.json)
   - Add environment requirements detection
   - Add visual verification planning for UI changes

4. **`agents/templates/implementer.template.md`**
   - Add test creation responsibility
   - Add before screenshot capture trigger
   - Mark new tests with @new tag

5. **`agents/templates/tester-e2e.template.md`**
   - Add E2E framework initialization
   - Add visual verification integration
   - Always enable video recording + trace

---

## Skill Updates (4 Files)

1. **`skills/020-development-workflow/implement-ticket/SKILL.md`**
   - Complete rewrite with 10-phase workflow
   - Add Phase 3 (Environment Setup)
   - Add Phase 6 (Visual Verification)
   - Add Phase 7 (Documentation Update)
   - Add Phase 9 (Review Loop)
   - Add Phase 10 (Cleanup)

2. **`skills/030-quality-assurance/create-pr/SKILL.md`**
   - Enhanced PR description template
   - Add before/after screenshot sections
   - Add test highlighting (new vs modified)
   - Embed video links and visual diffs

3. **`skills/030-quality-assurance/pr-reviewer/SKILL.md`**
   - Return structured feedback for automation
   - Categorize issues by severity
   - Support re-review after fixes

4. **`skills/030-quality-assurance/security-review/SKILL.md`**
   - Return structured vulnerability list
   - Include CWE references and remediation
   - Support incremental re-review

---

## Critical Files to Modify

### Top 5 Priority Files

1. **`skills/020-development-workflow/implement-ticket/SKILL.md`** (Core)
   - 10-phase workflow implementation
   - Stack-agnostic design
   - Error handling for each phase

2. **`utils/agent-generation.js`** (Integration)
   - Support new agent templates (visual-verifier, doc-updater)
   - Update variable substitution logic
   - Generate environment-specific agents

3. **`agents/templates/tester-e2e.template.md`** (Testing)
   - E2E framework initialization
   - Video + trace recording
   - Visual verification integration

4. **`skills/030-quality-assurance/create-pr/SKILL.md`** (PR Quality)
   - Rich PR description with artifacts
   - Visual diff embedding
   - Test result highlighting

5. **`utils/stack-detection.js`** (Foundation)
   - Add test framework detection
   - Add environment orchestration detection
   - Output enhanced stack profile

---

## Implementation Roadmap Timeline

### Week 1-2: Core Utilities

**Goal**: Build foundational utilities for testing, environments, and screenshots

- [ ] `utils/test-framework-detection.js`
- [ ] `utils/environment-detection.js`
- [ ] `utils/environment-manager.js`
- [ ] `utils/test-orchestrator.js`
- [ ] `utils/artifact-collector.js`
- [ ] `utils/screenshot-capture.js`
- [ ] `utils/screenshot-comparator.js`

**Deliverable**: Utilities tested on TypeScript, Python, and Go projects

---

### Week 2-3: Agent Templates

**Goal**: Create and update agent templates for new workflow

- [ ] `agents/templates/visual-verifier.template.md`
- [ ] `agents/templates/doc-updater.template.md`
- [ ] `agents/templates/planner-v2.template.md`
- [ ] Update `agents/templates/implementer.template.md`
- [ ] Update `agents/templates/tester-e2e.template.md`

**Deliverable**: Agent templates validated with variable substitution

---

### Week 3-4: Skill Updates

**Goal**: Implement 10-phase workflow in implement-ticket

- [ ] Refactor `skills/020-development-workflow/implement-ticket/SKILL.md`
  - Phase 0-2: Use existing logic
  - Phase 3: Integrate environment-manager
  - Phase 4-5: Integrate test-orchestrator
  - Phase 6: Integrate visual verification
  - Phase 7: Integrate doc-updater
  - Phase 8: Update create-pr integration
  - Phase 9: Add review loop
  - Phase 10: Add cleanup
- [ ] Update `skills/030-quality-assurance/create-pr/SKILL.md`
- [ ] Update `skills/030-quality-assurance/pr-reviewer/SKILL.md`
- [ ] Update `skills/030-quality-assurance/security-review/SKILL.md`

**Deliverable**: Full workflow functional on reference project (Gira)

---

### Week 4-5: Integration & Polish

**Goal**: Complete integration and add secondary utilities

- [ ] `utils/doc-change-detector.js`
- [ ] `utils/pr-description-generator.js`
- [ ] `utils/review-loop-orchestrator.js`
- [ ] Update `utils/agent-generation.js`
- [ ] Error handling for all phases
- [ ] Graceful degradation (missing tools)

**Deliverable**: End-to-end workflow validated on 3+ stacks

---

### Week 5-6: Testing & Documentation

**Goal**: Production readiness

- [ ] `tests/implement-ticket-v2.test.js`
- [ ] Test on 5+ different stacks
- [ ] Update `SKILLS_AND_AGENTS_MAP.md`
- [ ] Update `README.md`
- [ ] Update `ARCHITECTURE.md`
- [ ] Create migration guide v1 → v2
- [ ] Create video walkthrough

**Deliverable**: Production-ready v2.0 release

---

## Stack-Agnostic Design Highlights

### Testing Framework Detection

Supports out-of-the-box:
- **JavaScript/TypeScript**: Jest, Vitest, Mocha, Ava
- **E2E**: Playwright, Cypress, TestCafe, Puppeteer
- **Python**: Pytest, unittest
- **Go**: go test
- **Java**: JUnit (Maven/Gradle)
- **Rust**: cargo test
- **Ruby**: RSpec

### Environment Orchestration

Detects and supports:
- Docker Compose (with port override)
- Makefile (make up/down)
- npm/pnpm scripts (start:dev)
- Kubernetes (future)
- Terraform (future)

### Graceful Degradation

| Missing Tool | Fallback |
|--------------|----------|
| No E2E framework | Initialize Playwright |
| No Figma access | Use provided screenshots |
| No Docker | Use npm scripts/local |
| No screenshot tool | Text-based comparison |
| No coverage tool | Report N/A |

---

## Key Innovation: Visual Verification Loop

```
1. Capture "before" screenshots (Phase 3)
   ↓
2. Implement UI changes (Phase 4)
   ↓
3. Capture "after" screenshots (Phase 6)
   ↓
4. Compare with expected UI (Figma/Pencil/screenshots)
   ↓
5. If diff > 5%:
   → Fix issues
   → Re-capture screenshots
   → Compare again
   → Repeat (max 5 iterations)
   ↓
6. Continue to PR creation
```

Result: **Pixel-perfect UI without manual intervention**

---

## Key Innovation: Parallel Ticket Support

```
Ticket A (PROJ-123):
  Environment: localhost:10000-10099
  Docker Compose: docker-compose.PROJ-123.yml

Ticket B (PROJ-456):
  Environment: localhost:10100-10199
  Docker Compose: docker-compose.PROJ-456.yml

Ticket C (PROJ-789):
  Environment: localhost:10200-10299
  Docker Compose: docker-compose.PROJ-789.yml
```

Result: **100+ tickets in parallel across different projects**

---

## Key Innovation: Rich PR Documentation

### Before

```markdown
# PROJ-123: Add user profile page

## Changes
- Added user profile page
- Added tests

## Testing
- Tests passing
```

### After

```markdown
# PROJ-123: Add user profile page

## 📸 Visual Changes

### Desktop View
![Before](artifacts/screenshots/profile-before-desktop.png)
![After](artifacts/screenshots/profile-after-desktop.png)

**Visual Diff Score**: 2.1% (PASSED)

### Mobile View
![Before](artifacts/screenshots/profile-before-mobile.png)
![After](artifacts/screenshots/profile-after-mobile.png)

## ✅ Test Results

### Unit Tests
- Total: 45 tests
- Passed: 45 ✓
- Failed: 0
- **New Tests**: 12 (marked with @new)
- Coverage: 92% (+5%)

### Integration Tests
- Total: 8 tests
- Passed: 8 ✓
- **New Tests**: 2

### E2E Tests
- Total: 3 tests
- Passed: 3 ✓
- Duration: 45s
- [📹 Recording 1](artifacts/videos/profile-page.webm)

## 📝 Documentation Updates

- Updated `.claude/CLAUDE.md` - Added profile page to routes
- Updated `project-context/SKILL.md` - Documented profile component pattern

## 🔍 Review Checklist

- [x] All tests passing
- [x] Visual verification passed
- [x] Documentation updated
- [x] Security review passed
- [x] No breaking changes
```

Result: **5x faster developer review**

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Coverage | 80%+ | Automatic unit + integration tests |
| UI Accuracy | 95%+ | Visual diff score |
| PR Merge Time | <30min | Rich documentation enables quick review |
| Parallel Tickets | 100+ | Isolated environments support |
| Auto-Fix Rate | 80%+ | Review loop resolves most issues |
| Stack Support | 6+ | TypeScript, Python, Go, Java, Rust, Ruby |

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize which stacks** to support first (TypeScript + Python recommended)
3. **Start Week 1-2** implementation (core utilities)
4. **Run pilot** on Gira project in Week 4
5. **Iterate based on feedback** in Week 5-6
6. **Release v2.0** with full documentation

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [SKILLS_AND_AGENTS_MAP.md](../SKILLS_AND_AGENTS_MAP.md) - Agent relationships
- [CONTEXT_OPTIMIZATION_EXAMPLE.md](./CONTEXT_OPTIMIZATION_EXAMPLE.md) - Context management

---

**Status**: ✅ Planning Complete - Ready for Implementation
**Next**: Begin Week 1-2 utility development
**Estimated Completion**: 5-6 weeks from start
