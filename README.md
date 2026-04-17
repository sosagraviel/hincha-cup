# AI Agentic Framework

> **Autonomous Software Development Life Cycle** — From idea to production-ready pull request with minimal human intervention.

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen?style=for-the-badge)](.)
[![Stack Agnostic](https://img.shields.io/badge/Stack-Agnostic-blue?style=for-the-badge)](.)
[![Full SDLC](https://img.shields.io/badge/SDLC-Autonomous-orange?style=for-the-badge)](.)

**Built for**: 1000+ enterprise projects across diverse stacks
**Time Savings**: 70-80% reduction across full development cycle
**Autonomy Level**: Idea → Ticket → Implementation → PR

---

## What Is This?

The AI Agentic Framework enables **autonomous software development across the full SDLC**. Instead of just generating code, it handles the complete development cycle from ideation to production-ready pull requests.

**Traditional AI coding tools** stop at code generation. **This framework** handles the full cycle:
- ✅ **Generates tickets** from ideas with intelligent gap detection
- ✅ **Implements features** following YOUR patterns
- ✅ **Runs tests** and self-heals failures
- ✅ **Creates PRs** with comprehensive documentation

**Total time**: 7-20 minutes (idea → PR)
**Human time**: ~5 minutes (review + merge)
**Autonomy**: 90%+

---

## Quick Start

See [Quick Start Guide](docs/getting-started/QUICKSTART.md) for complete setup instructions.

### Prerequisites

- **Node.js** (v18+ or v20+) and **npm**
- **Git repository** with your project
- **5 minutes** of setup time

### Basic Usage

```bash
# 1. Setup (one-time)
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh

# 2. Create ticket from idea
/create-sdd-ticket --from-input "Add dark mode toggle to settings page"

# 3. Implement ticket
/implement-ticket PROJ-456

# Result: Production-ready pull request
```

---

## Documentation Index

### Getting Started
- [Installation & Setup](docs/getting-started/QUICKSTART.md) — 5-minute setup guide
- [Contributing Guidelines](docs/getting-started/CONTRIBUTING.md) — Contributing to the framework

### Architecture & Design
- [System Architecture](docs/architecture/ARCHITECTURE.md) — How the workflow engine works
- [Orchestration Layer](docs/architecture/ORCHESTRATION.md) — TypeScript orchestration details

### Core Workflows
- [Initialize Project](docs/workflows/INITIALIZE_PROJECT.md) — Project setup automation
- [Implement Ticket](docs/workflows/IMPLEMENT_TICKET.md) — 11-phase implementation workflow
- [Create SDD Ticket](docs/workflows/CREATE_SDD_TICKET.md) — Autonomous ticket generation

### User Guides
- [User Guide](docs/guides/USER_GUIDE.md) — Daily development practices
- [Pilot Guide](docs/guides/PILOT_GUIDE.md) — Rolling out to your team
- [Writing Good Tickets](docs/guides/WRITING_GOOD_TICKETS.md) — AI-friendly ticket format
- [Adding Skills](docs/guides/ADDING_SKILLS.md) — Extend framework capabilities

### Reference Documentation
- [API Reference](docs/reference/API_REFERENCE.md) — Skills, agents, and commands
- [Skills Specification](docs/reference/SKILLS_SPEC.md) — Skill development guidelines
- [Claude CLI Bundling](docs/reference/CLAUDE_CLI_BUNDLING.md) — CLI version management
- [Templates](docs/reference/templates/) — Skill and agent templates

### Infrastructure & Security
- [Docker Setup](docs/infrastructure/DOCKER.md) — Container runtime configuration
- [Authentication](docs/infrastructure/HYBRID_AUTHENTICATION.md) — API key vs CLI modes
- [Provider Switching](docs/infrastructure/PROVIDER_SWITCHING.md) — Multi-LLM support
- [Security Policy](docs/security/SECURITY.md) — Security best practices

### Advanced Features
- [UI Validation Overview](docs/ui-validation/OVERVIEW.md) — Visual testing pipeline

---

## Stack Support

**Automatically Detected**: TypeScript, Python, Go, Java, Rust, Ruby, PHP, C#, Elixir
**Frameworks**: React, Vue, Angular, NestJS, Django, FastAPI, Flask, Spring Boot, ASP.NET Core, Gin, Phoenix
**Build Tools**: Vite, Webpack, npm, Yarn, pnpm, Poetry, dotnet CLI, Go modules
**Test Frameworks**: Jest, Vitest, Pytest, xUnit, NUnit, Go testing, JUnit, ExUnit, RSpec
**Monorepos**: Nx, Lerna, Turborepo, pnpm workspaces, Yarn workspaces

No configuration required — just run initialization once.

---

## Key Metrics

### Time Savings
| Task | Manual | Framework | Savings |
|------|--------|-----------|---------|
| Create spec ticket | 30-60 min | 3-5 min | 85-90% |
| Implement feature | 2-4 hours | 10-20 min | 90-95% |
| Write tests | 1-2 hours | Included | 100% |
| Create PR | 10-15 min | Included | 100% |
| **Full cycle** | **4-7 hours** | **20-30 min** | **92-95%** |

### Quality Metrics
- **95%+** test pass rate on generated code
- **80%+** test coverage (configurable)
- **100%** adherence to project conventions
- **Zero** security vulnerabilities introduced

---

## Use Cases

### ✅ Perfect For
- **Feature development** from product requirements
- **Bug fixes** with clear reproduction steps
- **Ticket refinement** from rough ideas
- **Test generation** for existing code
- **Documentation** from codebase analysis

### ⚠️ Consider Carefully
- **Architectural decisions** (use human judgment)
- **Performance optimization** (requires profiling)
- **Security reviews** (supplement, don't replace)

---

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/thisisqubika/qubika-agentic-framework/issues)
- **Documentation**: Complete guides above
- **Contributing**: See [Contributing Guidelines](docs/getting-started/CONTRIBUTING.md)

---

## License

**Internal use only.** Not for external distribution.