---
name: project-context
description: Deep architectural knowledge of the AI Agentic Framework — LangGraph workflow engine, skills system, agent invocation patterns, and file conventions. Use when implementing features, adding phases, creating skills, or modifying workflow graphs.
user-invokable: true
---

# Project Context: AI Agentic Framework

## When to Use This Skill

- When adding a new phase to `initialize-project` or `implement-ticket`
- When creating or modifying a skill in `skills/`
- When modifying the LangGraph graph topology (edges, conditional routing)
- When adding a new service or utility
- When writing tests for orchestration nodes
- When understanding agent → artifact → next-phase data flow

---

## Architecture Deep Dive

### Two Workflows, One Pattern

Both workflows use the same LangGraph `StateGraph` + `MemorySaver` pattern:

```typescript
// Pattern for all graphs
const workflow = new StateGraph(AnnotationType);
workflow.addNode('phase0_preflight', phase0PreflightNode);
workflow.addEdge(START, 'phase0_preflight');
workflow.addConditionalEdges('phase0_preflight', routeAfterPhase0);
const app = workflow.compile({ checkpointer });
```

Each phase node is an `async function (state: StateType): Promise<Partial<StateType>>` that:
1. Reads inputs from `state.*` fields
2. Reads artifact files from `state.temp_dir` (if resuming)
3. Invokes an agent or performs computation
4. Writes completion marker: `<temp_dir>/phase{N}/<name>-complete.json`
5. Returns state delta

### Phase Numbering Convention

```
implement-ticket:  phase0=preflight, phase1=context, phase2=planning,
                   phase3=environment, phase4=implementation, phase5=testing,
                   phase6=visual, phase7=documentation, phase8=pr,
                   phase9=review, phase10=cleanup

initialize-project: phase1=4×parallel analyzers, phase2=consolidator,
                    phase3=synthesis, phase4=context-generation,
                    phase5=resources, phase6=validation
```

### initialize-project Phase 1: Parallel Analyzers

The four Phase 1 analyzers run in parallel via LangGraph's fan-out pattern:

```
phase1_structure_analyzer ─┐
phase1_tech_stack_analyzer ─┤→ phase2_consolidator → phase3_synthesis → ...
phase1_code_patterns_analyzer─┤
phase1_data_flows_analyzer ─┘
```

Each analyzer agent writes its output to `.claude-temp/<analyzer-name>/output.json`. The Phase 2 consolidator reads all four outputs and produces the consolidated analysis.

### Agent Invocation Modes

Two execution modes based on auth detection (`orchestration/src/auth/auth-detector.ts`):

| Mode | When | Mechanism |
|---|---|---|
| **API Key mode** | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` present | DeepAgents library or LangChain ChatModel |
| **CLI Subscription mode** | `~/.claude` credentials exist | Subprocess spawn of `claude` binary |

The `AgentFactory` (`orchestration/src/utils/shared/agent-factory/`) abstracts both modes behind a unified interface.

### LLM Factory

`orchestration/src/llm/llm-factory.ts` — singleton factory with internal `Map` cache keyed by `modelAlias + overrides`. Multi-provider: Anthropic, OpenAI, Google Gemini.

```typescript
const factory = getLLMFactory();
const model = factory.getModel('sonnet');  // returns ChatAnthropic/ChatOpenAI/etc.
```

### State Schemas

Each workflow has a Zod + LangGraph Annotation schema:

```
orchestration/src/state/schemas/
├── implement-ticket.schema.ts    # ImplementTicketAnnotation, ImplementTicketState
└── initialize-project.schema.ts  # InitializeProjectAnnotation, InitializeProjectState
```

State fields use LangGraph's `Annotation.Root()` pattern. Phase outputs are namespaced: `phase1_complete`, `phase1_context`, `phase2_complete`, etc.

---

## Skills System Deep Dive

### Directory Structure

```
skills/
├── skills.config.json              ← registry of all skills
├── 010-foundation/
│   ├── start-task/SKILL.md
│   └── project-context/SKILL.md    ← generated per-project (trigger_mode: "generated")
├── 020-development-workflow/
│   ├── create-sdd-ticket/SKILL.md  ← invoked as Skill(create-sdd-ticket, args: "...")
│   ├── implement-ticket/SKILL.md
│   └── ...
├── 030-quality-assurance/
├── 040-integrations/
├── 050-language-frameworks/
├── 060-documentation/
├── 070-infrastructure/
└── 080-cloud-platforms/
```

### Skill Invocation (Current Pattern)

Skills are invoked via the Claude Code `Skill` tool, NOT as slash commands:

```
# Correct (current)
Skill(create-sdd-ticket, args: "--from-jira PROJ-123 --save-to-markdown ./specs/PROJ-123.md")

