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

### 010 - Foundation (Bootstrap & Project Setup)
**Priority**: HIGHEST - These skills establish the project foundation

| Skill | Purpose |
|-------|---------|
| initialize-project | Deep codebase analysis → generates CLAUDE.md + project-context skill |
| project-context | Hard-to-discover architectural knowledge (auth flows, real-time, guard stacking) |
| analyze-requirements | Jira ticket analysis → implementation planning with file changes & risks |

**When to use**: Starting new projects, onboarding to codebases, understanding complex flows

---

### 020 - Development Workflow (Daily Development)
**Priority**: HIGH - Core development cycle skills used daily

| Skill | Purpose |
|-------|---------|
| code-implementation | Language-aware implementation (auto-detects Python/TypeScript) |
| implement-ticket | End-to-end ticket orchestrator: analyze → implement → quality → security → PR |

**When to use**: Implementing features, fixing bugs, daily coding tasks

---

### 030 - Quality Assurance (Testing & Security)
**Priority**: HIGH - Quality gates before code ships

| Skill | Purpose |
|-------|---------|
| code-quality-check | Linting, type checking, test coverage (80%+ threshold) |
| security-review | OWASP Top 10 scanning, secrets detection, vulnerability analysis |
| create-pr | GitHub PR with conventional commits, descriptions, Jira links |

**When to use**: Before merging code, pre-PR validation, security audits

---

### 040 - Integrations (External Platforms)
**Priority**: MEDIUM - Connect to external services

| Skill | Purpose |
|-------|---------|
| jira | Jira operations (create, update, transition, search with JQL) |
| mastering-github-cli | GitHub operations (PRs, issues, repos, code search) |
| mastering-confluence | Confluence pages, CQL search, ADF/markdown conversion |
| notion-document-manager | Notion operations with smart chunking for large pages |
| fetch-ticket-context | Fetch complete Jira context + external docs (Notion/Confluence) |

**When to use**: Managing tickets, documentation, cross-platform workflows

---

### 050 - Language & Framework Expertise
**Priority**: MEDIUM - Tech-specific deep knowledge

| Skill | Purpose |
|-------|---------|
| mastering-typescript | TypeScript patterns, strict mode, NestJS/React integration |
| react-frontend | React 19, TanStack Router/Query, Tailwind v4, Radix UI |
| atomic-design-react | Atomic Design methodology for component architecture |

**When to use**: Complex TypeScript challenges, React patterns, component design

---

### 060 - Documentation & Design
**Priority**: LOW - Supporting artifacts

| Skill | Purpose |
|-------|---------|
| design-doc-mermaid | Generate Mermaid diagrams (activity, sequence, architecture) from code/text |

**When to use**: Creating technical documentation, visualizing architectures

---

## Adding New Skills

1. **Determine the correct group** (010-060) based on primary purpose
2. **Add to group folder**: Create skill in appropriate numbered folder
3. **Update group README**: Add entry to the table above
4. **Consider new group**: If none fit, use next available (070, 080, etc.)

### Adding a New Group (070, 080...)

Only create new groups when:
- Existing groups don't fit (resist creating too many!)
- Clear functional boundary exists
- Group will contain 2+ skills (avoid single-skill groups)

**Example future groups**:
- `070-deployment` (CI/CD, infrastructure)
- `080-monitoring` (observability, alerting)

## Skill Priority Matrix

| Group | Priority | Usage Frequency | Examples |
|-------|----------|----------------|----------|
| 010 Foundation | ⭐⭐⭐⭐⭐ | Once per project | Onboarding, setup |
| 020 Workflow | ⭐⭐⭐⭐⭐ | Daily | Feature dev, bug fixes |
| 030 Quality | ⭐⭐⭐⭐ | Pre-merge | PR creation, reviews |
| 040 Integrations | ⭐⭐⭐ | As needed | Ticket management |
| 050 Languages | ⭐⭐⭐ | Complex tasks | Type errors, patterns |
| 060 Documentation | ⭐⭐ | Occasional | Design docs |

## Workflow Examples

### New Feature Implementation
```
1. 040/fetch-ticket-context  → Get full context
2. 010/analyze-requirements  → Plan implementation
3. 020/code-implementation   → Write code
4. 030/code-quality-check    → Verify quality
5. 030/security-review       → Check security
6. 030/create-pr             → Submit for review
```

### New Project Onboarding
```
1. 010/initialize-project    → Generate CLAUDE.md
2. 010/project-context       → Load architectural knowledge
3. 050/mastering-typescript  → Review tech patterns
```

## Naming Conventions

- **Folder names**: `{number}-{kebab-case}` (e.g., `010-foundation`)
- **Skill names**: Match their identifier (e.g., `initialize-project`)
- **Numbers**: Increments of 10 with room for insertion (010, 020, 030...)

## Sources

- [Johnny Decimal System](https://johnnydecimal.com/) - Decimal numbering methodology
- [Johnny Decimal + PARA Integration](https://help.noteplan.co/article/155-how-to-organize-your-notes-and-folders-using-johnny-decimal-and-para)
- [Why Numbered Folders Work](https://rknight.me/blog/using-the-johnny-decimal-system/)
- [File Organization Best Practices](https://www.asianefficiency.com/organization/organize-your-files-folders-documents/)
