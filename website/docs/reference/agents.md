---
sidebar_position: 3
title: Agents Reference
description: Complete reference for AI agents in the Qubika Agentic Framework
---

# Agents Reference

Agents are specialized AI assistants that handle specific tasks in the development workflow. The framework automatically generates agents tailored to your tech stack.

---

## How Agents Work

Agents are AI assistants configured with:
- **Specific skills**: Relevant knowledge for their task
- **Model tier**: Matched to complexity (fast/standard/advanced)
- **Context**: Project-specific patterns from CLAUDE.md
- **Instructions**: Clear prompts for their role

**Key Characteristics**:
- **Specialized**: Each agent has a focused responsibility
- **Stack-aware**: Generated based on detected technologies
- **Language-specific**: Separate agents for TypeScript, Python, Go, etc.
- **Composable**: Work together through workflow orchestration

---

## Agent Types

### Planning Agents

Agents that create implementation strategies and architecture plans.

#### planner

**Purpose**: Creates implementation plans for medium-complexity tickets.

**When used**: Risk score 31-70 (medium complexity)

**Model tier**: Advanced (Opus for highest reasoning)

**Skills**:
- `project-context` - Project understanding
- `analyze-requirements` - Requirement analysis
- All detected language skills (architecture-aware)

**Context**: Architecture-aware across all project languages

**Output**:
- Implementation plan with file changes
- Test strategy
- Risk assessment
- Implementation steps

**Example invocation**:
```
During Phase 2 of /implement-ticket for medium-risk tickets
```

---

#### architect

**Purpose**: Detailed architecture planning for high-risk tickets.

**When used**: Risk score 71+ (high complexity)

**Model tier**: Advanced (Opus for deep analysis)

**Skills**:
- `project-context` - Project understanding
- `analyze-requirements` - Requirement analysis
- `design-doc-mermaid` - Diagram generation
- All detected language skills (full system awareness)

**Context**: Full system architecture awareness

**Output**:
- Architecture document with diagrams
- Implementation plan
- Integration points
- Migration strategy (if applicable)
- Test strategy

**Example invocation**:
```
During Phase 2 of /implement-ticket for high-risk tickets
(e.g., database migrations, API changes)
```

---

### Implementation Agents

Agents that write production code following project conventions.

#### implementer-[language]

**Purpose**: Implements code in a specific language following project patterns.

**When used**: During Phase 4 (Implementation) of `/implement-ticket`

**Model tier**: Standard (Sonnet for cost-effectiveness)

**Generated for**: Each detected language in the project

**Skills** (example for TypeScript):
- `project-context` - Project conventions
- `mastering-typescript` - Language patterns
- Framework skills (e.g., `react-frontend`, `nestjs-patterns`)

**Output**: Production-ready code following YOUR patterns

**Language Variants**:

| Agent | Language | Framework Skills |
|-------|----------|------------------|
| `implementer-typescript` | TypeScript | React, NestJS, Express |
| `implementer-python` | Python | Django, FastAPI, Flask |
| `implementer-go` | Go | Gin, Echo, standard library |
| `implementer-java` | Java | Spring Boot, Maven |
| `implementer-rust` | Rust | Actix, Rocket, Tokio |
| `implementer-ruby` | Ruby | Rails, Sinatra |

**Multi-Language Routing**:

The framework automatically routes files to the correct implementer based on file extension:

```
.ts, .tsx → implementer-typescript
.py → implementer-python
.go → implementer-go
.java → implementer-java
.rs → implementer-rust
.rb → implementer-ruby
```

**Example invocation**:
```
Phase 4: Implementation
- User service implementation: implementer-typescript
- Database migration: implementer-python
- Microservice API: implementer-go
```

---

### Testing Agents

Agents that generate comprehensive tests with high coverage.

#### tester-unit-[language]

**Purpose**: Generates unit and integration tests.

**When used**: During Phase 5 (Testing) of `/implement-ticket`

**Model tier**: Standard (Sonnet for efficiency)

**Generated for**: Each detected language with test framework

**Skills** (example for TypeScript):
- `project-context` - Testing conventions
- `mastering-typescript` - Language patterns
- Test framework skills (e.g., `jest-coverage-automation`)

**Output**: Comprehensive tests with 80%+ coverage

**Language Variants**:

