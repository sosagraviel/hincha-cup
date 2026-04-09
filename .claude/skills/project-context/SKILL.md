---
name: project-context
description: Deep architectural knowledge for AI Agentic Framework — phase-based LangGraph orchestration, dual-auth agent invocation, two-layer retry system, state management patterns, and non-obvious gotchas. Load when implementing new phases, modifying agents, or debugging retry failures.
user-invokable: true
disable-model-invocation: false
version: 3.0
---

# Project Context: AI Agentic Framework

A TypeScript CLI that orchestrates multi-phase LangGraph workflows to analyze codebases (`initialize-project`) and implement development tickets (`implement-ticket`), dispatching AI sub-agents at each phase.

## When to Use This Skill

- Adding a new phase to either workflow
- Modifying agent prompts or stop hooks
- Changing state schema (Zod or LangGraph Annotation)
- Debugging retry loop failures or validation errors
- Changing auth detection or agent invocation mode
- Adding or modifying skills and agent templates
- Troubleshooting cross-phase data exchange failures
- Writing tests for phase nodes

## Architecture Deep Dive

The framework has two top-level LangGraph `StateGraph` instances:

```
initialize-project:  [Phase1 x4 parallel] → Phase2 → Phase3 → Phase4 → Phase5 → Phase6
implement-ticket:    Phase0 → Phase1 → ... → Phase10 (sequential)
```

Each phase is a **self-contained LangGraph node** — a pure async function `(state) → Partial<state>`. The phase node owns its sub-graph of helpers, validators, agent prompts, and stop hooks.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Phase-based vertical slicing | Each phase is independently testable and retryable; failure in one phase does not corrupt earlier work |
| Disk-based cross-phase data exchange | Phase outputs go to `.claude-temp/initialize-project/` — disk allows resumption after crash and avoids LangGraph state size limits |
| Dual-auth modes (API key + Claude CLI) | Claude Pro/Max subscribers can run without API keys; API key mode enables CI/CD and custom models |
| Two-layer retry (stop hooks + external) | Stop hooks retry within the same session (context preserved); external retry is the fallback for complete agent failures |
| LangGraph Annotation merge reducers for Phase 1 | 4 parallel agents update different fields of the same state — `LastValue` reducer throws on concurrent updates; merge reducers are required |

## Request Lifecycle (initialize-project workflow)

```
pnpm initialize -- --project-path /path/to/project
│
├─ CLI parses args (commander)
├─ runPreflightChecks() — validates Node >= 20, npm, auth, .gitignore
├─ LLMFactory.init() — loads config/model-config.json, selects tier
├─ StateGraph compiled with MemorySaver checkpointer
│
├─ Phase 1 (parallel): 4 analyzer agents run concurrently
│   ├─ structure-architecture-analyzer.node.ts
│   ├─ tech-stack-dependencies-analyzer.node.ts
│   ├─ code-patterns-testing-analyzer.node.ts
│   └─ data-flows-integrations-analyzer.node.ts
│   Each agent: AgentFactory.create() → detects auth → createDeepAgentImpl or createCLIAgentImpl
│   Each result persisted to disk: .claude-temp/initialize-project/phase1-{analyzer}.json
│
├─ Phase 2 (consolidation): merges 4 outputs, identifies gaps
│   Reads phase1-*.json from disk, persists phase2-consolidation.json
│
├─ Phase 3 (synthesis): architect-synthesizer agent (Opus)
│   Reads phase2-consolidation.json, invokes agent with ultrathink
│   Output persisted as synthesis-raw.md; validated via stop hook + external retry (max 10 attempts)
│
├─ Phase 4 (context generation): extracts CLAUDE.md + project-context from synthesis
│   Produces .claude/CLAUDE.md, .claude/skills/project-context/SKILL.md
│   Produces .claude/framework-config.json (stack_profile consumed by Phase 5)
│
├─ Phase 5 (resources): reads framework-config.json (NOT state)
│   Resolves skills by stack, generates agents from templates, copies commands
│
└─ Phase 6 (validation): verifies all files are present and valid
```

## Authentication & Authorization

### Auth Detection Flow

```
Does ANTHROPIC_API_KEY || OPENAI_API_KEY || GOOGLE_API_KEY exist?
  YES → authMode = "api_key"
       (Claude CLI is optional, only detected for version reporting)
  NO  → Check local bundled CLI: orchestration/node_modules/.bin/claude
         Found + authenticated? → authMode = "claude_cli"
         Not found → check global `claude` in PATH
         Nothing? → error: no auth method
```

