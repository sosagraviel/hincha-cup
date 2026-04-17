# Skills Organization - Johnny Decimal System

This directory uses the [Johnny Decimal system](https://johnnydecimal.com/) for organizing skills into logical, prioritized groups.

## Why Numbered Groups (010, 020, 030...)?

Based on [Johnny Decimal best practices](https://johnnydecimal.com/) and [organizational research](https://help.noteplan.co/article/155-how-to-organize-your-notes-and-folders-using-johnny-decimal-and-para):

### Key Benefits
1. **Prevents folder movement** - Numbers maintain position when new items added
2. **Future-proof** - Can insert 015 between 010 and 020 without reorganizing
3. **Priority-based ordering** - Most important groups first (not alphabetical)
4. **Muscle memory** - Folders never move, so you learn their locations
5. **Room for growth** - Gaps allow up to 10 groups max (keeps it simple)

### Why NOT 001, 002, 003?
- Sequential numbering doesn't allow insertion between items
- Gaps of 10 provide flexibility for future categories
- Aligns with proven organizational systems (Johnny Decimal, PARA)

## Skill Group Hierarchy

### 010 - Foundation (Bootstrap & Task Isolation)
**Priority**: HIGHEST - These skills establish the project and task foundation

| Skill | Purpose |
|-------|---------|
| start-task | Isolated git worktree per task with auto port detection and `.claude` config copy |

**Related artifacts (not static skills)**: `initialize-project` is implemented as the TypeScript orchestration CLI; `project-context` is generated per target project by that pipeline.

**When to use**: Starting a new ticket in parallel with other work, keeping experiments isolated

---

### 020 - Development Workflow (Daily Development)
**Priority**: HIGH - Core development cycle skills used daily

| Skill | Purpose |
|-------|---------|
| analyze-requirements | Jira ticket analysis → implementation plan with file changes, risks, and steps |
| architect-agent | Coordinate planning, delegation, and evaluation across architect and code agent workspaces |
| code-implementation | Language-aware implementation orchestrator (auto-detects Python/TypeScript) |
| create-sdd-ticket | Generate specification-driven development (SDD) tickets with gap detection |
| implement-ticket | End-to-end ticket orchestrator: analyze → implement → quality → security → PR |
| mastering-git-cli | Git expertise — branches, commits, merges, rebases, worktrees, conflict resolution |
| skill-creator | Create, modify, improve, and eval skills |

**When to use**: Implementing features, fixing bugs, daily coding tasks

---

### 030 - Quality Assurance (Testing & Security)
**Priority**: HIGH - Quality gates before code ships

| Skill | Purpose |
|-------|---------|
| code-quality-check | Linting, type checking, test coverage (80%+ threshold) |
| create-pr | GitHub PR with conventional commits, descriptions, artifacts |
| doc-updater | Maintain `CLAUDE.md` and `project-context` accuracy after code changes |
| jest-coverage-automation | AI-powered Jest test generation and coverage improvement |
| playwright-e2e-automation | Multi-step Playwright E2E automation with Planner/Implementer/Healer agents |
| pr-reviewer | Comprehensive GitHub PR code review with structured feedback |
| pytest-patterns | Pytest fixtures, parametrization, mocking, coverage, plugins |
| security-review | OWASP Top 10 scanning, secrets detection, vulnerability analysis |
| ui-testing | Stack-agnostic UI testing across unit, component, E2E, and visual levels |
| ui-visual-testing | Dual-mode visual testing — Figma fidelity + screenshot regression with fix loop |

**When to use**: Before merging code, pre-PR validation, security audits

---

### 040 - Integrations (External Platforms)
**Priority**: MEDIUM - Connect to external services

| Skill | Purpose |
|-------|---------|
| fetch-ticket-context | Fetch complete Jira context + external docs (Notion, Confluence) |
| figma-design-fetcher | Fetch Figma designs, export frames at 2x, extract design constraints |
| jira | Jira operations (create, update, transition, search with JQL) |
| mastering-confluence | Confluence pages, CQL search, ADF/markdown conversion |
| mastering-github-cli | GitHub Actions logs + `gh` CLI operations (PRs, issues, workflows) |
| notion-document-manager | Notion operations with smart chunking for large pages |

**When to use**: Managing tickets, documentation, cross-platform workflows

---

### 050 - Language & Framework Expertise
**Priority**: MEDIUM - Tech-specific deep knowledge

| Skill | Purpose |
|-------|---------|
| atomic-design-react | Atomic design patterns for React (TypeScript, Tailwind v4, shadcn/ui) |
| mastering-go-skill | Go idioms, concurrency, testing, standard library |
| mastering-java-skill | Java with Spring Boot, JPA/Hibernate, Maven/Gradle |
| mastering-langgraph-agent-skill | Stateful AI agents and agentic workflows with LangGraph in Python |
| mastering-nextjs | Next.js 13+ App Router — RSC, Server Actions, streaming, performance |
| mastering-python-skill | Modern Python — Poetry/PDM, pytest, FastAPI, Pydantic, async |
| mastering-ruby-skill | Ruby with Rails, idioms, metaprogramming, RSpec |
| mastering-rust-skill | Rust ownership, lifetimes, traits, async, ecosystem |
| mastering-typescript | Enterprise TypeScript 5.9+ — generics, Zod, NestJS, React, LangChain.js |
| mastering-vitest | Vitest testing patterns and configuration for TS/JS projects |
| react-frontend | React engineering — architecture, atomic design, state, forms, testing |
| vue-frontend | Vue.js 3 with Composition API, Pinia, Vue Router |

**When to use**: Complex TypeScript challenges, React patterns, framework-specific work

---

### 060 - Documentation & Design
**Priority**: LOW - Supporting artifacts

| Skill | Purpose |
|-------|---------|
| design-doc-mermaid | Generate Mermaid diagrams (activity, sequence, architecture, ER) from code/text |

**When to use**: Creating technical documentation, visualizing architectures

---

### 070 - Infrastructure (Containers & DevOps)
**Priority**: MEDIUM - Container orchestration and runtime debugging

| Skill | Purpose |
|-------|---------|
| developing-with-docker | Debugging-first Docker across CLI, Compose, Docker Desktop, Rancher Desktop |

**When to use**: Debugging containers, fixing networking/volume issues, cross-platform Docker runtime behavior

---

### 080 - Cloud Platforms
**Priority**: MEDIUM - Cloud-specific CLIs and SDKs

| Skill | Purpose |
|-------|---------|
| mastering-aws-cdk | AWS CDK v2 infrastructure-as-code in TypeScript |
| mastering-aws-cli | AWS CLI v2 — Lambda, ECS, EKS, S3, IAM, Secrets Manager |
| mastering-gcloud-commands | GCP gcloud CLI — Cloud Run, IAM, VPC, AlloyDB, Secret Manager |
| using-firebase | Firebase — Firestore, Cloud Functions, auth, rules, hosting |

**When to use**: Deploying to AWS/GCP, writing IaC, configuring cloud CI/CD

---

## Adding New Skills

1. **Determine the correct group** (010-080) based on primary purpose
2. **Add to group folder**: Create skill in appropriate numbered folder
3. **Update group README**: Add entry to the table above
4. **Consider new group**: If none fit, use next available (090, etc.)

### Adding a New Group (090, 100...)

Only create new groups when:
- Existing groups don't fit (resist creating too many!)
- Clear functional boundary exists
- Group will contain 2+ skills (avoid single-skill groups)

**Example future groups**:
- `090-monitoring` (observability, alerting, tracing)
- `100-data-platforms` (data warehousing, analytics, streaming)

## Skill Priority Matrix

| Group | Priority | Usage Frequency | Examples |
|-------|----------|----------------|----------|
| 010 Foundation | ⭐⭐⭐⭐⭐ | Per ticket | Parallel task setup |
| 020 Workflow | ⭐⭐⭐⭐⭐ | Daily | Feature dev, bug fixes |
| 030 Quality | ⭐⭐⭐⭐ | Pre-merge | PR creation, reviews |
| 040 Integrations | ⭐⭐⭐ | As needed | Ticket/doc management |
| 050 Languages | ⭐⭐⭐ | Complex tasks | Type errors, patterns |
| 060 Documentation | ⭐⭐ | Occasional | Design docs |
| 070 Infrastructure | ⭐⭐⭐ | DevOps tasks | Docker/Compose debugging |
| 080 Cloud Platforms | ⭐⭐⭐ | Deploys | IaC, CLI operations |

## Workflow Examples

### New Feature Implementation
```
1. 040/fetch-ticket-context  → Get full context
2. 020/analyze-requirements  → Plan implementation
3. 020/code-implementation   → Write code
4. 030/code-quality-check    → Verify quality
5. 030/security-review       → Check security
6. 030/create-pr             → Submit for review
```

### Parallel Ticket Kickoff
```
1. 010/start-task            → Create isolated worktree + ports
2. 020/implement-ticket      → End-to-end orchestration inside the worktree
```

### Cloud Deployment Task
```
1. 080/mastering-aws-cdk     → Review CDK patterns
2. 070/developing-with-docker → Debug container issues
3. 040/mastering-github-cli  → Trigger/inspect CI workflows
```

## Naming Conventions

- **Folder names**: `{number}-{kebab-case}` (e.g., `010-foundation`)
- **Skill names**: Match their identifier (e.g., `start-task`)
- **Numbers**: Increments of 10 with room for insertion (010, 020, 030...)

## Sources

- [Johnny Decimal System](https://johnnydecimal.com/) - Decimal numbering methodology
- [Johnny Decimal + PARA Integration](https://help.noteplan.co/article/155-how-to-organize-your-notes-and-folders-using-johnny-decimal-and-para)
- [Why Numbered Folders Work](https://rknight.me/blog/using-the-johnny-decimal-system/)
- [File Organization Best Practices](https://www.asianefficiency.com/organization/organize-your-files-folders-documents/)