| Agent | Language | Test Frameworks |
|-------|----------|-----------------|
| `tester-unit-typescript` | TypeScript | Jest, Vitest |
| `tester-unit-python` | Python | Pytest, unittest |
| `tester-unit-go` | Go | testing package |
| `tester-unit-java` | Java | JUnit, TestNG |
| `tester-unit-rust` | Rust | built-in test framework |

**Example invocation**:
```
Phase 5: Testing
- Generate unit tests for UserService.ts
- Achieve 85% coverage
- Mock external dependencies
```

---

#### tester-e2e-[language]

**Purpose**: Generates end-to-end tests for user flows.

**When used**: During Phase 5 (Testing) for projects with E2E framework

**Model tier**: Standard (Sonnet)

**Generated for**: Projects with Playwright, Cypress, or similar

**Skills** (example for TypeScript):
- `project-context` - Application flows
- `mastering-typescript` - Language patterns
- E2E framework skills (e.g., `playwright-e2e-automation`)

**Output**: E2E tests for critical user flows

**Example invocation**:
```
Phase 5: Testing (E2E)
- Test user registration flow
- Test checkout process
- Verify error handling
```

---

### Review Agents

Agents that analyze code for security, quality, and best practices.

#### security-reviewer-[language]

**Purpose**: Security analysis and vulnerability detection.

**When used**: During Phase 9 (Review Loop) of `/implement-ticket`

**Model tier**: Advanced (Opus for deep analysis)

**Generated for**: Primary project language

**Skills**:
- `project-context` - Project security patterns
- `security-review` - OWASP Top 10, CVE database
- Primary language skills

**Output**:
- Security report
- Vulnerability list with severity
- Remediation steps
- Compliance checks

**Example invocation**:
```
Phase 9: Review Loop
- Scan for SQL injection risks
- Check authentication patterns
- Verify input validation
- Review dependency vulnerabilities
```

---

#### code-reviewer

**Purpose**: Code quality and best practices review.

**When used**: During Phase 9 (Review Loop) of `/implement-ticket`

**Model tier**: Standard (Sonnet)

**Skills**:
- `project-context` - Project conventions
- All relevant language skills
- Framework skills

**Output**:
- Code quality report
- Best practice violations
- Refactoring suggestions
- Performance concerns

**Example invocation**:
```
Phase 9: Review Loop
- Review code against project conventions
- Check for anti-patterns
- Verify test coverage
- Suggest improvements
```

---

## Agent Skill Mapping

Different agent types receive different skill combinations for optimal context.

### Planner (Cross-Language)

**Needs**: Architecture awareness across all languages

```yaml
skills:
  - project-context
  - analyze-requirements
  - design-doc-mermaid
  - mastering-typescript     # ALL detected languages
  - mastering-python-skill
  - mastering-go
  - developing-with-docker
```

**Why**: Plans may involve changes across multiple languages.

---

### Implementer-TypeScript (Single-Language)

**Needs**: Deep TypeScript knowledge only

```yaml
skills:
  - project-context
  - mastering-typescript     # THIS language only
  - react-frontend           # Detected frameworks
  - atomic-design-react
```

**Why**: Focuses on TypeScript implementation, ignores other languages.

---

### Tester-Unit-Python (Testing-Specific)

**Needs**: Python testing knowledge

```yaml
skills:
  - project-context
  - code-quality-check
  - mastering-python-skill
  - pytest-patterns
```

**Why**: Focused on Python testing with pytest.

---

## Agent Lifecycle

### 1. Generation

Agents are generated during `/initialize-project`:

```
Detect TypeScript → Generate implementer-typescript
Detect Jest → Generate tester-unit-typescript
Detect Playwright → Generate tester-e2e-typescript
```

**Location**: `.claude/agents/`

---

### 2. Invocation

Agents are invoked during workflows:

```
Phase 2: Planning → Invoke planner agent
Phase 4: Implementation → Invoke implementer-typescript agent
Phase 5: Testing → Invoke tester-unit-typescript agent
Phase 9: Review → Invoke security-reviewer-typescript agent
```

---

### 3. Execution

Agents receive:
- Input prompt with context
- Relevant skills (auto-loaded)
- Project knowledge from CLAUDE.md
- Task-specific instructions

Agents produce:
- Structured JSON output
- Code changes
- Analysis reports
- Test files

---

### 4. Validation

