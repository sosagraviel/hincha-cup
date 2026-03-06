# Initialize-Project Missing Features Analysis

## Executive Summary

The current `initialize-project` implementation in `.claude/skills/initialize-project/SKILL.md` is missing several critical features that exist in the ai-agentic-framework version. This document identifies all gaps and proposes fixes.

## Critical Issues Found

### 1. **Folder Structure Not Preserved** ❌ CRITICAL

**Problem**: When copying skills from `ai-agentic-framework/skills`, subdirectories (like `references/`, `scripts/`, `agents/`) are not being preserved.

**Evidence**:
- `ai-agentic-framework/skills/020-development-workflow/mastering-git-cli/` has `references/` and `scripts/` subdirectories
- `ai-agentic-framework/skills/040-integrations/mastering-github-agent-skill/` has subdirectories
- `ai-agentic-framework/skills/010-foundation/initialize-project/` has `agents/` subdirectory

**Current Code**:
```bash
cp -r ai-agentic-framework/skills/010-foundation/initialize-project .claude/.tmp/skills/
```

**Issue**: This copies the top-level directory but the skill's SKILL.md is in the root, while agents are in subdirectories.

**Fix Required**: Use `cp -r` with correct path handling to preserve entire directory tree.

---

### 2. **Missing Always-Copy Skills** ❌ CRITICAL

**Problem**: The following skills should ALWAYS be copied but are not in the current implementation:

**Missing Skills**:
1. `mastering-git-cli` (020-development-workflow/) - Git CLI mastery with references
2. `create-sdd-ticket` (020-development-workflow/) - Create SDD tickets
3. `start-task` (010-foundation/) - Worktree management for parallel work

**Evidence**: These skills exist in ai-agentic-framework but are not in the Phase 5 copy logic.

**Impact**: Users cannot use essential Git features, SDD ticket creation, or parallel task management.

---

### 3. **Autonomous Execution Not Enforced** ❌ CRITICAL

**Problem**: The `implement-ticket` skill has `--no-stop` flag and autonomous mode, but there's no enforcement that it MUST complete all phases unattended.

**From ai-agentic-framework/skills/020-development-workflow/implement-ticket/SKILL.md**:
```bash
# Autonomous Mode (--no-stop)
# Runs end-to-end without user prompts. Only stops on hard errors
/implement-ticket PROJ-123 --no-stop
```

**Current State**: The skill supports autonomous mode but doesn't enforce it.

**Fix Required**:
- Document in `.claude/CLAUDE.md` that `--no-stop` should be default
- Add validation that all phases complete
- Add checkpoint/resume logic for recovery

---

### 4. **Planner vs Architect Decision Logic Missing** ❌ CRITICAL

**Problem**: The `implement-ticket` skill should automatically decide between simple planner vs architect mode based on ticket complexity/risk.

**From git commit `bce062e` (Mon Mar 2 21:57:40 2026)**:
```
## Automatic Planner Detection (P0-15)

**Problem**: Engineers had to manually select planner vs architect mode

**Solution**: Automatic risk-based mode selection
- High-risk tickets (migration, auth, payment, security, breaking change,
  database schema, crypto, encryption, compliance, GDPR, PCI, HIPAA)
  → Automatically select architect mode (deliberate review)
- Low-risk tickets → Automatically select planner mode (fast execution)
```

**From ai-agentic-framework/skills/020-development-workflow/implement-ticket/SKILL.md** (lines 86-136):
- Planner Mode (Default) - Fast linear pipeline
- Architect Mode (Automatic for High-Risk) - Deliberate supervisor pattern with grading
- Auto-detection based on keywords: migration, auth, payment, security, etc.

**Current State**: Logic exists in ai-agentic-framework but may not be in generated agents.

**Fix Required**: Ensure planner/implementer/tester agents check for risk keywords and select mode automatically.

---

### 5. **Worktree/Parallel Task Support Missing** ⚠️ HIGH PRIORITY

**Problem**: The `start-task` skill exists in ai-agentic-framework but is not copied to `.claude/skills/`.

**From ai-agentic-framework/skills/010-foundation/start-task/SKILL.md** (16 KB file):
- Creates git worktrees for parallel task development
- Allows working on multiple tickets simultaneously
- Manages branch isolation

**Current State**: Skill exists but not being copied.

**Fix Required**: Add `start-task` to always-copy list in Phase 5.

