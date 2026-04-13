---
name: project-context
description: Deep architectural knowledge of the ai-agentic-framework — LangGraph pipeline internals, Phase 1–6 data flow, agent factory patterns, schema registry, disk-first idempotency, and conventions for adding new analyzers or phases
user-invokable: true
---

# Project Context: AI Agentic Framework

## When to Use This Skill

- When adding a new Phase 1 analyzer (node, agent.md, schema, hook, tests)
- When modifying how Phase 5 generates agent templates or resolves commands
- When changing state schema fields and their LangGraph reducers
- When debugging why an agent output fails validation or the stop hook rejects it
- When extending Phase 2 consolidation or Phase 3 synthesis prompts
- When adding a new phase to either workflow graph
- When writing unit tests for nodes, hooks, or utilities

## Architecture Deep Dive

### LangGraph State and Reducers

State is defined in `orchestration/src/state/schemas/initialize-project.schema.ts` using LangGraph's `Annotation` API. Phase 1 runs four nodes in parallel, so any state field written by multiple parallel nodes **must** use a custom merge reducer:

```typescript
// Correct: merge reducer for parallel Phase 1 updates
phase1_analysis: Annotation<Record<string, unknown>>({
  reducer: (existing, update) => ({ ...existing, ...update }),
  default: () => ({}),
}),

// Correct: concat reducer for error/warning arrays
errors: Annotation<string[]>({
  reducer: (existing, update) => [...existing, ...update],
  default: () => [],
}),
```

The default LangGraph reducer (last-write-wins) is wrong for any field touched by Phase 1 parallel nodes.

### Phase 1 Analyzer Node Pattern

Every Phase 1 analyzer follows this exact structure:

1. Resolve `tempDir` (`state.temp_dir` or fallback `<projectPath>/.claude-temp/initialize-project`)
2. Ensure `phase1-outputs/` directory exists recursively
3. Define `agentInvoke(feedbackPrompt, resumeSessionId)` — builds prompt via `buildPhase1AnalyzerPrompt()`, creates agent via `AgentFactory.createAgent()`
4. Define `validator(output)` — delegates to `validateAndParseAgentOutput(output, agentName)`
5. Define `outputPath = join(tempDir, 'phase1-outputs', '<N>-<name>.json')`
6. Call `retryWithEnhancedFeedback(agentInvoke, validator, DEFAULT_RETRY_CONFIG, outputPath)`
7. Persist validated JSON to `outputPath`
8. Return `{ temp_dir: tempDir }`

On retry, `feedbackPrompt` is non-empty — it contains the Zod validation error text formatted for agent self-correction. `resumeSessionId` enables Claude CLI session resumption so the agent keeps its prior context.

### Schema Registry and Validation Pipeline

```
Agent raw text output
  → extractJSON() / extractBalancedJSON()     # strips markdown fences, text prefix
  → JSON.parse()
  → getSchemaForAgent(output.agent_name)      # dispatches by agent_name literal
  → ZodSchema.safeParse()
  → ValidationResult { success, data, errors }
```

The registry in `phase1-agent-outputs.schema.ts`:
```typescript
export const AGENT_OUTPUT_SCHEMAS = {
  'structure-architecture-analyzer': StructureAnalyzerOutputSchema,
  'tech-stack-dependencies-analyzer': TechStackAnalyzerOutputSchema,
  'code-patterns-testing-analyzer': CodePatternsAnalyzerOutputSchema,
  'data-flows-integrations-analyzer': DataFlowsAnalyzerOutputSchema,
} as const;
```

When adding a new analyzer, add its schema here. The stop hook (`validate-analyzer-json.hook.ts`) uses the same registry automatically.

### Agent Factory: CLI vs. API Mode

`AgentFactory.create()` auto-detects auth mode:
- **CLI mode** (`cli-agent-impl.ts`): spawns the `claude` binary as subprocess with `--agent`, `--model`, `--session-id`/`--resume` flags. Uses Claude Pro/Max subscription.
- **API mode** (`deep-agent-impl.ts`): uses `deepagents` package with a LangChain model instance. Auth via `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`.

Both implement the same `Agent` interface: `invoke({ inputPrompt }) → { output: string, sessionId: string }`.

### Prompt Construction for Phase 1 Analyzers

`buildPhase1AnalyzerPrompt()` assembles four XML-tagged sections in order:

```
<excluded_directories>
  .worktrees, node_modules, .git, dist, ...
</excluded_directories>

<project_path>/absolute/path/to/target/project</project_path>

<output_format>
  Raw JSON only. First character: { Last character: }
</output_format>

<execution_instructions>
  [contents of execution-instructions.md for this analyzer]
</execution_instructions>
```

On retry, a `<validation_feedback>` section is appended with Zod error details. The final input prompt prepends `ultrathink\n\n` and appends a task sentence: `Analyze the X at: <path>`.

### Disk-First Idempotency

The pattern gates each phase behind a completion marker on disk:

```typescript
// Phase node checks for existing output before running
const outputPath = join(tempDir, 'phase1-outputs', '01-structure-architecture.json');
if (existsSync(outputPath)) {
  // Already completed — skip agent invocation
  return { temp_dir: tempDir };
}
// ... run agent, persist output, return state
```

