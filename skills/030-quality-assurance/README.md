# Quality Assurance Skills

Skills for code quality checks, security reviews, automated testing, and pull request management.

## Skills in this group

- **code-quality-check**: Perform comprehensive code quality checks
- **create-pr**: Create well-formatted pull requests with proper context
- **jest-coverage-automation**: AI-powered automated Jest test generation and coverage improvement
- **pr-reviewer-skill**: Comprehensive GitHub Pull Request code review
- **security-review**: Security vulnerability analysis and best practices review

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
