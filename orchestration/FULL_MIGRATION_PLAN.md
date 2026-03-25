# Full Utils Migration & Cleanup Plan

**Objective**: Migrate all JS script dependencies to TypeScript orchestration, update skills, and delete deprecated utils folder.

**Estimated Total Time**: 2-3 hours
**Estimated Timeline**: Can be completed in one session

**Status**: ⏸️ AWAITING APPROVAL

---

## Overview

This plan covers:
1. ✅ **Phase 1**: Migrate/wrap utils for scripts (1-1.5 hours)
2. ✅ **Phase 2**: Update skills to reference orchestration (30 min)
3. ✅ **Phase 3**: Verification & testing (20 min)
4. ✅ **Phase 4**: Delete utils folder (10 min)

---

## Phase 1: Script Dependencies Migration (1-1.5 hours)

### Strategy

Most utils are already migrated to TypeScript. To make them callable from bash scripts, we will:

**Approach**: Create TypeScript scripts in `orchestration/src/scripts/` + npm scripts in `package.json`

**Pattern**:

1. Create TS file: `src/scripts/save-checkpoint.ts`
2. Add npm script: `"save-checkpoint": "tsx src/scripts/save-checkpoint.ts"`
3. External bash scripts call: `cd <PROJECT_PATH>/orchestration && npm run save-checkpoint`

**Benefits**:
- Clean TypeScript implementation
- No wrapper files needed
- Type-safe with proper error handling
- Easy to test and maintain

---

### Script 1: `save-checkpoint.sh` (EASIEST)

**Current Code**:
```bash
const { saveCheckpoint } = require('./utils/error-handling/error-recovery.js');
```

**Utils Dependency**:
- `utils/error-handling/error-recovery.js` → Function: `saveCheckpoint()`

**Orchestrator Equivalent**:
- `src/state/checkpointers/sqlite.checkpointer.ts` → Has checkpoint save/load functionality

**Migration Steps**:

1. **Create TypeScript script** (15 min)

   Create `src/scripts/save-checkpoint.ts`:
   ```typescript
   import { SqliteCheckpointer } from '../state/checkpointers/sqlite.checkpointer.js';
   import { logger } from '../utils/logger.js';

   async function main() {
     const args = process.argv.slice(2);
     const checkpointPath = args[0] || './.claude-temp/checkpoint.db';

     try {
       const checkpointer = new SqliteCheckpointer({ dbPath: checkpointPath });
       // Save checkpoint logic here
       logger.success('Checkpoint saved successfully');
     } catch (error) {
       logger.error('Failed to save checkpoint:', error);
       process.exit(1);
     }
   }

   main();
   ```

2. **Add npm script to package.json** (2 min)
   ```json
   {
     "scripts": {
       "save-checkpoint": "tsx src/scripts/save-checkpoint.ts"
     }
   }
   ```

3. **Update bash script** (3 min)
   ```diff
   - const { saveCheckpoint } = require('./utils/error-handling/error-recovery.js');
   + # Use orchestration npm script
   + cd "$PROJECT_ROOT/orchestration" && npm run save-checkpoint
   ```

**Estimated Time**: 20 minutes

---

### Script 2: `collect-test-artifacts.sh` (MEDIUM)

**Current Code**:
```bash
node utils/documentation/generate-architecture-diagram.js
node utils/artifacts/calculate-accuracy.js
```

**Utils Dependencies**:
1. `utils/documentation/generate-architecture-diagram.js`
2. `utils/artifacts/calculate-accuracy.js`

**Orchestrator Equivalents**:
1. Architecture diagram: Embedded in `src/nodes/implement-ticket/phase7-documentation.node.ts`
2. Accuracy calculation: Distributed across validation nodes

**Migration Steps**:

**For generate-architecture-diagram.js**:

