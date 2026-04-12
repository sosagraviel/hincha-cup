---
name: create-sdd-ticket
description: Generate specification-driven development (SDD) tickets with intelligent gap detection and minimal engineer questions
---

# /create-sdd-ticket

Generate comprehensive, implementation-ready SDD tickets following INVEST criteria and BDD format.

## Usage

```bash
/create-sdd-ticket [INPUT] [OUTPUT] [OPTIONS]
```

### Required Flags

**INPUT** (mutually exclusive, one required):
- `--from-input "description"` - Create from plain text description
- `--from-jira <JIRA-URL>` - Refine existing Jira ticket
- `--from-markdown <PATH>` - Refine existing markdown ticket

**OUTPUT** (mutually exclusive, one required):
- `--save-to-jira <BOARD-URL>` - Create ticket in Jira board
- `--save-to-markdown <PATH>` - Save as markdown file

### Optional Flags

- `--project-key <KEY>` - Jira project key (for --save-to-jira)
- `--issue-type <TYPE>` - Issue type: Story, Task, Bug (default: Story)
- `--priority <PRIORITY>` - Priority: High, Medium, Low (default: Medium)

## Examples

### Example 1: Plain text to Jira
```bash
/create-sdd-ticket \
  --from-input "Add user export feature for admins to download CSV reports" \
  --save-to-jira https://acme.atlassian.net/jira/software/projects/PROJ/boards/1 \
  --project-key PROJ \
  --priority High
```

### Example 2: Plain text to Markdown
```bash
/create-sdd-ticket \
  --from-input "Implement password reset flow with email verification" \
  --save-to-markdown .claude-temp/tickets/password-reset/password-reset.md
```

### Example 3: Refine Jira ticket to Markdown
```bash
/create-sdd-ticket \
  --from-jira https://acme.atlassian.net/browse/PROJ-100 \
  --save-to-markdown ./specs/refined-PROJ-100.md
```

### Example 4: Refine Markdown ticket to Jira
```bash
/create-sdd-ticket \
  --from-markdown ./specs/draft-feature.md \
  --save-to-jira https://acme.atlassian.net/jira/software/projects/PROJ/boards/1 \
  --project-key PROJ
```

### Example 5: Refine Jira to different Jira board
```bash
/create-sdd-ticket \
  --from-jira PROJ-100 \
  --save-to-jira https://acme.atlassian.net/jira/software/projects/ENG/boards/2 \
  --project-key ENG
```

## Workflow

### Phase 0: Inject project context
- Invoke /project-context skill to get in depth context of the project

### Phase 1: Parse Input Source
- Fetch/read ticket from specified source (Jira/Markdown/Text)
- Convert to canonical internal format
- Validate basic structure

### Phase 2: Intelligent Gap Detection
- Validate ticket against SDD schema requirements
- For EACH missing/incomplete field:
  1. **Search codebase** for patterns, similar implementations
  2. **Analyze related files** for architectural patterns
  3. **Check existing tickets** for precedents
  4. **Only if inference fails**: Add to question list

### Phase 3: Batch Question Generation
- Generate MINIMAL questions for unresolved gaps only
- Include context of what was searched
- Present all questions at once (batch mode)
- Wait for engineer answers

### Phase 4: Process Answers & Fill Gaps
- Parse engineer answers
- Fill gaps in canonical ticket
- Re-validate completeness

### Phase 5: Apply INVEST Criteria
- Independent: Check for blocking dependencies
- Negotiable: Ensure flexibility in approach
- Valuable: Validate business value clear
- Estimable: Ensure enough detail for estimation
- Small: Validate 1-5 day scope (suggest splits if too large)
- Testable: Ensure acceptance criteria verifiable

### Phase 6: Generate BDD Scenarios
- Convert acceptance criteria to Given-When-Then format
- Generate 3-7 scenarios (happy path, edge cases, errors)
- Use concrete examples (not vague descriptions)

### Phase 7: Output Ticket
- Format canonical ticket to output destination
- If Jira: Create ticket via MCP
- If Markdown:
  - **IMPORTANT**: ALWAYS save to `.claude-temp/tickets/<ticket-id>/<ticket-id>.md`
  - Create parent directories if they don't exist
  - Use ticket ID or timestamp for directory name
  - Write file with proper structure
- Return ticket ID/path to user

## Key Features

