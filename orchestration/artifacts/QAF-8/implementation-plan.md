# Implementation Plan: QAF-8 Consolidate Documentation Structure

## Phase 1: File Audit

### Current Documentation Files Outside /docs

#### Root Level Files
- `/README.md` - Mixed user/contributor content (KEEP but simplify)
- `/CONTRIBUTING.md` - Contributor guidelines
- `/QUICKSTART.md` - Quick start guide

#### Subdirectory READMEs
- `/orchestration/README.md` - Orchestration architecture
- `/orchestration/docs/HYBRID_AUTHENTICATION.md` - Auth documentation
- `/orchestration/docs/PROVIDER_SWITCHING.md` - Provider switching
- `/docker/claude-runtime/README.md` - Docker runtime setup

#### Skills Directory
- `/skills/*/README.md` - Category-level READMEs for skill organization

### Current /docs Structure
```
docs/
├── ADDING_SKILLS.md
├── API_REFERENCE.md
├── ARCHITECTURE.md
├── CLAUDE_CLI_BUNDLING.md
├── CREATE_SDD_TICKET.md
├── IMPLEMENT_TICKET.md
├── INITIALIZE_PROJECT.md
├── PILOT_GUIDE.md
├── SECURITY.md
├── SKILLS_SPEC.md
├── UI_VALIDATION_TESTING_PIPELINE.md
├── USER_GUIDE.md
├── WRITING_GOOD_TICKETS.md
├── templates/
│   ├── SKILL_TEMPLATE_REFERENCE.md
│   └── SKILL_TEMPLATE_WORKFLOW.md
└── ui-validation/
    ├── 01-overview-and-architecture.md
    ├── 02-pillar-1-ui-task-detection.md
    ├── 03-pillar-2-ticket-creation.md
    ├── 04-pillar-3-ui-testing-strategy.md
    ├── 05-pillar-4-visual-testing.md
    ├── 06-integration-points.md
    └── 07-implementation-guide.md
```

## Phase 2: Target Directory Structure

```
docs/
├── getting-started/
│   ├── INSTALLATION.md (extracted from README)
│   ├── QUICKSTART.md (moved from root)
│   └── CONTRIBUTING.md (moved from root)
├── architecture/
│   ├── ARCHITECTURE.md (existing)
│   ├── ORCHESTRATION.md (from orchestration/README.md)
│   └── SKILLS_AND_AGENTS_MAP.md (extracted from README if exists)
├── workflows/
│   ├── INITIALIZE_PROJECT.md (existing)
│   ├── IMPLEMENT_TICKET.md (existing)
│   └── CREATE_SDD_TICKET.md (existing)
├── guides/
│   ├── USER_GUIDE.md (existing)
│   ├── PILOT_GUIDE.md (existing)
│   ├── WRITING_GOOD_TICKETS.md (existing)
│   └── ADDING_SKILLS.md (existing)
├── reference/
│   ├── API_REFERENCE.md (existing)
│   ├── SKILLS_SPEC.md (existing, rename from SKILLS_SPEC.md)
│   ├── CLAUDE_CLI_BUNDLING.md (existing)
│   └── templates/ (existing)
│       ├── SKILL_TEMPLATE_REFERENCE.md
│       └── SKILL_TEMPLATE_WORKFLOW.md
├── security/
│   └── SECURITY.md (existing)
├── infrastructure/
│   ├── DOCKER.md (from docker/claude-runtime/README.md)
│   ├── HYBRID_AUTHENTICATION.md (from orchestration/docs/)
│   └── PROVIDER_SWITCHING.md (from orchestration/docs/)
└── ui-validation/ (existing)
    ├── OVERVIEW.md (renamed from 01-overview-and-architecture.md)
    ├── UI_TASK_DETECTION.md (merged content)
    ├── TICKET_CREATION.md (merged content)
    ├── TESTING_STRATEGY.md (merged content)
    ├── VISUAL_TESTING.md (merged content)
    ├── INTEGRATION_POINTS.md (merged content)
    └── IMPLEMENTATION_GUIDE.md (merged content)
```

## Phase 3: File Operations

### 3.1 Create New Directories

```bash
mkdir -p docs/getting-started
mkdir -p docs/architecture
mkdir -p docs/workflows
mkdir -p docs/guides
mkdir -p docs/reference
mkdir -p docs/security
mkdir -p docs/infrastructure
```

### 3.2 Move Files with git mv (Preserves History)