1. **Extract function from phase7 node** (20 min)
   - Read `src/nodes/implement-ticket/phase7-documentation.node.ts`
   - Extract architecture diagram generation logic
   - Create standalone: `src/services/documentation/architecture-diagram.service.ts`

   ```typescript
   // New file: src/services/documentation/architecture-diagram.service.ts
   export class ArchitectureDiagramService {
     async generateDiagram(projectPath: string): Promise<string> {
       // Logic extracted from phase7 node
     }
   }
   ```

2. **Create TypeScript script** (10 min)

   Create `src/scripts/generate-architecture-diagram.ts`:
   ```typescript
   import { ArchitectureDiagramService } from '../services/documentation/architecture-diagram.service.js';
   import { logger } from '../utils/logger.js';

   async function main() {
     const projectPath = process.argv[2] || process.cwd();
     const service = new ArchitectureDiagramService();

     try {
       const diagram = await service.generateDiagram(projectPath);
       console.log(diagram);
       logger.success('Architecture diagram generated');
     } catch (error) {
       logger.error('Failed to generate diagram:', error);
       process.exit(1);
     }
   }

   main();
   ```

3. **Add npm script** (2 min)
   ```json
   "generate-architecture-diagram": "tsx src/scripts/generate-architecture-diagram.ts"
   ```

4. **Update bash script** (3 min)
   ```diff
   - node utils/documentation/generate-architecture-diagram.js
   + cd "$PROJECT_ROOT/orchestration" && npm run generate-architecture-diagram
   ```

**For calculate-accuracy.js**:

1. **Check if standalone accuracy function exists** (5 min)
   - Search for accuracy calculation in validator.ts

2. **If NO: Create accuracy calculator service** (20 min)
   ```typescript
   // src/services/testing/accuracy-calculator.service.ts
   export class AccuracyCalculatorService {
     calculateAccuracy(results: TestResults): AccuracyReport {
       // Calculate pass/fail rates, coverage, etc.
     }
   }
   ```

3. **Create TypeScript script** (10 min)

   Create `src/scripts/calculate-accuracy.ts`:
   ```typescript
   import { AccuracyCalculatorService } from '../services/testing/accuracy-calculator.service.js';
   import { logger } from '../utils/logger.js';
   import { readFileSync } from 'fs';

   async function main() {
     const resultsFile = process.argv[2];
     const service = new AccuracyCalculatorService();

     try {
       const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));
       const accuracy = service.calculateAccuracy(results);
       console.log(JSON.stringify(accuracy, null, 2));
       logger.success('Accuracy calculated');
     } catch (error) {
       logger.error('Failed to calculate accuracy:', error);
       process.exit(1);
     }
   }

   main();
   ```

4. **Add npm script** (2 min)
   ```json
   "calculate-accuracy": "tsx src/scripts/calculate-accuracy.ts"
   ```

5. **Update bash script** (3 min)
   ```diff
   - node utils/artifacts/calculate-accuracy.js
   + cd "$PROJECT_ROOT/orchestration" && npm run calculate-accuracy "$RESULTS_FILE"
   ```

**Estimated Time**: 60-75 minutes

---

### Script 3: `sync-framework-resources.sh` (LARGEST)

**Current Code**:
```javascript
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
const { updateSingleSkill, addSingleSkill } = require('$FRAMEWORK_PATH/utils/skills');
const { discoverMissingSkills } = require('$FRAMEWORK_PATH/utils/discovery/skill-discovery.js');
const { getAffectedAgents } = require('$FRAMEWORK_PATH/utils/discovery/skill-discovery.js');
const { regenerateSingleAgent } = require('$FRAMEWORK_PATH/utils/agents');
const { validateAgentSkills } = require('$FRAMEWORK_PATH/utils/discovery/agent-skill-validator.js');
```

**Utils Dependencies** (6 functions):
1. ConfigUpdater class
2. updateSingleSkill, addSingleSkill
3. discoverMissingSkills
4. getAffectedAgents
5. regenerateSingleAgent
6. validateAgentSkills

