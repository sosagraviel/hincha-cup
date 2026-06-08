# Initialize Project Workflow

TypeScript-orchestrated project initialization using LangGraph state machines.

---

## Overview

Analyzes codebase and generates AI configuration via 6-phase workflow.

**Output** (Claude Code layout shown — Codex uses `.codex/` + `AGENTS.md`):
```
.claude/                         # or .codex/ when provider=codex
├── CLAUDE.md                    # Quick reference (AGENTS.md in Codex)
├── skills/                      # Tech-specific knowledge (also the invocation surface)
├── agents/                      # AI agents
└── framework-config.json        # Config registry
```

**Features**: TypeScript orchestration, parallel analysis (Phase 1), resumable, stack-agnostic, auto-validation

---

## Recent changes (2026-04 init refactor)

- **Single-init model.** No `-p` / `-f` flags, no `PROJECT_PATH` / `FRAMEWORK_PATH` env vars. The Bash entry point and the TypeScript layer derive both paths locally — Bash via `pwd -P` walking up from the script, TS via `import.meta.url`. The framework is expected to live as a child of the target project (`<project>/qubika-agentic-framework/…`); dogfooding is detected via the `qubika-agentic-framework -> .` self-symlink so this very repo can initialize itself.
- **Phase 0 — Graph Foundation.** Runs *before* Phase 1. Builds `<project>/.code-review-graph/graph.db`, writes the project-level MCP config (`.mcp.json` for Claude, `.codex/config.toml` for Codex), then opens an MCP stdio session against `code-review-graph serve` and stashes the live tool catalog in workflow state. Failure here aborts the run (`current_phase: failed`) — analyzers without the graph are not allowed to silently fall back to file scanning.
- **Live tool catalog.** Analyzer prompts no longer hard-code `mcp__code_graph__<name>` strings. Phase 1's `prompt-builder.ts` injects the catalog as a `=== CODE GRAPH CONTEXT ===` block, and the analyzer's Stop hook reads `transcript.jsonl` to count actual `mcp__code_graph__*` `tool_use` events. `graph_queries_used` in each analyzer's output is overwritten with the real count; an analyzer that claims graph use without making any call is rejected and retried.
- **Portable artifacts.** Everything written under `<project>/.claude/` and `<project>/.codex/` flows through `PortableWriter` (services/framework/portable-paths/). Four layers of defense: branded TypeScript types (`AbsolutePath` / `ProjectRelativePath`), Zod refinements, the `PortableWriter` chokepoint, and a Phase 6 runtime walker (`portability-validator.ts`) that scans every committed text file for `/Users/<name>/` or `/home/<name>/` patterns. A non-portable path anywhere in the generated tree fails the run.
- **`.code-review-graphignore`.** Lives in `templates/code-review-graphignore` in the framework; copied idempotently into `<project>/.code-review-graphignore` by `setup-code-graph.sh` and `sync-framework-resources.sh`. The framework folder no longer holds an inert copy.
- **`framework-config.json`.** `project_metadata.project_path` was dropped — it was an absolute filesystem path written into a committed file, and nothing read it.
- **Settings split.** `<project>/.claude/settings.json` is committed (shareable permissions); `<project>/.claude/settings.local.json` is gitignored.

See [`docs/CODE_GRAPH.md`](../CODE_GRAPH.md) and [`docs/CLAUDE_DIR_LAYOUT.md`](../CLAUDE_DIR_LAYOUT.md) for details.

---

## Architecture

**Pattern**: Phase 0 (graph + catalog) → Phase 1 (4 parallel analyzers) → Phases 2-6 (sequential)