```bash
# Getting Started
git mv QUICKSTART.md docs/getting-started/QUICKSTART.md
git mv CONTRIBUTING.md docs/getting-started/CONTRIBUTING.md

# Architecture
git mv orchestration/README.md docs/architecture/ORCHESTRATION.md

# Infrastructure
git mv docker/claude-runtime/README.md docs/infrastructure/DOCKER.md
git mv orchestration/docs/HYBRID_AUTHENTICATION.md docs/infrastructure/HYBRID_AUTHENTICATION.md
git mv orchestration/docs/PROVIDER_SWITCHING.md docs/infrastructure/PROVIDER_SWITCHING.md

# Move existing docs into new structure
git mv docs/ADDING_SKILLS.md docs/guides/ADDING_SKILLS.md
git mv docs/USER_GUIDE.md docs/guides/USER_GUIDE.md
git mv docs/PILOT_GUIDE.md docs/guides/PILOT_GUIDE.md
git mv docs/WRITING_GOOD_TICKETS.md docs/guides/WRITING_GOOD_TICKETS.md

git mv docs/INITIALIZE_PROJECT.md docs/workflows/INITIALIZE_PROJECT.md
git mv docs/IMPLEMENT_TICKET.md docs/workflows/IMPLEMENT_TICKET.md
git mv docs/CREATE_SDD_TICKET.md docs/workflows/CREATE_SDD_TICKET.md

git mv docs/ARCHITECTURE.md docs/architecture/ARCHITECTURE.md

git mv docs/API_REFERENCE.md docs/reference/API_REFERENCE.md
git mv docs/SKILLS_SPEC.md docs/reference/SKILLS_SPEC.md
git mv docs/CLAUDE_CLI_BUNDLING.md docs/reference/CLAUDE_CLI_BUNDLING.md

git mv docs/SECURITY.md docs/security/SECURITY.md

# UI Validation files - rename for clarity
git mv docs/UI_VALIDATION_TESTING_PIPELINE.md docs/ui-validation/OVERVIEW.md
```

### 3.3 Remove Empty Directories

```bash
rmdir orchestration/docs  # After moving files
# docker/claude-runtime/ directory kept for Dockerfile, docker-compose.yml
```

## Phase 4: Cross-Reference Updates

### 4.1 Update Internal Links in Moved Files

**Pattern Search & Replace:**

| Old Path Pattern | New Path Pattern | Files to Update |
|------------------|------------------|-----------------|
| `](README.md)` | `](../README.md)` | All docs in subdirectories |
| `](docs/ARCHITECTURE.md)` | `](architecture/ARCHITECTURE.md)` | All docs |
| `](docs/ADDING_SKILLS.md)` | `](guides/ADDING_SKILLS.md)` | All docs |
| `](docs/USER_GUIDE.md)` | `](guides/USER_GUIDE.md)` | All docs |
| `](CONTRIBUTING.md)` | `](docs/getting-started/CONTRIBUTING.md)` | README.md |
| `](QUICKSTART.md)` | `](docs/getting-started/QUICKSTART.md)` | README.md |
| `](orchestration/README.md)` | `](docs/architecture/ORCHESTRATION.md)` | All docs |
| `](docker/claude-runtime/README.md)` | `](docs/infrastructure/DOCKER.md)` | All docs |

### 4.2 Files That Need Link Updates

**High Priority (contain many doc links):**
1. `/README.md` - Root index
2. All files in `/docs` subdirectories
3. `/.claude/CLAUDE.md` - May reference documentation paths
4. `/orchestration/.claude/CLAUDE.md` - May reference documentation paths

**Search Commands to Find References:**
```bash
# Find all markdown files referencing moved docs
rg "CONTRIBUTING\.md" --type md -g "!node_modules"
rg "QUICKSTART\.md" --type md -g "!node_modules"
rg "orchestration/README\.md" --type md -g "!node_modules"
rg "docker/claude-runtime/README\.md" --type md -g "!node_modules"
rg "docs/ARCHITECTURE\.md" --type md -g "!node_modules"
rg "docs/ADDING_SKILLS\.md" --type md -g "!node_modules"
```

### 4.3 Update Root README.md

**New Structure (< 200 lines):**

