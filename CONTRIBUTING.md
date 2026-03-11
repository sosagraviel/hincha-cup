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

- **Claude Code** installed ([Get it here](https://claude.ai/code))
- **Git** for version control
- **Bash** (macOS/Linux) or WSL (Windows)

### Setup Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/your-username/ai-agentic-framework.git
cd ai-agentic-framework

# 2. Bootstrap the framework
cd ai-agentic-framework
./scripts/bootstrap-project.sh

# 3. Test the framework on a sample project
cd /path/to/test-project
claude
/initialize-project
```

---

## Contributing Skills

Skills are reusable knowledge modules that provide context to AI agents.

### Skill Structure

Each skill must have:

```markdown
---
name: mastering-your-framework
category: language-framework
stacks: [framework-name]
detection:
  files: [config.json]
  patterns:
    - "framework" in package.json dependencies
always_copy: false
---

# Mastering Your Framework

## Overview

Brief description of the framework and when to use this skill.

## Core Concepts

### Concept 1

Explanation with code examples.

### Concept 2

Explanation with code examples.

## Best Practices

- Practice 1
- Practice 2

## Common Patterns

### Pattern 1

Code example and explanation.

## Testing

How to test code using this framework.

---

## Further Reading

- [Official Docs](https://framework.dev)
```

### Adding a New Skill

**Step 1**: Create skill file

```bash
# Skills are organized by category
mkdir -p ai-agentic-framework/skills/050-language-frameworks/your-framework
cd ai-agentic-framework/skills/050-language-frameworks/your-framework
touch SKILL.md
```

**Step 2**: Write the skill content (see structure above)

**Step 3**: Add detection logic in frontmatter

```yaml
---
name: mastering-nextjs
category: language-framework
stacks: [nextjs, react, typescript]
detection:
  files: [package.json, next.config.js]
  patterns:
    - "next" in package.json dependencies
always_copy: false
---
```

**Step 4**: Test the skill

```bash
# Test on a project that uses your framework
cd /path/to/nextjs-project
/initialize-project

# Verify skill was copied
ls .claude/skills/mastering-nextjs
```

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
mkdir -p ai-agentic-framework/agents/templates
touch ai-agentic-framework/agents/templates/your-agent.md
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
/implement-ticket TEST-123
```

---

## Testing Your Changes

### Integration Tests

The framework includes integration tests for the full SDLC workflow:

```bash
# Run all integration tests
./ai-agentic-framework/tests/run-integration-tests.sh

# Run specific test
./ai-agentic-framework/tests/run-integration-tests.sh go-microservice
```

### Manual Testing

Test your changes on real projects:

```bash
# 1. Test initialization
cd /path/to/test-project
/initialize-project

# 2. Verify skill detection
cat .claude/project-context/SKILL.md

# 3. Test implementation
/implement-ticket TEST-123

# 4. Verify quality gates pass
/code-quality-check
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
# Run integration tests
./ai-agentic-framework/tests/run-integration-tests.sh

# Test on real projects
/initialize-project
/implement-ticket TEST-123
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

## Recognition

Contributors are recognized in:

- **README.md**: Acknowledgments section
- **Release Notes**: Feature attribution
- **Contributors Page**: GitHub contributors graph

Thank you for contributing to the AI Agentic Framework! 🎉

---

## Further Reading

- [Architecture](./docs/ARCHITECTURE.md) - How the framework works
- [API Reference](./docs/API_REFERENCE.md) - Skills, agents, and commands
- [Skill Catalog](./SKILL_CATALOG.md) - Available skills with detection logic