```typescript
const graph = new StateGraph(InitializeProjectAnnotation)
  .addNode("phase1", phase1ParallelAnalysis)
  .addNode("phase2", phase2Consolidation)
  .addNode("phase3", phase3Synthesis)
  .addNode("phase3_5", phase3_5ContextVerification)
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
| 3.5 | 30-90s | Verify generated CLAUDE.md claims against the real tree (open-book; best-effort) | Sequential |
| 4 | 30-60s | Write CLAUDE.md and project-context | Sequential |
| 5 | 1-2min | Sync skills and agents | Sequential |
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

**Graph navigation discipline.** Every analyzer prompt embeds the canonical graph-tool discipline (single source: `services/graph-wiki/graph-navigation-discipline.ts`). The discipline forbids `mcp__code_graph__get_architecture_overview_tool` (its response cannot be bounded and overflows on any non-trivial codebase) and pins lean defaults (`detail_level: "minimal"`, `limit: 20` MAX, `include_members: false`, `include_source: false`) on every other graph tool. The same constant is upserted into `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`) and the project-context skill at Phase 4b, so every downstream agent (planner, implementer, ad-hoc Claude / Codex sessions) inherits the same rules. See [`docs/CODE_GRAPH.md`](../CODE_GRAPH.md) for the full discipline + lean-defaults table.

### Phase 2: Consolidation

Merges Phase 1 analyzer outputs into unified analysis.

**Writes**: `phase2-consolidated.json`

### Phase 3: Synthesis

Generates human-readable project understanding from consolidated analysis.

**Writes**: `phase3-synthesis.md`

### Phase 3.5: Context Verification

Audits the generated `CLAUDE.md`/`AGENTS.md` cheat-sheet against the real
repository. Unlike the closed-book synthesizer, this verifier is **open-book**
(`Read`/`Glob`/`Grep`): it fixes or removes broken file-placement rows,
directory-tree entries, and inline paths, and collapses duplicate/garbage
Services & Ports rows (e.g. a docker-compose alias shadowing the real source
service). Best-effort and non-blocking — if it cannot run or repair, the
original synthesis is kept and the pipeline proceeds.

**Rewrites**: `synthesis-raw.md` (the artifact Phase 4 extracts).

### Phase 4: File Writing

**Creates** (Claude Code layout — Codex writes to `.codex/` with `AGENTS.md` instead):
- `.claude/CLAUDE.md` - Quick reference for Claude (`.codex/AGENTS.md` for Codex)
- `.claude/skills/project-context/SKILL.md` - Deep project knowledge

### Phase 4b: LLM-Wiki Generation

**Creates** under `<project>/docs/llm-wiki/`:
- `wiki/ARCHITECTURE.md`, `wiki/DATA-FLOWS.md`, `wiki/PATTERNS.md` — LLM-synthesized from already-digested upstream (Phase 1 analyzer JSONs + Phase 3 synthesis + the just-generated CLAUDE.md slice + project-context slice). The `wiki-generator` agent runs **closed-book** — no Read/Grep/Glob/MCP — so it cannot re-analyze the codebase.
- `wiki/services/<id>.md` per detected service. Concurrency bounded to 3 in flight.
- `wiki/SERVICES.md` — deterministic catalog (no LLM call).
- `wiki/index.md` — deterministic summary catalog: one line per page with `summary` / `document_type` / `confidence` / `tags` / `related` inline. Tier 1 retrieval at consumer time is one read, not N.
- `<schema-filename>` — the wiki's runtime router, project-specific. `CLAUDE.md` for Claude provider, `AGENTS.md` for Codex provider, `COPILOT.md` for GitHub Copilot. Capped at ~150 lines: decision table, tier discipline, ingest workflow, off-limits. The frontmatter contract for wiki pages lives in `docs/CLAUDE_DIR_LAYOUT.md` (developer-facing, not query-time).

See [`docs/LLM_WIKI.md`](../LLM_WIKI.md) for the full router contract and consumer-side retrieval model.

### Phase 5: Resource Sync

**Syncs** (based on detected stack):
- Skills (`skills.config.json` → `.claude/skills/`)
- Agents (`agents/templates/` → `.claude/agents/`)

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
# Standard run from the target project root
cd /path/to/project
./qubika-agentic-framework/scripts/initialize-project.sh

# Fast tier (Haiku) — recommended for first-pass analysis of new projects
MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh

# Codex provider
./qubika-agentic-framework/scripts/initialize-project.sh --provider codex

# Fully automated (CI / CD — skip interactive gap questions)
./qubika-agentic-framework/scripts/initialize-project.sh --skip-gap-questions

# Resume after interruption (start at phase 4)
./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4

# Integration-fixture runs (token-burning, requires --confirm)
./orchestration/test/integration/initialize-project/scripts/run-fixture.sh mini-monorepo --confirm
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

## Code Graph Bootstrap (First Run)

On the very first run, the workflow invokes `scripts/setup-code-graph.sh` to install and invoke `code-review-graph`. The script resolves the tool using this priority order:

1. `code-review-graph` already on PATH — used directly.
2. `uvx` available — runs `uvx code-review-graph` without a persistent install.
3. `uv` available (but no uvx) — installs via `uv tool install code-review-graph`.
4. **Bootstrap**: if none of the above exist, the script downloads and installs `uv` automatically via the official installer (`curl -LsSf https://astral.sh/uv/install.sh | sh`), then uses `uvx`. This requires `curl` and outbound access to `astral.sh`. The installer places a single static binary in `~/.local/bin`; no system Python or sudo is needed.
5. `pipx` — installs the package persistently.
6. Python 3.10+ with pip — installs with `pip install --user`.