---

### 6. **P0-P14 Improvements Not Reflected** ⚠️ HIGH PRIORITY

**From git commit `932cde5` (Mon Mar 2 21:05:54 2026)**:

**Initialize-Project Improvements** (P0-1 to P0-6):
- P0-1: Workspace-aware stack detection (monorepo support)
- P0-2: Multi-language arrays (polyglot repo support)
- P0-3: Template variable validation (prevents broken agents)
- P0-4: Dependency version extraction (version-specific guidance)
- P0-5: Transaction-like file writes (atomic operations with rollback)
- P0-6: Subagent completion validation (ensures all 4 analyzers complete)

**Implement-Ticket Improvements** (P0-7 to P0-14):
- P0-7: Atomic checkpoint operations (corruption prevention)
- P0-8: Rollback on quality gate failure (4 options: rollback/WIP/checkpoint/adjust)
- P0-9: Resource validation (disk/memory/connectivity checks)
- P0-10: Coverage gap detection (actionable line-level analysis)
- P0-11: API rate limit tracking (per-service budgets)
- P0-12: Checkpoint validation on resume (git state/environment validation)
- P0-13: WIP PR creation on unrecoverable errors (preserves work)
- P0-14: Infinite retry loop detection (3 identical errors in 5 minutes)

**Files Modified**:
- `ai-agentic-framework/utils/stack-detection.js` (~1,000 lines)
- `ai-agentic-framework/utils/error-recovery.js` (~400 lines added)
- `ai-agentic-framework/utils/skill-selection.js` (~50 lines)
- `ai-agentic-framework/utils/agent-generation.js`
- `ai-agentic-framework/schemas/checkpoint.schema.json`

**Current State**: These utilities may exist but are not integrated into the current initialize-project workflow.

**Fix Required**: Check if these utilities exist and integrate them into Phase 5.

---

### 7. **Grading Rubric & Quality Assurance** ⚠️ MEDIUM PRIORITY

**From git commit `70fbe17` (Mon Mar 2 14:56:24 2026)**:

**Architect Mode Workflow**:
- Phase 2: Conditional branching (architect vs planner)
- Architect mode: Creates detailed instructions with 100-point grading rubric
- Phase 3.5: Post-implementation grading
- Threshold enforcement: Score ≥80 required to proceed
- Rework loop: Restart Phase 3 if score <80
- PR Integration: Adds "Quality Assurance (Architect Mode)" section to PR

**Current State**: Architect agent exists but grading logic may not be implemented.

**Fix Required**: Check if grading logic is in architect-agent or needs to be added.

---

## Comparison: ai-agentic-framework vs Current .claude

| Feature | ai-agentic-framework | Current .claude | Status |
|---------|----------|-----------------|--------|
| Folder structure preservation | ✅ Has subdirs | ❌ Not preserved | BROKEN |
| mastering-git-cli | ✅ Present | ❌ Missing | MISSING |
| create-sdd-ticket | ✅ Present | ❌ Missing | MISSING |
| start-task | ✅ Present | ❌ Missing | MISSING |
| Autonomous mode enforcement | ✅ --no-stop | ⚠️ Not enforced | PARTIAL |
| Planner vs Architect auto-detection | ✅ Implemented | ⚠️ May be partial | VERIFY |
| P0-P14 improvements | ✅ Committed | ❌ Not integrated | MISSING |
| Checkpoint/resume logic | ✅ In implement-ticket | ⚠️ Unknown | VERIFY |
| Grading rubric | ✅ In architect mode | ⚠️ Unknown | VERIFY |
| Worktree support | ✅ start-task skill | ❌ Not copied | MISSING |

---

## Action Plan

### Phase 1: Fix Folder Structure (CRITICAL - Must fix today)

1. Update `ai-agentic-framework/skills/010-foundation/initialize-project/SKILL.md` Phase 5 logic:
   ```bash
   # OLD (broken):
   cp -r ai-agentic-framework/skills/050-language-frameworks/mastering-typescript .claude/.tmp/skills/

   # NEW (preserves structure):
   mkdir -p .claude/.tmp/skills/mastering-typescript
   cp -r ai-agentic-framework/skills/050-language-frameworks/mastering-typescript/* .claude/.tmp/skills/mastering-typescript/
   ```

2. Test that subdirectories (`references/`, `scripts/`, `agents/`) are preserved

