# Utils Deletion Verification Report

**Date**: March 24, 2026
**Status**: ⚠️ **BLOCKED** - Dependencies found that must be migrated first

---

## Summary

Ran comprehensive verification checks before deleting `../utils/` folder. Found **CRITICAL DEPENDENCIES** that block deletion.

**Verification Results**:
- ✅ Orchestration source code: Clean (no utils imports)
- ✅ Package.json: Clean (no utils references)
- ⚠️ **Skills**: 3 skills reference old utils (need updates)
- ⚠️ **Scripts**: 4 bash scripts actively use utils (BLOCKERS)

---

## ✅ PASSED CHECKS

### 1. Orchestration Source Code
**Status**: ✅ CLEAN

```bash
grep -r "node ../utils" src/        # No matches
grep -r "bash ../utils" src/        # No matches
```

**Result**: Orchestration fully migrated to TypeScript, zero utils dependencies

### 2. Package.json
**Status**: ✅ CLEAN

```bash
cat package.json | grep -i "utils"  # No matches
```

**Result**: No npm scripts reference utils

### 3. Commands Directory
**Status**: ✅ CLEAN (Empty or no references)

```bash
grep -r "utils/" ../commands/       # No output
```

**Result**: Commands directory has no utils dependencies

---

## ⚠️ BLOCKERS FOUND

### 1. Skills with Utils References

**Status**: ⚠️ **3 SKILLS NEED UPDATES**

#### Skill 1: `create-sdd-ticket`
**File**: `../skills/020-development-workflow/create-sdd-ticket/SKILL.md`

**References**:
```javascript
const { parseCreateSddTicketArgs } = require('../../utils/argument-parser');
const { parseJiraTicket } = require('../../utils/ticket-io/parsers/jira-parser');
const { parseMarkdownTicket } = require('../../utils/ticket-io/parsers/markdown-parser');
const { validateTicket } = require('../../utils/ticket-io/validators/ticket-validator');
const { detectAndFillGaps } = require('../../utils/ticket-io/gap-detector');
const { writeMarkdownFile } = require('../../utils/ticket-io/formatters/markdown-formatter');
const { formatToJira } = require('../../utils/ticket-io/formatters/jira-formatter');
```

**Also lists**:
```
Dependencies:
- `utils/ticket-io/` - All parsers, formatters, validators
```

**Migration Required**: Update SKILL.md to reference orchestrator equivalents

---

#### Skill 2: `implement-ticket`
**File**: `../skills/020-development-workflow/implement-ticket/SKILL.md`

**References**:
```bash
UTILS_DIR="$HOME/.claude/utils"
```
Multiple occurrences (7 times)

**Also references**:
```
| 0 | StackDetector | `utils/stack-detection.js` |
| 0 | TestFrameworkDetector | `utils/test-framework-detection.js` |
```

**Sub-agent file**: `../skills/020-development-workflow/implement-ticket/agents/config-updater.md`
```javascript
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
```

**Migration Required**:
- Update SKILL.md to use orchestration CLI commands
- Update config-updater.md agent to use TypeScript service

---

#### Skill 3: `create-pr`
**File**: `../skills/030-quality-assurance/create-pr/SKILL.md`

**References**:
```bash
UTILS_DIR="$HOME/.claude/utils"
```
(2 occurrences)

**Also mentions**:
```
- ArtifactCollector utility: `utils/artifact-collector.js`
```

**Migration Required**: Update to reference orchestrator service

---

#### Skill 4: `pr-reviewer`
**File**: `../skills/030-quality-assurance/pr-reviewer/SKILL.md`

**References**:
```bash
UTILS_DIR="$HOME/.claude/utils"
node ~/.claude/utils/review-loop-orchestrator.js PROJ-123
```

**Migration Required**: Update to use orchestration review-loop service

---

### 2. Scripts with Active Utils Dependencies

**Status**: ⚠️ **CRITICAL BLOCKERS - 4 SCRIPTS**

#### Script 1: `collect-test-artifacts.sh`
**File**: `../scripts/collect-test-artifacts.sh`
**Size**: 584 lines

**Utils Dependencies**:
```bash
node utils/documentation/generate-architecture-diagram.js
node utils/artifacts/calculate-accuracy.js
```