This allows safe re-runs after partial failures without repeating expensive LLM calls.

### Phase 4 → Phase 5 Data Flow

Phase 4 (`context-generation.node.ts`) reads Phase 1–3 outputs from `.claude-temp/` and produces `framework-config.json` in the target project's `.claude/` directory. This file contains a `stack_profile` (`StackProfile` object with services, languages, file counts).

Phase 5 reads `framework-config.json` — not the raw Phase 1 outputs — to get the stack profile for agent generation and skill resolution.

**Active gap (QAF-13)**: Phase 5's `command-extractor.ts` reads only `package.json` scripts and language defaults. It does not read `phase1-outputs/02-tech-stack-dependencies.json` for `documented_commands.by_task` or `01-structure-architecture.json` for `automation.makefiles[].targets`. The intended command priority is: documented commands (README) > Makefile targets > `package.json` scripts > language defaults.

### Phase 5 Skill Resolution

Each skill in `skills/**/*.md` has frontmatter with `triggers` (package names or stack keywords) and `trigger_mode` (`always`, `triggered`, or `generated`).

`resolveSkills(stackProfile, frameworkPath)` in `skill-resolver.ts`:
- `always` mode: skill is always included
- `triggered` mode: included if any trigger matches a detected production dependency
- `generated` mode: generated dynamically based on detected stack

Skill resolution uses two match strategies: normalized exact match (e.g., `"firebase"`) and prefix match with delimiters (e.g., `"@google-cloud/firestore"`).

### Adding a New Phase 1 Analyzer — Checklist

1. Create `orchestration/src/nodes/initialize-project/phase1/<name>-analyzer/`
2. Add `prompts/agent.md` — frontmatter with `name`, `tools: Read, Grep, Glob`, output format, constraints
3. Add `prompts/execution-instructions.md` — step-by-step discovery process with output JSON examples
4. Add `settings.json` — Claude CLI tool permissions and model selection
5. Add `<name>-analyzer.node.ts` — follow the exact node pattern described above
6. Add Zod schema to `phase1-agent-outputs.schema.ts` and register in `AGENT_OUTPUT_SCHEMAS`
7. Add agent definition file in `agents/` directory (e.g., `05-<name>.md`)
8. Wire the node into `initialize-project.graph.ts` as a parallel Phase 1 edge
9. Add unit tests: node-level test and schema-level test

## Gotchas & Non-Obvious Patterns

**SIGINT must propagate** — Nodes catch all errors but re-throw SIGINT to allow graceful shutdown:

```typescript
// Wrong: swallows SIGINT, user can't interrupt
} catch (error) {
  return { errors: [...state.errors, error.message] };
}

// Correct: re-throw SIGINT, catch everything else
} catch (error) {
  const err = error as Error;
  if (err.message.includes('SIGINT') || err.message.includes('interrupted by user')) {
    throw error;
  }
  return { errors: [...state.errors, `${agentName}: ${err.message}`] };
}
```

**`.passthrough()` means extra fields don't break validation** — `findings` objects use `.passthrough()` so unexpected keys from agents parse successfully. Only explicitly declared fields get TypeScript types:

```typescript
// Extra fields from agent output are silently accepted
findings: z.object({ services: z.array(...) }).passthrough()
```

**Parallel state — always spread errors** — Returning `{ errors: ['new error'] }` from a parallel Phase 1 node with a concat reducer will append correctly. Without the spread you'd overwrite prior errors:

```typescript
// Wrong: may lose errors from sibling parallel nodes if reducer isn't set correctly
return { errors: ['structure-architecture-analyzer: timeout'] };

// Correct: always spread to be safe
return { errors: [...state.errors, 'structure-architecture-analyzer: timeout'] };
```

**`agentFilePath` vs `prompts/agent.md`** — Phase 1 nodes pass `agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile)` where `agentFile` is the numbered agent file under `agents/` at framework root (e.g., `01-structure-architecture.md`). This is a different file from the node's local `prompts/agent.md`. The local `prompts/agent.md` is the system prompt content; the `agents/` file is the Claude CLI agent definition that references it.

**MemorySaver loses state on restart** — The current `sqlite.checkpointer.ts` uses `MemorySaver`. Any workflow interrupted mid-run loses checkpointed state. `@langchain/langgraph-checkpoint-sqlite` is in production dependencies and is the intended replacement, but not yet wired in.

**`documented_commands` and `automation` are collected but not yet consumed** — Phase 1 now discovers Makefile targets (`findings.automation.makefiles[].targets`) and documented commands (`findings.documented_commands.by_task`), but Phase 5's command extractor reads only `package.json` scripts and language defaults. A project relying on `make test` will receive `npm test` in its generated agent until the Phase 5 command extractor is updated to read Phase 1 outputs.

**`services` array is deprecated in Analyzers 02 and 03** — New code should use `dependencies.by_service` (Analyzer 02) and `testing` map (Analyzer 03) with service IDs as keys. Analyzer 01 (`structure-architecture-analyzer`) is the single source of truth for the services list.