---
sidebar_position: 2
title: Writing Good Tickets
description: How to write clear, complete tickets for autonomous implementation with the AI Agentic Framework.
---

# Writing Good Tickets

How to write clear, complete tickets for autonomous implementation with the AI Agentic Framework.

---

## Overview

The framework offers two approaches for ticket creation:

### Option 1: Autonomous Ticket Generation (Recommended)

Use `/create-sdd-ticket` to generate implementation-ready tickets from ideas:

```bash
/create-sdd-ticket \
  --from-input "Add OAuth login with Google" \
  --save-to-jira https://company.atlassian.net/projects/PROJ/boards/1
```

**What the framework does**:
- Searches your codebase for relevant patterns
- Infers technical approach from existing code
- Asks 2-5 clarifying questions (not 20+)
- Generates INVEST-compliant ticket with BDD scenarios
- Creates ticket in Jira ready for `/implement-ticket`

**Time**: 3-5 minutes (vs 30-60 minutes manually)

### Option 2: Manual Ticket Writing

If you prefer to write tickets manually or need to create tickets outside the framework, follow the guidelines below.

---

## Why Good Tickets Matter

Whether created by the framework or manually, **clarity = success**. Ambiguous tickets lead to:
- ❌ Wrong implementations requiring rework
- ❌ Missing edge cases causing bugs
- ❌ Back-and-forth clarifications wasting time

Well-written tickets lead to:
- ✅ Correct implementations on first attempt
- ✅ Complete test coverage
- ✅ Fewer review iterations

---

## The 6 Essential Sections

Every ticket should have these sections:

### 1. User Story (Who, What, Why)

**Format**: `As a [role], I want [feature] so that [benefit]`

**Example**:
```
As a project manager, I want to filter tickets by assignee
so that I can quickly see what each team member is working on.
```

### 2. Acceptance Criteria (Given-When-Then)

**Format**: Use Given-When-Then for each scenario

**Example**:
```
Scenario 1: Filter by single assignee
  Given I am on the tickets page
  When I select "John Doe" from the assignee filter
  Then I see only tickets assigned to John Doe

Scenario 2: Clear filter
  Given I have applied an assignee filter
  When I click "Clear Filters"
  Then I see all tickets
```

### 3. Out of Scope

**Why**: Prevents scope creep and clarifies boundaries

**Example**:
```
Out of Scope:
- Filtering by multiple assignees (future feature)
- Exporting filtered results (separate ticket)
- Saving filter presets (not needed for MVP)
```

### 4. Technical Context

**Include**:
- Relevant files/components
- External dependencies
- Performance requirements
- Security considerations

**Example**:
```
Technical Context:
- Update TicketList component (src/components/tickets/TicketList.tsx)
- Use existing UserService.getUsers() API
- Filter should work with 1000+ tickets without lag
- Ensure assignee data is sanitized (XSS prevention)
```

### 5. Edge Cases

**Common categories**:
- Empty states
- Error scenarios
- Boundary conditions
- Concurrent operations

**Example**:
```
Edge Cases:
- No tickets match filter → Show "No tickets found" message
- User deleted after filter applied → Show "(Deleted User)"
- API timeout → Show error toast, keep previous results
```

### 6. Definition of Done

**Standard checklist**:
```
Definition of Done:
- [ ] Unit tests with 80%+ coverage
- [ ] Integration tests for API calls
- [ ] E2E test for happy path
- [ ] Code reviewed and approved
- [ ] No ESLint warnings (--max-warnings=0)
- [ ] Documentation updated (if public API)
```

---

## INVEST Criteria (Quick Reference)

Good tickets are **INVEST**:

| Criteria | Meaning | Bad Example | Good Example |
|----------|---------|-------------|--------------|
| **I**ndependent | Self-contained | "Redesign entire UI" | "Add filter to ticket list" |
| **N**egotiable | Flexible on how | "Use React Table library" | "Display data in sortable table" |
| **V**aluable | Clear user value | "Refactor TicketService" | "Speed up ticket loading by 50%" |
| **E**stimable | Team can estimate | "Improve performance" | "Add database index on assignee_id" |
| **S**mall | 1-2 week effort | "Build admin dashboard" | "Add user role filter" |
| **T**estable | Clear pass/fail | "Make UI better" | "Page loads in &lt;2s with 1000 tickets" |

---

## Common Pitfalls to Avoid

### ❌ Too Vague
```
As a user, I want better search so that I can find things faster.
```
**Problem**: What does "better" mean? What things? How fast?

### ✅ Specific and Testable
```
As a user, I want to search tickets by title and description
so that I can find tickets containing specific keywords.

Acceptance Criteria:
- Search returns results in &lt;500ms for 10,000 tickets
- Matches are highlighted in yellow
- Partial word matches are supported (e.g., "auth" matches "authentication")
```

---

### ❌ Too Prescriptive
```
As a developer, I want to use Redis for caching with a 5-minute TTL
implemented using the ioredis library with cluster support.
```
**Problem**: Over-specifies implementation, limits developer creativity

### ✅ Outcome-Focused
```
As a user, I want search results to load instantly (&lt; 100ms)
even with thousands of tickets.

Technical Constraint:
- Must work with existing PostgreSQL database
- Consider caching strategy for frequently searched terms
```

---