**Orchestrator Equivalents**:
1. ConfigUpdater → `src/utils/config-generator.ts` (generateFrameworkConfig)
2. Skill management → `src/utils/skill-resolver.ts` (resolveSkills, copyResolvedSkills)
3. Agent generation → `src/utils/agent-generator.ts` (generateAgents, writeAgents)

**Migration Strategy**:

This script is complex. Recommended approach:

**Create TypeScript script with npm command** - maintains existing bash wrapper

**Migration Steps**:

1. **Create TypeScript script** (45 min)

   Create `src/scripts/sync-framework-resources.ts`:
   ```typescript
   import { generateFrameworkConfig } from '../utils/config-generator.js';
   import { resolveSkills, copyResolvedSkills } from '../utils/skill-resolver.js';
   import { generateAgents, writeAgents } from '../utils/agent-generator.js';
   import { logger } from '../utils/logger.js';

   interface SyncOptions {
     projectPath: string;
     operation: 'sync-skills' | 'sync-agents' | 'sync-all';
   }

   async function syncSkills(projectPath: string) {
     // Port logic from utils/skills
     const skills = await resolveSkills(stackProfile, frameworkPath);
     await copyResolvedSkills(skills, projectPath);
     logger.success('Skills synced');
   }

   async function syncAgents(projectPath: string) {
     // Port logic from utils/agents
     const agents = await generateAgents(stackProfile, projectPath, templatesPath, frameworkPath);
     await writeAgents(agents, projectPath);
     logger.success('Agents synced');
   }

   async function main() {
     const operation = process.argv[2] || 'sync-all';
     const projectPath = process.argv[3] || process.cwd();

     try {
       switch (operation) {
         case 'sync-skills':
           await syncSkills(projectPath);
           break;
         case 'sync-agents':
           await syncAgents(projectPath);
           break;
         case 'sync-all':
           await syncSkills(projectPath);
           await syncAgents(projectPath);
           break;
       }
       logger.success('Sync complete');
     } catch (error) {
       logger.error('Sync failed:', error);
       process.exit(1);
     }
   }

   main();
   ```

2. **Add npm script** (2 min)
   ```json
   "sync-resources": "tsx src/scripts/sync-framework-resources.ts"
   ```

3. **Update bash script** (5 min)
   ```diff
   - const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config/config-updater.js');
   - # ... all the require() statements
   + # Use orchestration npm script
   + cd "$FRAMEWORK_PATH/orchestration" && npm run sync-resources "$@"
   ```

**Estimated Time**: 50-60 minutes

---

### Script 4: `security-check.sh` (SIMPLE)

**Current Code**:
```bash
grep -r "pattern" utils/ 2>/dev/null
```

**Issue**: Script greps through `utils/` directory for security vulnerabilities.

**Migration Steps**:

**Option A: Simple path update** (5 min)
```diff
- grep -r "process\.env\." utils/ 2>/dev/null
+ grep -r "process\.env\." orchestration/src/ 2>/dev/null
```

**Option B: Create TypeScript security scanner** (optional, 30 min)

Create `src/scripts/security-check.ts`:
```typescript
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

const PATTERNS = {
  envVars: /process\.env\./g,
  eval: /eval\(/g,
  hardcodedSecrets: /['"](sk-|pk_|api[_-]?key)/gi,
};

async function scanFiles() {
  const files = await glob('src/**/*.ts');
  const issues: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    // Check patterns...
  }

  return issues;
}

async function main() {
  const issues = await scanFiles();
  if (issues.length > 0) {
    logger.warn(`Found ${issues.length} security issues`);
    issues.forEach(i => console.log(i));
    process.exit(1);
  }
  logger.success('No security issues found');
}

main();
```

Add npm script:
```json
"security-check": "tsx src/scripts/security-check.ts"
```

**Recommended**: **Option A** for now (quick fix)

**Estimated Time**: 5 minutes (Option A) or 30 minutes (Option B)

