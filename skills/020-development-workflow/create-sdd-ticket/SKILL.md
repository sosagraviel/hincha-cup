---
name: create-sdd-ticket
description: Generate specification-driven development (SDD) tickets with intelligent gap detection and multiple input/output formats
version: 2.0.0
category: development-workflow
keywords: [sdd, tickets, requirements, jira, markdown, planning, specifications]
prerequisites:
  - jira (optional, only for --from-jira or --save-to-jira)
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - mcp__atlassian__* (if using Jira)
last_updated: 2026-03-08
---

# Create SDD Ticket Skill

**Purpose**: Generate comprehensive, assumption-free tickets following Specification-Driven Development (SDD) principles with intelligent gap detection from multiple sources.

**Version**: 2.0.0
**Last Updated**: 2026-03-08

---

## ⚠️ Migration Notice

> **This functionality has been migrated to the TypeScript orchestration module.**
>
> ### New Approach (Orchestration CLI)
>
> ```bash
> # From project root
> cd orchestration
> npm run create-sdd-ticket -- --source jira PROJ-123
> ```
>
> ### Orchestration Implementation
>
> The utilities referenced in this skill have been migrated to:
> - **Ticket Parsing**: `orchestration/src/nodes/implement-ticket/phase1-context.node.ts`
> - **Gap Detection**: `orchestration/src/services/gap-questions.service.ts`
> - **Validation**: `orchestration/src/utils/validator.ts`
> - **Formatting**: `orchestration/src/nodes/implement-ticket/phase8-pr.node.ts`
>
> ### Direct API Usage (TypeScript)
>
> ```typescript
> import { validateTicket } from './orchestration/src/utils/validator.js';
> import { GapQuestionsService } from './orchestration/src/services/gap-questions.service.js';
>
> // Use orchestration services directly in TypeScript
> ```
>
> **The examples below reference the deprecated `utils/` folder for historical context.**

---

## Overview

This skill produces gap-free, implementation-ready tickets by:
1. **Supporting multiple input sources** (text, Jira, markdown)
2. **Intelligent gap detection** (deep codebase inference before asking questions)
3. **Multiple output formats** (Jira, markdown)
4. **Applying INVEST criteria** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
5. **Using BDD format** (Given-When-Then scenarios)
6. **Minimizing engineer interruption** (maximum autonomous inference)

**Critical Principle**: The skill performs deep codebase research to infer missing information before asking ANY questions. Only unresolvable gaps require engineer input.

---

## Input/Output Modes

### Input Modes

#### 1. Text Input (`--from-input "text"`)
Free-form text describing the requirement:
```bash
/create-sdd-ticket --from-input "Add user authentication with JWT tokens" --save-to-markdown "./specs/AUTH-001.md"
```

#### 2. Jira Input (`--from-jira <JIRA-URL-OR-KEY>`)
Import existing Jira ticket and enhance it:
```bash
/create-sdd-ticket --from-jira "https://company.atlassian.net/browse/PROJ-123" --save-to-markdown "./specs/PROJ-123.md"
/create-sdd-ticket --from-jira "PROJ-123" --save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

#### 3. Markdown Input (`--from-markdown <PATH>`)
Import existing markdown ticket and complete gaps:
```bash
/create-sdd-ticket --from-markdown "./specs/DRAFT-001.md" --save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

### Output Modes

#### 1. Markdown Output (`--save-to-markdown <PATH>`)
Save as markdown file following SDD template:
```bash
--save-to-markdown "./specs/PROJ-123.md"
```

#### 2. Jira Output (`--save-to-jira <BOARD-URL>`)
Create/update Jira ticket:
```bash
--save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

#### 3. Display Only (no output flag)
Display canonical ticket in console without saving.

### All Valid Combinations

```bash
# Text → Markdown
/create-sdd-ticket --from-input "..." --save-to-markdown "./specs/ticket.md"

# Text → Jira
/create-sdd-ticket --from-input "..." --save-to-jira "<board-url>"

# Jira → Markdown (enhance Jira ticket)
/create-sdd-ticket --from-jira "PROJ-123" --save-to-markdown "./specs/PROJ-123.md"