Implemented in `orchestration/src/utils/preflight-checks.ts`.

### Auth Mode in Agent Factory

```typescript
// orchestration/src/utils/shared/agent-factory/agent-factory.ts
if (authMode === "api_key") {
  return createDeepAgentImpl(...)  // Uses deepagents SDK + LLM provider API
} else {
  return createCLIAgentImpl(...)   // Spawns claude subprocess with --resume support
}
```

### Auth Gotchas

- **Only one provider key is needed** — whichever matches `MODEL_TIER`. `ANTHROPIC_API_KEY` for `standard`/`fast`/`advanced`; `OPENAI_API_KEY` for `openai`; `GOOGLE_API_KEY` for `gemini`.
- **Stop hooks only work in CLI mode** — `deepagents` (API key mode) has no hook mechanism. The external retry layer handles all validation failures in API key mode.
- **Local bundled CLI takes precedence over global** — path: `orchestration/node_modules/.bin/claude`. Authenticating the global CLI does NOT authenticate the local one.

## Two-Layer Retry System

This is the most non-obvious architecture in the codebase.

### Layer 1: Stop Hooks (Claude CLI mode only)

Stop hooks are scripts registered in phase `settings.json`. They execute **before the agent finishes** and can block output, forcing the agent to self-correct **within the same session** (context preserved, no new session spawned).

```
Agent produces output
  → Stop hook runs validate-synthesis.hook.ts
  → Hook calls validateSynthesisOutput(output)
  → If invalid: hook exits non-zero → Claude sees error feedback, retries inline
  → If valid: hook exits 0 → agent output accepted
```

**Critical**: The stop hook validator (`agents/hooks/validate-synthesis.ts`) MUST be byte-for-byte identical to the external validator (`orchestration/src/nodes/initialize-project/phase3/validators/index.ts`). If they diverge, the hook may pass but the external validator rejects, creating an infinite retry loop.

### Layer 2: External Retry (`retryWithEnhancedFeedback`)

Triggers only when Layer 1 is exhausted or unavailable (API key mode). Each attempt is a **fresh agent session**.

```typescript
// orchestration/src/utils/enhanced-retry.ts
retryWithEnhancedFeedback(agentInvoke, validator, { maxAttempts: 10 }, outputFilePath)
// - Failed attempts persisted as synthesis-raw.attempt-1.md, .attempt-2.md, etc.
// - Previous error passed as feedbackPrompt to the fresh session
// - Exponential backoff between attempts
// - In CLI mode: passes resumeSessionId (--resume flag) for context-preserving retry
```

### When to Modify Validators

If you change output format for a phase, update validators in **both**:
1. `orchestration/src/nodes/initialize-project/phase{N}/validators/index.ts` (external)
2. `agents/hooks/validate-{phase}.ts` (stop hook — CLI mode only)

## State Schema Patterns

### Zod Schema vs LangGraph Annotation

Every workflow state is defined **twice** in the same file:

```typescript
// orchestration/src/state/schemas/initialize-project.schema.ts

// 1. Zod schema — for type inference and documentation
export const InitializeProjectStateSchema = z.object({ ... })
export type InitializeProjectState = z.infer<typeof InitializeProjectStateSchema>

// 2. LangGraph Annotation — required for parallel state updates
export const InitializeProjectAnnotation = Annotation.Root({ ... })
```

The `Annotation.Root` definition MUST use **merge reducers** for any fields updated by Phase 1's 4 parallel nodes. The default `LastValue` reducer throws `"LastValue can only receive one value per step"` at runtime.

```typescript
// Correct — merge reducer handles concurrent updates from 4 parallel nodes
phase1_analysis: Annotation<Phase1Analysis>({
  reducer: (left, right) => ({ ...left, ...right }),
  default: () => ({ all_completed: false })
}),

// Wrong — default LastValue crashes when 4 nodes update simultaneously
phase1_analysis: Annotation<Phase1Analysis>,
```

Fields updated by sequential phases (2–4) use the default `LastValue` reducer.

## Critical Workflows

### Adding a New Phase to initialize-project

1. Create `orchestration/src/nodes/initialize-project/phase{N}/` directory
2. Add `phase{N}.node.ts` — export `async function phaseNNode(state: InitializeProjectState): Promise<Partial<InitializeProjectState>>`
3. Add `current_phase` enum value in `orchestration/src/state/schemas/initialize-project.schema.ts` (both Zod schema AND Annotation priority map)
4. Add new phase state fields to `InitializeProjectStateSchema` and `InitializeProjectAnnotation`
5. Wire the node into `orchestration/src/graphs/initialize-project.graph.ts`
6. If the phase uses an agent with stop hooks, create `settings.json` and `hooks/*.hook.ts`
7. Add validators in `validators/index.ts` — must match stop hook validator