---

## Phase 2: Skills Migration (30 minutes)

### Skill 1: `create-sdd-ticket/SKILL.md`

**Current References**:
```javascript
const { parseCreateSddTicketArgs } = require('../../utils/argument-parser');
const { parseJiraTicket } = require('../../utils/ticket-io/parsers/jira-parser');
const { parseMarkdownTicket } = require('../../utils/ticket-io/parsers/markdown-parser');
const { validateTicket } = require('../../utils/ticket-io/validators/ticket-validator');
const { detectAndFillGaps } = require('../../utils/ticket-io/gap-detector');
const { writeMarkdownFile } = require('../../utils/ticket-io/formatters/markdown-formatter');
const { formatToJira } = require('../../utils/ticket-io/formatters/jira-formatter');
```

**Migration**:

Replace with orchestration CLI usage:

```markdown
## Usage

This skill has been migrated to the orchestration CLI.

### Create SDD Ticket

**Old (deprecated)**:
```bash
node utils/create-sdd-ticket.js --source jira PROJ-123
```

**New (orchestration)**:
```bash
cd orchestration
npx tsx src/cli/create-sdd-ticket.ts --source jira PROJ-123
```

### Implementation

The functionality is now available through:
- Ticket parsing: `src/nodes/implement-ticket/phase1-context.node.ts`
- Gap detection: `src/services/gap-questions.service.ts`
- Validation: `src/utils/validator.ts`
- Formatting: `src/nodes/implement-ticket/phase8-pr.node.ts`

### Direct API Usage (for custom scripts)

```typescript
import { validateTicket } from '@orchestration/utils/validator';
import { GapQuestionsService } from '@orchestration/services/gap-questions.service';

// Use TypeScript services directly
```
```

**Estimated Time**: 10 minutes

---

### Skill 2: `implement-ticket/SKILL.md`

**Current References**:
```bash
UTILS_DIR="$HOME/.claude/utils"
```

**Migration**:

Update to reference orchestration:

```diff
- UTILS_DIR="$HOME/.claude/utils"
+ ORCHESTRATION_DIR="$PROJECT_ROOT/orchestration"

# Old approach (deprecated)
- node $UTILS_DIR/implement-ticket.js PROJ-123

# New approach (orchestration CLI)
+ cd $ORCHESTRATION_DIR
+ npm run implement-ticket PROJ-123
```

Also update agent references:

```diff
- | 0 | StackDetector | `utils/stack-detection.js` |
+ | 0 | StackDetector | `orchestration/src/nodes/initialize-project/phase1/` |

- | 0 | TestFrameworkDetector | `utils/test-framework-detection.js` |
+ | 0 | TestFrameworkDetector | `orchestration/src/services/implement-ticket/project-config-reader.service.ts` |
```

**Estimated Time**: 10 minutes

---

### Skill 3: `implement-ticket/agents/config-updater.md`

**Current Reference**:
```javascript
const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
```

**Migration**:

```diff
- const { ConfigUpdater } = require('$FRAMEWORK_PATH/utils/config-updater.js');
+ import { generateFrameworkConfig } from '$FRAMEWORK_PATH/orchestration/src/utils/config-generator';

- const updater = new ConfigUpdater(projectPath);
- updater.update(data);
+ const config = generateFrameworkConfig(projectPath, tempDir, phase1Data, phase3Content, stackProfile, frameworkPath);
```

**Estimated Time**: 5 minutes

---

### Skill 4: `create-pr/SKILL.md` + `pr-reviewer/SKILL.md`

**Current References**:
```bash
UTILS_DIR="$HOME/.claude/utils"
node ~/.claude/utils/review-loop-orchestrator.js PROJ-123
```

**Migration**:

