---
name: create-sdd-ticket
description: Generate specification-driven development (SDD) tickets with zero assumptions
version: 1.0.0
category: development-workflow
keywords: [sdd, tickets, requirements, jira, planning, specifications]
prerequisites:
  - jira
  - fetch-ticket-context
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - mcp__atlassian__*
last_updated: 2026-03-02
---

# Create SDD Ticket Skill

**Purpose**: Generate comprehensive, assumption-free Jira tickets following Specification-Driven Development (SDD) principles using INVEST criteria and BDD format.

**Version**: 1.0.0
**Last Updated**: 2026-03-02

---

## Overview

This skill produces gap-free, implementation-ready tickets by:
1. **Gathering all requirements upfront** (batch questions, not iterative)
2. **Applying INVEST criteria** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
3. **Using BDD format** (Given-When-Then scenarios)
4. **Zero assumptions** (ask if unclear, never fill gaps)
5. **Supporting dual input modes** (free-form or structured)

**Critical Principle**: Once all questions are answered, the ticket must be 100% complete with NO missing information.

---

## Prerequisites

Before using this skill:
- Jira MCP must be configured (see `.claude/mcp.json`)
- User must have Jira API access
- Project key must be known (e.g., "PROJ", "EV")
- SPECIFICATION_DRIVEN_DEVELOPMENT_GUIDE.md should exist for reference

---

## Input Modes

### Mode A: Free-Form Input

User provides loose requirements:
```
User: "We need a way for admins to export user reports as CSV"
```

**Process**:
1. Extract key concepts (admins, export, user reports, CSV)
2. Generate comprehensive question list
3. Wait for all answers
4. Generate complete ticket

---

### Mode B: Structured Input

User provides specific fields:
```
User Story: As an admin, I want to export user reports as CSV
Stakeholders: Product Manager (Sarah), CTO (John)
Context: Current reports are view-only, finance team needs exports for compliance
```

**Process**:
1. Validate provided fields
2. Ask questions for missing fields only
3. Generate complete ticket

---

## Execution Workflow

### Phase 1: Parse Input

**Actions**:
1. **Detect input mode** (free-form vs structured)
2. **Extract provided information**:
   - User story fragments
   - Stakeholders mentioned
   - Technical context
   - Success criteria hints
   - Constraints or requirements
