---
sidebar_position: 4
title: Project Structure
description: Understanding the .claude directory and generated framework files
---

# Project Structure

After running `/initialize-project`, the framework creates a `.claude/` directory containing all project-specific configuration, skills, and agents.

---

## The .claude Directory

### Directory Structure

```
.claude/
├── settings.json              # Framework configuration
├── CLAUDE.md                  # Quick reference guide (30-200 lines)
│
├── skills/                    # Stack-specific skills
│   ├── project-context/       # Your project's context
│   ├── mastering-typescript/  # TypeScript patterns
│   ├── react-frontend/        # React patterns
│   └── jest-coverage-automation/  # Jest testing
│
├── agents/                    # Custom AI agents
│   ├── planner.md            # Medium-risk planning
│   ├── implementer-typescript.md  # TypeScript implementation
│   ├── tester-unit-typescript.md  # TypeScript testing
│   └── security-reviewer-typescript.md  # Security review
│
└── commands/                  # Available slash commands
    ├── initialize-project.md
    ├── implement-ticket.md
    ├── fetch-ticket-context.md
    └── code-quality-check.md
```

---

## Generated Files Explained

### CLAUDE.md (Project Root)

**Purpose**: Quick reference guide for AI agents

**Location**: Root of project (`.claude/CLAUDE.md`)

**Contains**:
- Tech stack summary
- Project patterns and conventions
- Testing setup
- Common commands
- File organization

**Size**: 30-200 lines (intentionally concise)

**Updated**: Each time `/initialize-project` runs

**Example Structure**:
```markdown
# Project Name

## Tech Stack
- TypeScript 5.x with ESM
- React 18 with Vite
- Jest + React Testing Library

## Patterns
- Atomic Design for components
- Redux Toolkit for state
- Axios for API calls

## Testing
npm test           # Unit tests
npm run test:e2e   # E2E tests

## Key Conventions
- Components in src/components/
- Tests colocated: Component.test.tsx
- Coverage target: 80%
```

---

### settings.json

**Purpose**: Framework configuration and preferences

**Location**: `.claude/settings.json`

**Contains**:
- Model tier preferences
- Quality gate thresholds
- MCP configurations
- Workflow customizations

**Example**:
```json
{
  "modelTier": "standard",
  "qualityGates": {
    "coverageThreshold": 80,
    "skipVisualRegression": false
  },
  "mcpServers": {
    "jira": {
      "enabled": true,
      "url": "https://company.atlassian.net"
    }
  }
}
```

---

### project-context/SKILL.md

**Purpose**: Deep architectural knowledge of your project

**Location**: `.claude/skills/project-context/SKILL.md`

**Contains**:
- Architecture overview
- Module organization
- Data flows
- Integration points
- Conventions and patterns
- Testing strategies

**Size**: 50-800 lines (comprehensive, scales with complexity)

**Updated**: Each time initialization runs

**Example Structure**:
```markdown
# Project Context: E-Commerce Platform

## Architecture
- Monorepo with pnpm workspaces
- Frontend: React SPA
- Backend: NestJS REST API
- Database: PostgreSQL with TypeORM

## Modules
- auth/ - Authentication & authorization
- users/ - User management
- products/ - Product catalog
- orders/ - Order processing

## Data Flows
User Login → AuthService → JWT Token → Protected Routes

## Conventions
- Services use dependency injection
- DTOs for API validation
- Repository pattern for database
```

---

### Language Skills

**Purpose**: Language-specific patterns and best practices

**Location**: `.claude/skills/mastering-{language}/`

**Copied from**: Framework skill library (`skills/` in framework repo)

**Examples**:
- `mastering-typescript/` - TypeScript patterns
- `mastering-python-skill/` - Python patterns
- `mastering-go/` - Go idioms

**Updated**: Only when framework is updated (not on re-initialization)

---

### Framework Skills

**Purpose**: Framework-specific patterns

**Location**: `.claude/skills/{framework-name}/`

**Copied from**: Framework skill library

**Examples**:
- `react-frontend/` - React patterns
- `nestjs-patterns/` - NestJS patterns
- `django-patterns/` - Django patterns

**Updated**: Only when framework is updated

---

### Testing Skills