```diff
- UTILS_DIR="$HOME/.claude/utils"
- node ~/.claude/utils/review-loop-orchestrator.js PROJ-123

+ # PR creation now integrated into implement-ticket workflow
+ cd orchestration
+ npm run implement-ticket PROJ-123
+ # Phase 8 automatically creates PR
+ # Phase 9 handles review loop
```

**Estimated Time**: 5 minutes

---

## Phase 3: Verification & Testing (20 minutes)

### Step 1: Verify No Utils References (5 min)

```bash
# Check skills
grep -r "utils/" ../skills/ | grep -v "src/utils" | grep -v node_modules | grep -v ".git"

# Expected: Only documentation examples (non-blockers)

# Check scripts
grep -r "require.*utils" ../scripts/ | grep -v node_modules

# Expected: Empty (all migrated)

# Check orchestration
grep -r "../utils" src/ | grep -v node_modules

# Expected: Empty
```

---

### Step 2: Test Scripts (10 min)

```bash
# Test each migrated script
cd ..

# 1. Save checkpoint
bash scripts/save-checkpoint.sh --test

# 2. Collect artifacts (dry run if available)
bash scripts/collect-test-artifacts.sh --dry-run

# 3. Sync resources (dry run)
bash scripts/sync-framework-resources.sh --dry-run

# 4. Security check
bash scripts/security-check.sh | head -20
```

---

### Step 3: Run Orchestration Tests (5 min)

```bash
cd orchestration

# Run full test suite
npm test

# Expected: All 1169 tests passing (or current count)
```

---

## Phase 4: Delete Utils Folder (10 minutes)

### Step 1: Create Backup (3 min)

```bash
cd ..

# Create timestamped backup
tar -czf utils-backup-$(date +%Y%m%d-%H%M%S).tar.gz utils/

# Move to safe location
mkdir -p ~/backups/ai-agentic-framework
mv utils-backup-*.tar.gz ~/backups/ai-agentic-framework/

# Verify backup
ls -lh ~/backups/ai-agentic-framework/utils-backup-*
```

---

### Step 2: Soft Delete (Rename First) (2 min)

```bash
# Rename instead of immediate deletion (safer)
mv utils utils-DEPRECATED-$(date +%Y%m%d)

# Confirm
ls -la | grep utils
```

---

### Step 3: Final Verification (3 min)

```bash
# Run tests again with utils renamed
cd orchestration
npm test

# If all pass, proceed to permanent deletion
# If failures, restore utils and investigate
```

---

### Step 4: Permanent Deletion (2 min)

```bash
# Only if all tests pass
cd ..
rm -rf utils-DEPRECATED-*

# Verify deletion
ls -la | grep utils
# Expected: No utils directory
```

---

## Phase 5: Documentation & Cleanup (10 minutes)

### Step 1: Update Root README (5 min)

```bash
# Edit ../README.md
# Remove any utils/ references
# Update architecture diagrams
# Add migration note
```

**Example addition**:
```markdown
## Migration Note

As of March 2026, all utilities have been migrated to the TypeScript orchestration module:
- Old: `utils/` (JavaScript, deprecated)
- New: `orchestration/src/` (TypeScript, production-ready)

See `orchestration/UTILS_CLEANUP_PLAN.md` for complete migration mapping.
```

---

### Step 2: Update Skills README (3 min)

```bash
# Edit ../skills/README.md
# Update paths and examples
# Reference orchestration module
```

---

### Step 3: Git Commit (2 min)

```bash
cd orchestration

git add .
git commit -m "feat: complete utils migration to orchestration

- Migrated all JS utilities to TypeScript
- Updated 4 skills to reference orchestration
- Updated 4 scripts to use orchestration services
- Removed deprecated utils/ folder
- All tests passing (1169 tests)

Breaking changes:
- utils/ folder removed
- Scripts now require orchestration module
- Skills updated to use orchestration CLI

Migration docs:
- UTILS_CLEANUP_PLAN.md
- UTILS_VERIFICATION_REPORT.md
- FULL_MIGRATION_PLAN.md
"

git push
```

