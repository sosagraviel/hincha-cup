# AI Development Framework

End-to-end AI-powered software development framework for automating ticket implementation across diverse tech stacks. The framework automatically detects your project's technology stack, configures appropriate skills and agents, and provides a complete workflow from specification-driven ticket creation to pull request submission.

**Version**: 1.0.0 | **Status**: Ready for Phase 1 Pilot

---

## Table of Contents

- [Quick Start](#quick-start)
- [Key Features](#key-features)
- [Directory Structure](#directory-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Support](#support)

---

## Quick Start

```bash
# 1. Bootstrap the framework in your project
cd your-project/ai-agentic-framework
./scripts/bootstrap-project.sh

# 2. Start Claude Code from project root
cd ..
claude code

# 3. Initialize your project (detects stack, copies skills, generates agents)
/initialize-project

# 4. Start implementing tickets
/implement-ticket PROJ-123
```

For detailed setup instructions, see [QUICKSTART.md](./QUICKSTART.md).

---

## Key Features

- **Automatic Project Initialization** - Detects tech stack and configures skills, agents, and MCP servers in 2 minutes
- **Specification-Driven Tickets** - Generates gap-free Jira tickets with INVEST criteria and BDD scenarios
- **End-to-End Implementation** - From ticket fetch to PR creation with 70-80% time savings
- **No-Stop Execution** - 4-layer error recovery (exponential backoff, model fallback, error classification, checkpointing)
- **Stack-Specific Agents** - TypeScript, Python, and framework-aware code generation
- **Multi-Task Parallel Development** - Git worktrees for isolated, concurrent ticket work
- **Docker Runtime** - Consistent execution environment with pre-installed MCP servers

---

## Directory Structure

```
ai-agentic-framework/
├── skills/                    # Reusable skills (Johnny Decimal organization)
│   ├── 010-foundation/        # Project initialization & context
│   ├── 020-development-workflow/  # Ticket implementation workflow
│   ├── 030-quality-assurance/ # Testing, security, PR creation
│   ├── 040-integrations/      # Jira, GitHub, Confluence
│   ├── 050-language-frameworks/   # TypeScript, Python, React
│   ├── 060-documentation/     # Documentation tools
│   ├── 070-infrastructure/    # Docker, DevOps
│   └── 080-cloud-platforms/   # AWS, GCP, Firebase
│
├── agents/templates/          # Agent templates with variable substitution
├── utils/                     # Stack detection & skill selection algorithms
├── docker/claude-runtime/     # Isolated Docker runtime environment
├── docs/                      # Extended documentation
├── examples/                  # Usage examples and walkthroughs
└── commands/                  # Task management commands
```

---

## Documentation

### Getting Started

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute setup guide |
| [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | Complete usage scenarios and workflows |
| [docs/PILOT_GUIDE.md](./docs/PILOT_GUIDE.md) | Pilot program onboarding |

### Architecture & Reference

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design and component layers |
| [docs/API_REFERENCE.md](./docs/API_REFERENCE.md) | Skills, agents, and utilities API |
| [SKILL_CATALOG.md](./SKILL_CATALOG.md) | All skills with detection logic |
| [SKILLS_AND_AGENTS_MAP.md](./SKILLS_AND_AGENTS_MAP.md) | Skills and agents relationship map |

### Utilities Documentation

| Document | Description |
|----------|-------------|
| [utils/STACK_DETECTION.md](./utils/STACK_DETECTION.md) | Tech stack detection algorithm |
| [utils/SKILL_SELECTION.md](./utils/SKILL_SELECTION.md) | Skill selection rules |
| [utils/AGENT_GENERATION.md](./utils/AGENT_GENERATION.md) | Agent template substitution |
| [utils/MCP_DETECTION.md](./utils/MCP_DETECTION.md) | MCP server auto-configuration |

### Quality & Security

| Document | Description |
|----------|-------------|
| [docs/SECURITY.md](./docs/SECURITY.md) | Security guidelines and OWASP compliance |
| [docs/WRITING_GOOD_TICKETS.md](./docs/WRITING_GOOD_TICKETS.md) | Ticket quality best practices |

### Docker Runtime

| Document | Description |
|----------|-------------|
| [docker/claude-runtime/README.md](./docker/claude-runtime/README.md) | Docker setup and usage guide |

### Examples

| Example | Description |
|---------|-------------|
| [examples/simple-feature.md](./examples/simple-feature.md) | Basic feature implementation |
| [examples/medium-feature.md](./examples/medium-feature.md) | Multi-file feature with tests |
| [examples/complex-feature.md](./examples/complex-feature.md) | Cross-module implementation |
| [examples/autonomous-overnight.md](./examples/autonomous-overnight.md) | Batch overnight execution |

---

## Contributing

### Adding Skills

1. Choose a category (010-080) based on skill type
2. Create `skills/{category}/{skill-name}/SKILL.md`
3. Update [SKILL_CATALOG.md](./SKILL_CATALOG.md) with detection logic
4. Test with `/initialize-project` on a relevant project

See [docs/SKILL_INTEGRATION_GUIDE.md](./docs/SKILL_INTEGRATION_GUIDE.md) for detailed instructions.

### Adding Agent Templates

1. Create `agents/templates/{name}.template.md`
2. Use variables: `{{stack}}`, `{{skills}}`, `{{commands}}`
3. Update [utils/AGENT_GENERATION.md](./utils/AGENT_GENERATION.md)

### Enhancing Stack Detection

1. Edit [utils/STACK_DETECTION.md](./utils/STACK_DETECTION.md)
2. Add detection indicators (files, patterns, dependencies)
3. Update skill selection rules if needed

---

## Support

- **Documentation**: See links above
- **Issues**: Contact AI Team Leads
- **Slack**: #ai-framework-support
- **Office Hours**: Check internal calendar

---

**Built by**: AI Team | **Target**: 1000+ company projects | **License**: Internal use only
