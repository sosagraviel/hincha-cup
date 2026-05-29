# Implement Ticket Workflow (Experimental)

## 🚧 EXPERIMENTAL FEATURE

**Status**: Work-in-progress, not production-ready

**Production Approach**: Use the `implement-ticket` skill — invoked as `/implement-ticket` in Claude Code or `$implement-ticket` in Codex CLI (95%+ success rate). In Codex, run `/skills` to list available skills.

**This Document**: For framework contributors understanding experimental TypeScript orchestration

---

## Overview

Transforms tickets into production-ready PRs through 14-phase TypeScript orchestration using LangGraph state machines.

**Features**:
- 14 sequential phases (Phase 0–11 with sub-phases 8.4 and 8.5)
- TypeScript orchestration with type safety
- Wiki-aware planning (LLM wiki preloaded in Phase 2)
- Graph-aware implementation (code graph consulted throughout)
- Visual regression testing (Playwright)
- Comprehensive quality gates
- Artifact-based agent communication
- Multi-language support
- Implementation committed in Phase 8.4 so the Phase 8.5 wiki refresh sees the real diff
- Automatic wiki refresh (Phase 8.5) before every PR

**Flow**: `Ticket → Context → Wiki Preload → Planning → Implementation → Testing → Visual → Docs → Implementation Commit → Wiki Refresh → PR`

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
| 0 | <3 s hot, ~5 s cold (graph fresh) / 30–90 s cold (graph build) | Preflight: `bash $FRAMEWORK_PATH/scripts/ensure-context.sh`. Auto-installs `uv`/`uvx`/`code-review-graph` if missing, builds or incrementally updates the graph, re-emits the local MCP config, then runs structural assertions as defensive double-checks. STOPs on non-zero exit. Wiki staleness is handled separately by `/wiki-refresh` (Phase 8.5). |
| 1 | 1-2min | Context: fetch ticket from Jira/markdown/input |
| 2 | 1-2min | Wiki Preload: read the wiki router (`docs/llm-wiki/CLAUDE.md`/`AGENTS.md`) and `index.md` (summary catalog), expand 1–3 matched page bodies, optionally call `get_minimal_context_tool` once if the matched bodies don't fully answer the planner's likely questions |
| 3 | 2-5min | Planning: planner agent consumes wiki + graph context; produces Implementation Plan. Mid-session `⚠ BUDGET WARNING` messages injected via stop hooks when token thresholds are approached — informational, non-blocking. |
| 4 | 1-3min | Environment: create branch, allocate ports, capture before-screenshots |
| 5 | 3-8min | Implementation: graph-aware implementer consumes plan + wiki evidence. Also receives mid-session `⚠ BUDGET WARNING` stop-hook messages directing it to trim exploratory graph queries. |
| 6 | 2-5min | Testing: run unit/integration/E2E tests with coverage |
| 7 | 2-4min | Visual: pixel-diff comparison; visual-verifier agent if >5% changed |
| 8 | 1-3min | Documentation: invoke `/doc-updater` to update CLAUDE.md/project-context |
| 8.4 | <30 s | Implementation Commit: stage and commit the implementer's edits + tests + doc-updater output in each affected repo with `<type>(<TICKET>): <title>` Conventional Commit. Excludes `docs/llm-wiki/**` (Phase 8.5 owns that). Must run BEFORE Phase 8.5 so `/wiki-refresh` can diff `.state.json` HEAD against a HEAD that contains the actual work. |
| 8.5 | 1-2min | Wiki Refresh: invoke `/wiki-refresh --commit --ticket <TICKET-ID> --artifacts-dir $ARTIFACTS_DIR`. The skill diffs per-repo commits from `docs/llm-wiki/.state.json`, applies a high-level-only conservatism rule to identify affected pages, surgically edits them, then either commits `docs/llm-wiki/**` itself (when the wiki is git-tracked) or writes a diff manifest + warning artifact for Phase 9 to embed in PR bodies. Blocks PR only on hard errors (state missing, page update failure, wiki-commit hook failure). |
| 9 | 1-2min | PR Creation: push + open pull request (the implementation commit is already in place from Phase 8.4; the optional wiki commit is from Phase 8.5). Multi-repo workspaces delegate to `/repo-fanout-pr --no-commit` for per-repo push + PR + cross-link. |
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