When you see `[code-graph] bootstrapping uv (single-binary Python tool runner)` in the output, step 4 is running. This is a one-time operation; subsequent runs find `uvx` already on PATH.

After installation, `setup-code-graph.sh` writes `<projectPath>/.code-review-graph/launcher.json`. The TypeScript layer reads this file on subsequent calls so it never needs to resolve the binary again from scratch.

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
# Increase the wall-clock timeout
./qubika-agentic-framework/scripts/initialize-project.sh --timeout 5400

# Or fall back to the fast (Haiku) tier
MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh
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

## Projects with existing Claude configuration

If your project already has a `CLAUDE.md` at the repository root or a
`.claude/CLAUDE.md` from a previous setup, `initialize-project` will detect
this during preflight and emit non-blocking warnings. Initialization will
continue, but you should understand how Claude Code loads these files before
proceeding.

### How Claude Code loads CLAUDE.md

Claude Code loads configuration files in this order, concatenating their
contents into the system context:

1. `./CLAUDE.md` — project root (user-maintained)
2. `./.claude/CLAUDE.md` — framework-generated (this framework writes here)

When both exist, **both are loaded**. Conflicting instructions (for example,
two different "tech stack" sections) can produce inconsistent agent behavior.

### What initialize-project does

- **Does NOT** touch `./CLAUDE.md` at the project root.
- **DOES** write `./.claude/CLAUDE.md` in Phase 4, overwriting any prior file at that path.
- **Does NOT** auto-merge content. Merging is a manual step.

### Recommended workflow

1. Before running `initialize-project`, back up any existing `./.claude/CLAUDE.md`:
   ```bash
   cp .claude/CLAUDE.md .claude/CLAUDE.md.bak
   ```
2. Run `initialize-project` as normal. Expect two warnings if both files exist; they are informational and do not block the run.
3. After completion, diff the generated `./.claude/CLAUDE.md` against your backup and reconcile any custom content you want to keep.
4. Decide which file is the **source of truth** for each concern:
   - Framework conventions, tech stack, agent/skill wiring → `./.claude/CLAUDE.md` (framework-owned).
   - Project-specific rules, team conventions, onboarding notes → `./CLAUDE.md` (user-owned).
5. Remove duplicated sections from `./CLAUDE.md` so each rule lives in exactly one file.

### Out of scope

- Automatic merging of `CLAUDE.md` files.
- Automatic backup creation (the framework does not copy your files).
- Conflict detection for `.claude/skills/` or `.claude/agents/` directories.

---

**See Also**: [Architecture](../architecture/ARCHITECTURE.md), [Orchestration](../architecture/ORCHESTRATION.md)