**Purpose**: Test framework patterns

**Location**: `.claude/skills/{test-framework}/`

**Examples**:
- `jest-coverage-automation/` - Jest patterns
- `playwright-e2e-automation/` - Playwright patterns
- `pytest-patterns/` - Pytest patterns

**Updated**: Only when framework is updated

---

### Agent Files

**Purpose**: AI agent definitions with skill mappings

**Location**: `.claude/agents/{agent-name}.md`

**Generated for**:
- Planner (always)
- Implementer per language (e.g., `implementer-typescript.md`)
- Tester per language (e.g., `tester-unit-typescript.md`)
- Security reviewer for primary language

**Example**: `implementer-typescript.md`
```markdown
---
name: implementer-typescript
description: TypeScript implementation specialist
model-tier: standard
---

You are a TypeScript implementation specialist.

## Skills
- project-context
- mastering-typescript
- react-frontend

## Instructions
Implement features following conventions in CLAUDE.md.
Output code changes as JSON.
```

**Updated**: Each time initialization runs (regenerated with current skills)

---

### Command Files

**Purpose**: Slash command definitions

**Location**: `.claude/commands/{command-name}.md`

**Examples**:
- `initialize-project.md`
- `implement-ticket.md`
- `code-quality-check.md`

**Updated**: Copied from framework during initialization

---

## Skill Selection Logic

The framework intelligently selects which skills to copy based on project detection.

### Language Detection

```
Detected: tsconfig.json
→ Copy: mastering-typescript

Detected: pyproject.toml
→ Copy: mastering-python-skill

Detected: go.mod
→ Copy: mastering-go
```

**Supports**: TypeScript, Python, Go, Java, Rust, Ruby, PHP, C#

---

### Framework Detection

```
Detected: react in package.json
→ Copy: react-frontend

Detected: @nestjs/core in package.json
→ Copy: nestjs-patterns

Detected: django in requirements.txt
→ Copy: django-patterns
```

**Supports**: 40+ frameworks across all languages

---

### Test Framework Detection

```
Detected: jest in package.json
→ Copy: jest-coverage-automation

Detected: playwright in package.json
→ Copy: playwright-e2e-automation

Detected: pytest in pyproject.toml
→ Copy: pytest-patterns
```

**Supports**: 10+ test frameworks

---

### Infrastructure Detection

```
Detected: Dockerfile
→ Copy: developing-with-docker

Detected: aws-cdk in package.json
→ Copy: mastering-aws-cdk
```

---

### Monorepo Handling

For monorepos, detection runs per workspace:

```
Detected: pnpm-workspace.yaml

Scan workspaces:
  packages/frontend/
    → Detect: TypeScript + React + Jest
    → Copy: mastering-typescript, react-frontend, jest-coverage-automation
  
  packages/backend/
    → Detect: TypeScript + NestJS
    → Copy: mastering-typescript, nestjs-patterns
  
  services/worker/
    → Detect: Python + FastAPI + Pytest
    → Copy: mastering-python-skill, fastapi-patterns, pytest-patterns
```

**Result**: Only skills relevant to detected technologies (10-20 instead of 50+)

---

## What to Commit

Understanding what should be tracked in version control.

### ✅ Should Commit

```
.claude/
├── settings.json              # ✅ Team configuration
├── CLAUDE.md                  # ✅ Project reference
├── skills/project-context/    # ✅ Project knowledge
└── agents/                    # ✅ Custom agents
```

**Why**: These files are project-specific and valuable for the team.

---

### ❌ Should NOT Commit

```
.claude/
├── skills/mastering-typescript/    # ❌ Framework skill
├── skills/react-frontend/          # ❌ Framework skill
└── commands/                       # ❌ Framework commands
```

**Why**: These are copied from the framework and can be regenerated.

---

### 🚫 Never Commit

```
.claude-temp/                  # 🚫 Runtime artifacts (gitignored)
├── tickets/
│   └── PROJ-123/
│       └── artifacts/         # Workflow artifacts
```

**Why**: Temporary runtime files, not needed in version control.

---

## Recommended .gitignore