**Orchestrator Equivalents**:
- Architecture diagram: `src/nodes/implement-ticket/phase7-documentation.node.ts`
- Accuracy calculation: `src/utils/validator.ts` + phase nodes

**Action Required**: Rewrite script to call orchestrator CLI or remove deprecated functionality

---

#### Script 2: `sync-framework-resources.sh`
**File**: `../scripts/sync-framework-resources.sh`
**Size**: 650 lines (LARGEST BLOCKER)

**Utils Dependencies**:
```javascript
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
const { updateSingleSkill, addSingleSkill } = require('$FRAMEWORK_PATH/utils/skills');
const { discoverMissingSkills } = require('$FRAMEWORK_PATH/utils/discovery/skill-discovery.js');
const { getAffectedAgents } = require('$FRAMEWORK_PATH/utils/discovery/skill-discovery.js');
const { regenerateSingleAgent } = require('$FRAMEWORK_PATH/utils/agents');
const { validateAgentSkills } = require('$FRAMEWORK_PATH/utils/discovery/agent-skill-validator.js');
```

**Orchestrator Equivalents**:
- ConfigUpdater: `src/utils/config-generator.ts`
- Skill management: `src/utils/skill-resolver.ts`
- Skill discovery: `src/utils/skill-resolver.ts`
- Agent generation: `src/utils/agent-generator.ts`
- Agent validation: `src/utils/skill-resolver.ts`

