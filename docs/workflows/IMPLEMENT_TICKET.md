# Implement Ticket Workflow (Experimental)

## 🚧 EXPERIMENTAL FEATURE

**Status**: Work-in-progress, not production-ready

**Production Approach**: Use the `implement-ticket` skill — invoked as `/implement-ticket` in Claude Code or `$implement-ticket` in Codex CLI (95%+ success rate). In Codex, run `/skills` to list available skills.

**This Document**: For framework contributors understanding experimental TypeScript orchestration

---

## Overview

Transforms tickets into production-ready PRs through 13-phase TypeScript orchestration using LangGraph state machines.

**Features**:
- 13 sequential phases (Phase 0–11 with Phase 8.5)
- TypeScript orchestration with type safety
- Wiki-aware planning (LLM wiki preloaded in Phase 2)
- Graph-aware implementation (code graph consulted throughout)
- Visual regression testing (Playwright)
- Comprehensive quality gates
- Artifact-based agent communication
- Multi-language support
- Automatic wiki refresh (Phase 8.5) before every PR

**Flow**: `Ticket → Context → Wiki Preload → Planning → Implementation → Testing → Visual → Docs → Wiki Refresh → PR`

**Duration**: 17-40 minutes

---

## Architecture

### LangGraph State Machine

```typescript
const graph = new StateGraph(ImplementTicketAnnotation)
  .addNode("phase0", phase0ContextNode)
  .addNode("phase1", phase1PlanningNode)
  .addNode("phase2", phase2GapAnalysisNode)
  .addNode("phase3", phase3ArchitectureNode)
  .addNode("phase4", phase4ImplementationNode)
  .addNode("phase5", phase5ResourcesNode)
  .addNode("phase6", phase6TestingNode)
  .addNode("phase7", phase7QualityGatesNode)
  .addNode("phase8", phase8IntegrationNode)
  .addNode("phase9", phase9VisualRegressionNode)
  .addNode("phase10", phase10FinalizationNode)
  .addEdge(START, "phase0")
  .addEdge("phase10", END);
```

### Artifact Communication

```
.claude-temp/tickets/{TICKET_ID}/artifacts/   # Claude Code (use .codex-temp/ in Codex)
├── phase0-context.json
├── phase1-planning.json
├── phase4-implementation-complete.json
├── phase6-test-results.json
├── phase9-visual-diffs/
│   ├── before_001.png
│   ├── after_001.png
│   └── diff_001.png
└── phase10-finalization.json
```

---

## Phase Breakdown

| Phase | Duration | Purpose |
|-------|----------|---------|
| 0 | 30-60s | Preflight: validate environment, LLM wiki presence; WARN (not fail) on stale wiki |
| 1 | 1-2min | Context: fetch ticket from Jira/markdown/input |
| 2 | 1-2min | Wiki Preload: tiered retrieval — Tier 1 summary index for all pages, Tier 2 one `get_minimal_context_tool` call, Tier 3 expand bodies for 1–3 relevant docs only |
| 3 | 2-5min | Planning: planner agent consumes wiki + graph context; produces Implementation Plan. Mid-session `⚠ BUDGET WARNING` messages injected via stop hooks when token thresholds are approached — informational, non-blocking. |
| 4 | 1-3min | Environment: create branch, allocate ports, capture before-screenshots |
| 5 | 3-8min | Implementation: graph-aware implementer consumes plan + wiki evidence. Also receives mid-session `⚠ BUDGET WARNING` stop-hook messages directing it to trim exploratory graph queries. |
| 6 | 2-5min | Testing: run unit/integration/E2E tests with coverage |
| 7 | 2-4min | Visual: pixel-diff comparison; visual-verifier agent if >5% changed |
| 8 | 1-3min | Documentation: invoke `/doc-updater` to update CLAUDE.md/project-context |
| 8.5 | 1-2min | Wiki Refresh: `/wiki-refresh --since <branch-base>`; block PR on structural lint failures |
| 9 | 1-2min | PR Creation: commit, push, open pull request (blocked by Phase 8.5) |
| 10 | 2-4min | Review: `/pr-reviewer` + `/security-review`; up to 3 fix iterations |
| 11 | 1-2min | Cleanup: archive artifacts, emit token-usage summary |

---

## Visual Regression Pipeline

### Screenshot Capture

Uses Playwright for before/after screenshots with pixelmatch pixel comparison:

1. Capture "before" state
2. Execute code changes
3. Capture "after" state
4. Generate pixel diff (5% threshold for significance)
5. Invoke visual-verifier agent if significant changes

### Visual Verifier Agent

Analyzes visual diffs and provides approval/rejection with specific feedback.

---

## Quality Gates

### Gate Configuration

- **Linting**: Auto-fix with ESLint --fix, Prettier
- **Type Checking**: TypeScript compiler, mypy
- **Testing**: 80%+ coverage threshold
- **Security**: npm audit with auto-fix

### Auto-Fix Strategy

1. Run lint:fix and format:fix
2. Install missing dependencies
3. Re-run validation
4. Fail if issues persist

---

## CLI Usage

### Basic Command

```bash
cd orchestration
pnpm implement -- -p <project-path> -f <framework-path> --ticket-id <ticket-id>
```

### Options

```bash
# Jira ticket
pnpm implement -- -p /path/to/project -f /path/to/framework --ticket-id PROJ-123

# Local markdown
pnpm implement -- -p /path/to/project -f /path/to/framework --ticket-id ./specs/feature.md

# Resume from checkpoint
pnpm implement -- --ticket-id PROJ-123 --resume

# Skip visual tests
pnpm implement -- --ticket-id PROJ-123 --skip-visual
```

### Environment Variables

```bash
# Model tier
export MODEL_TIER=opus|sonnet|haiku

# Quality gates
export COVERAGE_THRESHOLD=85
export SKIP_VISUAL_REGRESSION=true

# Debug
export DEBUG=true
export SAVE_ARTIFACTS=true
```

---

## Integration Services

### TestOrchestrator
Unified test runner with parallel execution (unit, integration, E2E)

### ReviewLoopOrchestrator
Automated PR review (code, security, performance)

### GapQuestionsService
Intelligent requirement clarification

---

## Performance

**Typical**: 15-35 minutes ticket to PR

**Optimizations**:
- Parallel testing
- Smart caching
- Selective phase execution
- Agent warm-up

---

**See Also**:
- [Architecture Overview](../architecture/ARCHITECTURE.md)
- [TypeScript Orchestration](../architecture/ORCHESTRATION.md)
- [Initialize Project](INITIALIZE_PROJECT.md)
