# Initialize Project Workflow

TypeScript-orchestrated project initialization using LangGraph state machines.

---

## Overview

Analyzes codebase and generates AI configuration via 6-phase workflow.

**Output**:
```
.claude/
├── CLAUDE.md                    # Quick reference
├── skills/                      # Tech-specific knowledge
├── agents/                      # AI agents
├── commands/                    # Workflows
└── framework-config.json        # Config registry
```

**Features**: TypeScript orchestration, parallel analysis (Phase 1), resumable, stack-agnostic, auto-validation

---

## Architecture

**Pattern**: Phase 1 (4 parallel analyzers) → Phases 2-6 (sequential)

```typescript
const graph = new StateGraph(InitializeProjectAnnotation)
  .addNode("phase1", phase1ParallelAnalysis)
  .addNode("phase2", phase2Consolidation)
  .addNode("phase3", phase3Synthesis)
  .addNode("phase4", phase4FileWriting)
  .addNode("phase5", phase5ResourceSync)
  .addNode("phase6", phase6Validation)
  .addEdge(START, "phase1")
  .addEdge("phase6", END);
```

---

## Phase Breakdown

| Phase | Duration | Purpose | Parallelism |
|-------|----------|---------|-------------|
| 1 | 2-5min | Analyze codebase (structure, stack, patterns, context) | 4 analyzers |
| 2 | 30-60s | Consolidate analysis results | Sequential |
| 3 | 1-2min | Synthesize project understanding | Sequential |
| 4 | 30-60s | Write CLAUDE.md and project-context | Sequential |
| 5 | 1-2min | Sync skills, agents, commands | Sequential |
| 6 | 30-60s | Validate configuration | Sequential |

**Total**: 5-10 minutes

---

## Phase Details

### Phase 1: Parallel Analysis

**4 concurrent analyzers**:

1. **Structure Analyzer**: Directory tree, file organization, monorepo detection
2. **Stack Analyzer**: Languages, frameworks, package managers, dependencies
3. **Pattern Analyzer**: Code patterns, conventions, test structure
4. **Context Analyzer**: README, docs, architecture, business domain

**Writes**: `phase1-analysis.json`

### Phase 2: Consolidation

Merges Phase 1 analyzer outputs into unified analysis.

**Writes**: `phase2-consolidated.json`

### Phase 3: Synthesis

Generates human-readable project understanding from consolidated analysis.

**Writes**: `phase3-synthesis.md`

### Phase 4: File Writing

**Creates**:
- `.claude/CLAUDE.md` - Quick reference for Claude
- `.claude/skills/project-context/SKILL.md` - Deep project knowledge

### Phase 5: Resource Sync

**Syncs** (based on detected stack):
- Skills (`skills.config.json` → `.claude/skills/`)
- Agents (`agents/templates/` → `.claude/agents/`)
- Commands (`commands/` → `.claude/commands/`)

**Updates**: `framework-config.json`

### Phase 6: Validation

**Validates**:
- All expected files exist
- JSON files parse correctly
- Frontmatter valid
- framework-config.json schema correct

---

## CLI Usage

### Basic Command

```bash
cd orchestration
pnpm initialize -- -p <project-path> -f <framework-path>
```

### Examples

```bash
# Current directory
pnpm initialize -- -p $(pwd) -f $(pwd)

# Specific project
pnpm initialize -- -p /path/to/project -f /path/to/framework

# Resume from checkpoint
pnpm initialize -- -p /path/to/project -f /path/to/framework --resume

# Debug mode
DEBUG=true pnpm initialize -- -p /path/to/project -f /path/to/framework
```

---

## State Management

**Checkpoints** written after each phase to `.claude-temp/initialize/artifacts/`:
- `phase1-complete.json`
- `phase2-complete.json`
- etc.

**Resume**: `--resume` flag detects last complete phase and continues from there.

---

## Error Handling

### Auto-Retry
- Failed phases retry up to 3 times
- Exponential backoff between retries

### Manual Recovery
```bash
# Check artifacts
ls .claude-temp/initialize/artifacts/

# Resume from last checkpoint
pnpm initialize -- -p . -f /path/to/framework --resume

# Clean and restart
rm -rf .claude-temp/initialize
pnpm initialize -- -p . -f /path/to/framework
```

---

## Troubleshooting

### "Stack detection failed"
```bash
# Ensure package files exist
ls package.json tsconfig.json requirements.txt

# Manual check
cat .claude-temp/initialize/artifacts/phase1-analysis.json | jq .stack_analyzer
```

### "Phase timeout"
```bash
# Increase timeout or use opus
MODEL_TIER=opus pnpm initialize ...
```

### "Validation failed"
```bash
# Check specific errors
cat .claude-temp/initialize/artifacts/phase6-validation.json | jq .errors

# Common fixes:
# - Ensure .claude/ directory writable
# - Check disk space
# - Verify framework path correct
```

---

## Performance

**Optimization**:
- Phase 1 parallelism (4 analyzers)
- Incremental file reading
- Smart caching
- Resumable execution

**Scaling**:
- Small projects (<100 files): 3-5 min
- Medium projects (100-1000 files): 5-8 min
- Large projects (1000+ files): 8-12 min

---

**See Also**: [Architecture](../architecture/ARCHITECTURE.md), [Orchestration](../architecture/ORCHESTRATION.md)