**Files to modify:**
- `orchestration/src/state/schemas/initialize-project.schema.ts` — Add state fields + enum value + priority map entry
- `orchestration/src/graphs/initialize-project.graph.ts` — Register node + edges
- `orchestration/src/nodes/initialize-project/phase{N}/phase{N}.node.ts` — New node (create)

> **Gotcha**: The `current_phase` priority map in the Annotation reducer must be updated. Missing values default to `-1` priority and may be overridden by lower-priority phases.

### Adding a New Phase 1 Analyzer Agent

1. Create `orchestration/src/nodes/initialize-project/phase1/{name}-analyzer/` directory
2. Add `{name}-analyzer.node.ts`, `prompts/agent.md`, `prompts/execution-instructions.md`
3. Register new `agent_name` value in `AnalyzerOutputSchema` (Zod enum in `initialize-project.schema.ts`)
4. Add field to `Phase1AnalysisSchema` and `Phase1RetryTrackingSchema`
5. Add corresponding field to `InitializeProjectAnnotation` with merge reducer
6. Wire into graph with parallel edge from `START`

> **Gotcha**: Phase 1 analyzer outputs are JSON, NOT markdown. This is opposite to Phase 3 (synthesis), which MUST return markdown. The `agent.md` for Phase 1 agents instructs JSON output.

## Gotchas & Non-Obvious Patterns

### Phase 5 Reads Stack Profile from Disk, Not from LangGraph State

Phase 5 (`resources.node.ts`) reads `framework-config.json` produced by Phase 4 and performs strict stack profile validation. If Phase 4 missed a language with 20+ files, Phase 5 throws a hard error.

```typescript
// The validation thresholds in resources.node.ts:
const WARN_THRESHOLD = 10;   // Advisory for 10-19 files (may be utility scripts)
const ERROR_THRESHOLD = 20;  // Hard error for 20+ files without a service entry

// Infrastructure languages (js, json, yaml, sh) under 30 files are skipped entirely
// Wrong: Assuming Phase 5 always succeeds if Phase 4 completes
// Phase 5 will throw if language detection was incomplete in Phase 4
```

### Cross-Phase Data Lives on Disk, Not in State

Every phase reads the previous phase's output from `.claude-temp/initialize-project/`, not from LangGraph state. The LangGraph state fields (`phase2_consolidation`, etc.) exist for type inference only.

```typescript
// Correct: read from disk
const consolidationPath = join(tempDir, "phase2-consolidation.json")
if (!existsSync(consolidationPath)) {
  throw new Error("Phase 2 not completed")
}
const data = JSON.parse(readFileSync(consolidationPath, "utf-8"))

// Wrong: read from LangGraph state — unreliable, may be stale
const data = state.phase2_consolidation
```

### Session Resumption in Layer 2 Is Subprocess-Level

The `resumeSessionId` passed in `retryWithEnhancedFeedback` uses the `--resume` flag of Claude CLI. This resumes conversation context in a **new subprocess** — it does NOT reuse the same OS process. In API key mode (deepagents), session IDs are ignored entirely.

### LangGraph MemorySaver Is In-Process Only

```typescript
// orchestration/src/graphs/initialize-project.graph.ts
const checkpointer = new MemorySaver()
```

Workflow state is lost on process restart. Cross-phase resumption relies exclusively on disk files in `.claude-temp/`. For production durability, replace `MemorySaver` with `SqliteSaver` or `PostgresSaver` — the interface is compatible.

### Parallel Phase 1 State Conflict

Phase 1 has 4 nodes running concurrently. Adding a new parallel agent field without a merge reducer causes a runtime crash:

```typescript
// Wrong — throws "LastValue can only receive one value per step"
newAnalyzerResult: Annotation<AnalyzerOutput | undefined>,

// Correct — merge reducer handles all 4 concurrent updates
phase1_analysis: Annotation<Phase1Analysis>({
  reducer: (left, right) => ({ ...left, ...right }),
  default: () => ({ all_completed: false })
}),
```

### Synthesis Agent Must Not Perform File Operations

The architect-synthesizer is configured in `settings.json` with `tools: Read, Grep, Glob` only — no filesystem mutations. Its output is pure markdown text that Phase 4 parses and persists to disk. Any synthesis output that references file operations is blocked by the stop hook and triggers a retry.

### ESM Import Extension Requirement