---

## Summary Timeline

| Phase | Task | Estimated Time |
|-------|------|----------------|
| **Phase 1** | Script Dependencies | 1-1.5 hours |
| - | save-checkpoint.sh | 15-40 min |
| - | collect-test-artifacts.sh | 60-75 min |
| - | sync-framework-resources.sh | 30-50 min |
| - | security-check.sh | 5-15 min |
| **Phase 2** | Skills Migration | 30 min |
| - | create-sdd-ticket | 10 min |
| - | implement-ticket | 10 min |
| - | config-updater agent | 5 min |
| - | create-pr + pr-reviewer | 5 min |
| **Phase 3** | Verification & Testing | 20 min |
| **Phase 4** | Delete Utils | 10 min |
| **Phase 5** | Documentation | 10 min |
| **TOTAL** | | **2-2.5 hours** |

---

## Risks & Mitigation

### Risk 1: Scripts Break After Migration
**Mitigation**:
- Test each script after migration
- Keep utils renamed (not deleted) until all tests pass
- Have backup ready for quick restore

### Risk 2: Missing Functionality in Orchestrator
**Mitigation**:
- Checked all mappings (62/62 utils accounted for)
- If function missing, port it before deleting utils
- Phase 1 ensures all script dependencies exist

### Risk 3: Skills Reference Old Paths
**Mitigation**:
- Phase 2 updates all skill references
- Verification step catches any missed references
- Skills are documentation, not executable (lower risk)

---

## Rollback Plan

If anything breaks:

```bash
# Restore utils from backup
cd ~/backups/ai-agentic-framework
tar -xzf utils-backup-YYYYMMDD-HHMMSS.tar.gz -C ~/projects/ai-agentic-framework/

# OR restore from renamed folder
cd ~/projects/ai-agentic-framework
mv utils-DEPRECATED-YYYYMMDD utils

# Verify restoration
cd orchestration
npm test
```

---

## Success Criteria

Migration is complete when:

- ✅ All 4 scripts work without utils/ folder
- ✅ All 4 skills reference orchestration (not utils)
- ✅ No `grep -r "utils/"` matches in skills/scripts (except documentation examples)
- ✅ All orchestration tests pass (1169 tests)
- ✅ utils/ folder deleted
- ✅ Backup created and verified
- ✅ Documentation updated
- ✅ Git committed

---

## Next Steps (After Approval)

1. **User reviews this plan**
2. **User approves or requests changes**
3. **I begin Phase 1: Script migration**
4. **Progress updates after each script**
5. **User approval before Phase 4 (deletion)**
6. **Final commit and push**

---

## Questions for Review

1. **npm scripts approach**: Confirmed - using `tsx` with npm scripts ✅
2. **sync-framework-resources.sh**: Full TypeScript rewrite (~1 hour) acceptable?
3. **Security-check.sh**: Quick path update (Option A, 5 min) or full TS scanner (Option B, 30 min)?
4. **Timeline**: Is 2-2.5 hours still acceptable with this approach?
5. **Testing**: Should I pause after each script migration for verification, or proceed continuously?

---

## Ready to Proceed?

Once you approve this plan, I'll:

1. **Phase 1**: Create TypeScript scripts in `src/scripts/` with npm commands
   - Start with save-checkpoint.sh (easiest, ~20 min)
   - Progress through all 4 scripts
   - Report after each completion

2. **Phase 2**: Update 4 skills to reference orchestration (30 min)

3. **Phase 3**: Run full verification (20 min)

4. **Phase 4**: **PAUSE for final approval** before deleting utils/

5. **Phase 5**: Complete documentation and commit

**Migration Pattern** (used for all scripts):
```
utils/*.js → src/scripts/*.ts → package.json script → bash calls npm run
```

**External Usage**:
```bash
cd $PROJECT_ROOT/orchestration && npm run <command>
```

**Awaiting your approval to begin** 🚀