### ✅ Intelligent Gap Detection
- **Maximum autonomy**: Exhaustive codebase search before asking questions
- **Context-aware**: Learns from project patterns and conventions
- **Minimal questions**: Only asks what can't be inferred from code

### ✅ INVEST Validation
- Validates all criteria before ticket creation
- Suggests splits if ticket too large
- Ensures implementation-ready quality

### ✅ BDD Format
- Generates Given-When-Then scenarios
- Concrete, verifiable examples
- Covers happy path, edge cases, errors

### ✅ Stack Agnostic
- Works with any tech stack
- No framework-specific assumptions
- Adapts to project conventions

## Error Handling

### Invalid Input Source
```
❌ Error: Cannot access input source
  - Jira ticket not found: PROJ-999
  - Check ticket key and permissions

Fix: Verify ticket exists and you have access
```

### Incomplete Gap Detection
```
⚠️ Unable to infer the following from codebase:

1. Who is the primary user for this feature?
   (Searched: CLAUDE.md, user models, auth patterns)

2. What is the success metric?
   (Searched: analytics code, dashboard configs)

Please provide answers to proceed.
```

### INVEST Validation Failure
```
⚠️ INVEST Validation Failed: Ticket too large (estimated 8-10 days)

Recommendation: Split into 3 tickets:
  - TICKET-1: Core feature (3 days)
  - TICKET-2: Error handling (2 days)
  - TICKET-3: Performance optimization (3 days)

Proceed with split? [y/n]
```

### Output Destination Error
```
❌ Error: Cannot write to output destination
  - Permission denied: /protected/path/ticket.md

Fix: Check directory permissions or use different path
```

## Best Practices

### DO ✅
- Provide detailed context in --from-input descriptions
- Use absolute paths for markdown files
- Specify project-key when saving to Jira
- Review generated questions carefully before answering
- Answer all questions in batch (numbered format)

### DON'T ❌
- Don't use vague descriptions ("add feature")
- Don't skip questions (answer "I don't know" if unsure)
- Don't create tickets without INVEST validation
- Don't make architectural decisions in questions
- Don't bypass gap detection (answer honestly)

## Integration with Other Skills

- **fetch-ticket-context**: Automatically used when --from-jira specified
- **implement-ticket**: Generated tickets ready for immediate implementation
- **project-context**: Automatically consulted for gap detection

## Prerequisites

- For `--from-jira` or `--save-to-jira`: Jira MCP configured
- For markdown operations: Write permissions to target directory
- For gap detection: Project must have been initialized with /initialize-project

## Output Format

### Jira Output
```
✅ SDD Ticket Created: PROJ-123

Summary: Add user export feature
Link: https://acme.atlassian.net/browse/PROJ-123
Status: Ready for Implementation

INVEST Validation: ✅ All criteria passed
BDD Scenarios: 5 scenarios ready for testing
Gap Detection: 2 fields inferred from codebase, 3 questions asked

Next steps:
- Review ticket in Jira
- Assign to sprint/epic
- Use /implement-ticket --from-jira PROJ-123 to begin
```

### Markdown Output
```
✅ SDD Ticket Created: ./specs/user-export.md

Ticket ID: DRAFT-20260307-143022
Status: Ready for Implementation

INVEST Validation: ✅ All criteria passed
BDD Scenarios: 5 scenarios included
Gap Detection: 3 fields inferred from codebase, 2 questions asked

Next steps:
- Review ticket at ./specs/user-export.md
- Use /implement-ticket --from-markdown ./specs/user-export.md to begin
```

## Troubleshooting

**Q: "Too many questions being asked"**
A: Gap detection should ask minimal questions. If getting >5 questions, check:
- Is project initialized? (/initialize-project)
- Is CLAUDE.md populated with project context?
- Are there similar features in codebase to learn from?

**Q: "Can't infer technical approach"**
A: This is expected - architectural decisions should be made by engineer, not inferred.
The model will ask when multiple valid approaches exist.

**Q: "INVEST validation keeps failing"**
A: Review feedback and either:
- Split ticket into smaller pieces
- Add missing details
- Clarify scope boundaries

**Q: "Jira ticket creation fails"**
A: Check:
- Jira MCP configured (see .claude/mcp.json)
- Valid project key provided
- Permissions to create tickets in board
- Network connectivity to Atlassian

---

**Version**: 2.0.0
**Last Updated**: 2026-03-07
**Category**: development-workflow