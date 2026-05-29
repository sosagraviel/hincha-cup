---
sidebar_position: 1
title: Initialize Project
description: Automated project initialization with codebase analysis and AI configuration
---

# Initialize Project

Automated project initialization that analyzes your codebase and generates AI configuration via a 6-phase workflow.

## Overview

The initialize project workflow:
1. **Analyzes** your codebase structure, tech stack, patterns, and context
2. **Generates** AI-optimized project configuration
3. **Creates** `.claude/` directory with skills, agents, and commands
4. **Validates** all configuration for correctness

**Duration**: 5-10 minutes  
**Output**: Production-ready `.claude/` configuration

## Quick Start

```bash
# From your project root, clone the framework
cd your-project-directory
git clone https://github.com/thisisqubika/qubika-agentic-framework.git

# Run automated initialization (auto-detects provider)
./qubika-agentic-framework/scripts/initialize-project.sh

# Or pick a provider explicitly
./qubika-agentic-framework/scripts/initialize-project.sh --provider claude
./qubika-agentic-framework/scripts/initialize-project.sh --provider codex

# Result: .claude/ (or .codex/) directory created with full configuration
```

The script installs dependencies, builds the TypeScript orchestration, and runs all six phases. Project and framework paths are inferred from the script's location — no flags required for the happy path. See [Installation Guide](/docs/getting-started/installation) for prerequisites.

## Multi-Repository Setup

Use this setup when a product is split across **two or more Git repositories** that are developed together (for example, one repo for the backend and another for the frontend). QAF will be initialized once at a shared parent folder so it understands all the repositories as a single product. This enables **traversal tickets** — a single ticket that touches more than one repo, such as adding a field to the API and rendering it in the UI.