# Jira → Jira (update Jira ticket with enhancements)
/create-sdd-ticket --from-jira "PROJ-123" --save-to-jira "<board-url>"

# Markdown → Jira (complete draft and publish)
/create-sdd-ticket --from-markdown "./specs/DRAFT-001.md" --save-to-jira "<board-url>"

# Markdown → Markdown (complete draft and save)
/create-sdd-ticket --from-markdown "./specs/DRAFT-001.md" --save-to-markdown "./specs/FEAT-001.md"
```

---

## Execution Workflow (7 Phases)

### Phase 1: Parse Input Source

**Actions**:
1. **Detect input mode** from arguments (`--from-input`, `--from-jira`, `--from-markdown`)
2. **Load input data**:
   - **Text mode**: Use provided string directly
   - **Jira mode**: Fetch ticket via MCP, extract all fields
   - **Markdown mode**: Read file, parse sections
3. **Validate input**: Ensure required data is accessible

**Tools**:
```javascript
const { parseCreateSddTicketArgs } = require('../../utils/argument-parser');
const args = parseCreateSddTicketArgs(process.argv.slice(2));
```

**Output**: Raw input data ready for conversion

---

### Phase 2: Convert to Canonical Format

**Actions**:
1. **Select appropriate parser** based on input mode
2. **Parse input into canonical ticket structure** (see `schemas/sdd-ticket.schema.json`)
3. **Extract all available information**:
   - User story components (role, goal, benefit)
   - Stakeholders
   - Success criteria
   - Acceptance criteria (BDD scenarios)
   - Technical context
   - Dependencies
   - Metadata

**Tools**:
```javascript
const { parseJiraTicket } = require('../../utils/ticket-io/parsers/jira-parser');
const { parseMarkdownTicket } = require('../../utils/ticket-io/parsers/markdown-parser');

// For text input
const canonical = {
  id: generateDraftId(),
  source: 'input',
  title: inputText.slice(0, 100),
  userStory: { role: null, goal: inputText, benefit: null },
  // ... rest with nulls/empty arrays
};

// For Jira input
const canonical = parseJiraTicket(jiraData, jiraBaseUrl);

// For markdown input
const canonical = parseMarkdownTicket(filePath);
```

**Output**: Canonical ticket object (may have gaps)

---

### Phase 3: Validate & Detect Gaps (CRITICAL)

**Actions**:
1. **Validate ticket completeness**:
   - Check required fields (user story, stakeholders, success criteria, etc.)
   - Validate BDD scenario quality
   - Check for placeholder text
   - Identify all gaps

2. **Intelligent Gap Detection** (4-strategy approach):

   **Strategy 1: Search Project Context**
   - Read `.claude/CLAUDE.md` for project standards
   - Search project-context skill for patterns
   - Check for documented conventions

   **Strategy 2: Deep Codebase Pattern Search**
   - Grep for similar feature implementations
   - Find authentication patterns, validation rules, error handling
   - Extract technical context from existing code

   **Strategy 3: Find Similar Implementations**
   - Search for files with similar names/purposes
   - Analyze implementation patterns
   - Infer architecture decisions

   **Strategy 4: Analyze Existing Tickets**
   - Search `.claude/tickets/` for similar tickets
   - Extract common patterns for stakeholders, DoD, testing
   - Learn from precedents

3. **Apply inferred values** to canonical ticket

4. **Generate questions** only for unresolvable gaps

**Tools**:
```javascript
const { validateTicket } = require('../../utils/ticket-io/validators/ticket-validator');
const { detectAndFillGaps } = require('../../utils/ticket-io/gap-detector');

console.log('🔍 Validating ticket...');
const validation = validateTicket(canonical);

