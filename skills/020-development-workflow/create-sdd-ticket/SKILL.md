---
name: create-sdd-ticket
description: Generate specification-driven development (SDD) tickets directly from ideas, Jira tickets, or markdown drafts. Use when creating implementation-ready tickets with gap detection, INVEST validation, and BDD scenarios.
model: sonnet
user-invokable: true
argument-hint: '[--from-input "..." | --from-jira JIRA-URL-OR-KEY | --from-markdown PATH] [--save-to-jira BOARD-URL | --save-to-markdown [PATH]]'
---

# Create SDD Ticket

Input: `$ARGUMENTS`

Generate a complete, implementation-ready SDD ticket from plain text, Jira, or markdown input while keeping ticket creation behavior in one skill.

## Purpose

This skill must:

- support text, Jira, and markdown as inputs
- support Jira, markdown, or display-only as outputs
- inject project context before gap detection
- infer as much as possible from the codebase before asking questions
- validate the final ticket against INVEST criteria
- produce BDD scenarios in Given-When-Then form
- respect explicit markdown output paths and use `.claude-temp/tickets/<ticket-id>/<ticket-id>.md` only as the default when no markdown path is provided

## Invocation

Invoke the `create-sdd-ticket` skill directly with arguments such as:

```text
--from-input "Add user authentication with JWT tokens" --save-to-markdown "./specs/AUTH-001.md"
```

```text
--from-jira "PROJ-123" --save-to-jira "https://company.atlassian.net/jira/software/c/projects/PROJ/boards/1"
```

```text
--from-markdown "./specs/DRAFT-001.md" --save-to-markdown "./specs/FEAT-001.md"
```

Optional flags:

- `--project-key <KEY>`
- `--issue-type <TYPE>` where supported values are `Story`, `Task`, `Bug`
- `--priority <PRIORITY>` where supported values are `High`, `Medium`, `Low`

If no output flag is provided, display the completed canonical ticket without saving.

## Input And Output Modes

### Inputs

- `--from-input "description"`: create a ticket from a plain-language idea
- `--from-jira <JIRA-URL-OR-KEY>`: refine an existing Jira ticket
- `--from-markdown <PATH>`: refine an existing markdown draft

Exactly one input mode is required.

### Outputs

- `--save-to-jira <BOARD-URL>`: create or update the ticket in Jira
- `--save-to-markdown <PATH>`: save the ticket exactly to the path provided by the user
- `--save-to-markdown` with no path: default markdown output to `.claude-temp/tickets/<ticket-id>/<ticket-id>.md`
- no output flag: print the completed canonical ticket for review

## Workflow

### Phase 0: Inject Project Context

Before ticket analysis, invoke the `project-context` skill so the workflow has deep architectural context for:

- conventions and patterns already used in the codebase
- integration points and known constraints
- naming, testing, and deployment expectations
- project-specific gotchas that should influence gap detection

If the generated project-context skill is missing, fall back to `.claude/CLAUDE.md` and explicit codebase inspection, but still treat project context collection as required work before continuing.

### Phase 1: Parse Input Source

- detect which input mode is active
- load the source data from plain text, Jira, or markdown
- validate accessibility and basic structure
- normalize the raw source into a working internal representation

### Phase 2: Intelligent Gap Detection

Validate the canonical ticket against the SDD requirements and, for every missing or weak field, exhaust inference before asking the engineer.

Required inference order:

1. search project context and `.claude/CLAUDE.md`
2. search the codebase for similar features, patterns, validation rules, and architectural precedents
3. inspect related files and integration points
4. inspect existing tickets or drafts for precedents
5. only if inference still fails, add the item to the question batch

UI-specific handling must remain available:

- classify whether the work is UI-related
- if UI work is detected, check for existing UI or visual testing configuration
- if configuration is missing, ask one targeted batch question about whether visual UI testing against designs is required
- if UI testing is required, inject the relevant Definition of Done items, technical tasks, and BDD coverage expectations

### Phase 3: Batch Question Generation

- generate the minimum number of questions required to finish the ticket
- include what was searched so the engineer understands the missing context
- ask all unresolved questions at once
- avoid asking for information that could have been inferred from the repository