```markdown
# AI Agentic Framework

[Project overview - 2-3 paragraphs]

## Quick Start

See [Quick Start Guide](docs/getting-started/QUICKSTART.md)

## Documentation Index

### Getting Started
- [Installation](docs/getting-started/INSTALLATION.md)
- [Quick Start](docs/getting-started/QUICKSTART.md)
- [Contributing](docs/getting-started/CONTRIBUTING.md)

### Architecture
- [System Architecture](docs/architecture/ARCHITECTURE.md)
- [Orchestration Layer](docs/architecture/ORCHESTRATION.md)

### Workflows
- [Initialize Project](docs/workflows/INITIALIZE_PROJECT.md)
- [Implement Ticket](docs/workflows/IMPLEMENT_TICKET.md)
- [Create SDD Ticket](docs/workflows/CREATE_SDD_TICKET.md)

### Guides
- [User Guide](docs/guides/USER_GUIDE.md)
- [Pilot Guide](docs/guides/PILOT_GUIDE.md)
- [Writing Good Tickets](docs/guides/WRITING_GOOD_TICKETS.md)
- [Adding Skills](docs/guides/ADDING_SKILLS.md)

### Reference
- [API Reference](docs/reference/API_REFERENCE.md)
- [Skills Specification](docs/reference/SKILLS_SPEC.md)
- [Claude CLI Bundling](docs/reference/CLAUDE_CLI_BUNDLING.md)

### Infrastructure
- [Docker Setup](docs/infrastructure/DOCKER.md)
- [Hybrid Authentication](docs/infrastructure/HYBRID_AUTHENTICATION.md)
- [Provider Switching](docs/infrastructure/PROVIDER_SWITCHING.md)

### Security
- [Security Policy](docs/security/SECURITY.md)

### UI Validation
- [Overview](docs/ui-validation/OVERVIEW.md)

## License

[License info]
```

## Phase 5: Validation

### 5.1 Git History Verification

```bash
# Verify git history preserved for moved files
git log --follow docs/getting-started/QUICKSTART.md
git log --follow docs/getting-started/CONTRIBUTING.md
git log --follow docs/architecture/ORCHESTRATION.md
git log --follow docs/infrastructure/DOCKER.md

# Verify git blame works
git blame docs/getting-started/QUICKSTART.md
```

### 5.2 Link Validation

```bash
# Check for broken links (use markdown-link-check or similar)
find docs -name "*.md" -exec markdown-link-check {} \;

# Manual verification of key files
# - README.md links
# - .claude/CLAUDE.md links
# - All docs/*/README.md if any exist
```

### 5.3 Test Build/Deploy Processes

- Verify CI/CD pipelines don't reference old doc paths
- Check if any scripts reference old README paths
- Verify no external links are broken (e.g., from other repos)

## Phase 6: Risk Assessment

### Identified Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| External references to moved READMEs | High | Add GitHub redirects if possible; check for incoming links |
| CI/CD pipeline references | Medium | Search CI config for doc paths before moving |
| Scripts referencing doc paths | Medium | Search codebase for hardcoded doc paths |
| Broken internal links | High | Automated link checker + manual verification |

### Pre-Move Checklist

1. Search for hardcoded paths in:
   - `.github/workflows/*.yml`
   - `package.json` scripts
   - All TypeScript/JavaScript files for doc imports
   - Shell scripts in `/scripts` if exists

2. Backup current state:
   ```bash
   git tag pre-doc-consolidation
   ```

## Implementation Order

1. **Phase 3.1**: Create directory structure
2. **Phase 3.2**: Move files with `git mv`
3. **Phase 4**: Update all internal links
4. **Phase 3.3**: Remove empty directories
5. **Phase 5**: Validation
6. **Commit**: Single atomic commit with all changes

## Test Plan

### AC1: All Documentation Consolidated to /docs
- [ ] All markdown files in /docs subdirectories
- [ ] No README files in orchestration/, docker/
- [ ] Root README is index only

### AC2: Git History Preserved
- [ ] `git log --follow` works for all moved files
- [ ] `git blame` shows original authors

### AC3: All Internal Links Updated
- [ ] No broken links in markdown files
- [ ] All cross-references resolve correctly

### AC4: Root README < 200 lines
- [ ] Line count verified
- [ ] Contains only overview + index

### AC5: Subdirectory READMEs Removed
- [ ] orchestration/README.md moved
- [ ] docker/claude-runtime/README.md moved
- [ ] orchestration/docs/ files moved

### AC6: No Duplicate Documentation
- [ ] Each concept in one location
- [ ] No conflicting information

### AC7: Documentation Structure Browsable
- [ ] Clear category organization
- [ ] Logical file naming