if (validation.gaps.length > 0) {
  console.log('\n🧠 Starting intelligent gap detection...');
  console.log(`   Found ${validation.gaps.length} gaps, attempting autonomous inference...\n`);

  const gapAnalysis = await detectAndFillGaps(canonical, validation, process.cwd());

  console.log(`\n📈 Gap Detection Results:`);
  console.log(`   Total Gaps: ${gapAnalysis.summary.totalGaps}`);
  console.log(`   Inferred: ${gapAnalysis.summary.inferred} (${gapAnalysis.summary.inferenceRate}%)`);
  console.log(`   Unresolved: ${gapAnalysis.summary.unresolved}`);

  // Apply inferred values
  Object.entries(gapAnalysis.inferredValues).forEach(([field, value]) => {
    setNestedValue(canonical, field, value);
  });
}
```

**Output**: Validated ticket with inference results and unresolved gaps

---

### Phase 4: Ask Engineer (Only If Needed)

**Actions**:
1. **Check if questions are needed**: `gapAnalysis.unresolvedGaps.length > 0`
2. **If autonomous** (no unresolved gaps): Skip this phase entirely
3. **If questions needed**:
   - Display minimal, focused questions
   - Provide context from inference attempts
   - Show examples
   - Collect answers
   - Apply answers to canonical ticket

**Question Format**:
```markdown
I need clarification on ${unresolvedGaps.length} item(s) that couldn't be inferred:

## ${category}

${gap.field}:
  Question: ${gap.message}
  Context: Searched ${attemptedSources.join(', ')} - no definitive answer found
  Example: ${gap.example}

Your answer: _____
```

**Output**: Complete canonical ticket with all gaps filled

---

### Phase 5: Apply INVEST Criteria

**Actions**:
1. **Validate ticket meets INVEST standards**:
   - **Independent**: Check blocking dependencies
   - **Negotiable**: Verify implementation flexibility
   - **Valuable**: Confirm business value articulated
   - **Estimable**: Ensure sufficient technical detail
   - **Small**: Estimate complexity (days), suggest splits if > 5 days
   - **Testable**: Verify BDD scenarios are verifiable

2. **Display INVEST results** with scores and recommendations

3. **Handle split recommendations**:
   - If ticket estimated > 5 days, show split suggestion
   - Ask engineer if they want to split
   - If yes, generate multiple tickets

**Tools**:
```javascript
const validation = validateTicket(canonical);

console.log('\n📊 INVEST Criteria:');
Object.entries(validation.invest).forEach(([criterion, result]) => {
  console.log(`   ${result.passed ? '✅' : '❌'} ${criterion.toUpperCase()} (${result.score}%)`);
  console.log(`      ${result.message}`);
  if (result.recommendation) {
    console.log(`      💡 ${result.recommendation}`);
  }
});

if (validation.invest.small.estimatedDays > 5) {
  console.log('\n⚠️  Ticket complexity suggests splitting');
  console.log(validation.invest.small.recommendation);
  // Ask engineer if they want to split
}
```

**Output**: INVEST-validated ticket (potentially split into multiple)

---

### Phase 6: Generate/Enhance BDD Scenarios

**Actions**:
1. **Ensure minimum 3 BDD scenarios**:
   - Happy path (primary use case)
   - Edge cases (boundary conditions, unusual inputs)
   - Error scenarios (failures, invalid states)

2. **Validate scenario quality**:
   - All scenarios have Given-When-Then structure
   - Use concrete examples (not "some users" but "50 users")
   - Include And clauses where needed
   - Scenarios are independently verifiable

3. **Enhance scenarios if needed**:
   - Add missing Given clauses for context
   - Add Then clauses for complete validation
   - Ensure error messages specified

**Scenario Template**:
```gherkin
Scenario: [Clear, specific scenario name]
  Given [initial context/state]
  And [additional context if needed]
  When [action/trigger]
  Then [expected outcome]
  And [additional outcome/validation]
  And [system state/side effects]
```

**Example**:
```gherkin
Scenario: User successfully resets forgotten password
  Given I am on the login page
  And I click "Forgot Password"
  And I enter email "user@example.com" that exists in the system
  When I click "Send Reset Link"
  Then I see message "Password reset link sent to user@example.com"
  And an email is sent within 60 seconds
  And the email contains a reset link valid for 1 hour
  And the link format is https://app.com/reset-password?token=<uuid>
