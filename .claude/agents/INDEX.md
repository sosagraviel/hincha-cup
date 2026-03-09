# Agents Inventory

**Project**: ai-agentic-framework
**Last Updated**: 2026-03-09T16:05:55Z

---

## Planning Agents

- `planner` (model: opus) - Create detailed implementation plans with full architecture awareness

## Implementation Agents

- `implementer-typescript` (model: sonnet) - Implement typescript code following team conventions

## Testing Agents

- `tester-unit-typescript` (model: sonnet) - Write unit + integration tests with null

## Review Agents

- `security-reviewer-typescript` (model: sonnet) - Security review and OWASP scanning

---

**Total Agents**: 4

To run an agent: `claude-code agents run <agent-name>`
To list agents: `ls .claude/agents/`
