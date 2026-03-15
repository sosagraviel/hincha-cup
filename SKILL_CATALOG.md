# Skill Catalog

Comprehensive catalog of all skills in the AI Agentic Framework with detection patterns.

**Total Skills**: 30 (11 always-copied, 19 stack-specific)

---

## Always-Copied Skills

These skills are copied to **every project** regardless of tech stack.

### Foundation (010)

| Skill                | Description                                                                      | Category   |
| -------------------- | -------------------------------------------------------------------------------- | ---------- |
| `initialize-project` | Deep codebase analysis → generates CLAUDE.md + project-context                   | foundation |
| `project-context`    | Hard-to-discover architectural knowledge (auth flows, real-time, guard stacking) | foundation |

### Development Workflow (020)

| Skill                  | Description                                                                                          | Category |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| `implement-ticket`     | End-to-end orchestrator with 4-layer error recovery: pre-flight → analyze → implement → quality → PR | workflow |
| `analyze-requirements` | Jira ticket analysis → implementation planning with file changes & risks                             | workflow |
| `code-implementation`  | Language-aware implementation orchestrator (spawns implementer agents)                               | workflow |
| `create-sdd-ticket`    | Specification-driven ticket generation with INVEST criteria and BDD scenarios                        | workflow |
| `mastering-git-cli`    | Advanced Git operations (worktrees, submodules, recovery, bisect)                                    | workflow |

### Quality Assurance (030)

| Skill                | Description                                                      | Category |
| -------------------- | ---------------------------------------------------------------- | -------- |
| `code-quality-check` | Linting, type checking, test coverage (80%+ threshold)           | quality  |
| `security-review`    | OWASP Top 10 scanning, secrets detection, vulnerability analysis | quality  |
| `create-pr`          | GitHub PR with conventional commits, descriptions, Jira links    | quality  |

### Integrations (040)

| Skill    | Description                           | Category    |
| -------- | ------------------------------------- | ----------- |
| `jira`   | Jira operations (create, update, fetch) | integration |

---

## Stack-Specific Skills

These skills are copied **only when relevant** based on stack detection.

### Development Workflow (020)

| Skill             | Detection Pattern                          | Stacks |
| ----------------- | ------------------------------------------ | ------ |
| `architect-agent` | Optional - for complex architectural work | all    |

### Quality Assurance (030)

| Skill                      | Detection Pattern                      | Stacks                     |
| -------------------------- | -------------------------------------- | -------------------------- |
| `jest-coverage-automation` | `jest` in package.json devDependencies | typescript, javascript     |
| `pr-reviewer-skill`        | Optional - for PR review automation    | all                        |

### Integrations (040)

| Skill                              | Detection Pattern                                              | Stacks |
| ---------------------------------- | -------------------------------------------------------------- | ------ |
| `fetch-ticket-context`             | Always copied with `jira`                                      | all    |
| `mastering-github-cli`     | Git remote contains "github.com"                               | all    |
| `mastering-confluence` | CLAUDE.md mentions "Confluence" OR workflow uses Confluence    | all    |
| `notion-document-manager`          | CLAUDE.md mentions "Notion" OR workflow uses Notion            | all    |

### Language Frameworks (050)

#### TypeScript / Node.js

| Skill                  | Detection Pattern                                | Stacks            |
| ---------------------- | ------------------------------------------------ | ----------------- |
| `mastering-typescript` | `tsconfig.json` + `"typescript"` in package.json | typescript, node  |
| `react-frontend`       | `"react"` in package.json dependencies           | typescript, react |
| `atomic-design-react`  | `"react"` + component structure                  | typescript, react |

#### Python

| Skill                                    | Detection Pattern                                     | Stacks            |
| ---------------------------------------- | ----------------------------------------------------- | ----------------- |
| `mastering-python-skill`                 | `pyproject.toml` or `requirements.txt` or `.py` files | python            |
| `mastering-langgraph-agent-skill`        | `"langgraph"` in dependencies                         | python, langgraph |

### Documentation (060)

| Skill                | Detection Pattern                    | Stacks |
| -------------------- | ------------------------------------ | ------ |
| `design-doc-mermaid` | Always useful for diagram generation | all    |

### Infrastructure / DevOps (070)

| Skill                                  | Detection Pattern                    | Stacks |
| -------------------------------------- | ------------------------------------ | ------ |
| `developing-with-docker-agentic-skill` | `Dockerfile` or `docker-compose.yml` | docker |

### Cloud Platforms (080)

| Skill                       | Detection Pattern                         | Stacks   |
| --------------------------- | ----------------------------------------- | -------- |
| `mastering-aws-cdk-plugin`  | `cdk.json` or `"aws-cdk"` in dependencies | aws, cdk |
| `mastering-aws-cli`         | AWS-related config files                  | aws      |
| `mastering-gcloud-commands` | `.gcloudignore` or `gcloud` references    | gcp      |
| `using-firebase`            | `firebase.json` or `firebaserc`           | firebase |

---

## Skill Detection Logic

### How Detection Works

Each skill includes frontmatter metadata:

```yaml
---
name: mastering-typescript
category: language-framework
stacks: [typescript, node]
detection:
  files: [package.json, tsconfig.json]
  patterns:
    - "typescript" in package.json dependencies
always_copy: false
---
```

**Detection Steps**:

1. Check if `detection.files` exist in project
2. If files exist, check `detection.patterns`
3. If all conditions match, skill is applicable
4. If `always_copy: true`, skip detection and always copy

---

## Skill Usage Examples

### Example 1: TypeScript + React + NestJS Project

**Detected Stack**:

- Primary Language: TypeScript
- Backend: NestJS
- Frontend: React
- Database: PostgreSQL (TypeORM)

**Skills Copied**:

- ✅ All always-copied skills (foundation, workflow, quality, integrations)
- ✅ mastering-typescript (TypeScript detected)
- ✅ react-frontend (React detected)
- ✅ atomic-design-react (React detected)
- ✅ nestjs-patterns (NestJS detected) _[To be created]_

---

### Example 2: Python + FastAPI + Next.js + Firebase

**Detected Stack**:

- Primary Language: Python
- Backend: FastAPI
- Frontend: Next.js (React)
- Database: Firestore
- Cloud: Firebase, Google Cloud Functions

**Skills Copied**:

- ✅ All always-copied skills
- ✅ mastering-python-skill (Python detected)
- ✅ fastapi-patterns (FastAPI detected) _[To be created]_
- ✅ react-frontend (React in Next.js)
- ✅ nextjs-patterns (Next.js detected) _[To be created]_
- ✅ firebase-patterns (firebase.json detected) _[To be created]_
- ✅ firestore-patterns (Firestore detected) _[To be created]_
- ✅ gcloud-functions-patterns (GCP Functions detected) _[To be created]_

---

## Further Reading

- [API Reference](./docs/API_REFERENCE.md) - Skills, agents, and commands reference
- [Architecture](./docs/ARCHITECTURE.md) - How skills and agents work together
- [Contributing](./CONTRIBUTING.md) - How to create custom skills
