---
name: update-project-context
description: Re-run codebase analysis to update project-context skill with latest architectural changes. Preserves custom engineer additions while updating auto-discovered patterns.
user-invocable: true
argument-hint: []
disable-model-invocation: true
context: inline
version: 1.0.0
---

# Update Project Context — Refresh Architectural Knowledge

This skill re-runs the codebase analysis from `/initialize-project` to update the `.claude/skills/project-context/SKILL.md` file with the latest architectural changes.

## When to Use This Skill

Use `/update-project-context` when:

- **Major architectural changes** have been made (new auth flows, real-time pipelines, etc.)
- **New patterns** have emerged that should be documented
- **Project has grown** significantly since initialization
- **Non-obvious behaviors** have been added that aren't easily discoverable
- **You want to verify** that project-context is still accurate

**Do NOT use this for minor changes** like adding endpoints, entities, or env vars. Those should remain easily discoverable via ls/grep/read.

---

## Core Philosophy

Same as `/initialize-project`:

**Only document what's hard to discover.** The AI can `ls`, `grep`, and `read` files instantly. Focus on:

- Multi-step flows spanning multiple files/services
- Non-obvious conventions and patterns
- Error handling chains
- Guard/middleware stacking order
- Real-time event pipelines
- Complex validation logic

---

## Workflow

### Phase 1: Backup Existing Project Context

Before making any changes, preserve the current state:

```bash
# Backup current project-context
cp .claude/skills/project-context/SKILL.md .claude/skills/project-context/SKILL.md.backup

# Add timestamp to backup
mv .claude/skills/project-context/SKILL.md.backup \
   .claude/skills/project-context/SKILL.md.backup.$(date +%Y%m%d-%H%M%S)
```

**Report to user**:
```
Backed up existing project-context to:
.claude/skills/project-context/SKILL.md.backup.20260302-143022
```

---

### Phase 2: Re-run Analysis Subagents

Launch the same **4 parallel subagents** from `/initialize-project`:

**Load from**: `.claude/agents/initialize-project-agents/`

1. `01-structure-architecture.md` - Structure & Architecture
2. `02-data-flows-auth.md` - Data Flows & Auth
3. `03-devops-workflow.md` - DevOps & Development Workflow
4. `04-conventions-patterns.md` - Conventions & Non-Obvious Patterns

Send all 4 Task calls in a **single message** for parallel execution.

**Instruct each subagent**:
```
You are re-analyzing this codebase to UPDATE the project-context skill.
Focus on what has CHANGED since the last analysis:
- New architectural patterns
- New flows (auth, real-time, error handling)
- New conventions or non-obvious behaviors
- Changed patterns or deprecations

DO NOT report unchanged items unless they are critical.
```

---

### Phase 3: Consolidate & Compare

After all 4 subagents complete:

### Step 3.1: Compile New Analysis

Create a consolidated summary of the new analysis, organized the same way as the original:

- Tech stack (note any version changes)
- Architecture patterns (note any new patterns)
- Complex flows (highlight changes)
- Development workflow (note new commands)
- Non-obvious patterns (new gotchas)

### Step 3.2: Read Old Project Context

Read the backed-up project-context file:

```bash
Read: .claude/skills/project-context/SKILL.md.backup.*
```

Extract the following sections from the old context:
- Hard-to-discover flows
- Non-obvious patterns
- Custom engineer additions (look for manual edits, TODOs, or sections not in templates)

### Step 3.3: Generate Diff Summary

Compare old vs new and create a diff summary:

**Format**:
```markdown
# Project Context Update Summary

## Changes Detected

### Added Patterns
- [New pattern 1]: Description
- [New pattern 2]: Description

### Modified Flows
- [Flow name]: What changed
  - Old: [description]
  - New: [description]

### Removed/Deprecated
- [Pattern name]: Reason for removal

### Unchanged (Critical)
- [Critical pattern]: Still applies, kept in updated context

## Custom Engineer Additions (Preserved)
The following sections from the old project-context were manually added
by engineers and have been preserved:
- [Section name]: [Brief description]
```

### Step 3.4: Present Diff to Engineer

Show the diff summary to the engineer and ask for review:

```
I've re-analyzed the codebase and found the following changes to project-context:

[Insert diff summary here]

Would you like me to:
1. Apply these updates (recommended)
2. Review specific sections before applying
3. Cancel and keep the current project-context

Please respond with 1, 2, or 3.
```

Wait for engineer's response.

---

### Phase 4: Generate Updated Project Context

If engineer approves (option 1 or after reviewing option 2):

### Step 4.1: Invoke Architect Synthesizer

Launch the opus architect synthesizer subagent:

**Load from**: `.claude/agents/initialize-project-agents/05-architect-synthesizer.md`

**Provide context**:
- New consolidated analysis from Phase 2
- Old project-context backup
- Diff summary from Phase 3.3
- Engineer's feedback (if option 2 was chosen)

**Instruct the architect**:
```
Generate an UPDATED project-context skill that:
1. Incorporates all changes detected in the new analysis
2. Preserves custom engineer additions from the old context
3. Removes deprecated patterns
4. Maintains the same structure and format

Mark any sections you're unsure about with [NEEDS_VERIFICATION].
```

---

### Phase 5: Write Updated Project Context

After the opus subagent returns:

### Step 5.1: Write New Project Context

```bash
Write: .claude/skills/project-context/SKILL.md
```

