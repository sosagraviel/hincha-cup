# Implementation Checklist - Skill-First Refactor

## Phase 1: Skills Don't Need Enhancement ✅

After analyzing the skills and agent templates, I've determined:

**KEY INSIGHT**: The agent templates (`tester-unit`, `tester-e2e`, `doc-updater`, `security-reviewer`) are already THIN WRAPPERS. They don't contain complex logic - just workflow guidance that's already documented in the skills.

**Decision**: Skip skill enhancement. The skills are already comprehensive. The agents just provide:
- Stack-specific variable substitution ({{stack}}, {{test_command}})
- Workflow steps (already in skills)
- Best practices (already in skills)

## Phase 2: Direct Implementation Steps

### Step 1: Update implement-ticket Skill ⏳

**File**: `skills/020-development-workflow/implement-ticket/SKILL.md`

**Changes Needed**:
1. Add deterministic TodoWrite integration for all 10 phases
2. Change Phase 5 to invoke skills directly instead of spawning agents:
   - Unit tests: Invoke `/jest-coverage-automation` skill
   - E2E tests: Invoke `/playwright-e2e-automation` skill
3. Change Phase 7 to invoke `/update-project-context` skill
4. Add Phase 9 PR review loop with `/pr-reviewer` skill
5. Ensure structured JSON output expected from skills

### Step 2: Delete Commands/implement-ticket.md ⏳

**File**: `commands/implement-ticket.md`

**Action**: DELETE entirely (skill is canonical)

### Step 3: Update agent-generation.js ⏳

**File**: `utils/agent-generation.js`

**Remove**:
- `generateTesterAgents()` - Lines dealing with E2E (keep unit test logic if separate, or remove entirely)
- `generateSecurityReviewerAgent()` function
- `generateDocUpdaterAgent()` function
- Template filename mappings for deleted agents in `getTemplateFilename()`

**Keep**:
- `generatePlannerAgent()`
- `generateImplementerAgents()`
- `generateVisualVerifierAgent()`

### Step 4: Delete 4 Agent Templates ⏳

**Delete these files**:
1. `agents/templates/tester-e2e.template.md`
2. `agents/templates/tester-unit.template.md`
3. `agents/templates/doc-updater.template.md`
4. `agents/templates/security-reviewer.template.md`

### Step 5: Update SKILLS_AND_AGENTS_MAP.md ⏳

**File**: `SKILLS_AND_AGENTS_MAP.md`

**Changes**:
- Remove references to deleted agents
- Update architecture diagrams
- Document new skill-first approach

### Step 6: Create New Documentation ⏳

**Create**:
1. `docs/IMPLEMENT_TICKET.md` - Complete workflow with mermaid
2. `docs/CREATE_SDD_TICKET.md` - Workflow with mermaid
3. Update `README.md` - New architecture overview

### Step 7: Test ⏳

1. Test on fresh project initialization
2. Verify agent generation creates only 3 agent types
3. Test implement-ticket end-to-end

## Progress Tracker

- [ ] Step 1: Update implement-ticket skill
- [ ] Step 2: Delete commands/implement-ticket.md
- [ ] Step 3: Update agent-generation.js
- [ ] Step 4: Delete 4 agent templates
- [ ] Step 5: Update SKILLS_AND_AGENTS_MAP.md
- [ ] Step 6: Create new documentation
- [ ] Step 7: Test

## Critical Decision

**Why not enhance skills?**

Because the agent templates don't have any logic that's missing from skills. They are just:
- Variable templates ({{stack}}, {{test_command}}) - this is handled by agent generation
- Workflow steps - already documented in skills
- Best practices - already in skills

The implement-ticket skill just needs to invoke skills directly instead of spawning agents.
