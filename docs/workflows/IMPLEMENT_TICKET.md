# Implement Ticket Workflow (Experimental)

## 🚧 EXPERIMENTAL FEATURE

**Status**: Work-in-progress, not production-ready

**Production Approach**: Use the `implement-ticket` skill — invoked as `/implement-ticket` in Claude Code or `$implement-ticket` in Codex CLI (95%+ success rate). In Codex, run `/skills` to list available skills.

**This Document**: For framework contributors understanding experimental TypeScript orchestration

---

## Overview

Transforms tickets into production-ready PRs through 11-phase TypeScript orchestration using LangGraph state machines.

**Features**:
- 11 sequential phases (Phase 0-10)
- TypeScript orchestration with type safety
- Visual regression testing (Playwright)
- Comprehensive quality gates
- Artifact-based agent communication
- Multi-language support

**Flow**: `Ticket → Context → Planning → Implementation → Testing → Visual → PR`

**Duration**: 15-35 minutes

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
| 0 | 30-60s | Load ticket context, validate environment |
| 1 | 2-5min | Create implementation plan with planner agent |
| 2 | 1-2min | Identify and resolve requirement gaps |
| 3 | 1-3min | Validate architectural decisions |
| 4 | 3-8min | Generate code with implementer agent |
| 5 | <1min | Manage dependencies and resources |
| 6 | 2-5min | Run comprehensive test suite |
| 7 | 1-3min | Run quality gates (linting, type checking) |
| 8 | 1-2min | Validate external service integrations |
| 9 | 2-4min | Visual regression testing (UI only) |
| 10 | 1-2min | Create PR and archive artifacts |

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