3. **Identify gaps** (what's missing for a complete ticket)

**Output**: Structured analysis of what we know vs what we need

---

### Phase 2: Generate Question List (Batch Mode)

**CRITICAL**: Ask ALL questions at once, do NOT iterate.

**Question Categories**:

#### 2.1 User Story Clarification
- Who is the user? (role/persona)
- What is the goal? (action/capability)
- Why is it valuable? (benefit/outcome)

#### 2.2 Stakeholders
- Who requested this? (product owner, customer, team lead)
- Who will benefit? (end users, internal teams)
- Who needs to approve? (decision makers)
- Who will review implementation? (technical reviewers)

#### 2.3 Success Criteria
- How will we measure success? (metrics, KPIs)
- What does "done" look like from user perspective?
- What behavior change are we expecting?

#### 2.4 Acceptance Criteria
- What are the happy path scenarios?
- What edge cases must be handled?
- What are the validation rules?
- What are the error scenarios?

#### 2.5 Technical Context
- Are there existing systems to integrate with?
- What are the technical constraints? (performance, scale, security)
- What libraries/frameworks should be used?
- Are there architectural decisions to make?

#### 2.6 Scope Boundaries
- What is explicitly OUT of scope?
- What should be deferred to future tickets?
- What dependencies exist?

#### 2.7 Definition of Done
- What quality checks are required? (tests, coverage, linting)
- What documentation is needed?
- What review process should be followed?

**Output Format**:
```markdown
I need clarification on the following to create a complete ticket:

## User Story & Value
1. [Question about user role]
2. [Question about user goal]
3. [Question about business value]

## Stakeholders
4. [Question about requester]
5. [Question about beneficiaries]

## Success Criteria
6. [Question about metrics]
7. [Question about completion definition]

## Acceptance Criteria
8. [Question about happy path]
9. [Question about edge cases]
10. [Question about validation rules]

## Technical Context
11. [Question about integrations]
12. [Question about constraints]

## Scope & Boundaries
13. [Question about what's out of scope]
14. [Question about dependencies]

## Definition of Done
15. [Question about testing requirements]
16. [Question about documentation]

Please answer all questions above in numbered format.
```

**Important**: Maximum 20 questions. If more needed, consolidate related questions.

---

### Phase 3: Process Answers

**Actions**:
1. **Parse numbered answers** from user response
2. **Map answers to question categories**
3. **Validate completeness** (all critical fields covered)
4. **Flag any remaining ambiguities** with `[NEEDS_CLARIFICATION]`

**Validation Checklist**:
- [ ] User story has WHO + WHAT + WHY
- [ ] At least 1 stakeholder identified
- [ ] Success criteria defined
- [ ] At least 3 acceptance criteria scenarios
- [ ] Technical context provided
- [ ] Out of scope clarified
- [ ] Definition of done specified

**If validation fails**: Generate follow-up questions for missing items

---

### Phase 4: Apply INVEST Criteria

Validate the ticket meets INVEST standards:

#### Independent
- Can this be implemented without waiting for other tickets?
- Are dependencies clearly documented?

#### Negotiable
- Is the implementation approach flexible?
- Are there multiple valid solutions?

#### Valuable
- Does this deliver user/business value?
- Is the value clearly articulated?

#### Estimable
- Is there enough detail to estimate effort?
- Are unknowns identified?

#### Small
- Can this be completed in 1-5 days?
- If too large, suggest splitting (provide split recommendations)

#### Testable
- Are acceptance criteria verifiable?
- Can we write automated tests?

**If INVEST fails**: Provide recommendations to fix (e.g., "This ticket is too large, suggest splitting into: Ticket A [scope], Ticket B [scope]")

---

### Phase 5: Generate BDD Scenarios

Convert acceptance criteria into Given-When-Then format:

**Template**:
```gherkin
Scenario: [Clear scenario name]
  Given [initial context/state]
  And [additional context if needed]
  When [action/trigger]
  Then [expected outcome]
  And [additional outcome if needed]
```

**Example**:
```gherkin
Scenario: Admin exports user report as CSV
  Given I am logged in as an admin user
  And there are 50 users in the system
  When I click "Export to CSV" on the Users page
  Then a CSV file downloads containing all 50 user records
  And the file includes columns: name, email, role, created_at, last_login
  And the filename follows format: users_export_YYYY-MM-DD.csv
```

**Guidelines**:
- Write 3-7 scenarios (happy path + edge cases + error cases)
- Use concrete examples (not "some users" but "50 users")
- Make scenarios independently verifiable
- Include negative scenarios (invalid input, unauthorized access)

---

### Phase 6: Generate Complete Ticket

**Ticket Structure** (following SPECIFICATION_DRIVEN_DEVELOPMENT_GUIDE.md):

```markdown
# [Epic/Feature Name]: [Concise Title]

## 📋 User Story

**As a** [user role/persona]
**I want** [goal/capability]
**So that** [benefit/value]

---

## 👥 Stakeholders

| Role | Name | Responsibility |
|------|------|----------------|
| Requester | [Name] | Initial request, requirements validation |
| Product Owner | [Name] | Acceptance, prioritization |
| Tech Lead | [Name] | Architecture review, technical approval |
| End Users | [Group/Role] | Primary beneficiaries |

---

## 🎯 Success Criteria

1. [Measurable outcome 1]
2. [Measurable outcome 2]
3. [Measurable outcome 3]

**Metrics**: [How we'll measure success]

---

## ✅ Acceptance Criteria

### Scenario 1: [Happy Path]
```gherkin
Given [context]
When [action]
Then [outcome]
```

### Scenario 2: [Edge Case 1]
```gherkin
Given [context]
When [action]
Then [outcome]
```

### Scenario 3: [Error Case]
```gherkin
Given [context]
When [action]
Then [outcome]
```

[... 3-7 total scenarios ...]

---

## 🔧 Technical Context

### Current State
- [What exists today]
- [Relevant systems/components]

### Proposed Changes
- [What will be built/modified]
- [Technologies/libraries to use]

### Technical Constraints
- [Performance requirements]
- [Security requirements]
- [Scalability considerations]

### Integration Points
- [Systems to integrate with]
- [APIs to call/expose]

### Architecture Decisions
- [Key technical choices]
- [Rationale for approach]

---

## 🚫 Out of Scope

The following are explicitly NOT part of this ticket:
1. [Item 1]
2. [Item 2]
3. [Item 3]

**Future Considerations**: [What might be addressed later]

---

## ⚠️ Edge Cases & Error Handling

### Edge Cases
1. **[Edge case 1]**: [How to handle]
2. **[Edge case 2]**: [How to handle]

### Error Scenarios
1. **[Error 1]**: [User-facing message, system behavior]
2. **[Error 2]**: [User-facing message, system behavior]

### Data Validation Rules
- [Validation rule 1]
- [Validation rule 2]

---

## 📦 Dependencies

### Blocking
- [ ] [Ticket/item that must complete first]

### Related
- [Ticket] - [Relationship]
- [Ticket] - [Relationship]

---

## 🎓 Definition of Done

### Code Quality
- [ ] All acceptance criteria scenarios implemented
- [ ] Unit test coverage ≥ 80%
- [ ] Integration test coverage = 100% (all scenarios)
- [ ] No ESLint warnings (--max-warnings=0)
- [ ] TypeScript type check passes
- [ ] Code formatted with Prettier

### Testing
- [ ] All BDD scenarios have corresponding automated tests
- [ ] Manual testing completed for edge cases
- [ ] Error handling tested

### Documentation
- [ ] API endpoints documented (if applicable)
- [ ] README updated (if user-facing feature)
- [ ] Technical decisions logged in project-context skill

### Review & Deployment
- [ ] Code reviewed and approved
- [ ] PR merged to main
- [ ] Deployed to staging
- [ ] Stakeholders validated implementation

---

## 📝 Implementation Notes

[Any additional context, helpful resources, or gotchas for implementer]

---

## 🔗 References

- SPECIFICATION_DRIVEN_DEVELOPMENT_GUIDE.md
- [Design mockups URL]
- [Related documentation]

---

**Created**: [Date]
**Created By**: Claude (create-sdd-ticket skill)
**INVEST Validated**: ✅
**BDD Scenarios**: [Count]
```

---

### Phase 7: Create Jira Ticket

**Actions**:

1. **Prepare ticket data**:
   - Convert markdown to Jira-compatible format
   - Extract summary (first 100 chars of title)
   - Extract description (full ticket markdown)
   - Set issue type (Story, Task, or Bug based on context)
   - Set priority (based on stakeholder input)

2. **Create ticket via MCP**:
```typescript
// Use Jira MCP tool
mcp__atlassian__createJiraIssue({
  cloudId: "<from config>",
  projectKey: "PROJ",
  issueTypeName: "Story",
  summary: "[Concise title from ticket]",
  description: "[Full markdown ticket]",
  additional_fields: {
    priority: { name: "High" },
    labels: ["sdd", "ready-for-implementation"],
    components: [{ name: "Backend" }] // if applicable
  }
})
```

3. **Validate creation**:
   - Verify ticket created successfully
   - Capture ticket key (e.g., "PROJ-123")
   - Confirm all fields populated

4. **Report to user**:
```markdown
✅ SDD Ticket Created: PROJ-123

**Summary**: [Title]
**Link**: https://your-org.atlassian.net/browse/PROJ-123
**Status**: Ready for Implementation

**INVEST Validation**: ✅ Passed all criteria
**BDD Scenarios**: 5 scenarios ready for automated testing

Next steps:
- Review ticket in Jira
- Assign to sprint/epic if needed
- Use /implement-ticket PROJ-123 to begin implementation
```

---

## Usage Examples

### Example 1: Free-Form Input

**User input**:
```
"We need to let users reset their password if they forgot it"
```

**Skill generates 15 questions**:
```markdown
## User Story & Value
1. Who can reset passwords? (all users, or specific roles only?)
2. Where should the reset link be sent? (email, SMS, both?)
3. What's the business value? (reduce support tickets, improve UX, compliance?)

## Success Criteria
4. How many users do we expect to use this monthly?
5. What response time is acceptable? (email within 5 min, 1 hour?)

## Acceptance Criteria
6. What happens if user enters invalid email?
7. What happens if reset link expires?
8. Should there be rate limiting on reset requests?
9. Can user reset password multiple times?

## Technical Context
10. Do we have an email service configured? (SendGrid, AWS SES?)
11. What's the token expiration time? (15 min, 1 hour, 24 hours?)
12. Should we log reset attempts for security?

## Scope & Boundaries
13. Is password strength validation in scope? (or separate ticket?)
14. Is MFA/2FA integration needed? (or future enhancement?)

## Definition of Done
15. What's the testing strategy? (unit + integration + E2E?)
```

**User answers all 15**, skill generates complete ticket with 5 BDD scenarios, validates INVEST, creates PROJ-456.

---

### Example 2: Structured Input

**User input**:
```markdown
User Story: As a project manager, I want to bulk-assign tickets to team members so that I can distribute work faster

Stakeholders:
- Requester: Jane (PM)
- Users: All PMs on platform

Success Criteria:
- PMs can assign 20+ tickets in under 1 minute
- No errors when assigning to valid users

Technical Context:
- Backend: NestJS API
- Frontend: React with TanStack Query
- Use existing ticket assignment endpoint, add batch support
```

**Skill generates 8 questions** (only for gaps):
```markdown
## Acceptance Criteria
1. What's the maximum number of tickets in a single batch? (20, 50, 100?)
2. What happens if some assignments fail? (rollback all, partial success?)
3. Should user get confirmation before bulk assign? (or immediate action?)

## Edge Cases
4. What if a ticket is already assigned to someone else? (overwrite, skip, error?)
5. What if assignee doesn't have permission for project? (validation rule?)

## Technical Context
6. Should this be synchronous or async? (if 100+ tickets, use background job?)
7. What's the UI pattern? (checkbox selection + assign button?)

## Definition of Done
8. What E2E scenarios should be tested? (happy path + partial failure?)
```

**User answers 8**, skill generates ticket with 6 BDD scenarios, creates PROJ-457.

---

## Error Handling

### Incomplete Answers

**Scenario**: User only answers 10 of 15 questions

**Handling**:
1. Parse answered questions
2. Identify unanswered questions
3. Re-ask ONLY unanswered questions:
```markdown
I still need answers for these questions to complete the ticket:

## Acceptance Criteria
6. What happens if user enters invalid email?
7. What happens if reset link expires?

## Technical Context
11. What's the token expiration time?

## Definition of Done
15. What's the testing strategy?

Please provide answers for questions 6, 7, 11, and 15.
```

---

### Ambiguous Answers

**Scenario**: User answer is unclear (e.g., "whatever is standard")

**Handling**:
1. Flag ambiguity in ticket as `[NEEDS_CLARIFICATION: <detail>]`
2. Ask follow-up question:
```markdown
⚠️ Ambiguous answer detected:

Q11: "What's the token expiration time?"
Your answer: "whatever is standard"

This is unclear. Please specify:
A) 15 minutes (high security)
B) 1 hour (balanced)
C) 24 hours (user convenience)
D) Other: [specify]
```

---

### INVEST Validation Failures

**Scenario**: Ticket is too large (violates "Small" criteria)

**Handling**:
1. Identify why it's too large
2. Suggest split:
```markdown
⚠️ INVEST Validation Failed: Ticket is too large (estimated 8-10 days)

**Recommendation**: Split into 3 tickets:

**Ticket 1**: Password Reset - Email Delivery
- Generate reset token
- Send email with link
- Basic validation
Estimate: 2-3 days

**Ticket 2**: Password Reset - Token Validation & Reset
- Validate token on link click
- Update password
- Expire token
Estimate: 2-3 days

**Ticket 3**: Password Reset - Security Features
- Rate limiting
- Audit logging
- Suspicious activity detection
Estimate: 3-4 days

Proceed with split? (y/n)
```

---

### Jira Creation Failures

**Scenario**: MCP tool fails (network error, auth error, validation error)

**Handling**:
1. **Save ticket locally**:
   - Write to `.claude/tickets/DRAFT-[timestamp].md`
   - Include all generated content

2. **Diagnose error**:
   - Network error → Retry with exponential backoff (3 attempts)
   - Auth error → Prompt user to check Jira credentials
   - Validation error → Show Jira's error message, ask user to fix

3. **Provide fallback**:
```markdown
❌ Failed to create Jira ticket (auth error)

Ticket saved locally: .claude/tickets/DRAFT-2026-03-02-143022.md

**Manual Steps**:
1. Fix Jira credentials in .env
2. Run: claude-code run create-sdd-ticket --resume DRAFT-2026-03-02-143022

Or create manually in Jira UI using saved ticket content.
```

---

## Quality Checks

Before finalizing ticket, validate:

### Completeness
- [ ] User story has WHO + WHAT + WHY
- [ ] All 7 main sections present
- [ ] No `[NEEDS_CLARIFICATION]` markers
- [ ] No placeholder text like "[TODO]" or "[TBD]"

### INVEST Criteria
- [ ] Independent (no blocking dependencies)
- [ ] Negotiable (implementation flexible)
- [ ] Valuable (clear business value)
- [ ] Estimable (enough detail to estimate)
- [ ] Small (1-5 days estimated)
- [ ] Testable (scenarios are verifiable)

### BDD Scenarios
- [ ] At least 3 scenarios (happy + edge + error)
- [ ] All scenarios use Given-When-Then format
- [ ] Scenarios use concrete examples
- [ ] Scenarios are independently verifiable

### Technical Clarity
- [ ] Integration points documented
- [ ] Technical constraints specified
- [ ] Architecture decisions explained
- [ ] Error handling defined

---

## Integration with Other Skills

### With `/fetch-ticket-context`
- Use to gather context for related tickets
- Cross-reference existing implementations
- Avoid duplicating functionality

### With `/implement-ticket`
- Generated SDD tickets are ready for `/implement-ticket` skill
- No additional analysis needed
- BDD scenarios become automated tests

### With `/analyze-requirements`
- Use for complex features needing deeper analysis
- Generate multiple related SDD tickets
- Create epic structure

---

## Best Practices

### Do's ✅
- **Ask all questions upfront** (batch mode)
- **Use concrete examples** in scenarios ("50 users" not "some users")
- **Define measurable success criteria** (metrics, KPIs)
- **Document edge cases explicitly**
- **Specify error messages** in scenarios
- **Include test coverage requirements** in DoD
- **Reference existing patterns** from codebase

### Don'ts ❌
- **Don't assume** - always ask if unclear
- **Don't iterate questions** - batch them all at once
- **Don't create placeholder sections** - fill everything or mark `[NEEDS_CLARIFICATION]`
- **Don't skip INVEST validation** - tickets must meet all criteria
- **Don't write vague scenarios** - be specific and verifiable
- **Don't forget negative cases** - include error scenarios
- **Don't make technical decisions** without stakeholder input

---

## Troubleshooting

### "How do I handle contradictory answers?"

**Solution**:
1. Identify contradiction
2. Present both interpretations
3. Ask user to clarify:
```markdown
⚠️ Contradictory information detected:

In answer #3 you said: "All users can reset passwords"
In answer #8 you said: "Only verified users can reset"

Which is correct?
A) All users (including unverified)
B) Only verified users
C) Other: [specify]
```

---

### "What if user says 'I don't know' to a question?"

**Solution**:
1. Mark that section with `[NEEDS_CLARIFICATION: User unsure about X]`
2. Suggest reasonable default with disclaimer:
```markdown
⚠️ Missing information:

Q11: Token expiration time - User unsure

**Suggested default**: 1 hour (industry standard)
**Marked in ticket**: [NEEDS_CLARIFICATION: Token expiration - assuming 1 hour, confirm with security team]

Ticket created with assumption, will need validation before implementation.
```

---

### "What if this is a bug fix, not a feature?"

**Solution**:
1. Adapt template for bug fixes
2. Add sections:
   - **Bug Description**: What's broken
   - **Steps to Reproduce**: How to trigger bug
   - **Expected vs Actual Behavior**
   - **Root Cause** (if known)
   - **Proposed Fix**
3. Keep BDD scenarios (for regression tests)

**Bug Ticket Template** (modified):
```markdown
# 🐛 Bug: [Concise Description]

## 📋 Bug Description
[What's broken]

## 🔁 Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## 🔍 Expected vs Actual

**Expected**: [What should happen]
**Actual**: [What actually happens]

## 🎯 Acceptance Criteria (Fix Validation)

### Scenario 1: Bug is fixed
```gherkin
Given [reproduction setup]
When [trigger action]
Then [correct behavior occurs]
And [no errors logged]
```

### Scenario 2: Regression test
```gherkin
Given [related functionality]
When [use related feature]
Then [still works correctly]
```

[... rest of template ...]
```

---

## Version History

- **1.0.0** (2026-03-02): Initial skill with dual input modes, batch questions, INVEST validation, BDD scenarios

---

## References

- SPECIFICATION_DRIVEN_DEVELOPMENT_GUIDE.md (project root)
- INVEST criteria: https://en.wikipedia.org/wiki/INVEST_(mnemonic)
- BDD/Gherkin: https://cucumber.io/docs/gherkin/reference/
- Atlassian MCP: `.claude/mcp.json`