```

**Output**: Ticket with high-quality BDD scenarios ready for automated testing

---

### Phase 7: Output Ticket

**Actions**:
1. **Update metadata**:
   - Set `investValidated: true`
   - Set `bddScenarioCount`
   - Add timestamp

2. **Format based on output mode**:

   **Markdown Output**:
   ```javascript
   const { writeMarkdownFile } = require('../../utils/ticket-io/formatters/markdown-formatter');
   const writtenPath = writeMarkdownFile(canonical, outputPath);
   console.log(`✅ Markdown written to: ${writtenPath}`);
   ```

   **Jira Output**:
   ```javascript
   const { formatToJira } = require('../../utils/ticket-io/formatters/jira-formatter');
   const jiraPayload = formatToJira(canonical, projectKey, 'Story');

   // Use MCP to create/update
   const result = await mcp__atlassian__createJiraIssue({
     cloudId: cloudId,
     projectKey: projectKey,
     issueTypeName: 'Story',
     summary: canonical.title,
     description: jiraPayload.fields.description,
     additional_fields: {
       priority: { name: canonical.metadata.priority || 'Medium' },
       labels: canonical.metadata.labels || []
     }
   });

   console.log(`✅ Jira ticket created: ${result.key}`);
   console.log(`   URL: ${jiraBaseUrl}/browse/${result.key}`);
   ```

   **Display Only**:
   ```javascript
   console.log('\n📄 Canonical Ticket:');
   console.log(JSON.stringify(canonical, null, 2));
   ```

3. **Provide success summary**:
   ```markdown
   ✨ Ticket Creation Complete!

   Summary:
     Title: ${canonical.title}
     Output: ${outputPath or jiraKey}
     INVEST: ✅ ${passedCount}/6 criteria passed
     BDD Scenarios: ${scenarioCount}
     Autonomous Inference: ${inferenceRate}%
     Questions Asked: ${questionsAsked}

   Next Steps:
     - Review the ticket for accuracy
     - Assign to sprint/epic if using Jira
     - Use /implement-ticket ${ticketId} to begin implementation
   ```

**Output**: Final ticket saved/created, engineer notified

---

## Canonical Ticket Structure

All tickets follow this schema (see `schemas/sdd-ticket.schema.json`):

```json
{
  "id": "PROJ-123 or DRAFT-YYYYMMDD-HHMMSS",
  "source": "jira | markdown | input",
  "title": "Concise ticket title",
  "userStory": {
    "role": "user persona",
    "goal": "desired capability",
    "benefit": "business value"
  },
  "stakeholders": [
    {
      "role": "Product Owner",
      "name": "Jane Doe",
      "responsibility": "Acceptance, prioritization"
    }
  ],
  "successCriteria": [
    "Measurable outcome 1",
    "Measurable outcome 2"
  ],
  "metrics": "How success will be measured",
  "acceptanceCriteria": [
    {
      "scenario": "Happy path",
      "given": "initial context",
      "and_given": ["additional context"],
      "when": "action trigger",
      "then": "expected outcome",
      "and_then": ["additional outcomes"]
    }
  ],
  "technicalContext": {
    "currentState": ["What exists today"],
    "proposedChanges": ["What will be built"],
    "constraints": ["Performance, security requirements"],
    "integrationPoints": ["Systems to integrate with"],
    "architectureDecisions": [
      {
        "decision": "Use JWT tokens",
        "rationale": "Industry standard, stateless"
      }
    ]
  },
  "outOfScope": ["Item explicitly not included"],
  "futureConsiderations": "What might be addressed later",
  "edgeCases": [
    {
      "case": "Edge case description",
      "handling": "How to handle it"
    }
  ],
  "errorScenarios": [
    {
      "error": "Error condition",
      "systemBehavior": "User message, system behavior"
    }
  ],
  "validationRules": ["Data validation rules"],
  "dependencies": {
    "blocking": ["PROJ-122"],
    "related": ["PROJ-100 - Related feature"]
  },
  "definitionOfDone": {
    "codeQuality": ["Unit test coverage >= 80%"],
    "testing": ["All BDD scenarios automated"],
    "documentation": ["API endpoints documented"],
    "review": ["Code reviewed and approved"]
  },
  "implementationNotes": "Additional context for implementer",
  "references": ["Design mockups URL"],
  "metadata": {
    "createdAt": "2026-03-08T10:00:00Z",
    "investValidated": true,
    "bddScenarioCount": 5,
    "priority": "High",
    "labels": ["sdd", "authentication"]
  }
}
```

---

## Markdown Template Structure

Output follows `templates/sdd-ticket-template.md`:

```markdown
# PROJ-123: [Title]

