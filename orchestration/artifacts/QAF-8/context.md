# QAF-8: Consolidate Documentation Structure

**Status**: In Progress
**Priority**: High
**Estimated Effort**: 3-5 days

## Summary

Consolidate all scattered documentation files into a unified `/docs` folder structure, eliminate duplicate READMEs across the codebase, and create a single authoritative root README with a comprehensive index linking to all documentation.

## Requirements

1. **Consolidate Documentation**: Move all framework contributor documentation to `/docs` folder
2. **Eliminate Duplicates**: Remove duplicate READMEs outside `/docs` (orchestration/, docker/, tests/, skills/)
3. **Preserve Git History**: Use `git mv` for all file relocations
4. **Update Cross-References**: Fix all internal markdown links to point to new locations
5. **Clean Root README**: Convert root README to clean index (<200 lines)
6. **Organize by Category**: Structure docs into logical subdirectories

## Acceptance Criteria

### AC1: All Documentation Consolidated to /docs
- All framework contributor documentation exists in `/docs` folder
- No README files outside root (except `/docs` subdirs)
- Root README contains only project overview and documentation index

### AC2: Git History Preserved for Moved Files
- `git log --follow` shows full history for moved files
- `git blame` shows original authors

### AC3: All Internal Links Updated
- All markdown links in `/docs` resolve correctly
- No broken links in any documentation file

### AC4: Root README is Clean Index
- Contains: project title, overview, documentation index, quick start, CONTRIBUTING link
- Less than 200 lines

### AC5: Subdirectory READMEs Removed
- orchestration/README.md content moved to `/docs`
- docker/README.md content moved to `/docs`
- tests/README.md content moved to `/docs`

### AC6: No Duplicate Documentation
- Each concept documented in exactly one location

### AC7: Documentation Structure is Browsable
- Organized by category with clear file names

## Target Directory Structure

```
docs/
├── getting-started/
│   ├── QUICKSTART.md (moved from root)
│   ├── INSTALLATION.md (new, extracted from README)
│   └── CONTRIBUTING.md (moved from root)
├── architecture/
│   ├── ARCHITECTURE.md (existing)
│   ├── ORCHESTRATION.md (from orchestration/README.md)
│   └── SKILLS_AND_AGENTS_MAP.md (moved from root)
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
│   ├── SKILL_CATALOG.md (from root)
│   └── CLAUDE_CLI_BUNDLING.md (existing)
├── security/
│   └── SECURITY.md (existing)
├── infrastructure/
│   ├── DOCKER.md (from docker/claude-runtime/README.md)
│   └── TESTING.md (from tests/README.md)
└── skills/
    └── [skill-specific docs from skills/*/README.md]
```

## Implementation Phases

### Phase 1: Audit & Map
1. List all markdown files outside `/docs`
2. Create old-path → new-path mapping
3. Identify content to extract from root README
4. Document all cross-references to update

### Phase 2: Create Structure
1. Create `/docs` subdirectory structure
2. Move files with `git mv` to preserve history
3. Extract sections from root README to new files
4. Remove duplicate READMEs in subdirectories

### Phase 3: Update References
1. Update all internal markdown links
2. Update root README to be clean index
3. Update CLAUDE.md if it references moved files
4. Update any scripts that reference old paths

### Phase 4: Validation
1. Run link checker on all markdown files
2. Verify git history preserved (`git log --follow`)
3. Test all documentation links manually
4. Verify no broken references

## Out of Scope

- Content updates/rewrites (separate ticket)
- Accuracy audits of existing docs (separate ticket)
- GitHub Pages site creation (separate ticket)
