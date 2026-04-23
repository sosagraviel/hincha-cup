# Phase 7: Initialize-Project Integration

## Objective

Update the `initialize-project` workflow (CLI entry point + 6-phase pipeline) to support provider selection and ensure all phases work correctly with both Claude and Codex.

## Why This Phase Exists

The initialize-project workflow is the primary entry point for onboarding a project. It must:
1. Ask the user which provider to use (or auto-detect)
2. Run preflight checks for the selected provider
3. Pass provider context through all 6 phases
4. Generate the correct instruction file (CLAUDE.md or AGENTS.md)
5. Write resources to the correct provider directory
6. Validate the correct artifacts in Phase 6

Without this integration, the workflow can only initialize projects for Claude.

## Dependencies

- Phase 1 (Provider abstraction)
- Phase 2 (Auth detection)
- Phase 3 (Codex CLI impl)
- Phase 4 (Provider-aware paths)
- Phase 5 (Instruction file generation)
- Phase 6 (Hook translation)

## Steps

### Step 7.1: Update CLI Entry Point

**File to modify:** `orchestration/src/cli/initialize.ts`

**Why:** The CLI must accept a `--provider` flag and set the active provider early in the pipeline.

**Changes:**

1. Add `--provider` option to Commander:
```typescript
program
  .option('-p, --provider <provider>', 'Target provider: claude or codex (auto-detected if omitted)')
  .option('--tier <tier>', 'Model tier: standard, fast, advanced, openai, gemini')
  // ... existing options
```

2. Set active provider based on flag or auto-detection:
```typescript
import { setActiveProvider, Provider } from '../providers/types.js';

// After parsing CLI args:
if (options.provider) {
  const provider = options.provider.toLowerCase();
  if (provider === 'codex' || provider === 'openai') {
    setActiveProvider(Provider.CODEX);
  } else if (provider === 'claude' || provider === 'anthropic') {
    setActiveProvider(Provider.CLAUDE);
  } else {
    console.error(`Unknown provider: ${options.provider}. Use 'claude' or 'codex'.`);
    process.exit(1);
  }
} else {
  // Auto-detect from auth
  const authConfig = await detectAuthMode();
  if (authConfig.mode === AuthMode.CODEX_CLI || authConfig.provider === 'openai') {
    setActiveProvider(Provider.CODEX);
  } else {
    setActiveProvider(Provider.CLAUDE); // default
  }
}
```

3. Auto-select appropriate tier based on provider:
```typescript
// If user specified --provider codex but didn't specify --tier,
// default to the 'openai' tier
if (getActiveProvider() === Provider.CODEX && !options.tier) {
  process.env.MODEL_TIER = 'openai';
}
```

### Step 7.2: Update LangGraph State to Include Provider

**File to modify:** `orchestration/src/state/schemas/initialize-project.schema.ts`

**Why:** The provider choice must flow through the state so all nodes can access it.

```typescript
// Add to state schema:
provider: z.enum(['claude', 'codex']).optional().default('claude'),
```

### Step 7.3: Pass Provider Through Graph Initialization

**File to modify:** `orchestration/src/graphs/initialize-project.graph.ts`

**Why:** The initial state must include the provider so all nodes can read it.

When creating the initial state:
```typescript
const initialState = {
  // ... existing fields ...
  provider: getActiveProvider(),
};
```

### Step 7.4: Update Phase 1 Analyzer Nodes

**Files to modify:** All 4 analyzer nodes in `orchestration/src/nodes/initialize-project/phase1/`

**Why:** Phase 1 nodes use `AgentFactory` to create agents. The factory already routes based on auth mode (Phase 2/3), so Phase 1 mostly works as-is. However:

1. The `settingsPath` passed to agents needs hook translation (Phase 6)
2. The prompt content may reference Claude-specific instructions

**Changes:**
- In each analyzer node, before passing `settingsPath` to agent config, check the provider and translate hooks if Codex
- Review analyzer prompts (`agent.md` and `execution-instructions.md`) for Claude-specific language

### Step 7.5: Update Phase 2 Consolidation

**File to modify:** `orchestration/src/nodes/initialize-project/phase2/*.ts`

**Why:** Phase 2 consolidates Phase 1 outputs. It's provider-agnostic (works on JSON data), so minimal changes needed. Just ensure any logging messages don't hardcode "Claude".

### Step 7.6: Update Phase 3 Synthesis

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts`

**Why:** Phase 3 generates the instruction file content. Must know which provider format to produce (covered in Phase 5, but the node must read the provider from state and inject it into the prompt).

```typescript
// In synthesis.node.ts:
const provider = state.provider || 'claude';
const instructionFileName = provider === 'codex' ? 'AGENTS.md' : 'CLAUDE.md';

