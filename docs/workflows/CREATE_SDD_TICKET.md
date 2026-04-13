# create-sdd-ticket Workflow

Generates comprehensive, gap-free tickets following Specification-Driven Development (SDD) principles.

**Version**: 2.0.0
**File**: `skills/020-development-workflow/create-sdd-ticket/SKILL.md`

---

## Key Principles

### 1. Specification-Driven Development
- Gap-free specifications
- Implementation-ready format
- BDD scenarios define success
- Deep codebase inference before asking questions

### 2. INVEST Criteria
- **I**ndependent - No blocking dependencies
- **N**egotiable - Flexible implementation
- **V**aluable - Delivers user value
- **E**stimable - Clear enough to estimate
- **S**mall - 1-3 days completable
- **T**estable - Clear acceptance criteria

### 3. Minimal Engineer Interruption
Performs deep codebase inference for:
- Architecture patterns
- File placement conventions
- Naming conventions
- Dependencies

---

## Input/Output Modes

### Input Modes

| Mode | Flag | Example |
|------|------|---------|
| Text | `--from-input "text"` | `--from-input "Add JWT auth"` |
| Jira | `--from-jira KEY` | `--from-jira "PROJ-123"` |
| Markdown | `--from-markdown PATH` | `--from-markdown "./draft.md"` |

### Output Modes

| Mode | Flag | Example |
|------|------|---------|
| Markdown | `--save-to-markdown PATH` | `--save-to-markdown "./spec.md"` |
| Jira | `--save-to-jira URL` | `--save-to-jira "<board-url>"` |
| Display | _(none)_ | Preview only |

### Common Usage

```bash
# Text → Markdown (most common)
/create-sdd-ticket --from-input "Add user profile page" --save-to-markdown "./specs/PROF-001.md"

# Enhance Jira ticket
/create-sdd-ticket --from-jira "PROJ-123" --save-to-jira "<board-url>"

# Complete draft
/create-sdd-ticket --from-markdown "./draft.md" --save-to-markdown "./final.md"

# Preview only
/create-sdd-ticket --from-input "Add real-time notifications"
```

---

## Workflow (7 Phases)

1. **Parse Input** - Load from text, Jira, or markdown
2. **Canonical Format** - Transform to standard structure
3. **Codebase Inference** - Infer missing information from codebase
4. **Gap Detection** - Identify and resolve remaining gaps
5. **SDD Template** - Format with user stories and BDD scenarios
6. **INVEST Validation** - Ensure quality criteria met
7. **Output Formatting** - Save to markdown or Jira

---

## Canonical Schema

```json
{
  "id": "PROJ-123",
  "title": "Add user authentication with JWT",
  "userStory": {
    "asA": "registered user",
    "iWantTo": "log in securely",
    "soThat": "I can access protected features"
  },
  "acceptanceCriteria": [
    {
      "scenario": "Successful login",
      "given": "valid credentials",
      "when": "submit login form",
      "then": "receive JWT token"
    }
  ],
  "technicalContext": {
    "architecture": "Backend: NestJS + JWT, Frontend: React",
    "dependencies": ["@nestjs/jwt", "bcrypt"],
    "filesToModify": ["src/auth/auth.controller.ts"]
  },
  "estimatedEffort": "2 days",
  "priority": "high"
}
```

---

## SDD Template Structure

```markdown
# [ID] Title

## User Story
As a [role]
I want to [action]
So that [benefit]

## Acceptance Criteria (BDD)

### Scenario: [Happy path]
**Given** [precondition]
**When** [action]
**Then** [expected outcome]

## Technical Context

### Architecture
[Technical approach]

### Dependencies
- [List]

### Files to Modify
- `path/to/file.ts`

## Testing Strategy
- Unit: [What to test]
- Integration: [What to test]

## Estimated Effort
[1-3 days]
```

---

## Examples

### Quick Text → Markdown

```bash
/create-sdd-ticket --from-input "Add real-time notifications using WebSockets" --save-to-markdown "./specs/NOTIF-001.md"
```

**Process**:
1. Parse text input
2. Infer architecture from codebase
3. Infer file placement
4. Ask minimal questions
5. Generate complete ticket
6. Save to file

### Enhance Jira Ticket

```bash
/create-sdd-ticket --from-jira "PROJ-456" --save-to-jira "<board-url>"
```

**Process**:
1. Fetch from Jira
2. Convert to canonical format
3. Add missing BDD scenarios
4. Infer technical context
5. Update Jira ticket

---

## Troubleshooting

### Too Many Questions
**Solution**:
- Ensure `.claude/CLAUDE.md` is up to date
- Ensure `.claude/skills/project-context/SKILL.md` exists
- Add similar features to codebase for inference

### Ticket Too Large
**Solution**:
- Skill suggests splitting
- Focus on smaller scope
- Create multiple tickets

### Missing Technical Context
**Solution**:
- Provide detailed input: `--from-input "Add JWT auth using @nestjs/jwt"`
- Answer technical questions when prompted

---

## Performance

| Phase | Time |
|-------|------|
| Parse input | 5s |
| Canonicalization | 10s |
| Codebase inference | 30s |
| Gap resolution | 15s |
| Template application | 10s |
| INVEST validation | 10s |
| Output formatting | 10s |
| **Total** | **~90s** |

---

**See also**:
- `skills/020-development-workflow/create-sdd-ticket/SKILL.md`
- `schemas/sdd-ticket.schema.json`