Agent outputs are validated:
- JSON schema validation
- File path verification
- Coverage threshold checks
- Quality gate validation

---

## Multi-Language Routing

For multi-language projects, the framework routes tasks to appropriate agents.

### Example: Full-Stack TypeScript + Python Project

**Detected Stack**:
- Frontend: TypeScript + React
- Backend: Python + FastAPI
- Database: PostgreSQL

**Generated Agents**:
- `planner` - Plans across both languages
- `implementer-typescript` - Frontend implementation
- `implementer-python` - Backend implementation
- `tester-unit-typescript` - Frontend tests
- `tester-unit-python` - Backend tests
- `security-reviewer-python` - Security (primary language)

**Routing Logic**:

```
File: UserProfile.tsx → implementer-typescript
File: user_service.py → implementer-python
Test: UserProfile.test.tsx → tester-unit-typescript
Test: test_user_service.py → tester-unit-python
```

---

## Agent Configuration

Agents are configured via markdown files in `.claude/agents/`.

### Example Agent File

**File**: `.claude/agents/implementer-typescript.md`

```markdown
---
name: implementer-typescript
description: TypeScript implementation specialist
model-tier: standard
---

You are a TypeScript implementation specialist for this project.

## Your Role
Implement features following project conventions in CLAUDE.md.

## Skills
- project-context
- mastering-typescript
- react-frontend

## Output Format
Return code changes as JSON with file paths and content.
```

---

## Model Tier Assignment

Agents use different model tiers based on task complexity:

| Agent Type | Tier | Model | Reasoning |
|------------|------|-------|-----------|
| Planner | Advanced | Opus | Complex reasoning required |
| Architect | Advanced | Opus | Architecture analysis |
| Implementer | Standard | Sonnet | Code generation (cost-effective) |
| Tester | Standard | Sonnet | Test generation |
| Security Reviewer | Advanced | Opus | Deep security analysis |
| Code Reviewer | Standard | Sonnet | Pattern matching |

**Tiers can be overridden** via environment variables (see [Environment Variables](../configuration/environment-variables.md)).

---

## Agent Outputs

Different agents produce different output formats:

### Planner Output

```json
{
  "plan": {
    "files_to_create": ["src/services/user.service.ts"],
    "files_to_modify": ["src/app.module.ts"],
    "test_strategy": "Unit tests with Jest, E2E with Playwright",
    "steps": [
      "Create UserService class",
      "Add dependency injection",
      "Write unit tests"
    ]
  }
}
```

---

### Implementer Output

```json
{
  "changes": [
    {
      "file": "src/services/user.service.ts",
      "action": "create",
      "content": "export class UserService { ... }"
    }
  ]
}
```

---

### Tester Output

```json
{
  "test_files": [
    {
      "file": "src/services/user.service.test.ts",
      "content": "describe('UserService', () => { ... })"
    }
  ],
  "coverage": {
    "statements": 87.5,
    "branches": 82.3,
    "functions": 90.0
  }
}
```

---

### Security Reviewer Output

```json
{
  "vulnerabilities": [
    {
      "severity": "HIGH",
      "type": "SQL Injection",
      "file": "src/users/user.service.ts",
      "line": 45,
      "remediation": "Use parameterized queries"
    }
  ]
}
```

---

## Best Practices

1. **Let the framework generate agents**: Don't create agents manually
2. **Trust the routing**: Multi-language routing is automatic
3. **Use appropriate tiers**: Don't force expensive models for simple tasks
4. **Review agent outputs**: Validate before applying changes
5. **Re-generate after stack changes**: Run `/initialize-project` again

---

## Troubleshooting

### Agent Not Found

```
❌ Error: Agent implementer-typescript not found

Solution: Run /initialize-project to generate agents
```

---

### Wrong Language Agent

```
⚠️ Warning: Routing .py file to implementer-python
(implementer-typescript was requested)

Solution: Framework auto-corrects routing based on file extension
```

---

### Agent Timeout

```
❌ Error: Agent execution timeout after 300s

Solution: Complex tasks may need longer timeout (configure via env vars)
```

---

## Further Reading

- [Skills Catalog](./skills-catalog.md) - Skills used by agents
- [Commands Reference](./commands.md) - Commands that invoke agents
- [Environment Variables](../configuration/environment-variables.md) - Agent configuration
- [Project Structure](./project-structure.md) - Where agents are stored