## 📋 User Story

**As a** [role]
**I want** [goal]
**So that** [benefit]

---

## 👥 Stakeholders

| Role | Name | Responsibility |
|------|------|----------------|
| Product Owner | Jane Doe | Acceptance, prioritization |

---

## 🎯 Success Criteria

1. [Measurable outcome 1]
2. [Measurable outcome 2]

**Metrics**: [How we'll measure success]

---

## ✅ Acceptance Criteria

### Scenario 1: [Happy Path]
```gherkin
Given [context]
When [action]
Then [outcome]
```

### Scenario 2: [Edge Case]
```gherkin
Given [context]
When [action]
Then [outcome]
```

---

## 🔧 Technical Context

### Current State
- [What exists today]

### Proposed Changes
- [What will be built/modified]

### Technical Constraints
- [Performance, security requirements]

### Integration Points
- [Systems to integrate with]

### Architecture Decisions
- **[Decision]**: [Rationale]

---

## 🚫 Out of Scope

1. [Item 1]
2. [Item 2]

**Future Considerations**: [What might be addressed later]

---

## ⚠️ Edge Cases & Error Handling

### Edge Cases
1. **[Edge case]**: [Handling]

### Error Scenarios
1. **[Error]**: [User message, system behavior]

### Data Validation Rules
- [Rule 1]

---

## 📦 Dependencies

### Blocking
- [ ] [Ticket that must complete first]

### Related
- [Ticket] - [Relationship]

---

## 🎓 Definition of Done

### Code Quality
- [ ] All acceptance criteria implemented
- [ ] Unit test coverage ≥ 80%

### Testing
- [ ] All BDD scenarios automated

### Documentation
- [ ] API endpoints documented

### Review & Deployment
- [ ] Code reviewed and approved
- [ ] PR merged to main

---

## 📝 Implementation Notes

[Additional context for implementer]

---

## 🔗 References

- [Design mockups URL]
- [Related documentation]

---

**Created**: 2026-03-08
**Created By**: Claude (create-sdd-ticket skill)
**INVEST Validated**: ✅
**BDD Scenarios**: 5
**Priority**: High
```

---

## Usage Examples

### Example 1: Text → Markdown

```bash
/create-sdd-ticket \
  --from-input "Add user authentication with JWT tokens" \
  --save-to-markdown "./specs/AUTH-001.md"
```

**Process**:
1. Parses text input
2. Creates minimal canonical ticket
3. Runs gap detection:
   - Searches codebase for existing auth patterns
   - Finds JWT implementation in backend
   - Infers technical stack, error handling patterns
   - Finds similar features for stakeholder patterns
4. Asks 3-5 questions for unresolvable gaps
5. Generates complete ticket with 5 BDD scenarios
6. Saves to markdown

---

### Example 2: Jira → Markdown (Enhance)

```bash
/create-sdd-ticket \
  --from-jira "PROJ-123" \
  --save-to-markdown "./specs/PROJ-123.md"
```

**Process**:
1. Fetches PROJ-123 from Jira via MCP
2. Parses Jira description, extracts all fields
3. Validates completeness (likely has gaps)
4. Runs gap detection on missing fields
5. Asks minimal questions
6. Enhances ticket with full SDD structure
7. Saves to markdown (local spec file)

---

### Example 3: Markdown → Jira (Complete Draft)

```bash
/create-sdd-ticket \
  --from-markdown "./specs/DRAFT-20260308.md" \
  --save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

**Process**:
1. Reads draft markdown file
2. Parses all sections
3. Validates and detects gaps
4. Completes missing sections autonomously
5. Applies INVEST criteria
6. Creates Jira ticket via MCP
7. Returns PROJ-124 ticket key

---

### Example 4: Jira → Jira (Update)

```bash
/create-sdd-ticket \
  --from-jira "PROJ-123" \
  --save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

**Process**:
1. Fetches PROJ-123
2. Enhances with SDD structure
3. Updates PROJ-123 in Jira with complete spec

---

## Error Handling

### Gap Detection Fails

**Scenario**: Cannot infer critical information

**Handling**:
```markdown
🧠 Gap Detection Summary:
   Inferred: 8/12 gaps (67%)
   Unresolved: 4 gaps

I need clarification on 4 items that couldn't be inferred from the codebase:

## Technical Context
1. proposedChanges:
   Question: What specific components will be modified?
   Context: Searched codebase but found multiple auth implementations
   Example: "Modify UserController, add AuthService, update User model"

Your answer: _____
```

---

### INVEST Validation Fails

**Scenario**: Ticket too large (> 5 days)

**Handling**:
```markdown
⚠️  INVEST Validation: Small criterion failed

Estimated: 8 days (complexity score: 42)
Recommendation: Split into 2 tickets

Suggested Split:
  Ticket 1: User Authentication - Basic Login
    - JWT token generation
    - Login endpoint
    - Token validation middleware
    Estimate: 3 days

  Ticket 2: User Authentication - Advanced Features
    - Refresh tokens
    - Token revocation
    - Session management
    Estimate: 4 days

Would you like to split this ticket? (y/n): _____
```

---

### Jira MCP Unavailable

**Scenario**: MCP not configured or failing

**Handling**:
```markdown
❌ Jira MCP not available

Ticket saved locally: .claude/tickets/DRAFT-20260308-143022.md

Options:
  1. Configure Jira MCP (see .claude/mcp.json)
  2. Use --save-to-markdown instead
  3. Copy ticket content and create manually in Jira UI

Would you like to save as markdown instead? (y/n): _____
```

---

## Quality Checks

Before finalizing, validate:

### Completeness
- [ ] User story has WHO + WHAT + WHY
- [ ] All 7 main sections present
- [ ] No `[NEEDS_CLARIFICATION]` markers
- [ ] No placeholder text

### INVEST Criteria
- [ ] Independent (score >= 60%)
- [ ] Negotiable (score >= 60%)
- [ ] Valuable (score >= 60%)
- [ ] Estimable (score >= 60%)
- [ ] Small (estimated <= 5 days)
- [ ] Testable (score >= 70%)

### BDD Scenarios
- [ ] At least 3 scenarios
- [ ] All have Given-When-Then
- [ ] Use concrete examples
- [ ] Cover happy path, edge cases, errors

### Technical Clarity
- [ ] Integration points documented
- [ ] Constraints specified
- [ ] Architecture decisions explained
- [ ] Error handling defined

---

## Best Practices

### Do's ✅
- **Maximize autonomous inference** - search codebase deeply before asking
- **Ask minimal, focused questions** - only for truly unresolvable gaps
- **Use concrete examples** in scenarios
- **Define measurable success criteria**
- **Document edge cases explicitly**
- **Include test coverage requirements**
- **Reference existing patterns**

### Don'ts ❌
- **Don't ask questions** that can be inferred from code
- **Don't assume** - mark `[NEEDS_CLARIFICATION]` if truly unknown
- **Don't skip INVEST validation**
- **Don't write vague scenarios**
- **Don't forget error scenarios**
- **Don't make architectural decisions** without input

---

## Integration with Other Skills

### With `/implement-ticket`
- SDD tickets are ready for implementation
- BDD scenarios become automated tests
- Use: `/implement-ticket --from-markdown "./specs/AUTH-001.md"`

### With `/fetch-ticket-context`
- Gather context for related tickets
- Cross-reference implementations

---

## Version History

- **2.0.0** (2026-03-08):
  - Added multiple input sources (text, Jira, markdown)
  - Added multiple output formats (Jira, markdown)
  - Implemented intelligent gap detection with 4-strategy inference
  - Added canonical ticket format
  - Removed backward compatibility (explicit flags required)
- **1.0.0** (2026-03-02): Initial release with dual input modes

---

## References

- `schemas/sdd-ticket.schema.json` - Canonical ticket schema
- `templates/sdd-ticket-template.md` - Markdown template
- `utils/ticket-io/` - All parsers, formatters, validators
- SPECIFICATION_DRIVEN_DEVELOPMENT_GUIDE.md
- INVEST criteria: https://en.wikipedia.org/wiki/INVEST_(mnemonic)
- BDD/Gherkin: https://cucumber.io/docs/gherkin/reference/
