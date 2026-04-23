---
sidebar_position: 5
title: Create Implementation-Ready Tickets
description: Transform ideas into detailed, actionable tickets with AI-powered analysis. Generates complete tickets with user stories, acceptance criteria, and technical notes.
---

# Create Implementation-Ready Tickets

Transform ideas into detailed, actionable tickets with AI-powered analysis.

---

## What It Does

Creates complete tickets with:
- ✅ Clear user stories
- ✅ Step-by-step acceptance criteria
- ✅ Edge cases and error scenarios
- ✅ Definition of done checklist
- ✅ Technical implementation notes (for developers)

**Result**: A ticket ready for developers to implement immediately

---

## How to Use

**Note**: Run this as a skill inside the AI CLI (Claude Code or Codex), not in a plain terminal.

### Invoking Skills

| Provider     | Invoke             | List active skills |
| ------------ | ------------------ | ------------------ |
| Claude Code  | `/skill [args]`    | Auto-discovered    |
| Codex CLI    | `$skill [args]`    | `/skills`          |

In Codex, run `/skills` to confirm `create-sdd-ticket` is available in the session.

### Basic Command

```bash
# Claude Code
/create-sdd-ticket --from-input "<your idea>" --save-to-markdown <file>

# Codex CLI
$create-sdd-ticket --from-input "<your idea>" --save-to-markdown <file>
```

### Examples

**From an idea**:
```bash
# Claude Code
/create-sdd-ticket --from-input "Add CSV export to user list" --save-to-markdown ./specs/export.md
# Codex CLI
$create-sdd-ticket --from-input "Add CSV export to user list" --save-to-markdown ./specs/export.md
```

**From existing Jira ticket** (to add more detail):
```bash
# Claude Code
/create-sdd-ticket --from-jira https://company.atlassian.net/browse/PROJ-123 --save-to-markdown ./refined.md
# Codex CLI
$create-sdd-ticket --from-jira https://company.atlassian.net/browse/PROJ-123 --save-to-markdown ./refined.md
```

**Save directly to Jira**:
```bash
# Claude Code
/create-sdd-ticket --from-input "Add dark mode toggle to settings" --save-to-jira https://company.atlassian.net/projects/PROJ
# Codex CLI
$create-sdd-ticket --from-input "Add dark mode toggle to settings" --save-to-jira https://company.atlassian.net/projects/PROJ
```

---

## What Information to Provide

### Good Example ✅
```bash
# Claude Code
/create-sdd-ticket --from-input "Users can't find specific users in our 500+ user list. Add search by name and email" --save-to-markdown ./specs/search.md
# Codex CLI
$create-sdd-ticket --from-input "Users can't find specific users in our 500+ user list. Add search by name and email" --save-to-markdown ./specs/search.md
```

**Why this works**: Clear problem, context (500+ users), specific solution (search by name/email)

### Better Example ✅✅
```bash
# Claude Code
/create-sdd-ticket --from-input "Admin users report taking too long to find specific users in the 500+ user list. Add search filtering by name and email, similar to the existing product search" --save-to-markdown ./specs/search.md
# Codex CLI
$create-sdd-ticket --from-input "Admin users report taking too long to find specific users in the 500+ user list. Add search filtering by name and email, similar to the existing product search" --save-to-markdown ./specs/search.md
```

**Why even better**: User type (admins), pain point (too slow), context (500+ users), solution (search), reference (like product search)

### Avoid ❌
```bash
# Claude Code / Codex CLI
/create-sdd-ticket --from-input "Make the app better" --save-to-markdown ./specs/feature.md
$create-sdd-ticket --from-input "Make the app better" --save-to-markdown ./specs/feature.md
```

**Why**: Too vague, no clear problem or solution

---

## AI Analysis Process

The AI automatically:

1. **Understands Context** - Analyzes codebase for similar features
2. **Expands Requirements** - Creates detailed user stories and acceptance criteria
3. **Identifies Gaps** - Asks clarifying questions if needed
4. **Structures Output** - Formats for developers

### Gap Analysis