All imports within `orchestration/src/` must use the `.js` extension, even when importing `.ts` source files:

```typescript
// Correct (TypeScript ESM with Node16 module resolution)
import { validateSynthesisOutput } from "./validators/index.js"

// Wrong — fails at runtime
import { validateSynthesisOutput } from "./validators/index"
```

## Testing Strategy

### Philosophy

Unit tests cover validators, helpers, and prompt builders — pure functions that do not invoke agents. Integration tests cover complete workflows with real agents (expensive, require credentials, run against fixture projects in `tests/integration/`).

### Unit Test Pattern

```typescript
// orchestration/test/unit/nodes/initialize-project/phase3/validators/validate-claude-md-content.test.ts
import { describe, it, expect } from "vitest"
import { validateClaudeMdContent } from "../../../../../../src/nodes/initialize-project/phase3/validators/validate-claude-md-content.js"

describe("validateClaudeMdContent", () => {
  it("rejects empty content", () => {
    const result = validateClaudeMdContent("")
    expect(result).toContain("CONTENT TOO SHORT")
  })

  it("passes valid content with all required sections", () => {
    const result = validateClaudeMdContent(validClaudeMdFixture)
    expect(result).toHaveLength(0)
  })
})
```

- Test files mirror `src/` structure under `test/unit/`
- Use `.js` extension in imports (ESM requirement)
- Never invoke agents in unit tests — mock at `AgentFactory` boundary

### What NOT to Test

- Do not test agent output format in unit tests — that is the validator's responsibility
- Do not mock `fs.readFileSync` for disk-based cross-phase data — use real temp directories with fixtures
- Do not test LangGraph graph topology — trust LangGraph's own test suite

## Integration Points

### deepagents (API key mode)

Used when any of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY` is set. Creates agents via the deepagents SDK with the LLM provider configured by `MODEL_TIER`. No stop hooks available — all validation is handled by `retryWithEnhancedFeedback`.

### Claude CLI (CLI auth mode)

Used when no API keys are present but `claude` binary is found (local or global). Spawns subprocess with `--dangerously-skip-permissions`. Stop hooks run as registered scripts in `settings.json`. Retry passes `--resume <sessionId>` to preserve conversation context between external retry attempts.

### Skills System

Skills are markdown files in `skills/{NNN}-{category}/` with YAML frontmatter. Phase 5 resolves skills by matching the project's detected `StackProfile` against skill metadata, then copies matching skills to the target project's `.claude/skills/`. New skills need YAML frontmatter with at least `name`, `description`, and applicable language/framework tags.

### Agent Templates (Handlebars)

Agent files for target projects are generated in Phase 5 from `agents/templates/*.md` using Handlebars. Template variables are populated from `StackProfile`. To add a new agent type, add a template to `agents/templates/` and register it in `agent-generator.ts`.

## Multi-File Change Checklists

### When adding a new Phase 3 output validator

- [ ] `orchestration/src/nodes/initialize-project/phase3/validators/{validator-name}.ts` — Create validator function
- [ ] `orchestration/src/nodes/initialize-project/phase3/validators/index.ts` — Import and call in `validateSynthesisOutput`
- [ ] `orchestration/src/nodes/initialize-project/phase3/validators/types.ts` — Add any new regex patterns or constants
- [ ] `agents/hooks/validate-synthesis.ts` — Mirror identical logic in the stop hook
- [ ] `orchestration/test/unit/nodes/initialize-project/phase3/validators/{validator-name}.test.ts` — Unit test

### When changing Phase 1 analyzer output schema

- [ ] `orchestration/src/state/schemas/initialize-project.schema.ts` — Update `AnalyzerOutputSchema` and `Phase1AnalysisSchema`
- [ ] `orchestration/src/nodes/initialize-project/phase1/{analyzer}/prompts/execution-instructions.md` — Update output format instructions
- [ ] `orchestration/src/nodes/initialize-project/phase2/question-consolidator/` — Update consolidation logic if field names changed
- [ ] Any phase that reads phase1 disk output — Update parsing logic accordingly

### When adding a new LLM provider tier

- [ ] `orchestration/config/model-config.json` — Add tier entry with model IDs
- [ ] `orchestration/src/utils/preflight-checks.ts` — Add new env var to `hasXxxKey` detection block
- [ ] `orchestration/src/utils/shared/agent-factory/agent-factory.ts` — Handle new provider in factory switch
- [ ] `orchestration/src/auth/auth-detector.ts` — Register new env var in auth detection
- [ ] `README.md` — Document the new tier