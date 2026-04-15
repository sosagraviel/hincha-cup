---
sidebar_position: 5
title: Create Implementation-Ready Tickets
description: Transform ideas into detailed, actionable tickets with AI-powered analysis. Generates complete tickets with user stories, acceptance criteria, and technical notes.
---

# Create Implementation-Ready Tickets

Transform ideas into detailed, actionable tickets with AI-powered analysis.

---

## What It Does

The `create-sdd-ticket` skill creates complete tickets with:

- clear user stories
- measurable success criteria
- edge cases and error scenarios
- Definition of Done checklists
- technical implementation notes
- INVEST validation
- Given-When-Then scenarios

**Result**: a ticket ready for developers to implement immediately.

---

## How To Use

Run this in Claude Code by invoking the `create-sdd-ticket` skill directly.

### Basic Usage

Invoke the skill with `/create-sdd-ticket`:

```text
/create-sdd-ticket --from-input "Add CSV export to user list" --save-to-markdown "./specs/export.md"
```

### Examples

**From an idea**:

```text
/create-sdd-ticket --from-input "Add CSV export to user list" --save-to-markdown "./specs/export.md"
```

**From an existing Jira ticket**:

```text
/create-sdd-ticket --from-jira "https://company.atlassian.net/browse/PROJ-123" --save-to-markdown "./specs/PROJ-123.md"
```

**Save directly to Jira**:

```text
/create-sdd-ticket --from-input "Add dark mode toggle to settings" --save-to-jira "https://company.atlassian.net/projects/PROJ"
```

---

## What Information To Provide

### Good Example

```text
/create-sdd-ticket --from-input "Users can't find specific users in our 500+ user list. Add search by name and email." --save-to-markdown "./specs/search.md"
```

This works well because it gives a clear problem, context, and desired outcome.

### Better Example

```text
/create-sdd-ticket --from-input "Admin users report taking too long to find specific users in the 500+ user list. Add search filtering by name and email, similar to the existing product search." --save-to-markdown "./specs/search.md"
```

This is stronger because it adds user type, pain point, context, and a reference pattern.

### Avoid

```text
/create-sdd-ticket --from-input "Make the app better" --save-to-markdown "./specs/feature.md"
```

Too vague to produce a strong implementation-ready ticket.

---

## AI Analysis Process

The skill automatically:

1. loads project context before ticket analysis
2. searches the codebase for similar features and conventions
3. expands requirements into a structured SDD ticket
4. asks only the minimum clarification questions still needed
5. validates the result against INVEST
6. generates Given-When-Then scenarios

### Gap Analysis

If more information is needed, the skill asks focused questions such as:

- Should this work for all user roles or just admins?
- What should happen if the export takes more than 5 seconds?
- Should users be able to filter by date range?

Questions are only asked after project context and codebase inference have been exhausted.

---

## Output Format

### Markdown

If the user provides `--save-to-markdown <PATH>`, the skill saves exactly there.

If markdown output is requested without a path, the default is:

```text
.claude-temp/tickets/<ticket-id>/<ticket-id>.md
```

### Jira

The skill can create or refine Jira tickets with the same SDD content:

- user story
- acceptance criteria
- technical context
- INVEST-ready scope
- BDD scenarios

---

## Best Practices

### Do

- describe the user pain point
- provide context like scale, limits, or business rules
- mention similar features or implementation patterns
- specify who needs the feature
- include success metrics when known

### Don't

- use vague prompts like "make it better"
- omit the underlying problem
- force architectural decisions into clarifying answers
- bypass the skill's gap detection process

---

## Tips For Complex Features

Large initiatives should usually be split into multiple tickets.

Instead of one broad prompt like:

```text
/create-sdd-ticket --from-input "Improve user management page" --save-to-markdown "./specs/user-mgmt.md"
```

Create several focused tickets:

```text
/create-sdd-ticket --from-input "Add search to user management page" --save-to-markdown "./specs/search.md"
/create-sdd-ticket --from-input "Add CSV export to user management page" --save-to-markdown "./specs/export.md"
/create-sdd-ticket --from-input "Add bulk actions to user management page" --save-to-markdown "./specs/bulk-actions.md"
```

This keeps each ticket easier to estimate, implement, and test.

---

## Troubleshooting

### Generated Ticket Is Too Generic

Provide more specific context:

```text
/create-sdd-ticket --from-input "Admin users report difficulty finding specific users in our 500+ user list. Add search by name and email." --save-to-markdown "./specs/search.md"
```

### Too Many Clarifying Questions

Include more operational detail up front:

```text
/create-sdd-ticket --from-input "Add CSV export for user data. Export name, email, and role. Limit 10,000 records max. Send email when complete." --save-to-markdown "./specs/export.md"
```

### Can't Create Jira Ticket

Save to markdown first:

```text
/create-sdd-ticket --from-input "Add feature" --save-to-markdown "./specs/feature.md"
```

---

## What Happens Next

Once you have a ticket:

1. review the generated SDD ticket
2. refine any remaining product details
3. assign it in Jira or keep it as a markdown spec
4. implement it with `/implement-ticket`

**Full cycle**: idea -> detailed ticket -> working code -> pull request.