### ❌ Missing Edge Cases
```
As a user, I want to upload my profile picture.
```
**Problem**: No mention of file size limits, formats, errors

### ✅ Comprehensive
```
As a user, I want to upload my profile picture
so that other users can recognize me.

Acceptance Criteria:
- Supports JPG, PNG, WebP formats
- Max file size: 5MB
- Image is cropped to 200x200px
- Shows upload progress indicator

Edge Cases:
- File > 5MB → Show error: "File too large (max 5MB)"
- Invalid format → Show error: "Please upload JPG, PNG, or WebP"
- Upload timeout → Show retry button
- No internet → Queue upload for when online
```

---

## Quick Ticket Template

Copy this template for your tickets:

```markdown
## User Story
As a [role], I want [feature] so that [benefit].

## Acceptance Criteria
**Scenario 1**: [Name]
  Given [context]
  When [action]
  Then [expected result]

**Scenario 2**: [Name]
  Given [context]
  When [action]
  Then [expected result]

## Out of Scope
- [What we're NOT doing]
- [Future enhancements]

## Technical Context
- Files to modify: [list]
- Dependencies: [APIs, libraries]
- Performance: [requirements]
- Security: [considerations]

## Edge Cases
- [Empty state]
- [Error scenario]
- [Boundary condition]

## Definition of Done
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] E2E test for happy path
- [ ] Code reviewed
- [ ] No linting warnings
- [ ] Documentation updated
```

---

## Real Example: Good Ticket

```markdown
## User Story
As a project manager, I want to bulk-assign tickets to team members
so that I can quickly distribute work during sprint planning.

## Acceptance Criteria

**Scenario 1**: Bulk assign to single user
  Given I have selected 5 tickets using checkboxes
  When I click "Assign" and select "John Doe"
  Then all 5 tickets are assigned to John Doe
  And I see a success toast: "5 tickets assigned to John Doe"

**Scenario 2**: No tickets selected
  Given I have not selected any tickets
  When I click "Assign"
  Then the assign button is disabled
  And I see a tooltip: "Select tickets first"

**Scenario 3**: Some tickets already assigned
  Given I have selected 3 unassigned and 2 assigned tickets
  When I bulk assign to "Jane Smith"
  Then all 5 tickets are reassigned to Jane Smith
  And I see: "5 tickets assigned (2 reassigned)"

## Out of Scope
- Assigning to multiple users at once (separate ticket: PROJ-789)
- Undo bulk assign (not needed for MVP)
- Email notifications (handled by existing notification system)

## Technical Context
- Update TicketList component (src/components/tickets/TicketList.tsx)
- Add BulkAssignDialog component
- Use existing PUT /api/tickets/bulk-assign endpoint (backend already supports)
- Max 50 tickets per bulk operation (API limit)
- Optimistic UI update with rollback on error

## Edge Cases
- User selects 51+ tickets → Show error: "Max 50 tickets per bulk assign"
- API returns 403 (no permission) → Revert selection, show error toast
- Assigned user deleted before confirm → Show warning, suggest refresh
- Concurrent bulk assign by another user → Last write wins, show warning

## Definition of Done
- [ ] Unit tests for BulkAssignDialog component
- [ ] Integration test for bulk assign API call
- [ ] E2E test for happy path (select 5, assign, verify)
- [ ] Handles all edge cases above
- [ ] Works with 1000+ tickets in list (performance test)
- [ ] Accessibility: Keyboard navigation works
- [ ] Code reviewed and approved
```

---

## Tips for AI-Assisted Development

When writing tickets for AI implementation:

1. **Be Explicit About Tech Stack**
   - ✅ "Use TanStack Query for data fetching"
   - ❌ "Fetch data from API"

2. **Provide File Paths**
   - ✅ "Update src/components/tickets/TicketList.tsx"
   - ❌ "Update the ticket list"

3. **Specify Testing Requirements**
   - ✅ "Unit tests with Jest, E2E with Playwright"
   - ❌ "Add tests"

4. **Include Code Style Preferences**
   - ✅ "Use arrow functions, const over let, no semicolons"
   - ❌ Assume AI knows your style

5. **Reference Existing Patterns**
   - ✅ "Follow same pattern as UserFilter component"
   - ❌ "Create a filter component"

---

## Using the Framework

### Autonomous Ticket Creation

The framework can create tickets from various sources:

**From a simple idea**:
```bash
/create-sdd-ticket \
  --from-input "Users should be able to export their data as CSV" \
  --save-to-jira <BOARD_URL> \
  --project-key PROJ
```

**Refine existing Jira ticket**:
```bash
/create-sdd-ticket \
  --from-jira PROJ-100 \
  --save-to-markdown ./specs/refined-spec.md
```

**From existing markdown**:
```bash
/create-sdd-ticket \
  --from-markdown ./specs/draft-spec.md \
  --save-to-jira <BOARD_URL>
```

### Manual Implementation

For manual tickets, use the template and guidelines above to ensure clarity.

---

## Further Reading

- [Quick Start Guide](/docs/getting-started/quickstart) - Full SDLC workflows
- [User Guide](/docs/guides/user-guide) - Daily development practices
- [INVEST Criteria](https://en.wikipedia.org/wiki/INVEST_(mnemonic))
- [Given-When-Then](https://martinfowler.com/bliki/GivenWhenThen.html)
