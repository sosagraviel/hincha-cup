# Contributing

Thank you for your interest in contributing to the AI Agentic Framework! This guide will help you get started.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Contributing Skills](#contributing-skills)
4. [Contributing Agents](#contributing-agents)
5. [Testing Your Changes](#testing-your-changes)
6. [Submitting Changes](#submitting-changes)
7. [Code Style Guidelines](#code-style-guidelines)

---

## Getting Started

### What Can You Contribute?

- **Skills**: Reusable knowledge modules for languages, frameworks, or tools
- **Agents**: Specialized AI assistants for specific tasks
- **Documentation**: Improvements to guides, examples, or API references
- **Bug Fixes**: Fixes for issues in existing skills, agents, or utilities
- **Tests**: Integration tests for new or existing features

### Before You Start

1. **Search existing issues** to see if someone else is already working on it
2. **Open an issue** to discuss major changes before implementing
3. **Read the documentation** to understand the framework architecture

---

## Development Setup

### Prerequisites

- **Node.js** v20+ (minimum), v22 recommended - for framework dependencies
- **Git** for version control
- **Bash** (macOS/Linux) or WSL (Windows)

> **Note:** The framework uses a local installation of Claude CLI (v2.1+) located at `orchestration/node_modules/.bin/claude`. This ensures all developers use the same version with `--agent` flag support. You do NOT need to install Claude CLI globally. See [docs/CLAUDE_CLI_BUNDLING.md](../reference/CLAUDE_CLI_BUNDLING.md) for details.

### Setup Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/qubika-agentic-framework.git
cd qubika-agentic-framework

# 2. Install framework dependencies (includes Claude CLI v2.1+)
cd orchestration
npm install
cd ..

# 3. Test the framework on a sample project
cd /path/to/test-project
git clone https://github.com/your-username/qubika-agentic-framework.git qubika-agentic-framework
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Contributing Skills

Skills are reusable knowledge modules that provide context to AI agents. When you add a skill to the framework, users automatically receive it during sync if their project stack matches.

> 📖 **Detailed Guide**: See [docs/ADDING_SKILLS.md](../guides/ADDING_SKILLS.md) for complete documentation

### Skill Structure

Each skill must have a `SKILL.md` file with this recommended structure:

```markdown
---
name: mastering-your-framework
description: Brief one-line description
version: 1.0.0
category: 050-language-frameworks
applies_to: [typescript, javascript]
---

# Mastering Your Framework

## Purpose

Clear description of what this skill provides and when to use it.

## Prerequisites

- List any dependencies
- Required tools or configurations
- Minimum framework version

## Core Concepts

### Concept 1

Explanation with code examples.

### Concept 2

Explanation with code examples.

## Best Practices

- Practice 1 with rationale
- Practice 2 with rationale

## Common Patterns

### Pattern 1

```typescript
// Code example with explanation
```

## Testing

How to test code using this framework.

## References

- [Official Docs](https://framework.dev)
- Related skills
```

### Adding a New Skill (Step-by-Step)

**Step 1**: Create the skill directory and files

```bash
# Skills are organized by category
mkdir -p skills/050-language-frameworks/nextjs-patterns
cd skills/050-language-frameworks/nextjs-patterns
touch SKILL.md
```

**Step 2**: Write comprehensive skill content

Follow the structure above and include:
- Clear explanations of concepts
- Real code examples
- Best practices with reasoning
- Common pitfalls to avoid

**Step 3**: Register the skill in the skill registry

Edit `utils/skill-registry.js` to add your skill to the appropriate location:

```javascript
// For framework-specific skills
const SKILL_REGISTRY = {
  implementation: {
    languages: {
      typescript: {
        core: ['mastering-typescript'],
        frontend: {
          react: ['react-frontend', 'atomic-design-react'],
          nextjs: ['nextjs-patterns'], // ← Add here
        },
      },
    },
  },
};
```

**Common registry locations:**

```javascript
// Language core skills
python: {
  core: ['mastering-python-skill', 'your-skill'], // ← Here
}

// Testing framework skills
testing: {
  unit: {
    jest: ['jest-coverage-automation', 'your-skill'], // ← Here
  },
}

// Infrastructure skills
infrastructure: {
  cloud: {
    aws: ['mastering-aws-cli', 'your-skill'], // ← Here
  },
}
```

**Step 4**: Test on a matching project

```bash
# Test sync on a project that should receive this skill
./scripts/sync-framework-resources.sh ~/test-nextjs-project

# Verify skill was detected and added
ls ~/test-nextjs-project/.claude/skills/050-language-frameworks/nextjs-patterns

# Check that relevant agents include the skill
cat ~/test-nextjs-project/.claude/agents/implementer-typescript.md | grep nextjs-patterns
```

**Step 5**: Commit your changes

```bash
git add utils/skill-registry.js skills/050-language-frameworks/nextjs-patterns/
git commit -m "feat: add nextjs-patterns skill for Next.js projects"
```

### How Skills Are Distributed

Once you add a skill to the registry:

1. **Users pull framework updates**: `git pull` in their framework directory
2. **Users run sync**: `./scripts/sync-framework-resources.sh ~/their-project`
3. **Sync detects new skills**: Based on the project's stack profile
4. **Skills are auto-added**: If the stack matches the skill's registry location
5. **Agents are regenerated**: If they use the new skill

Example sync output users will see:

```
Step 5.5: Detecting new skills from registry...
  Found 1 new skill(s) in registry based on stack profile
  ✓ New skills discovered: 1
  ✓ New skills added:      1 (nextjs-patterns)

  Checking for affected agents...
  ⚠️  1 agent(s) will be regenerated due to new skills
```

### Skill Naming Conventions

Follow these conventions when naming skills:

✅ **Good Examples:**
- `react-frontend` - lowercase with hyphens
- `mastering-python-skill` - descriptive and includes tool name
- `jest-coverage-automation` - clear purpose
- `developing-with-docker` - action-oriented

❌ **Bad Examples:**
- `reactSkill` - don't use camelCase
- `r` - too short, not descriptive
- `react_frontend` - use hyphens, not underscores
- `the-ultimate-react-guide` - too long and generic

**Rules:**
- Use lowercase with hyphens (kebab-case)
- Be descriptive (2-4 words)
- Include framework/tool name
- Use "mastering" prefix for comprehensive skills
- Keep it concise and specific

### Skill Categories

| Category | Directory | Examples |
|----------|-----------|----------|
| Foundation | `010-foundation` | `initialize-project`, `project-context` |
| Development Workflow | `020-development-workflow` | `implement-ticket`, `create-sdd-ticket` |
| Quality Assurance | `030-quality-assurance` | `code-quality-check`, `security-review` |
| Integrations | `040-integrations` | `jira`, `fetch-ticket-context` |
| Language Frameworks | `050-language-frameworks` | `mastering-typescript`, `react-frontend` |
| Documentation | `060-documentation` | `design-doc-mermaid` |
| Infrastructure | `070-infrastructure` | `developing-with-docker` |
| Cloud Platforms | `080-cloud-platforms` | `mastering-aws-cdk`, `using-firebase` |

---

## Contributing Agents

Agents are AI assistants specialized for specific tasks.

### Agent Structure

```markdown
# Agent: Your Agent Name

## Role

Brief description of what this agent does.

## Skills

- skill-1
- skill-2
- skill-3

## Context

Additional context for this agent's task.

## Instructions

Step-by-step instructions for the agent to follow.

## Output Format

Expected output format (markdown, JSON, code, etc.).
```

### Adding a New Agent

**Step 1**: Create agent template

```bash
mkdir -p qubika-agentic-framework/agents/templates
touch qubika-agentic-framework/agents/templates/your-agent.md
```

**Step 2**: Define agent role and skills

```markdown
# Agent: Test Generator

## Role

Generate comprehensive unit and integration tests for code implementations.

## Skills

- project-context
- mastering-{{PRIMARY_LANGUAGE}}
- {{TEST_FRAMEWORK}}-patterns

## Instructions

1. Analyze the implementation code
2. Identify test scenarios (happy path, edge cases, errors)
3. Generate unit tests with 80%+ coverage
4. Generate integration tests for API endpoints
5. Ensure all tests follow project conventions
```

**Step 3**: Test the agent

```bash
# Agents are automatically generated during initialization
# Test by running implement-ticket which uses agents
/implement-ticket TEST-123    # Claude Code
$implement-ticket TEST-123    # Codex CLI
```

---

## Testing Your Changes

### Unit + Integration Tests

All tests live under `orchestration/test/`. The integration fixtures simulate three realistic project shapes so the framework can be exercised end-to-end without paying for a tokenless dry-run.

```bash
# Unit tests (offline, no LLM calls, ~10s)
pnpm --filter orchestration test:unit

# Integration tests (live Claude CLI required)
pnpm --filter orchestration test:integration
```

#### End-to-end integration fixtures

Three fixture projects live under `orchestration/test/integration/initialize-project/projects/`:

| Fixture | Shape | Stack |
|---|---|---|
| `mini-monorepo` | Single-repo monorepo | NestJS + React + Postgres + Keycloak |
| `mini-microservices` | Multi-language services | Go + .NET + Python + Node + protobuf |
| `mini-serverless` | Cloud-functions monorepo | Firebase + GCP Cloud Functions + TS/JS/Python |

Each fixture ships with:
- A `qubika-agentic-framework` symlink pointing back to the framework repo so the standard `./qubika-agentic-framework/scripts/initialize-project.sh` entry point works.
- A `.fixture-meta.json` declaring expected services, languages, and required artefact paths.

Run a fixture end-to-end:

```bash
# Dry-run — prints cost projection (~30K Haiku tokens, ~5-10 min) and exits
./orchestration/test/integration/initialize-project/scripts/run-fixture.sh mini-monorepo

# Actually execute — pass --confirm to spend tokens
./orchestration/test/integration/initialize-project/scripts/run-fixture.sh mini-monorepo --confirm

# Clean a fixture's run artefacts before re-running
./orchestration/test/integration/initialize-project/scripts/clean-fixture.sh mini-monorepo
```

The runner sets `MODEL_TIER=fast` (Haiku family) and `PROJECT_PATH` so the framework treats the fixture as the target. Generated artefacts land in `.claude/`, `docs/llm-wiki/`, and per-run debug bundles under `.claude-temp/initialize-project/debug/runs/<runId>/`.

When inspecting a finished run:

```bash
# Open the HTML debug index for the latest run
open .claude-temp/initialize-project/debug/runs/$(ls -t .claude-temp/initialize-project/debug/runs/ | head -1)/index.html

# Inspect the generated CLAUDE.md
cat .claude/CLAUDE.md

# Inspect the wiki services
ls docs/llm-wiki/wiki/services/
```

A repo-wide sanity test (`test/unit/integration-fixtures/sanity.test.ts`) refuses to pass if a fixture contains committed run artefacts. Always run `clean-fixture.sh` before committing.

### Manual Testing

Test your changes on real projects:

```bash
# 1. Test initialization
cd /path/to/test-project
./qubika-agentic-framework/scripts/initialize-project.sh
# Or: ./qubika-agentic-framework/scripts/initialize-project.sh --provider codex

# 2. Verify skill detection
cat .claude/project-context/SKILL.md   # or .codex/project-context/SKILL.md

# 3. Test implementation
/implement-ticket TEST-123    # Claude Code
$implement-ticket TEST-123    # Codex CLI

# 4. Quality gates run inside /implement-ticket; re-run project scripts manually if needed
npm run lint:fix
npx tsc --noEmit
```

---

## Submitting Changes

### Pull Request Process

1. **Create a feature branch**

```bash
git checkout -b feature/add-vue-skill
```

2. **Make your changes**

- Add/modify skills or agents
- Update documentation if needed
- Add tests for new functionality

3. **Test thoroughly**

```bash
# Unit tests
pnpm --filter orchestration test:unit

# Integration tests (requires live Claude CLI)
pnpm --filter orchestration test:integration

# Test on real projects
./qubika-agentic-framework/scripts/initialize-project.sh
/implement-ticket TEST-123    # Claude Code
$implement-ticket TEST-123    # Codex CLI
```

4. **Commit with clear messages**

```bash
git add .
git commit -m "feat: add Vue 3 frontend skill with Composition API patterns"
```

5. **Push and create PR**

```bash
git push origin feature/add-vue-skill
# Create PR on GitHub
```

### Pull Request Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] New skill
- [ ] New agent
- [ ] Bug fix
- [ ] Documentation update
- [ ] Test improvement

## Testing

- [ ] Tested on 2+ real projects
- [ ] Integration tests pass
- [ ] Documentation updated

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No breaking changes (or documented if unavoidable)
```

---

## Code Style Guidelines

### Markdown

- Use **ATX-style headings** (`#`, `##`, not underlines)
- **One sentence per line** (easier diffs)
- **Code blocks** with language identifiers
- **Tables** aligned for readability

### Bash Scripts

```bash
# Use shellcheck for validation
shellcheck script.sh

# Follow Google Shell Style Guide
# - Use lowercase for variables
# - Quote variables
# - Check exit codes
```

### JSON

```json
{
  "consistent": "2-space indentation",
  "sorted": "keys alphabetically",
  "validated": "against JSON Schema"
}
```

---

## Getting Help

### Questions?

- **Documentation**: Check [docs/](./docs/) first
- **Issues**: Open a GitHub issue for bugs or questions
- **Discussions**: Use GitHub Discussions for general questions

### Reporting Bugs

Include:

1. **Description**: What went wrong?
2. **Steps to Reproduce**: How can we reproduce it?
3. **Expected Behavior**: What should happen?
4. **Actual Behavior**: What actually happened?
5. **Environment**: OS, Claude Code version, project type
6. **Logs**: Relevant error messages or logs

---

## Extending the Language Registry

The `/initialize-project` workflow runs deterministic post-fills driven by `orchestration/src/services/framework/language-config/`. Adding a new external service / auth library / event-queue library / framework / language / manifest kind takes one or two files — never an analyzer-prompt edit.

### Where each token lives

| Category | File | Field |
|---|---|---|
| External-service SDK (Stripe, Sentry, …) | `languages/<lang>.ts` | `toolTokens.externalServiceSdks[]` |
| Auth library (Passport, NextAuth, …) | `languages/<lang>.ts` | `toolTokens.authLibraries[]` |
| Event-queue library (BullMQ, Kafka, …) | `languages/<lang>.ts` | `toolTokens.eventQueueLibraries[]` |
| Linter / formatter / type-checker / test-runner / common framework / database | `languages/<lang>.ts` | `toolTokens.*` |
| Manifest kind for service discovery | `languages/<lang>.ts` | `manifests[]` |
| Lock file → package manager mapping | `languages/<lang>.ts` | `lockFiles[]` |
| Runtime-version pin file | `languages/<lang>.ts` | `runtimeVersionFiles[]` |
| New language family | new `languages/<key>.ts` + one import line in `languages/index.ts` |

### Worked example — add SendGrid for Python

Open `orchestration/src/services/framework/language-config/languages/python.ts` and add one line to `externalServiceSdks`:

```ts
{ pkg: 'sendgrid', vendor: 'SendGrid', purpose: 'transactional email' },
```

That's it. The composer-derivation library picks it up at `/initialize-project` time, the composer view surfaces it under `architecture-narrative.external_services[]`, the synthesizer renders it into the architectural narrative, and the LLM wiki notes the integration — without any prompt edits or analyzer changes. Adding a new manifest kind (e.g. `BUILD.bazel`) automatically widens the service-completeness validator's discovery surface in the same way.

---

## Recognition

Contributors are recognized in:

- **README.md**: Acknowledgments section
- **Release Notes**: Feature attribution
- **Contributors Page**: GitHub contributors graph

Thank you for contributing to the AI Agentic Framework! 🎉

---

## Further Reading

- [Architecture](../architecture/ARCHITECTURE.md) - How the framework works
- [Adding Skills](../guides/ADDING_SKILLS.md) - Complete guide to adding and distributing skills
- [API Reference](../reference/API_REFERENCE.md) - Skills, agents, and commands
- [Skill Catalog](../../SKILL_CATALOG.md) - Available skills with detection logic
