# Quick Start Guide

From idea to production-ready pull request in **under 30 minutes** with autonomous SDLC.

---

## Prerequisites

- **Claude Code** installed ([Get it here](https://claude.ai/code))
- **Git repository** with your project code
- **Jira or GitHub** for ticket management (optional but recommended)

---

## Step 1: One-Time Setup (10-15 minutes)

**Clone and initialize the framework**:

```bash
cd /path/to/your-project
git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework
./qubika-agentic-framework/scripts/initialize-project.sh
```

**What happens**:
- Detects your tech stack (TypeScript? Python? React? Django?)
- Analyzes your codebase patterns and conventions
- Generates `CLAUDE.md` and `project-context/`
- Creates custom AI agents and skills for YOUR stack
- Sets up slash commands for your workflows

**Time**: ~10-15 minutes (fully automated)

---

## Step 2: Your First Autonomous Cycle (20 minutes)

### Option A: Full Cycle (Idea → Ticket → Implementation → PR)

**1. Create a ticket from an idea** (3 minutes)

```bash
/create-sdd-ticket \
  --from-input "Add OAuth login with Google to the login page" \
  --save-to-jira https://company.atlassian.net/projects/PROJ/boards/1 \
  --project-key PROJ
```

**What happens**:
- Framework searches your codebase for auth patterns
- Asks some clarifying questions
- Generates complete ticket with BDD scenarios
- Creates ticket in Jira

**Output**: `PROJ-456` ready for implementation

**2. Implement the ticket** (12 minutes)

```bash
/implement-ticket PROJ-456
```

**What happens**:
- Fetches ticket from Jira
- Creates implementation plan
- Implements code following YOUR patterns
- Generates tests (unit + integration + E2E)
- Runs quality gates (linting, type checking, coverage)
- Creates pull request

**Output**: PR #123 with code, tests, and documentation

**3. Review and merge** (5 minutes)

- Review the PR in GitHub
- Test locally if desired
- Merge when ready

**Total**: ~20 minutes (vs 4-6 hours manually)

---

### Option B: Just Implementation (Ticket → PR)

If you already have a ticket:

```bash
/implement-ticket PROJ-123
```

**Time**: 10-15 minutes

**Output**: Production-ready PR

---

### Option C: Just Ticket Creation (Idea → Ticket)

If you want to create tickets for later:

```bash
/create-sdd-ticket \
  --from-input "Users should be able to export their data as CSV" \
  --save-to-markdown ./specs/data-export.md
```

**Time**: 3-5 minutes

**Output**: Detailed specification ready for review

---

## Common Workflows

### Workflow 1: Bug Fix

```bash
# Create bug ticket
/create-sdd-ticket \
  --from-input "Login fails when email contains + character" \
  --save-to-jira <BOARD_URL> \
  --project-key PROJ \
  --issue-type Bug \
  --priority High

# Fix it
/implement-ticket PROJ-789

# Total: 8-12 minutes
```

---

### Workflow 2: Refine Existing Ticket

```bash
# Refine incomplete Jira ticket
/create-sdd-ticket \
  --from-jira PROJ-100 \
  --save-to-markdown ./specs/refined-spec.md

# Review and implement
/implement-ticket --from-markdown ./specs/refined-spec.md
```

---

### Workflow 3: Batch Ticket Creation

```bash
# Create multiple tickets for sprint planning
/create-sdd-ticket \
  --from-input "Add pagination to user list" \
  --save-to-jira <BOARD_URL> \
  --project-key PROJ

/create-sdd-ticket \
  --from-input "Add search filter to user list" \
  --save-to-jira <BOARD_URL> \
  --project-key PROJ

/create-sdd-ticket \
  --from-input "Add sort by name/email to user list" \
  --save-to-jira <BOARD_URL> \
  --project-key PROJ
```

---

## Key Commands

### Full SDLC Commands

| Command | Purpose | Time |
|---------|---------|------|
| `/create-sdd-ticket` | Create ticket from idea | 3-5 min |
| `/implement-ticket <ID>` | Implement ticket → PR | 10-15 min |

### Utility Commands

| Command | Purpose | Time |
|---------|---------|------|
| `./qubika-agentic-framework/scripts/initialize-project.sh` | One-time setup | 2 min |
| `/fetch-ticket-context <ID>` | Get ticket details | 10 sec |
| `/code-quality-check` | Run quality checks | 1-3 min |
| `/create-pr` | Create PR manually | 30 sec |

---

## Troubleshooting

### `/create-sdd-ticket` asks too many questions

**Solution**: Ensure project is initialized and has patterns to learn from:
```bash
./qubika-agentic-framework/scripts/initialize-project.sh  # Re-run to update project context
```

---

### `/implement-ticket` doesn't match project style

**Solution**: Re-initialize to learn latest patterns:
```bash
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

### Tests failing after implementation

**Solution**: Framework auto-retries 3 times. If still failing:
1. Check the error in Claude Code output
2. Fix manually if needed
3. Resume: `/implement-ticket PROJ-123 --resume`

---

### Initialization takes too long or fails

**Solution**: Check the logs for specific errors:
```bash
cat .claude-temp/initialization.log
```

Common issues:
- Missing dependencies: Ensure node and npm are installed
- Network issues: Check internet connection for AI API calls
- Large codebase: May take longer (15-20 minutes is normal for large projects)

---

## What's Next?

### Learn the Full Workflows

- **[User Guide](../guides/USER_GUIDE.md)** - Complete workflows and daily development (15 min)
- **[Writing Good Tickets](../guides/WRITING_GOOD_TICKETS.md)** - How to write AI-friendly tickets (10 min)

### Understand the System

- **[Architecture](../architecture/ARCHITECTURE.md)** - How the workflow engine works (30 min)
- **[API Reference](../reference/API_REFERENCE.md)** - Skills, agents, and commands (20 min)

### Roll Out to Your Team

- **[Pilot Guide](../guides/PILOT_GUIDE.md)** - How to introduce this to your team (30 min)
- **[Security Best Practices](../security/SECURITY.md)** - Security guidelines (15 min)

---

## Example: Real-World Usage

**Monday morning** - Product manager has an idea:

```bash
# 9:00 AM - Create ticket
/create-sdd-ticket \
  --from-input "Add dark mode toggle to user settings" \
  --save-to-jira https://company.atlassian.net/projects/PROJ/boards/1 \
  --project-key PROJ

# Output: PROJ-567 created

# 9:05 AM - Implement ticket
/implement-ticket PROJ-567

# 9:20 AM - PR #234 created and ready for review

# 9:25 AM - Reviewed, tested locally, merged

# Total time: 25 minutes (vs 3-4 hours manually)
```

**By 9:30 AM** - Feature is merged and deploying to production.

---

## Pro Tips

### Tip 1: Create tickets in batches

Create multiple tickets during planning sessions, then implement them one by one.

### Tip 2: Use markdown for complex specs

For complex features, save to markdown first, review with team, then create Jira ticket.

### Tip 3: Refine existing tickets

If a ticket is vague, use `/create-sdd-ticket --from-jira` to refine it before implementation.

### Tip 4: Test locally before merging

Always test the generated code locally before merging, even though quality gates pass.

---

## Getting Help

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/thisisqubika/qubika-agentic-framework/issues)
- **Slack**: #qubika-agentic-framework

---

**Ready to 10x your productivity?** Run `./qubika-agentic-framework/scripts/initialize-project.sh` and start your first autonomous cycle!
