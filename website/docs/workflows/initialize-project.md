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
cd orchestration

# Initialize a project
pnpm initialize -- \
  -p /path/to/your/project \
  -f /path/to/framework

# Result: .claude/ directory created with full configuration
```

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
- Commands from `commands/` → `.claude/commands/`

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

```bash
# Required flags
-p, --project-path <path>      # Path to project (absolute)
-f, --framework-path <path>    # Path to framework (absolute)

# Optional flags
--resume                       # Resume from last completed phase
--model-tier <tier>           # Model tier (standard | fast | advanced)
--skip-validation             # Skip Phase 6 validation
```

## Usage Examples

### Example 1: Initialize TypeScript Project

```bash
cd orchestration
pnpm initialize -- \
  -p ~/projects/my-app \
  -f ~/framework

# Detects: TypeScript, React, pnpm, Vitest
# Includes: typescript-development, react-development, testing skills
```

### Example 2: Initialize Python Project

```bash
pnpm initialize -- \
  -p ~/projects/python-api \
  -f ~/framework

# Detects: Python, FastAPI, Poetry, Pytest
# Includes: python-development, fastapi-development, testing skills
```

### Example 3: Resume After Interruption

```bash
# If Phase 3 was interrupted
pnpm initialize -- \
  -p ~/projects/my-app \
  -f ~/framework \
  --resume

# Resumes from Phase 4 (skips Phases 1-3)
```

### Example 4: Use Advanced Models

```bash
pnpm initialize -- \
  -p ~/projects/complex-app \
  -f ~/framework \
  --model-tier advanced

# Uses Opus 4.6 for all phases (highest quality)
```

## Stack Support

**Automatically Detected**:
- **Languages**: TypeScript, JavaScript, Python, Go, Java, Rust, Ruby, PHP, C#, Elixir
- **Frameworks**: React, Vue, Angular, NestJS, Django, FastAPI, Flask, Spring Boot, Gin, Phoenix
- **Build Tools**: Vite, Webpack, npm, Yarn, pnpm, Poetry, Go modules, Gradle, Maven
- **Test Frameworks**: Jest, Vitest, Pytest, Go testing, JUnit, ExUnit, RSpec
- **Monorepos**: Nx, Lerna, Turborepo, pnpm workspaces, Yarn workspaces

**No configuration required** — detection is fully automatic.

## Troubleshooting

### Error: "Project path does not exist"

**Solution**: Ensure project path is absolute and exists

```bash
# Check path
ls -la /path/to/project

# Use absolute path
pnpm initialize -- -p $(pwd)/my-project -f $(pwd)/framework
```

### Error: "Framework path does not exist"

**Solution**: Clone framework first

```bash
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
pnpm initialize -- -p /path/to/project -f $(pwd)/qubika-agentic-framework
```

### Error: "Phase 1 analyzer timeout"

**Solution**: Large codebases may need more time

```bash
# Use fast tier for Phase 1 analyzers
pnpm initialize -- \
  -p /path/to/large-project \
  -f /path/to/framework \
  --model-tier fast
```

### Error: "Validation failed"

**Solution**: Check validation errors in output

```bash
# Skip validation to see generated files
pnpm initialize -- \
  -p /path/to/project \
  -f /path/to/framework \
  --skip-validation

# Manually inspect .claude/ directory
ls -la /path/to/project/.claude/
```

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
- Use `--model-tier fast` for Phase 1 analyzers (Haiku)
- Use `--model-tier advanced` for critical projects (Opus)

## Best Practices

### 1. Run Once Per Project

```bash
# Initial setup
pnpm initialize -- -p ~/projects/my-app -f ~/framework

# Framework updates: re-run to sync new skills/agents
pnpm initialize -- -p ~/projects/my-app -f ~/framework
```

### 2. Commit .claude/ Directory

```bash
# Add to version control
git add .claude/
git commit -m "Add AI framework configuration"

# Team members get configuration automatically
git pull
```

### 3. Update After Major Changes

```bash
# After adding new tech stack
pnpm initialize -- -p ~/projects/my-app -f ~/framework

# New skills/agents will be synced
```

### 4. Review Generated Files

```bash
# Inspect project-context skill
cat .claude/skills/project-context/SKILL.md

# Verify CLAUDE.md
cat .claude/CLAUDE.md
```

## Next Steps

After initialization:

1. **Review** generated `.claude/` configuration
2. **Customize** `CLAUDE.md` with project-specific notes (optional)
3. **Start using** the framework:
   - [Implement Ticket](./implement-ticket.md) - Implement features
   - [Create SDD Ticket](./create-sdd-ticket.md) - Generate tickets with the `create-sdd-ticket` skill

## See Also

- [Implement Ticket](./implement-ticket.md) - Feature implementation workflow
- [Create SDD Ticket](./create-sdd-ticket.md) - Ticket generation workflow for the `create-sdd-ticket` skill
- [Project Structure Reference](/docs/reference/project-structure.md) - `.claude/` directory structure
- [Skills Catalog](/docs/reference/skills-catalog.md) - Available skills
