# Gira

> A production-ready full-stack monorepo — clone, configure, ship.

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://docs.nestjs.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![Keycloak](https://img.shields.io/badge/Keycloak-SSO-4D4D4D?style=flat-square&logo=keycloak&logoColor=white)](https://www.keycloak.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose)

---

## About This Repository

This repository contains **two distinct projects** that work together but serve different purposes:

| Project | Location | Purpose |
|---------|----------|---------|
| **Gira** | Root directory (`services/`, `packages/`, etc.) | A Jira-like project management application |
| **AI Agentic Framework** | `ai-agentic-framework/` | Stack-agnostic AI development automation framework |

### How They Relate

- **Gira** serves as the **primary test bed** for developing and validating the AI Agentic Framework
- The **AI Agentic Framework** is the main deliverable and will be extracted to a separate repository
- The framework is **stack-agnostic** and can be used with ANY codebase (Python, TypeScript, React, NestJS, Django, etc.)

### Which Documentation Do You Need?

| If you want to... | Go to... |
|-------------------|----------|
| Use AI to automate development | [AI Agentic Framework](#ai-agentic-framework) section below |
| Build upon or explore the Gira app | [Gira: The Test Application](#gira-the-test-application) section below |
| Apply the framework to your own project | [ai-agentic-framework/README.md](ai-agentic-framework/README.md) |

---

## AI Agentic Framework

The AI Agentic Framework automates development workflows from ticket to pull request. It achieves **100% initialization accuracy** and **<1% implementation failure rate** through intelligent stack detection, quality gates, and error recovery.

> **Note**: This framework is stack-agnostic and designed to work with any codebase. While developed alongside Gira, it can be used independently with Python, TypeScript, React, Django, FastAPI, or any other stack.

### Key Features

- **Automatic Project Analysis** (`/initialize-project`) - Detects tech stack, frameworks, monorepo structure, and generates project-specific AI agents
- **End-to-End Implementation** (`/implement-ticket`) - Analyzes tickets, generates implementation plans, writes code, runs tests, and creates PRs
- **Intelligent Mode Selection** - Automatically chooses architect mode for high-risk changes, planner mode for routine tasks
- **Quality Gates** - Enforces linting, testing, and coverage thresholds before creating PRs
- **Error Recovery** - 5-layer error recovery system with checkpoints, rollback, and infinite loop detection

### Quick Start with AI Framework

```bash
# First time setup (from ai-agentic-framework directory)
cd ai-agentic-framework
./scripts/bootstrap-project.sh  # Launches Claude Code

# Once Claude Code starts, type:
/initialize-project

# Then implement tickets automatically
/implement-ticket PROJ-123
```

### Framework Documentation

| Document | Description | Read Time |
|----------|-------------|-----------|
| [Framework README](ai-agentic-framework/README.md) | **START HERE** - Complete framework overview | 5 min |
| [Quick Start Guide](ai-agentic-framework/QUICKSTART.md) | 5-minute setup guide | 5 min |
| [User Guide](ai-agentic-framework/docs/USER_GUIDE.md) | Step-by-step usage, troubleshooting, FAQ | 15 min |
| [Writing Good Tickets](ai-agentic-framework/docs/WRITING_GOOD_TICKETS.md) | How to write tickets for AI implementation | 10 min |
| [Architecture](ai-agentic-framework/docs/ARCHITECTURE.md) | Technical deep dive into framework internals | 45 min |
| [Skill Catalog](ai-agentic-framework/SKILL_CATALOG.md) | All available skills with detection logic | 20 min |
| [Pilot Guide](ai-agentic-framework/docs/PILOT_GUIDE.md) | 3-week pilot rollout plan | 45 min |

---

## Gira: The Test Application

A Jira-like project management board built as a **clone-and-go starting point** for new full-stack projects. Ships with SSO, three-layer RBAC, real-time WebSocket updates, a Kanban board, team chat, file attachments, email invites, and a complete test suite.

### What's Inside

| Area            | Details                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| **Backend**     | NestJS 11 - TypeORM 0.3 - PostgreSQL 16 - vertical-slice modules - REST API with Swagger                      |
| **Frontend**    | React 19 - Vite 6 - TanStack Router (file-based) - shadcn/ui - Tailwind CSS 4                                 |
| **Auth**        | Keycloak OIDC - Redis session cache - three-layer RBAC (`RolesGuard`, `OrgMemberGuard`, `ProjectMemberGuard`) |
| **Real-time**   | Socket.IO - BullMQ queue processor - per-user permission evaluation - typing indicators - presence            |
| **Chat**        | Group rooms - direct messages - read receipts - message deduplication                                         |
| **Testing**     | 108 unit tests - integration tests - Playwright E2E - 0-warning ESLint                                        |
| **Dev tooling** | pnpm workspaces - Prettier - Conventional Commits - Husky - shared `@livonit/*` config packages               |

### Quick Start (Gira)

> **Prerequisites**: Node.js >= 22.14.x - pnpm 10.x - Docker

```bash
git clone <your-repo-url>
cd <project>

pnpm install
cp .env.development.example .env.development

make setup   # Docker up -> Keycloak init -> DB migrations -> seed data
```

Once running, open:

- Frontend: [localhost:2712](http://localhost:2712)
- REST API: [localhost:3050/api/v1](http://localhost:3050/api/v1)
- Swagger UI: [localhost:3050/api/v1/docs](http://localhost:3050/api/v1/docs)
- Keycloak: [localhost:7080](http://localhost:7080)

### Services

| Service        | Port | Description                  |
| -------------- | ---- | ---------------------------- |
| `backend`      | 3050 | NestJS REST API              |
| `web-frontend` | 2712 | React SPA (Vite)             |
| `keycloak`     | 7080 | Identity & access management |
| `postgres`     | 5432 | Primary database             |
| `redis`        | 6379 | Session cache + BullMQ jobs  |

### Demo Credentials

| User  | Email             | Password  | Role          |
| ----- | ----------------- | --------- | ------------- |
| Admin | admin@gira.com    | admin123  | `super_admin` |
| Alice | alice@acme.com    | member123 | `member`      |
| Bob   | bob@acme.com      | member123 | `member`      |
| Carol | carol@widgets.com | member123 | `member`      |

### Day-to-Day Commands

```bash
# Docker
make up                          # Start all services
make up s=backend                # Start one service
make logs s=backend              # Tail logs
make sh s=backend                # Shell into container
make rebuild-packages s=backend  # Rebuild @livonit/* packages and restart

# Backend
pnpm --filter ./services/backend start:dev        # Watch mode
pnpm --filter ./services/backend test:unit        # 108 unit tests
pnpm --filter ./services/backend test:integration # Integration tests
pnpm --filter ./services/backend lint:check       # ESLint (0 warnings)
pnpm --filter ./services/backend type:check       # TypeScript

# Frontend
pnpm --filter ./services/web-frontend start:dev   # Vite dev server
pnpm --filter ./services/web-frontend test:e2e    # Playwright E2E
pnpm --filter ./services/web-frontend build       # Production build
```

### Gira Documentation

| Document                                         | Description                                                |
| ------------------------------------------------ | ---------------------------------------------------------- |
| [Gira Architecture](docs/ARCHITECTURE.md)        | System diagrams, module dependencies, repository structure |
| [Backend Guide](docs/backend.md)                 | NestJS modules, API endpoints, auth guards, migrations     |
| [Frontend Guide](docs/frontend.md)               | React routing, components, data fetching, design system    |
| [Shared Package](docs/shared-package.md)         | DTOs, enums, base types, shared utilities                  |
| [Contributing](docs/contributing.md)             | Setup, code conventions, testing, adding modules           |
| [Backend Deep Dive](docs/backend-deep-dive.md)   | Complete backend architecture: request lifecycle, auth layers, queue system |
| [Real-Time System](docs/realtime-system.md)      | WebSocket architecture: BullMQ queues, permissions, chat, typing indicators |
| [Authentication](docs/authentication.md)         | Keycloak OIDC: token lifecycle, three-layer RBAC, realm configuration |

---

## Project Structure

```text
gira/
├── ai-agentic-framework/      # AI Development Framework (separate project)
│   ├── skills/                # Reusable skills (Johnny Decimal organization)
│   ├── agents/templates/      # Agent templates with variable substitution
│   ├── utils/                 # Stack detection & skill selection algorithms
│   ├── docker/                # Isolated Docker runtime environment
│   ├── docs/                  # Framework documentation
│   └── examples/              # Usage examples and walkthroughs
│
├── packages/                  # Shared packages (Gira)
│   ├── liveonit/              # Shared tooling configs (ESLint, Prettier, TS, Jest, commitlint)
│   └── shared/                # Shared DTOs, enums, utilities (@livonit/shared)
│
├── services/                  # Application services (Gira)
│   ├── backend/               # NestJS REST API (port 3050)
│   ├── web-frontend/          # React SPA (port 2712)
│   ├── keycloak/              # IAM realm config, themes, init scripts
│   └── db/                    # PostgreSQL + Keycloak DB init scripts
│
├── seeds/                     # Database seed scripts (Gira)
└── docs/                      # Gira project documentation
```

---

## Full Documentation Index

### AI Agentic Framework Documentation

| Document | Description | Read Time |
|----------|-------------|-----------|
| [Framework README](ai-agentic-framework/README.md) | Framework overview and quick start | 5 min |
| [Quick Start](ai-agentic-framework/QUICKSTART.md) | 5-minute setup guide | 5 min |
| [User Guide](ai-agentic-framework/docs/USER_GUIDE.md) | Complete usage scenarios and workflows | 15 min |
| [Writing Good Tickets](ai-agentic-framework/docs/WRITING_GOOD_TICKETS.md) | INVEST criteria, Given-When-Then, examples | 10 min |
| [Architecture](ai-agentic-framework/docs/ARCHITECTURE.md) | Technical deep dive: error recovery, checkpoints | 45 min |
| [Skill Catalog](ai-agentic-framework/SKILL_CATALOG.md) | All skills with detection logic | 20 min |
| [Skills and Agents Map](ai-agentic-framework/SKILLS_AND_AGENTS_MAP.md) | Relationship between skills and agents | 15 min |
| [Pilot Guide](ai-agentic-framework/docs/PILOT_GUIDE.md) | 3-week pilot rollout plan (for management) | 45 min |
| [Security](ai-agentic-framework/docs/SECURITY.md) | Security guidelines and OWASP compliance | 20 min |
| [API Reference](ai-agentic-framework/docs/API_REFERENCE.md) | Skills, agents, and utilities API | 30 min |
| [Skill Integration Guide](ai-agentic-framework/docs/SKILL_INTEGRATION_GUIDE.md) | How to create and integrate new skills | 20 min |

### Gira Project Documentation

For Gira-specific development documentation (architecture, conventions, setup), see [`.claude/CLAUDE.md`](.claude/CLAUDE.md) in the project root.