// Inject into prompt:
const prompt = basePrompt.replace(/\{\{INSTRUCTION_FILE\}\}/g, instructionFileName);
```

### Step 7.7: Update Phase 5 Resources

**File to modify:** `orchestration/src/nodes/initialize-project/phase5/resources.node.ts`

**Why:** Phase 5 generates skills, agents, and commands and writes them to the project. Must use provider-aware paths.

**Changes:**
- Replace `join(projectPath, '.claude', 'skills')` with `resolveConfigPath(projectPath, 'skills')`
- Replace `join(projectPath, '.claude', 'agents')` with `resolveConfigPath(projectPath, 'agents')`
- Replace `join(projectPath, '.claude', 'commands')` with `resolveConfigPath(projectPath, 'commands')`

### Step 7.8: Update Phase 5 Agent Generator

**File to modify:** `orchestration/src/nodes/initialize-project/phase5/agent-generator.ts`

**Why:** Agent templates may need provider-specific frontmatter. For Claude, agent files use Claude frontmatter fields (`tools`, `mcpServers`, `hooks`). For Codex, these fields are not applicable.

Add a provider-aware template variable:

```typescript
// When rendering Handlebars templates:
const templateContext = {
  // ... existing context ...
  provider: getActiveProvider(),
  isClaude: getActiveProvider() === Provider.CLAUDE,
  isCodex: getActiveProvider() === Provider.CODEX,
};
```

### Step 7.9: Update Phase 6 Validation

**File to modify:** `orchestration/src/nodes/initialize-project/phase6/validation.node.ts` and helpers

**Why:** Phase 6 validates that all expected artifacts were created. Must check for the correct provider directory and files.

**Changes in `file-validator.ts`:**
```typescript
// Instead of hardcoding:
// const claudeMdPath = join(projectPath, '.claude', 'CLAUDE.md');
// Use:
const instructionFilePath = resolveInstructionFilePath(projectPath);
const frameworkConfigPath = resolveFrameworkConfigPath(projectPath);
const skillsDir = resolveConfigPath(projectPath, 'skills');
const agentsDir = resolveConfigPath(projectPath, 'agents');
```

### Step 7.10: Update Bash Launcher Script

**File to modify:** `scripts/initialize-project.sh`

**Why:** The bash script is the user-facing entry point. It should accept a `--provider` flag and pass it through.

```bash
# Parse --provider flag
PROVIDER=""
for arg in "$@"; do
  case "$arg" in
    --provider=*) PROVIDER="${arg#*=}" ;;
    --provider) NEXT_IS_PROVIDER=true ;;
    *) if [ "$NEXT_IS_PROVIDER" = true ]; then PROVIDER="$arg"; NEXT_IS_PROVIDER=false; fi ;;
  esac
done

# Pass to TypeScript CLI
npx tsx orchestration/src/cli/initialize.ts --provider "$PROVIDER" "$@"
```

### Step 7.11: Update Docker Runtime (if applicable)

**File to check:** `docker/claude-runtime/scripts/run-claude.sh`

**Why:** If there's a Docker-based execution path, it may need a parallel `run-codex.sh` or a provider-aware launcher.

## Files Modified

| Action | File | Why |
|--------|------|-----|
| MODIFY | `orchestration/src/cli/initialize.ts` | Add --provider flag, set active provider |
| MODIFY | `orchestration/src/state/schemas/initialize-project.schema.ts` | Add provider field to state |
| MODIFY | `orchestration/src/graphs/initialize-project.graph.ts` | Pass provider to initial state |
| MODIFY | `orchestration/src/nodes/initialize-project/phase1/*/analyzer.node.ts` | Hook translation for Codex |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts` | Provider-aware prompt |
| MODIFY | `orchestration/src/nodes/initialize-project/phase5/resources.node.ts` | Provider-aware paths |
| MODIFY | `orchestration/src/nodes/initialize-project/phase5/agent-generator.ts` | Provider-aware template vars |
| MODIFY | `orchestration/src/nodes/initialize-project/phase6/validation.node.ts` | Provider-aware validation |
| MODIFY | `orchestration/src/nodes/initialize-project/phase6/helpers/*.ts` | Provider-aware file checks |
| MODIFY | `scripts/initialize-project.sh` | Pass --provider flag |

## Acceptance Criteria

1. `./scripts/initialize-project.sh /my-project --provider codex` initializes a project for Codex
2. Auto-detection works: if Codex CLI is authenticated, it's selected automatically
3. Resources are written to `.codex/` when provider is Codex
4. `AGENTS.md` is generated instead of `CLAUDE.md` when provider is Codex
5. Phase 6 validates the correct artifacts for the selected provider
6. The `openai` model tier is auto-selected when provider is Codex
7. All Phase 1 analyzers work correctly with Codex CLI
8. The existing Claude path is completely unchanged (regression-safe)

## Notes for Implementer

- The CLI entry point is at `orchestration/src/cli/initialize.ts`. It uses Commander.js.
- The graph is compiled at `orchestration/src/graphs/initialize-project.graph.ts`.
- `setActiveProvider()` (from Phase 4) must be called BEFORE any `resolveConfigPath()` calls.
- The Phase 1 analyzer nodes are at:
  - `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/analyzer.node.ts`
  - `orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/analyzer.node.ts`
  - `orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/analyzer.node.ts`
  - `orchestration/src/nodes/initialize-project/phase1/data-flows-analyzer/analyzer.node.ts`
- Test with: `MODEL_TIER=openai PROVIDER=codex ./scripts/initialize-project.sh /tmp/test-project`