If the AI needs more information, it asks questions like:
- "Should this work for all user roles or just admins?"
- "What happens if the export takes more than 5 seconds?"
- "Should users filter by date range?"

You can:
- **Answer questions** for a complete ticket
- **Skip for now** and add details later

---

## Output Format

### Markdown File

```markdown
# Feature Title

## Summary
Brief description

## User Stories
- As an admin, I want to search users so I can find them quickly

## Acceptance Criteria
**Scenario: Search by name**
- Given a list of 500 users
- When I type "John" in the search box
- Then only users with "John" in their name appear

## Technical Requirements
- Implementation details (for developers)

## Definition of Done
- [ ] Search works for name and email
- [ ] Results appear within 1 second
- [ ] All tests passing
```

### Jira Ticket

Creates Jira ticket with same information.

---

## Best Practices

### Do ✅
- **Describe user pain point**: "Users struggle to..."
- **Provide context**: "In our 500+ user list..."
- **Mention similar features**: "Like existing product search..."
- **Specify who needs it**: "Admin users need..."
- **Include success metrics**: "Should load in under 1 second..."

### Don't ❌
- Be vague: "Make it better"
- Skip the problem: Just "Add feature X"
- Use overly technical language
- Try to define every detail (AI handles that)

---

## Tips for Complex Features

**Break down large features**:

Instead of:
```bash
# Claude Code
/create-sdd-ticket --from-input "Improve user management page" --save-to-markdown ./specs/user-mgmt.md
# Codex CLI
$create-sdd-ticket --from-input "Improve user management page" --save-to-markdown ./specs/user-mgmt.md
```

Do:
```bash
# Claude Code — separate tickets
/create-sdd-ticket --from-input "Add search to user management page" --save-to-markdown ./specs/search.md
/create-sdd-ticket --from-input "Add CSV export to user management page" --save-to-markdown ./specs/export.md
/create-sdd-ticket --from-input "Add bulk actions to user management page" --save-to-markdown ./specs/bulk-actions.md

# Codex CLI — same flags, '$' prefix
$create-sdd-ticket --from-input "Add search to user management page" --save-to-markdown ./specs/search.md
$create-sdd-ticket --from-input "Add CSV export to user management page" --save-to-markdown ./specs/export.md
$create-sdd-ticket --from-input "Add bulk actions to user management page" --save-to-markdown ./specs/bulk-actions.md
```

**Why**: Smaller tickets are easier to implement and test.

---

## Troubleshooting

### "Generated ticket is too generic"
**Fix**: Provide more specific details. Use `$` instead of `/` in Codex.

```bash
# Instead of:
/create-sdd-ticket --from-input "Add user search" --save-to-markdown ./specs/search.md
# Do:
/create-sdd-ticket --from-input "Admin users report difficulty finding specific users in our 500+ user list. Add search by name and email" --save-to-markdown ./specs/search.md
```

### "Too many clarifying questions"
**Fix**: Include more details upfront (works identically in Codex with `$`):

```bash
/create-sdd-ticket --from-input "Add CSV export for user data. Export name, email, and role. Limit 10,000 records max. Send email when complete" --save-to-markdown ./specs/export.md
```

### "Can't create Jira ticket"
**Fix**: Save to markdown first:

```bash
/create-sdd-ticket --from-input "Add feature" --save-to-markdown ./temp.md   # Claude Code
$create-sdd-ticket --from-input "Add feature" --save-to-markdown ./temp.md   # Codex CLI
```

### "Skill not recognized in Codex"
**Fix**: Run `/skills` in the Codex session to list available skills. If
`create-sdd-ticket` isn't listed, re-sync the framework resources and restart
the session.

---

## What Happens Next?

Once you have a ticket:

1. **Review** - Check generated ticket
2. **Refine** - Add missing details if needed
3. **Assign** - Give to development team
4. **Implement** - Developers use `/implement-ticket` (Claude) or `$implement-ticket` (Codex) to build it

**Full cycle**: Idea → Detailed Ticket → Working Code → Pull Request

---

**Ready to create better tickets?** Start with a clear description of the user problem and desired outcome.