**Action Required**:
- **Option 1**: Rewrite as TypeScript orchestrator command
- **Option 2**: Update require() paths to use orchestration/src/utils/*
- **Option 3**: Mark as deprecated (if functionality now in orchestration workflows)

---

#### Script 3: `save-checkpoint.sh`
**File**: `../scripts/save-checkpoint.sh`
**Size**: 33 lines (SMALLEST)

**Utils Dependencies**:
```javascript
const { saveCheckpoint } = require('./utils/error-handling/error-recovery.js');
```

**Orchestrator Equivalent**:
- Checkpointing: `src/state/checkpointers/sqlite.checkpointer.ts`

**Action Required**: Simple - update require() path or rewrite to use orchestrator

---

#### Script 4: `security-check.sh`
**File**: `../scripts/security-check.sh`

**Utils Dependencies**:
```bash
grep -r "pattern" utils/ 2>/dev/null
```
Multiple grep commands scanning utils/ directory for security issues

**Action Required**:
- **Option 1**: Update to scan orchestration/src/ instead
- **Option 2**: Remove (security checks may be deprecated)
- **Option 3**: Integrate into orchestration test suite

---

## Additional Findings (Non-Blockers)

### Documentation References
Several skill markdown files reference `src/utils/` in **example code**, not actual dependencies:

- `../skills/030-quality-assurance/jest-coverage-automation/SKILL.md`
- `../skills/050-language-frameworks/react-frontend/references/`
- `../skills/050-language-frameworks/atomic-design-react/SKILL.md`

These are **documentation examples** showing typical project structure (e.g., `src/utils/validation.ts`). They do NOT reference the deprecated `../utils/` folder.

**Action**: No changes needed (these are examples for user projects)

---

## Migration Plan Before Deletion

### Phase 1: Update Skills (30 min)

**Files to update**: 4 skill SKILL.md files

1. **`create-sdd-ticket/SKILL.md`**:
   ```diff
   - const { parseJiraTicket } = require('../../utils/ticket-io/parsers/jira-parser');
   + // Now integrated into orchestration CLI:
   + // npx orchestration implement-ticket <ticket-path>
   ```

2. **`implement-ticket/SKILL.md`**:
   ```diff
   - UTILS_DIR="$HOME/.claude/utils"
   + # Now uses orchestration CLI directly
   ```

3. **`implement-ticket/agents/config-updater.md`**:
   ```diff
   - const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
   + import { generateFrameworkConfig } from '@orchestration/utils/config-generator';
   ```

4. **`create-pr/SKILL.md`** + **`pr-reviewer/SKILL.md`**:
   ```diff
   - UTILS_DIR="$HOME/.claude/utils"
   - node ~/.claude/utils/review-loop-orchestrator.js
   + # Now integrated into orchestration:
   + # npx orchestration implement-ticket (handles PR creation in phase 8)
   ```

---

### Phase 2: Migrate/Update Scripts (1-2 hours)

#### High Priority Scripts (Active Utils Users)

**1. `save-checkpoint.sh` (33 lines - EASIEST)**
- **Action**: Update require path
- **Estimated time**: 5 minutes
  ```diff
  - const { saveCheckpoint } = require('./utils/error-handling/error-recovery.js');
  + const { saveCheckpoint } = require('./orchestration/src/state/checkpointers/sqlite.checkpointer.ts');
  ```

**2. `collect-test-artifacts.sh` (584 lines)**
- **Action**: Replace utils calls with orchestrator equivalents
- **Estimated time**: 30 minutes
  ```diff
  - node utils/documentation/generate-architecture-diagram.js
  + # Now handled by phase 7 node
  - node utils/artifacts/calculate-accuracy.js
  + # Now integrated into validation
  ```

**3. `sync-framework-resources.sh` (650 lines - LARGEST)**
- **Action**: Rewrite to use orchestration TypeScript utils
- **Estimated time**: 1 hour
  ```diff
  - const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
  + import { generateFrameworkConfig } from './orchestration/src/utils/config-generator.js';
  ```

**4. `security-check.sh`**
- **Action**: Update to scan orchestration/src/ instead of utils/
- **Estimated time**: 15 minutes
  ```diff
  - grep -r "pattern" utils/ 2>/dev/null
  + grep -r "pattern" orchestration/src/ 2>/dev/null
  ```

---

### Phase 3: Verification (15 min)

After updates, re-run verification:

```bash
# 1. Check skills
grep -r "../utils" ../skills/ | grep -v "src/utils" | grep -v node_modules

# 2. Check scripts
grep -r "utils/" ../scripts/ | grep -v node_modules | grep -v "\.git"

# 3. Expected: Only documentation examples remain
```

---

### Phase 4: Delete Utils (5 min)

Only after ALL blockers resolved:

```bash
cd ..
tar -czf utils-backup-$(date +%Y%m%d-%H%M%S).tar.gz utils/
mv utils utils-deprecated-$(date +%Y%m%d)

# Test
cd orchestration && npm test

# If pass, delete
cd .. && rm -rf utils-deprecated-*
```

---

## Summary Table

| Blocker | Files Affected | Migration Effort | Status |
|---------|----------------|------------------|--------|
| **Skills** | 4 SKILL.md files | 30 min | ⚠️ TODO |
| **Scripts** | 4 shell scripts | 1-2 hours | ⚠️ TODO |
| **Total** | 8 files | **~2 hours** | ⚠️ BLOCKED |

---

## Recommendations

### Option 1: Full Migration (Recommended)
**Timeline**: 2-2.5 hours
1. Update 4 skills (30 min)
2. Migrate 4 scripts (1.5-2 hours)
3. Verify and delete (20 min)

**Benefits**:
- Clean removal of deprecated code
- All references updated to orchestration
- No technical debt

---

### Option 2: Partial Migration
**Timeline**: 1 hour
1. Update critical skills (create-sdd-ticket, implement-ticket)
2. Mark non-critical scripts as deprecated
3. Delete utils, keep scripts as "legacy" (with warnings)

**Risks**:
- Scripts may break if utils deleted
- Technical debt remains

---

### Option 3: Defer Deletion
**Timeline**: 0 hours
1. Document blockers
2. Keep utils until scripts are rewritten
3. Schedule migration for later

**Risks**:
- Utils folder remains as deprecated code
- Confusion about which code to use

---

## Next Steps

**User Decision Required**:

1. **Which option?** Full migration, partial, or defer?
2. **Priority scripts?** Which of the 4 scripts are still actively used?
3. **Skills update?** Should I update the 4 SKILL.md files now?
4. **Script rewrite?** Should I migrate scripts to TypeScript or just update require() paths?

**Recommended Action**:
- Start with Phase 1 (update skills) - low risk, 30 minutes
- Review which scripts are actively used
- Migrate critical scripts only
- Delete utils after verification

---

## Confidence Assessment

**Migration Feasibility**: ✅ **HIGH**
- All utils functionality exists in orchestration
- Mappings are clear and documented
- Only file path updates needed

**Risk Level**: ⚠️ **MEDIUM**
- Scripts may be actively used (unknown)
- Breaking changes possible if skills not updated
- Need to test after each migration

**Recommendation**: **Proceed with caution** - Update skills first, then assess script usage before migrating