Preferred question format:

```markdown
I need clarification on ${unresolvedGaps.length} item(s) that could not be inferred:

## ${category}

${gap.field}
Question: ${gap.message}
Context: Searched ${attemptedSources.join(', ')} and did not find a definitive answer
Example: ${gap.example}

Your answer: **_**
```

### Phase 4: Process Answers And Fill Gaps

- parse the engineer's answers
- apply them back into the canonical ticket
- re-run completeness validation
- ensure no unresolved placeholder content remains

### Phase 5: Apply INVEST Criteria

Validate the ticket across all INVEST dimensions:

- `Independent`
- `Negotiable`
- `Valuable`
- `Estimable`
- `Small`
- `Testable`

If the ticket looks larger than a 1-5 day implementation, provide a concrete split recommendation before finalizing.

### Phase 6: Generate BDD Scenarios

- ensure there are at least 3 high-quality scenarios
- use Given-When-Then structure
- cover happy path, edge cases, and failure scenarios
- use concrete, verifiable examples instead of vague wording

### Phase 7: Output Ticket

- format the completed canonical ticket for the chosen destination
- if a markdown path is provided, save exactly there
- if markdown output is requested without a path, default to `.claude-temp/tickets/<ticket-id>/<ticket-id>.md`
- create parent directories when needed
- if saving to Jira, preserve priority, issue type, and project key when provided
- return the saved path or Jira key plus a short quality summary

## Canonical Expectations

The completed ticket should include, when applicable:

- title and user story
- stakeholders
- success criteria and metrics
- acceptance criteria with BDD scenarios
- technical context
- dependencies and integration points
- out of scope and future considerations
- edge cases and error scenarios
- validation rules
- Definition of Done
- implementation notes and references
- metadata indicating INVEST validation and BDD scenario count

## Canonical Ticket Structure

Use this structure as the mental model for completeness checks:

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
  "successCriteria": ["Measurable outcome 1", "Measurable outcome 2"],
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
    "createdAt": "2026-04-15T10:00:00Z",
    "investValidated": true,
    "bddScenarioCount": 5,
    "priority": "High",
    "labels": ["sdd", "authentication"]
  }
}
```

## Markdown Output Rule

Default markdown output path:

```text
.claude-temp/tickets/<ticket-id>/<ticket-id>.md
```

If the user supplies `--save-to-markdown <PATH>`, save the ticket to that exact path instead of rewriting it into `.claude-temp/tickets/`.

## Markdown Template Structure

Markdown output should align with [`templates/sdd-ticket-template.md`](./templates/sdd-ticket-template.md) and include these sections:

````markdown
# PROJ-123: [Title]

## User Story
**As a** [role]
**I want** [goal]
**So that** [benefit]

## Stakeholders
- Role / name / responsibility

## Success Criteria
1. [Measurable outcome 1]
2. [Measurable outcome 2]

## Acceptance Criteria
### Scenario 1: [Happy Path]
```gherkin
Given [context]
When [action]
Then [outcome]
```

## Technical Context
- Current state
- Proposed changes
- Technical constraints
- Integration points
- Architecture decisions

## Out Of Scope
- [Item]

## Edge Cases And Error Handling
- Edge cases
- Error scenarios
- Validation rules

## Dependencies
- Blocking
- Related

## Definition Of Done
- Code quality
- Testing
- Documentation
- Review and deployment

## Implementation Notes

## References

**INVEST Validated**: ✅
**BDD Scenarios**: 5
````

## Question Policy

Ask questions only when the answer cannot be reliably inferred from:

- the `project-context` skill
- `.claude/CLAUDE.md`
- repository structure and nearby implementations
- existing tickets or drafts
- visible integration and testing patterns

Questions should be:

- batched
- specific
- contextualized with what was searched
- phrased to unblock implementation, not to outsource architecture decisions

## Quality Bar

Before finalizing, ensure:

- no required section is missing
- no placeholder markers remain
- INVEST validation has been applied
- BDD scenarios are concrete and testable
- markdown output guidance uses `.claude-temp/tickets/`
- the ticket remains ready for `implement-ticket`

## Usage Examples

### Text To Markdown

Invoke the `create-sdd-ticket` skill with:

```text
--from-input "Admin users report taking too long to find specific users in the 500+ user list. Add search filtering by name and email, similar to the existing product search." --save-to-markdown "./specs/user-search.md"
```

### Text To Jira

Invoke the `create-sdd-ticket` skill with:

```text
--from-input "Add user export feature for admins to download CSV reports" --save-to-jira "https://acme.atlassian.net/jira/software/projects/PROJ/boards/1" --project-key PROJ --priority High
```

### Jira To Markdown

Invoke the `create-sdd-ticket` skill with:

```text
--from-jira "PROJ-100" --save-to-markdown "./specs/refined-PROJ-100.md"
```

### Markdown To Jira

Invoke the `create-sdd-ticket` skill with:

```text
--from-markdown "./specs/draft-feature.md" --save-to-jira "https://acme.atlassian.net/jira/software/projects/PROJ/boards/1" --project-key PROJ
```

## Error Handling

### Input Source Unavailable

Report which input could not be loaded and why, for example:

- Jira ticket not found
- markdown path missing or unreadable
- empty plain-text description

### Inference Could Not Resolve All Gaps

Summarize:

- how many gaps were found
- how many were inferred
- which searches were attempted
- the exact remaining questions

Example:

```markdown
🧠 Gap Detection Summary:
Inferred: 8/12 gaps (67%)
Unresolved: 4 gaps