# Deprecated (removed in v3.0.0)
/create-sdd-ticket --from-jira PROJ-123
```

### skills.config.json Registry

Controls which skills are synced to target projects via `sync-framework-resources`:

```json
{
  "name": "ui-testing",
  "path": "030-quality-assurance/ui-testing",
  "trigger_mode": "triggered",
  "triggers": ["react", "next", "nextjs", "vue", "angular"],
  "compatible_languages": ["typescript", "javascript"],
  "is_linkable_to_agents": true
}
```

`trigger_mode` values:
- `always` — synced to every project
- `triggered` — synced only when `triggers` match detected stack
- `generated` — not synced; generated fresh by Phase 5 for each target project

### Phase 5 Resources Node

`orchestration/src/nodes/initialize-project/phase5/resources.node.ts` uses `skills.config.json` + detected stack profile to generate `.claude/` configuration for target projects. This includes Handlebars-rendered `CLAUDE.md`, agent config files, and selected skill symlinks.

---

## Gotchas & Non-Obvious Patterns

### 1. ESM `.js` extension required

```typescript
// ❌ WRONG — will fail at runtime
import { Logger } from '../utils/logger';
import { Logger } from '../utils/logger.ts';

// ✅ CORRECT — always .js even for .ts source files
import { Logger } from '../utils/logger.js';
```

### 2. Artifact paths are deterministic and gitignored

```typescript
// ❌ WRONG — will pollute git
const artifactsDir = '.claude/tickets/PROJ-123/';

// ✅ CORRECT — always under .claude-temp/
const artifactsDir = join(projectPath, '.claude-temp/tickets', ticketId, 'artifacts');
```

### 3. Phase completion markers enable --resume

Each phase node must write a completion marker or resume will skip it:

```typescript
// At the END of every phase node, write the marker
await writeFile(
  join(state.temp_dir, 'phase4', 'implementation-complete.json'),
  JSON.stringify({ completed_at: new Date().toISOString(), success: true })
);
```

### 4. Agent output validation

LLM agents embed JSON in markdown fences. Never `JSON.parse()` directly:

```typescript
// ❌ WRONG
const result = JSON.parse(agentOutput);

// ✅ CORRECT — strips markdown, validates agent_name field
const result = validateAndParseAgentOutput(agentOutput, 'expected-agent-name');
```

### 5. MemorySaver vs SQLite

The `sqlite.checkpointer.ts` file is named misleadingly — it currently exports `MemorySaver` (in-memory). SQLite/Postgres checkpointing is planned for production but not yet wired up. Do not assume persistence across process restarts.

### 6. Model tier inheritance

`MODEL_TIER` env var is set once at CLI startup and read by `getLLMFactory()`. Do not set it per-node; it applies globally to the entire workflow run.

### 7. Skills are not slash commands

The `.claude/commands/` directory is NOT the source of truth for skills. The `skills/` directory and `skills.config.json` are. Slash commands (`.claude/commands/*.md`) were the legacy invocation mechanism. The current approach uses the `Skill` tool.

---

## External Integration Points

| Service | How Used | Auth |
|---|---|---|
| Jira REST API v3 | Phase 1 context fetching (`phase1-context.node.ts`) | `JIRA_EMAIL` + `JIRA_API_TOKEN` (Basic Auth) |
| Figma REST API | Phase 6 visual design context | `FIGMA_ACCESS_TOKEN` (Bearer) |
| GitHub (`gh` CLI) | Phase 8 PR creation | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Atlassian MCP Server | Docker runtime only | `ATLASSIAN_CLOUD_ID`, `ATLASSIAN_API_TOKEN` |
| Playwright | Phase 6 screenshot capture | No auth; headless browser |

---

## Testing Conventions

```
orchestration/test/
├── unit/              # Mirrors src/ — test individual functions/classes
│   ├── llm/
│   ├── nodes/
│   └── utils/
└── integration/       # End-to-end workflow tests (*.integration.test.ts)
```

Test files use Vitest. Mock LLM calls with `vi.mock('../llm/llm-factory.js')`. Do not mock the filesystem unless absolutely necessary — phase nodes are tested with real temp directories.