If your project lives in a single repository, use the [Quick Start](#quick-start) above instead.

### Folder layout

You create one **parent folder** that holds the related repositories side by side, plus the framework. The parent folder does **not** need to be a Git repository — it is just a workspace.

```
my-product/                          ← parent folder (you create this)
├── app-backend/                     ← cloned repo #1
├── app-frontend/                    ← cloned repo #2
└── qubika-agentic-framework/        ← cloned framework
```

After initialization, a single `.claude/` (or `.codex/`) directory will live next to those folders, and it will be aware of every repository.

### Step-by-step

#### 1. Create the parent folder

Pick any name you like (here we use `my-product`):

```bash
mkdir my-product
cd my-product
```

#### 2. Clone each related repository

From inside the parent folder, clone every repository that belongs to the product:

```bash
git clone https://github.com/your-org/app-backend.git
git clone https://github.com/your-org/app-frontend.git
```

#### 3. Clone the framework

Still inside the parent folder, clone QAF:

```bash
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
```

Your folder should now match the layout shown above.

#### 4. Run initialization from the parent folder

From the parent folder, run the initialization script. Replace `<provider>` with `claude` or `codex`:

```bash
./qubika-agentic-framework/scripts/initialize-project.sh --provider <provider>
```

Examples:

```bash
# Claude Code
./qubika-agentic-framework/scripts/initialize-project.sh --provider claude

# Codex CLI
./qubika-agentic-framework/scripts/initialize-project.sh --provider codex
```

The script will:
- Detect that the parent folder contains multiple repositories
- Analyze each repository's language, framework, and patterns
- Generate one `.claude/` (or `.codex/`) configuration at the parent folder, aware of every repo

#### 5. Verify

When the script finishes, the generated config sits at the parent folder:

```bash
ls .claude/
# CLAUDE.md  agents/  framework-config.json  skills/
```

Open `framework-config.json` and confirm that each repository appears in the discovered services.

### Tracking the parent configuration (optional)

The parent folder itself is **not** a Git repository, so the generated `.claude/` (or `.codex/`) is not tracked anywhere by default. If you want to share the multi-repo aware configuration with your team — instead of every developer regenerating it locally — create a dedicated GitHub repository for it.

#### 1. Create an empty GitHub repository

For example, `my-product-qaf-config` on your organization. Do **not** initialize it with a README.

#### 2. Initialize Git inside the parent folder

From the parent folder:

```bash
git init
```

#### 3. Ignore the cloned repos and the framework

The parent repo should only track the QAF-generated files — not the source repositories or the framework itself. Add a `.gitignore`:

```gitignore
# Cloned product repositories — each has its own GitHub repo
app-backend/
app-frontend/

# The framework — cloned per developer
qubika-agentic-framework/

# Local QAF temp files
.claude-temp/
.codex-temp/
.claude-backups/
.codex-backups/
```

#### 4. Commit and push the generated config

```bash
git add .gitignore .claude/      # or .codex/ when using Codex
git commit -m "Add multi-repo QAF configuration"
git remote add origin git@github.com:your-org/my-product-qaf-config.git
git branch -M main
git push -u origin main
```

#### 5. Teammates clone the config alongside the product repos

Each teammate sets up their parent folder once, then pulls updates as the config evolves:

```bash
mkdir my-product
cd my-product
git clone git@github.com:your-org/my-product-qaf-config.git .   # config + .gitignore
git clone https://github.com/your-org/app-backend.git
git clone https://github.com/your-org/app-frontend.git
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
```

After that, anyone re-running initialization can `git commit && git push` updates from the parent folder, and the rest of the team gets them with `git pull`.

### Implementing a traversal ticket

Once initialization is complete, run QAF workflows from the parent folder. They will reason about the whole product.

Example — a ticket that adds a "user avatar" field to the API and renders it on the frontend:

```bash
# from inside my-product/

# Claude Code
/implement-ticket --from-jira PROJ-123

# Codex CLI
$implement-ticket --from-jira PROJ-123
```

QAF will plan and apply the changes in `app-backend/`, plan and apply the matching changes in `app-frontend/`, and open one pull request per affected repository.

### Tips

- **Always run commands from the parent folder.** That is where the `.claude/` (or `.codex/`) lives.
- **Add a new repository later** by cloning it into the parent folder and re-running the initialization script.
- **Each developer sets up their own parent folder.** By default the parent is not versioned, so every team member creates it locally and clones the same repositories into it. To share the generated config across the team, see [Tracking the parent configuration](#tracking-the-parent-configuration-optional).
- Each repository keeps its own `.git`, branches, and pull requests exactly as before — QAF only coordinates across them.

### FAQ

#### What happens if a child repo already has its own `.claude/` (custom config or custom skills)?

Nothing breaks. The parent and child configurations are independent **and** the child config keeps contributing to your sessions thanks to how Claude Code loads context hierarchically.

**Independence.** Running initialization from the parent folder only writes to the parent's `.claude/` — it does **not** modify or delete an existing `.claude/` inside any child repo. Likewise, running QAF again later inside a child repo does not touch the parent's config. Whichever folder you launch the CLI from determines which config is the "primary" one for the session:

- Launched from the **parent folder** → the parent's `.claude/` drives the session.
- Launched from **inside a child repo** → only that child's `.claude/` is in scope; the parent config is invisible.

**What Claude Code sees when launched from `my-product/` (parent) folder:**

✅ **Loaded immediately at session start**

`CLAUDE.md` and `CLAUDE.local.md` files in the directory hierarchy *above* the working directory are loaded in full at launch. Since you launched from `my-product/`, that means:

- `my-product/.claude/CLAUDE.md` ✅ — loaded immediately
- `~/.claude/CLAUDE.md` (your personal global config) ✅ — loaded immediately
- Any managed policy `CLAUDE.md` (enterprise-wide) ✅ — loaded immediately

⏳ **Loaded on-demand (lazily)**

Files in subdirectories load on demand when Claude reads files in those directories. So `app-backend/.claude/CLAUDE.md` is **not** loaded at startup — it gets pulled in the moment Claude actually reads or touches a file inside `app-backend/`. At that point it is injected into context automatically.

So for your structure, **anything inside `app-backend/.claude/` — including custom skills under `app-backend/.claude/skills/` — will be discovered**, but only once Claude starts touching files in `app-backend/`. It mirrors the `CLAUDE.md` lazy-loading behavior exactly.

> The same hierarchical and lazy-loading model applies to Codex CLI with `AGENTS.md` and `.codex/` directories.

#### Do I need to delete the child repos' `.claude/` folders before running QAF at the parent?

No. Leave them in place. Each child can still be opened standalone (CLI launched from inside it), and the parent setup will simply add a new layer above them.

#### What if my child repos have very different stacks (e.g. Python backend + TypeScript frontend)?

That is the supported case. Phase 1 analyzers detect stack and patterns **per repository** (via the `by_service` map in `framework-config.json`). The generated parent config includes skills and agents for every detected stack — for example, `mastering-python` for `app-backend/` and `mastering-typescript` for `app-frontend/`.

#### Where do pull requests go for a traversal ticket?

Each repository keeps its own `.git` and its own remote. When `implement-ticket` runs from the parent folder and modifies files in `app-backend/` and `app-frontend/`, it creates a branch and a pull request **inside each affected repo** — not in the parent folder. You end up with one PR per touched repository.

#### Will re-running initialization at the parent overwrite child configs?

No. The parent initialization only writes to the parent folder's `.claude/` (or `.codex/`). Each child repo's own `.claude/` is left untouched.

#### Can I still commit a child repo's `.claude/` to that child repo's GitHub?

Yes. That is the standard single-repo flow and is fully independent from the multi-repo parent config. Many teams keep both: the per-repo `.claude/` for solo work inside that repo, and the parent `.claude/` for cross-repo tickets.

---

## Generated Structure

```
.claude/
├── CLAUDE.md                    # Quick reference guide
├── skills/                      # Tech-specific knowledge
│   ├── project-context/         # Deep project understanding
│   ├── typescript-development/  # TypeScript patterns
│   └── react-development/       # React patterns (if detected)
├── agents/                      # AI agents
│   ├── planner.md              # Implementation planning
│   ├── implementer.md          # Code implementation
│   └── reviewer.md             # Code review
├── commands/                    # Workflow automation
│   ├── initialize-project/     # This workflow
│   ├── implement-ticket/       # Feature implementation
│   └── create-sdd-ticket/      # Ticket generation
└── framework-config.json        # Configuration registry
```

## Workflow Phases

### Phase 1: Parallel Analysis (2-5 minutes)

**4 concurrent analyzers** examine your codebase:

#### 1. Structure Analyzer
- Directory tree layout
- File organization patterns
- Monorepo detection
- Module boundaries

#### 2. Stack Analyzer
- Languages (TypeScript, Python, Go, etc.)
- Frameworks (React, NestJS, Django, etc.)
- Package managers (pnpm, npm, pip, etc.)
- Dependencies analysis

#### 3. Pattern Analyzer
- Code patterns and conventions
- Test structure and framework
- Build and deployment patterns
- Naming conventions

#### 4. Context Analyzer
- README and documentation
- Architecture documentation
- Business domain
- Development practices

**Output**: `phase1-analysis.json`

### Phase 2: Consolidation (30-60 seconds)

Merges Phase 1 analyzer outputs into unified analysis.

**Output**: `phase2-consolidated.json`

### Phase 3: Synthesis (1-2 minutes)

Generates human-readable project understanding from consolidated analysis.

**Output**: `phase3-synthesis.md`

### Phase 4: File Writing (30-60 seconds)

**Creates**:
- `.claude/CLAUDE.md` - Quick reference for AI agents
- `.claude/skills/project-context/SKILL.md` - Deep project knowledge

**Contains**:
- Tech stack summary
- Key patterns and conventions
- Architecture overview
- Development workflows

### Phase 5: Resource Sync (1-2 minutes)

**Syncs** (based on detected stack):
- Skills from `skills.config.json` → `.claude/skills/`
- Agents from `agents/templates/` → `.claude/agents/`

**Updates**: `framework-config.json` with sync metadata

**Stack-Aware Selection**:
```typescript
// If TypeScript detected → includes typescript-development skill
// If React detected → includes react-development skill
// If Python detected → includes python-development skill
// If tests detected → includes testing skills
```

### Phase 6: Validation (30-60 seconds)

**Validates**:
- All SKILL.md files have valid frontmatter
- All agent files are properly formatted
- Commands have valid metadata
- No missing or broken references

**Output**: Validation report or errors

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

**State Management**: LangGraph StateGraph with typed annotations

**Resumability**: Each phase writes completion marker for `--resume` support

## Command Options

The script auto-detects project and framework paths from its own location, so no path flags are required.

```bash
# Optional flags
--provider <claude|codex>     # AI provider (auto-detected if omitted)
--start-phase <N>             # Start from phase N (1-6); skips earlier phases
--skip-gap-questions          # Skip Phase 2 gap analysis questions (full auto)
--timeout <seconds>           # Max execution time (default: 3600)
--clean                       # Remove .claude-temp/.codex-temp after completion
--ignore <path>               # Exclude an extra directory or relative path
                              # from analysis. Additive to .gitignore + the
                              # framework's built-in defaults. Two equivalent
                              # forms:
                              #   --ignore a --ignore b     (repeatable)
                              #   --ignore a,b,c            (comma-separated)
                              # Both can be mixed in the same command.
--help, -h                    # Show help
```

```bash
# Environment variables
MODEL_TIER=<tier>             # fast | standard (default) | advanced | openai | gemini
ANTHROPIC_API_KEY=<key>       # Required for Claude provider (or use claude auth login)
OPENAI_API_KEY=<key>          # Required for Codex provider (or use codex login)
GOOGLE_API_KEY=<key>          # Required for Gemini tier
```

## Usage Examples

### Example 1: Standard Initialization

```bash
cd ~/projects/my-app
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh

# Detects stack automatically (TypeScript, React, pnpm, Vitest, etc.)
# Includes matching skills (typescript-development, react-development, testing)
```

### Example 2: Initialize for Codex

```bash
./qubika-agentic-framework/scripts/initialize-project.sh --provider codex

# Generates .codex/ instead of .claude/
```

### Example 3: Resume After Interruption

```bash
# If Phase 3 was interrupted, resume from Phase 4
./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4
```

### Example 4: Use Advanced Models

```bash
MODEL_TIER=advanced ./qubika-agentic-framework/scripts/initialize-project.sh

# Uses the advanced tier (Opus) for all phases — highest quality
```

### Example 5: Fully Automated (CI/CD)

```bash
./qubika-agentic-framework/scripts/initialize-project.sh \
  --skip-gap-questions \
  --provider claude
```

### Example 5b: Exclude Test Fixtures or Sample Sub-Projects

Some repositories vendor sample applications or test fixtures alongside real
code (for example, integration-test scaffolds under `test/integration/`). By
default the analyzers will pick them up as real services and generate a wiki
page per fixture. Use `--ignore` to keep the analysis focused on production
code.

`--ignore` accepts two equivalent forms — pick whichever is easier to type:

```bash
# Repeatable form
./qubika-agentic-framework/scripts/initialize-project.sh \
  --ignore orchestration/test/integration/initialize-project/projects \
  --ignore website/build

# CSV form (comma-separated list of paths)
./qubika-agentic-framework/scripts/initialize-project.sh \
  --ignore orchestration/test/integration/initialize-project/projects,website/build

# Both forms can be mixed in the same command
./qubika-agentic-framework/scripts/initialize-project.sh \
  --ignore docs/legacy \
  --ignore orchestration/test/integration,website/build
```

The exclusions are additive: built-in framework defaults (`node_modules`,
`.git`, `dist`, etc.) and entries from your project's `.gitignore` remain in
effect. Absolute paths, parent-directory traversal (`..`), and glob characters
are rejected.

### Example 6: Fast Tier on a Real Project

Use `MODEL_TIER=fast` (Haiku) for the quickest, cheapest run when you want to validate the framework on a real project — large monorepos finish in 5–10 minutes for a few cents per run.

```bash
cd ~/projects/my-real-app
MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh \
  --provider claude \
  --skip-gap-questions

# Inspect the run
open .claude-temp/initialize-project/debug/runs/$(ls -t .claude-temp/initialize-project/debug/runs/ | head -1)/index.html
cat .claude/CLAUDE.md
ls docs/llm-wiki/wiki/services/
```

This is the same configuration the integration-fixture runner uses, so a successful fast-tier run on your project should produce an artefact tree comparable to the fixtures under `orchestration/test/integration/initialize-project/projects/mini-*`.

## Stack Support

**Automatically Detected**:
- **Languages**: TypeScript, JavaScript, Python, Go, Java, Rust, Ruby, PHP, C#, Elixir
- **Frameworks**: React, Vue, Angular, NestJS, Django, FastAPI, Flask, Spring Boot, Gin, Phoenix
- **Build Tools**: Vite, Webpack, npm, Yarn, pnpm, Poetry, Go modules, Gradle, Maven
- **Test Frameworks**: Jest, Vitest, Pytest, Go testing, JUnit, ExUnit, RSpec
- **Monorepos**: Nx, Lerna, Turborepo, pnpm workspaces, Yarn workspaces

**No configuration required** — detection is fully automatic.

## Troubleshooting

### Error: "Framework is not inside a project directory"

**Cause**: The framework must be cloned **inside** your project root, not at the same level.

**Solution**:

```bash
cd /path/to/your/project
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh
```

### Error: "node not found" or "npm not found"

**Solution**: Install Node.js v20+ from [nodejs.org](https://nodejs.org/).

### Error: Phase 1 analyzer timeout

**Solution**: Large codebases may need more time, or use the fast tier.

```bash
# Increase timeout (default: 3600s)
./qubika-agentic-framework/scripts/initialize-project.sh --timeout 5400

# Use the fast tier (Haiku models)
MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh
```

### Error: Phase failed midway

**Solution**: Re-run from the failing phase using `--start-phase`.

```bash
# Resume from phase 4
./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4

# Inspect previous phase outputs
ls .claude-temp/initialize-project/
```

### Issue: Test fixtures or sample apps show up as real services

If the generated wiki contains per-service pages for what are actually
integration-test fixtures, vendored sample applications, or other non-product
sub-projects, exclude them with `--ignore`. The flag is additive to
`.gitignore` and the framework's built-in defaults, and accepts either a
repeatable form or a comma-separated list:

```bash
# Single path
./qubika-agentic-framework/scripts/initialize-project.sh \
  --ignore orchestration/test/integration/initialize-project/projects

# Multiple paths, comma-separated
./qubika-agentic-framework/scripts/initialize-project.sh \
  --ignore orchestration/test/integration/projects,docs/legacy,website/build
```

After the run, regenerate the wiki and the Phase 1 analyzers will no longer
walk the excluded subtree.

## Performance

| Phase | Duration | Parallelism | Can Skip |
|-------|----------|-------------|----------|
| Phase 1 | 2-5 min | 4 analyzers | No |
| Phase 2 | 30-60s | Sequential | No |
| Phase 3 | 1-2 min | Sequential | No |
| Phase 4 | 30-60s | Sequential | No |
| Phase 5 | 1-2 min | Sequential | No |
| Phase 6 | 30-60s | Sequential | Yes (--skip-validation) |

**Total**: 5-10 minutes

**Cost Optimization**:
- Use `MODEL_TIER=fast` for quicker, cheaper runs (Haiku)
- Use `MODEL_TIER=advanced` for critical projects (Opus)

## Best Practices

### 1. Run Once Per Project

```bash
# Initial setup (full, AI-driven bootstrap — run once)
./qubika-agentic-framework/scripts/initialize-project.sh

# Framework updates: sync new skills/agents (fast, no re-analysis)
./qubika-agentic-framework/scripts/sync-framework-resources.sh
```

For routine framework updates, prefer the sync — see
[Updating the Framework](/docs/guides/updating-the-framework). Re-running
`initialize-project.sh` is only needed to switch providers, re-analyze the project, or
regenerate `CLAUDE.md`.

### 2. Commit the Generated Config

```bash
# Add to version control (single-repo setup)
git add .claude/   # or .codex/ when using Codex
git commit -m "Add AI framework configuration"

# Team members get configuration automatically
git pull
```

For [Multi-Repository Setup](#multi-repository-setup), the parent folder is not versioned — each developer recreates it locally.

### 3. Update After Major Changes

```bash
# After adding a new tech stack or repository (re-analyzes the project)
./qubika-agentic-framework/scripts/initialize-project.sh
```

For everything else — picking up new framework skills and agents — run
`sync-framework-resources.sh` instead. See [Updating the Framework](/docs/guides/updating-the-framework).

### 4. Review Generated Files

```bash
# Inspect project-context skill
cat .claude/skills/project-context/SKILL.md

# Verify CLAUDE.md
cat .claude/CLAUDE.md
```

## Next Steps

After initialization:

1. **Review** generated `.claude/` (or `.codex/`) configuration
2. **Customize** `CLAUDE.md` / `AGENTS.md` with project-specific notes (optional)
3. **Start using** the framework. Invocation differs per provider:

| Provider     | Invoke skill               | List skills |
| ------------ | -------------------------- | ----------- |
| Claude Code  | `/implement-ticket [args]` | Auto        |
| Codex CLI    | `$implement-ticket [args]` | `/skills`   |

   - [Implement Ticket](./implement-ticket.md) - Implement features
   - [Create SDD Ticket](./create-sdd-ticket.md) - Generate tickets

## See Also

- [Implement Ticket](./implement-ticket.md) - Feature implementation workflow
- [Create SDD Ticket](./create-sdd-ticket.md) - Ticket generation workflow
- [Project Structure Reference](/docs/reference/project-structure.md) - `.claude/` directory structure
- [Skills Catalog](/docs/reference/skills-catalog.md) - Available skills