```gitignore
# Framework-generated skills (regenerate with /initialize-project)
.claude/skills/mastering-*/
.claude/skills/*-frontend/
.claude/skills/*-patterns/
.claude/skills/*-automation/
.claude/skills/developing-with-*/
.claude/commands/

# Runtime artifacts (always temporary)
.claude-temp/
```

**Commit**:
```gitignore
# Keep project-specific configuration
!.claude/settings.json
!.claude/CLAUDE.md
!.claude/skills/project-context/
!.claude/agents/
```

---

## File Lifecycle

### During Initialization

1. **Analyze project**:
   - Scan for languages (tsconfig.json, pyproject.toml, etc.)
   - Scan for frameworks (package.json, requirements.txt)
   - Scan for test frameworks
   - Scan for infrastructure tools

2. **Generate CLAUDE.md**:
   - Extract tech stack
   - Document patterns
   - List commands

3. **Generate project-context**:
   - Analyze architecture
   - Document modules
   - Map data flows

4. **Copy relevant skills**:
   - Language skills for detected languages
   - Framework skills for detected frameworks
   - Testing skills for detected test tools

5. **Generate agents**:
   - Planner (always)
   - Implementer per language
   - Tester per language
   - Security reviewer (primary language)

6. **Copy commands**:
   - All framework commands

---

### During Updates

**When to re-run `/initialize-project`**:
- Added new language to project
- Added new framework
- Changed testing setup
- Major architecture changes
- Want to update project-context

**What gets updated**:
- ✅ CLAUDE.md regenerated
- ✅ project-context regenerated
- ✅ Agents regenerated
- ✅ New skills copied (if new tech detected)
- ❌ settings.json preserved (unless conflicts)

---

### During Workflows

**Runtime artifacts** created during `/implement-ticket`:

```
.claude-temp/tickets/PROJ-123/
├── artifacts/
│   ├── context.json           # Ticket context
│   ├── plan.json              # Implementation plan
│   ├── changes.json           # Code changes
│   ├── test-results.json      # Test results
│   └── screenshots/           # Visual verification
```

**Lifecycle**:
- Created during workflow execution
- Used for phase coordination
- Cleaned up after workflow completion
- Never committed to git

---

## Directory Size

Typical `.claude/` directory sizes:

| Project Type | CLAUDE.md | project-context | Total Skills | Total Size |
|--------------|-----------|-----------------|--------------|------------|
| Small SPA | 50 lines | 100 lines | 5 skills | ~200 KB |
| Medium Full-Stack | 100 lines | 300 lines | 10 skills | ~500 KB |
| Large Monorepo | 200 lines | 800 lines | 20 skills | ~1.5 MB |

**Note**: Framework skills are largest component. Consider gitignoring them.

---

## Best Practices

1. **Commit settings.json**: Share team configuration
2. **Commit CLAUDE.md**: Single source of truth for project
3. **Commit project-context**: Valuable project knowledge
4. **Commit agents**: Custom agent definitions
5. **Gitignore framework skills**: Regenerate with `/initialize-project`
6. **Gitignore .claude-temp**: Never commit runtime artifacts
7. **Re-run initialization**: After major tech stack changes
8. **Review generated files**: Verify accuracy after initialization

---

## Troubleshooting

### Missing Skills

```
❌ Error: Skill mastering-typescript not found

Solution: Run /initialize-project to copy skills
```

---

### Outdated project-context

```
⚠️ Warning: project-context may be outdated

Solution: Re-run /initialize-project to regenerate
```

---

### Wrong Skills Copied

```
Issue: Python skills copied but project is TypeScript-only

Cause: pyproject.toml exists for unrelated tool

Solution: 
1. Review detection logic in initialization output
2. Manually remove unwanted skills from .claude/skills/
3. Regenerate agents with /initialize-project
```

---

### Conflicts After Update

```
Issue: settings.json conflicts after re-initialization

Solution:
1. Back up current settings.json
2. Run /initialize-project
3. Merge custom settings back manually
```

---

## Further Reading

- [Commands Reference](./commands.md) - How commands use the structure
- [Skills Catalog](./skills-catalog.md) - Available skills
- [Agents Reference](./agents.md) - How agents are generated
- [Getting Started](../getting-started/quickstart.md) - Initial setup guide