---

### Phase 2: Add Always-Copy Skills (CRITICAL - Must fix today)

Update Phase 5 Step 5.3 to always copy:

```bash
# Foundation (always copy)
cp -r ai-agentic-framework/skills/010-foundation/initialize-project/* .claude/.tmp/skills/initialize-project/
cp -r ai-agentic-framework/skills/010-foundation/start-task/* .claude/.tmp/skills/start-task/

# Development workflow (always copy)
cp -r ai-agentic-framework/skills/020-development-workflow/implement-ticket/* .claude/.tmp/skills/implement-ticket/
cp -r ai-agentic-framework/skills/020-development-workflow/create-sdd-ticket/* .claude/.tmp/skills/create-sdd-ticket/
cp -r ai-agentic-framework/skills/020-development-workflow/mastering-git-cli/* .claude/.tmp/skills/mastering-git-cli/
cp -r ai-agentic-framework/skills/020-development-workflow/analyze-requirements/* .claude/.tmp/skills/analyze-requirements/
cp -r ai-agentic-framework/skills/020-development-workflow/code-implementation/* .claude/.tmp/skills/code-implementation/
```

---

### Phase 3: Verify Implement-Ticket Autonomous Mode (CRITICAL - Test today)

1. Read full `ai-agentic-framework/skills/020-development-workflow/implement-ticket/SKILL.md`
2. Verify --no-stop flag is default or enforced
3. Verify all phases run to completion
4. Add guardrails to prevent stopping mid-workflow

---

### Phase 4: Verify Planner Auto-Detection (CRITICAL - Test today)

1. Read planner/implementer/tester agent templates in ai-agentic-framework
2. Verify risk keyword detection logic exists
3. Add to generated agents if missing
4. Test with high-risk ticket (e.g., "AUTH-123 Implement OAuth2 migration")

---

### Phase 5: Integrate P0 Improvements (HIGH - This week)

1. Check if `ai-agentic-framework/utils/` directory exists
2. If exists, integrate utilities into initialize-project
3. If not exists, extract from git commit `932cde5`
4. Add checkpoint/resume/rollback logic to implement-ticket agent

---

### Phase 6: Integrate Grading Rubric (MEDIUM - Next week)

1. Read architect-agent implementation
2. Verify 100-point grading rubric exists
3. Add Phase 3.5 grading logic if missing
4. Test with high-risk ticket

---

## Files to Modify (in ai-agentic-framework)

All changes must be made in `ai-agentic-framework/` NOT `.claude/`:

1. ✅ `ai-agentic-framework/skills/010-foundation/initialize-project/SKILL.md` - Fix Phase 5 copy logic
2. ✅ Verify `ai-agentic-framework/skills/020-development-workflow/implement-ticket/SKILL.md` has all features
3. ✅ Check if `ai-agentic-framework/utils/` exists with P0 utilities
4. ✅ Check if `ai-agentic-framework/agents/` has planner/architect templates with auto-detection

---

## Testing Checklist

After fixes:

- [ ] Remove `.claude/` directory
- [ ] Run `/initialize-project`
- [ ] Verify folder structure preserved (mastering-git-cli/references/ exists)
- [ ] Verify all 20+ skills copied (including start-task, create-sdd-ticket, mastering-git-cli)
- [ ] Verify 3 agents generated (planner, implementer, tester)
- [ ] Run `/implement-ticket PROJ-123 --no-stop` on test ticket
- [ ] Verify it completes all phases unattended
- [ ] Verify planner vs architect auto-detection works
- [ ] Verify checkpoint/resume works on failure
- [ ] Verify grading rubric works in architect mode

---

## Timeline

**Today (EoD):**
- ✅ Fix folder structure preservation
- ✅ Add always-copy skills
- ✅ Verify autonomous mode
- ✅ Test implement-ticket end-to-end

**This Week:**
- Integrate P0 utilities
- Add checkpoint/resume logic
- Test parallel task support (start-task)

**Next Week:**
- Integrate grading rubric
- Polish edge cases
- Full workflow testing

---

## Notes

- ALL changes go to `ai-agentic-framework/`, not `.claude/`
- `.claude/` is regenerated from `ai-agentic-framework/` on every `/initialize-project` run
- Git commits show features were developed but may have been in `.claude/` before cleanup
- Need to port features from git history to `ai-agentic-framework/` if missing
