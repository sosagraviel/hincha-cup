# Quality Assurance Skills

Skills for code quality checks, security reviews, automated testing, and pull request management.

## Skills in this group

- **code-quality-check**: Automated quality verification with linters, type checkers, and test coverage (80%+ threshold)
- **create-pr**: Create production-ready GitHub Pull Requests with artifacts (screenshots, videos, coverage)
- **doc-updater**: Maintain `.claude/CLAUDE.md` and `project-context` accuracy after code changes
- **jest-coverage-automation**: AI-powered Jest test generation and coverage improvement until thresholds are met
- **playwright-e2e-automation**: Multi-step Playwright E2E test automation using Planner, Implementer, and Healer agents
- **pr-reviewer**: Comprehensive GitHub Pull Request code review with structured feedback for review-loop integration
- **pytest-patterns**: Pytest expertise covering fixtures, parametrization, mocking, coverage, and plugins
- **security-review**: OWASP Top 10 scanning, secrets detection, and vulnerability analysis
- **ui-testing**: Stack-agnostic UI testing orchestration across unit, component, E2E, and visual levels
- **ui-visual-testing**: Dual-mode visual testing — Figma design fidelity and screenshot regression with an iterative fix loop

## Featured Skill: Jest Coverage Automation

The `jest-coverage-automation` skill provides AI-powered test generation using a three-agent system:

### Agents
1. **Test Analyzer**: Analyzes coverage gaps and prioritizes files
2. **Test Writer**: Generates type-safe unit and integration tests
3. **Coverage Orchestrator**: Coordinates the test-analyze-generate loop

### Key Features
- Automated test generation for TypeScript/JavaScript
- Coverage-guided iteration until thresholds are met
- Quality filtering (build → run → pass → coverage)
- Support for NestJS, Express, React frameworks
- Supertest API testing and Axios mocking

### Usage
```bash
/agents quality-assurance coverage-orchestrator --target-lines=80
```

See `jest-coverage-automation/SKILL.md` for complete documentation.

## Agent Group

The **quality-assurance** agent group (`/.claude/agent-groups/quality-assurance/`) provides specialized agents for automated testing workflows. See the agent group README for invocation examples and workflow details.