### Step 5.2: Present Update Summary

Show the engineer what was updated:

```markdown
Project Context Updated Successfully!

## Files Modified
- .claude/skills/project-context/SKILL.md (~X lines → ~Y lines)

## Backup Created
- .claude/skills/project-context/SKILL.md.backup.20260302-143022

## Changes Applied
- Added: N new patterns
- Modified: M existing flows
- Removed: P deprecated items
- Preserved: Q custom engineer sections

## What's Updated (Hard to Discover)
- [New flow 1]: Multi-step auth changes
- [New pattern 2]: Real-time event handling
- [Modified behavior 3]: Guard stacking order changed

## What's NOT Updated (Easily Discoverable)
- Endpoint lists, entity fields, module inventories
- The AI can still find these instantly via ls/grep/read

## Next Steps
1. Review the updated project-context
2. Load it: /project-context
3. Verify critical flows are documented correctly

Rollback available: cp .claude/skills/project-context/SKILL.md.backup.* .claude/skills/project-context/SKILL.md
```

---

### Step 5.3: Offer Detailed Review

Ask:
```
Would you like me to:
1. Walk through the changes section by section
2. Highlight only the critical changes
3. Compare old vs new side-by-side for a specific flow

Or are you ready to use the updated context?
```

---

## Selective Update Options

### Option: Update Only Specific Sections

If the engineer wants to update only certain sections (e.g., auth flows but not data flows):

**Workflow modification**:
1. Ask which sections to update:
   - Architecture & Structure
   - Data Flows & Auth
   - DevOps & Workflow
   - Conventions & Patterns
2. Launch only the relevant subagents
3. Merge results with unchanged sections from old context

---

### Option: Add New Section Without Full Re-analysis

If the engineer wants to add a specific new pattern without re-analyzing everything:

**Workflow modification**:
1. Ask for the new pattern/flow to document
2. Analyze only that specific pattern
3. Insert into existing project-context without running full analysis

**Usage**:
```
/update-project-context --add-section "WebSocket connection lifecycle"
```

---

## Diff Visualization

When presenting changes, use clear before/after format:

**Example**:
```markdown
### Auth Flow Changes

#### Old Flow (before)
1. User logs in → Keycloak
2. JWT token stored in Redis
3. AuthGuard validates token

#### New Flow (after)
1. User logs in → Keycloak
2. JWT token stored in Redis **with TTL refresh**
3. AuthGuard validates token
4. **NEW**: RefreshGuard handles token rotation
5. **NEW**: Guard stacking: [AuthGuard, RoleGuard, PermissionGuard]

#### Impact
- All endpoints now have automatic token refresh
- Role-based access is now enforced via guard stacking
```

---

## Preservation Rules

When updating, always preserve:

1. **Custom engineer additions**:
   - Manually added sections not in templates
   - Engineer comments or TODOs
   - Business domain context added by user

2. **Critical patterns** (even if unchanged):
   - Guard stacking order (if it's non-obvious)
   - Sort prefix meaning (010, 020, etc.)
   - Error handling chains
   - Real-time event flows

3. **Version history** (if present):
   - Keep a "Changes" section at the bottom
   - Append new update timestamp

---

## Error Handling

| Error | Resolution |
|-------|------------|
| Subagent timeout | Retry with more focused scope |
| No changes detected | Ask engineer if specific section should be updated |
| Conflicting patterns | Present both, ask engineer which is correct |
| Lost custom additions | Restore from backup, merge manually |
| Old backup not found | Warn user, proceed without comparison |

---

## Advanced: Scheduled Updates

For teams that want periodic updates:

```bash
# Cron job example (monthly)
0 0 1 * * cd /project && claude-code /update-project-context --auto-approve-if-minor
```

**Auto-approve criteria**:
- Only minor changes (< 5 pattern updates)
- No deprecated patterns
- No conflicts with custom sections

If major changes detected, notify engineer for manual review.

---

## Comparison with Initialize-Project

| Feature | /initialize-project | /update-project-context |
|---------|---------------------|-------------------------|
| When to use | New project setup | Update existing context |
| Subagents | 4 analyzers + 1 architect | Same |
| Engineer Q&A | Yes (for unknowns) | Optional (only if conflicts) |
| Backup | Yes (if CLAUDE.md exists) | Always (required) |
| Diff generation | No | Yes (old vs new) |
| Custom preservation | No | Yes (critical) |
| Skill selection | Yes | No (skills already copied) |
| Agent generation | Yes | No (agents already exist) |
| MCP configuration | Yes | No (MCPs already configured) |

**Key difference**: `/update-project-context` focuses ONLY on refreshing the project-context skill, not the entire setup.

---

## Version History

- **1.0.0** (2026-03-02): Initial creation with backup, diff, and preservation logic

---

## Example Usage

**Scenario**: Team added a new Redis-based caching layer and want to document the cache invalidation flow.

**Command**:
```
/update-project-context
```

**Output**:
```
Backed up existing project-context to:
.claude/skills/project-context/SKILL.md.backup.20260302-150000

Re-analyzing codebase...
[4 parallel haiku analyzers run]

Changes detected:
- Added: Redis cache invalidation flow (7-step process)
- Modified: Request lifecycle (now includes cache check)
- Unchanged: Auth flow, real-time pipeline

Apply updates? (y/n)
> y

Updated project-context with 2 new patterns.
Backup available for rollback.
```

---

**End of Skill**
