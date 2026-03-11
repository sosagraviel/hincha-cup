# AI-Store Skills Catalog

**Purpose**: Comprehensive catalog of all skills in the ai-agentic-framework with detection patterns
**Last Updated**: 2026-03-02
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
| `mastering-github-agent-skill`     | Git remote contains "github.com"                               | all    |
| `mastering-confluence-agent-skill` | CLAUDE.md mentions "Confluence" OR workflow uses Confluence    | all    |
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
| `mastering-pytorch-rl-nlp-agentic-skill` | `"torch"` or `"pytorch"` in dependencies              | python, pytorch   |

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

## Missing Skills (To Be Created)

Based on pilot project requirements and company tech stack:

| Skill                       | Stack                  | Priority | Reason                             |
| --------------------------- | ---------------------- | -------- | ---------------------------------- |
| `nestjs-patterns`           | NestJS, TypeScript     | HIGH     | gira uses NestJS                   |
| `vue-frontend`              | Vue, TypeScript        | MEDIUM   | Client projects use Vue            |
| `angular-patterns`          | Angular, TypeScript    | MEDIUM   | Some company projects use Angular  |
| `django-patterns`           | Django, Python         | HIGH     | Client projects use Django         |
| `fastapi-patterns`          | FastAPI, Python        | HIGH     | Modern Python projects use FastAPI |
| `flask-patterns`            | Flask, Python          | LOW      | Legacy Python projects             |
| `nextjs-patterns`           | Next.js, React         | HIGH     | Client project uses Next.js        |
| `firebase-patterns`         | Firebase               | HIGH     | Client project uses Firebase       |
| `firestore-patterns`        | Firestore              | HIGH     | Client project uses Firestore      |
| `gcloud-functions-patterns` | Google Cloud Functions | MEDIUM   | Client project uses GCP Functions  |

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

## Next Steps

1. **Phase 1.3**: Move existing skills from `.claude/skills/` to `skills/`
2. **Phase 1.4**: Create agent templates
3. **Phase 1.7**: Merge duplicate skills (e.g., mastering-python-skill-plugin → mastering-python-skill)
4. **Phase 6.5**: Create missing stack skills based on pilot feedback

---

**Version**: 1.0.0
**Last Updated**: 2026-03-02