I need clarification on 4 items that couldn't be inferred from the codebase:

## Technical Context

proposedChanges
Question: What specific components will be modified?
Context: Searched the codebase but found multiple possible implementations
Example: "Modify UserController, add AuthService, update User model"

Your answer: **_**
```

### INVEST Validation Failed

If the ticket is too large or not testable enough, do not silently continue. Provide the failure reason and a split or refinement recommendation.

Example:

```markdown
⚠️ INVEST Validation: Small criterion failed

Estimated: 8 days
Recommendation: Split into 2 tickets

Suggested Split:
Ticket 1: Basic login and token generation
Estimate: 3 days

Ticket 2: Refresh tokens and session management
Estimate: 4 days
```

### Jira Output Unavailable

If Jira creation fails, recommend either saving to the user-requested markdown path or, if no path was provided, falling back to `.claude-temp/tickets/`.

Example:

```markdown
❌ Jira output unavailable

Fallback:
.claude-temp/tickets/DRAFT-20260415-143022/DRAFT-20260415-143022.md

Options:
1. Save to markdown now
2. Re-run later when Jira access is available
3. Copy the generated content into Jira manually
```

## Quality Checks

Before finalizing, validate:

### Completeness

- [ ] user story includes who, what, and why
- [ ] all main sections are present
- [ ] no `[NEEDS_CLARIFICATION]` markers remain
- [ ] no placeholder text remains

### INVEST

- [ ] Independent passes
- [ ] Negotiable passes
- [ ] Valuable passes
- [ ] Estimable passes
- [ ] Small is within expected scope or split recommendation is provided
- [ ] Testable passes

### BDD

- [ ] at least 3 scenarios exist
- [ ] all scenarios use Given-When-Then
- [ ] scenarios use concrete examples
- [ ] happy path, edge cases, and failures are covered

### Technical Clarity

- [ ] integration points are documented
- [ ] constraints are documented
- [ ] architecture decisions are explained where needed
- [ ] error handling is defined

## Integration Notes

- `project-context`: required in Phase 0
- `fetch-ticket-context`: useful when Jira input needs enrichment
- `implement-ticket`: the resulting markdown or Jira ticket should be directly implementable
- `ui-testing` and `ui-visual-testing`: used when UI work is detected and testing expectations need to be injected

## Version History

- **3.0.0** (2026-04-15): unified command and skill behavior into one directly invokable skill, restored Phase 0 project-context injection, and removed slash-command duplication
- **2.0.0** (2026-03-08): added multiple input and output modes plus intelligent gap detection
- **1.0.0** (2026-03-02): initial release
