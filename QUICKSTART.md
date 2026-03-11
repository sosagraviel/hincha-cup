# AI Framework Quick Start

Get your project AI-enabled in under 5 minutes.

---

## Prerequisites

- **Node.js** >= 22.14.x
- **Claude Code CLI** installed and authenticated
- **Jira/GitHub API access** configured in your environment

---

## Installation

### Step 1: Bootstrap

```bash
cd /path/to/your-project/ai-agentic-framework
./scripts/bootstrap-project.sh
```

### Step 2: Initialize

```bash
cd ..  # Go to project root
claude code
```

Then run:
```
/initialize-project
```

Claude will auto-detect your stack (TypeScript/Python/React/etc.), copy relevant skills, and generate project-specific agents.

---

## First Commands

### Create a Ticket

```
/create-sdd-ticket
```

Answer Claude's clarifying questions. A complete Jira ticket is created.

### Implement a Ticket

```
/implement-ticket PROJ-123
```

Claude will: analyze requirements, implement code, run tests (80%+ coverage), and create a PR.

### Check Code Quality

```
/code-quality-check
```

Runs linting, type checking, tests, and coverage validation.

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `/initialize-project` | Set up .claude/ directory |
| `/create-sdd-ticket` | Generate spec-driven ticket |
| `/implement-ticket PROJ-123` | Full implementation workflow |
| `/fetch-ticket-context PROJ-123` | Get Jira ticket details |
| `/code-quality-check` | Run all quality checks |
| `/create-pr` | Create GitHub pull request |
| `/start-task PROJ-123` | Create isolated worktree |
| `/end-task PROJ-123` | Clean up worktree |

---

## Troubleshooting

**"/initialize-project not found"**: Run `./scripts/bootstrap-project.sh` first.

**"Stack detection failed"**: Ensure `package.json`, `tsconfig.json`, or `pyproject.toml` exists.

**"Jira ticket not found"**: Verify ticket key format (e.g., "PROJ-123" not "123").

---

## Next Steps

- **Full Guide**: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Writing Tickets**: [docs/WRITING_GOOD_TICKETS.md](docs/WRITING_GOOD_TICKETS.md)
- **Team Rollout**: [docs/PILOT_GUIDE.md](docs/PILOT_GUIDE.md)
- **All Skills & Agents**: [SKILLS_AND_AGENTS_MAP.md](SKILLS_AND_AGENTS_MAP.md)
