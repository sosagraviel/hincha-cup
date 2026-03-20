# TypeScript Orchestration Refactor Plan

## Executive Summary

The TypeScript migration of Phases 4-6 reimplemented logic from scratch instead of reusing battle-tested utilities. This caused:
- **Phase 4:** Stub stack detection, incomplete config generation
- **Phase 5:** No skill filtering, zero agent generation, missing commands
- **Phase 6:** Weak validation (missing agent count, multi-stack coverage)

**Solution:** Call existing utilities instead of reimplementing.

---

## Current State Analysis

### Phase 4: Context Generation (BROKEN)

**What It Does:**
- ✅ Extracts CLAUDE.md and project-context/SKILL.md (works)
- ❌ Stack detection is STUB (line 223-237)
- ❌ Config generation incomplete (line 241-282)

**Problems:**
```typescript
// STUB - returns hardcoded data!
async function runStackDetection(...): Promise<Record<string, unknown>> {
  return {
    languages: ['typescript'],  // ← HARDCODED!
    frameworks: { frontend: [], backend: [], testing: [] },
    package_manager: 'pnpm',
    workspace_type: 'single'
  };
}

// INCOMPLETE - doesn't extract stack from Phase 1
function buildFrameworkConfig(...) {
  return {
    // Missing: proper stack extraction from phase1_analysis
    // Missing: workspace detection
    // Missing: primary language calculation
    // Missing: framework categorization
  };
}
```

**Bash Version (WORKING):**
- Calls `extract-synthesis.js` to parse synthesis
- Calls `$FRAMEWORK_PATH/utils/stack/cli.js` for stack detection
- Calls `generate-config.js` which:
  - Reads Phase 1 JSON outputs
  - Extracts stack from `02-tech-stack-dependencies.json`
  - Builds comprehensive config with schema validation

---

### Phase 5: Resources (BROKEN)

**What It Does:**
- ❌ Copies ALL skills (no filtering) - line 40
- ❌ Generates ZERO agents - missing completely
- ❌ Doesn't copy commands

**Problems:**
```typescript
// COPIES EVERYTHING - NO FILTERING!
const copiedCount = copyDirectoryRecursive(frameworkSkillsDir, skillsTargetDir);

// AGENT GENERATION: MISSING COMPLETELY
// Should generate:
// - planner.md
// - implementer-{language}.md (one per language)
// - visual-verifier.md (if frontend frameworks)
```

**Bash Version (WORKING):**
- Calls `resolveSkills()` from `skill-resolver.js`:
  - Reads `skills.config.json`
  - Matches triggers against detected stack
  - Filters "always" vs "triggered" skills
- Calls `generateAgentsWithTracking()`:
  - Generates planner agent (opus, all language/framework skills)
  - Generates implementer agents (sonnet, per-language filtering)
  - Generates visual-verifier (opus, if frontend)
  - Extracts commands from package.json/Makefile
  - Updates framework-config.json with tracking
- Copies commands from framework

---

### Phase 6: Validation (WEAK)

**What It Does:**
- ✅ Validates CLAUDE.md exists
- ✅ Validates project-context/SKILL.md exists
- ✅ Validates framework-config.json JSON structure
- ❌ Only checks skills directory exists (line 77-82)
- ❌ Missing agent count validation
- ❌ Missing multi-stack coverage validation

**Problems:**
```typescript
// WEAK - only checks directory exists
const skillsDir = join(state.project_path, '.claude', 'skills');
if (!existsSync(skillsDir)) {
  validationErrors.push('Skills directory not found');
}

// MISSING: Agent count validation
// MISSING: Multi-stack coverage validation
```

**Bash Version (WORKING):**
- Counts `.md` agents (must be ≥2)
- Multi-stack validation:
  - Parse stack-profile.json
  - Find languages with >10 files
  - Verify implementer-{language}.md exists for EACH
  - Error if any missing
- Warns if CLAUDE.md doesn't mention all languages

---

## Refactor Strategy

### Approach: **Reuse, Don't Rewrite**

Instead of reimplementing logic, CALL the existing utilities that work:

```
TypeScript Node → spawn() → Node.js Utility → return result → TypeScript Node
```

This is faster, safer, and preserves all the battle-tested logic.

---

## Detailed Refactor Plan

### Task 1: Phase 4 - Call Existing Utilities

**Current File:** `src/nodes/phase4/context-generation.node.ts`

**Changes Needed:**

1. **Replace `runStackDetection()` stub** (lines 217-238):
   ```typescript
   // OLD (BROKEN):
   async function runStackDetection(...) {
     return { languages: ['typescript'], ... };  // HARDCODED
   }

   // NEW (WORKING):
   import { spawn } from 'child_process';

   async function runStackDetection(projectPath: string, frameworkPath: string) {
     return new Promise((resolve, reject) => {
       const stackCli = join(frameworkPath, 'utils', 'stack', 'cli.js');
       const proc = spawn('node', [stackCli, projectPath], {
         cwd: projectPath,
         stdio: ['inherit', 'pipe', 'pipe']
       });

       let stdout = '';
       proc.stdout.on('data', (data) => stdout += data);
       proc.on('close', (code) => {
         if (code === 0) {
           resolve(JSON.parse(stdout));
         } else {
           reject(new Error(`Stack detection failed with code ${code}`));
         }
       });
     });
   }
   ```

2. **Replace `buildFrameworkConfig()` with call to `generate-config.js`** (lines 240-282):
   ```typescript
   // OLD (BROKEN):
   function buildFrameworkConfig(state, stackProfile, ...) {
     return { /* incomplete */ };
   }

   // NEW (WORKING):
   async function generateFrameworkConfig(
     projectPath: string,
     frameworkPath: string,
     tempDir: string,
     stackProfile: any
   ) {
     return new Promise((resolve, reject) => {
       const generateConfigScript = join(
         frameworkPath,
         'utils',
         'config-generator',
         'generate-config.js'
       );

       const proc = spawn('node', [
         generateConfigScript,
         '--project-path', projectPath,
         '--framework-path', frameworkPath,
         '--temp-dir', tempDir,
         '--stack-profile', JSON.stringify(stackProfile)
       ], {
         cwd: projectPath,
         stdio: ['inherit', 'pipe', 'pipe']
       });

       let stdout = '';
       proc.stdout.on('data', (data) => stdout += data);
       proc.on('close', (code) => {
         if (code === 0) {
           resolve(JSON.parse(stdout));
         } else {
           reject(new Error(`Config generation failed`));
         }
       });
     });
   }
   ```

3. **Update the main node logic** (lines 121-136):
   ```typescript
   // Run stack detection
   const stackProfile = await runStackDetection(state.project_path, state.framework_path);

   // Generate config using existing utility
   const frameworkConfig = await generateFrameworkConfig(
     state.project_path,
     state.framework_path,
     tempDir,
     stackProfile
   );

   // Write config
   const configPath = join(state.project_path, '.claude', 'framework-config.json');
   writeFileSync(configPath, JSON.stringify(frameworkConfig, null, 2));
   ```

**Expected Outcome:**
- ✅ Real stack detection (not stub)
- ✅ Comprehensive config with proper stack extraction from Phase 1
- ✅ Schema validation via existing utilities

---

### Task 2: Phase 5 - Call Skill Resolver & Agent Generator

**Current File:** `src/nodes/phase5/resources.node.ts`

**Changes Needed:**

1. **Replace blind skill copying with filtered skill copying** (lines 34-41):
   ```typescript
   // OLD (BROKEN):
   const frameworkSkillsDir = join(state.framework_path, 'skills');
   const copiedCount = copyDirectoryRecursive(frameworkSkillsDir, skillsTargetDir);

   // NEW (WORKING):
   import { resolveAndCopySkills } from '../../utils/skill-resolver.js';

   async function copySkillsFiltered(
     frameworkPath: string,
     projectPath: string,
     frameworkConfigPath: string
   ) {
     return new Promise((resolve, reject) => {
       const skillResolverScript = join(
         frameworkPath,
         'utils',
         'skill-resolver',
         'simple-resolver.js'
       );

       const proc = spawn('node', [
         skillResolverScript,
         '--config', frameworkConfigPath,
         '--framework-path', frameworkPath,
         '--project-path', projectPath,
         '--mode', 'copy'
       ], {
         cwd: projectPath,
         stdio: ['inherit', 'pipe', 'pipe']
       });

       let stdout = '';
       proc.stdout.on('data', (data) => stdout += data);
       proc.on('close', (code) => {
         if (code === 0) {
           const result = JSON.parse(stdout);
           resolve(result.copiedSkills);  // Returns array of copied skills
         } else {
           reject(new Error('Skill resolution failed'));
         }
       });
     });
   }
   ```

2. **Add agent generation** (NEW - insert after skill copying):
   ```typescript
   async function generateAgents(
     frameworkPath: string,
     projectPath: string,
     frameworkConfigPath: string
   ) {
     return new Promise((resolve, reject) => {
       const agentGeneratorScript = join(
         frameworkPath,
         'utils',
         'agent-generator',
         'index.js'
       );

       const proc = spawn('node', [
         agentGeneratorScript,
         '--config', frameworkConfigPath,
         '--framework-path', frameworkPath,
         '--project-path', projectPath,
         '--mode', 'generate'
       ], {
         cwd: projectPath,
         stdio: ['inherit', 'pipe', 'pipe']
       });

       let stdout = '';
       proc.stdout.on('data', (data) => stdout += data);
       proc.on('close', (code) => {
         if (code === 0) {
           const result = JSON.parse(stdout);
           resolve(result);  // Returns { agents: [...], errors: [...] }
         } else {
           reject(new Error('Agent generation failed'));
         }
       });
     });
   }
   ```

3. **Add command copying** (NEW - insert after agent generation):
   ```typescript
   function copyCommands(frameworkPath: string, projectPath: string): number {
     const frameworkCommandsDir = join(frameworkPath, 'commands');
     const projectCommandsDir = join(projectPath, '.claude', 'commands');

     mkdirSync(projectCommandsDir, { recursive: true });

     const commands = readdirSync(frameworkCommandsDir)
       .filter(file => file.endsWith('.md') && file !== 'initialize-project.md');

     commands.forEach(cmd => {
       copyFileSync(
         join(frameworkCommandsDir, cmd),
         join(projectCommandsDir, cmd)
       );
     });

     return commands.length;
   }
   ```

4. **Update main node logic**:
   ```typescript
   try {
     // 1. Copy filtered skills
     console.log('[Phase 5] Resolving and copying skills...');
     const copiedSkills = await copySkillsFiltered(
       state.framework_path,
       state.project_path,
       state.framework_config_path!
     );
     console.log(`[Phase 5] ✓ Copied ${copiedSkills.length} skills`);

     // 2. Generate agents
     console.log('[Phase 5] Generating agents...');
     const agentResult = await generateAgents(
       state.framework_path,
       state.project_path,
       state.framework_config_path!
     );
     console.log(`[Phase 5] ✓ Generated ${agentResult.agents.length} agents`);

     // 3. Copy commands
     console.log('[Phase 5] Copying commands...');
     const commandCount = copyCommands(state.framework_path, state.project_path);
     console.log(`[Phase 5] ✓ Copied ${commandCount} commands`);

     return {
       current_phase: 'phase5_resources'
     };
   }
   ```

**Expected Outcome:**
- ✅ Skills filtered by detected stack (not all copied)
- ✅ Agents generated (planner + implementers + visual-verifier)
- ✅ Commands copied
- ✅ Framework-config.json updated with tracking

---

### Task 3: Phase 6 - Add Missing Validations

**Current File:** `src/nodes/phase6/validation.node.ts`

**Changes Needed:**

1. **Add agent count validation** (insert after line 82):
   ```typescript
   // 4. Validate agent count (minimum 2: planner + at least one implementer)
   const agentsDir = join(state.project_path, '.claude', 'agents');
   if (!existsSync(agentsDir)) {
     validationErrors.push('Agents directory not found');
   } else {
     const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
     const agentCount = agentFiles.length;

     if (agentCount < 2) {
       validationErrors.push(
         `Insufficient agents generated: ${agentCount} (minimum 2 required: planner + implementer)`
       );
     }

     console.log(`[Phase 6: Validation] ✓ ${agentCount} agents generated`);
   }
   ```

2. **Add multi-stack coverage validation** (insert after agent count):
   ```typescript
   // 5. Validate multi-stack coverage
   const stackProfile = state.phase4_context?.stack_profile;
   if (stackProfile && typeof stackProfile === 'object') {
     const languages = Object.keys(stackProfile).filter(lang => {
       const count = (stackProfile as any)[lang];
       return typeof count === 'number' && count > 10;
     });

     if (languages.length > 1) {
       console.log(`[Phase 6: Validation] Multi-stack project detected (${languages.length} languages)`);

       // Verify implementer exists for each significant language
       languages.forEach(lang => {
         const implementerPath = join(
           agentsDir,
           `implementer-${lang.toLowerCase()}.md`
         );

         if (!existsSync(implementerPath)) {
           validationErrors.push(
             `Missing implementer for ${lang} (${(stackProfile as any)[lang]} files)`
           );
         } else {
           console.log(`[Phase 6: Validation] ✓ Implementer for ${lang} exists`);
         }
       });
     }
   }
   ```

**Expected Outcome:**
- ✅ Validates agent count (≥2)
- ✅ Validates multi-stack coverage (all languages have implementers)
- ✅ Proper error reporting

---

### Task 4: Add --start-phase Flag Support

**Current File:** `src/cli/initialize.ts`

**Changes Needed:**

1. **Add CLI option** (line 22):
   ```typescript
   .option('--start-phase <phase>', 'Start from specific phase (1-6)', '1')
   ```

2. **Add phase skipping logic** (before line 189):
   ```typescript
   // Handle --start-phase flag
   const startPhase = parseInt(options.startPhase || '1', 10);
   if (startPhase < 1 || startPhase > 6) {
     logger.error('Invalid --start-phase value (must be 1-6)');
     process.exit(1);
   }

   if (startPhase > 1) {
     logger.warn(`Starting from Phase ${startPhase} (skipping phases 1-${startPhase - 1})`);
     logger.warn('This assumes previous phases completed successfully.');

     // Load state from checkpoint if resuming
     if (!options.resume) {
       logger.error('--start-phase requires --resume <thread-id> to load previous state');
       process.exit(1);
     }
   }
   ```

3. **Modify graph invocation to support phase skipping**:
   - This requires modifying the graph structure to support conditional edges
   - OR: Load checkpoint and manually set `current_phase` in initial state

**Expected Outcome:**
- ✅ Can resume from specific phase
- ✅ Requires --resume flag for state continuity
- ✅ Validates phase number (1-6)

---

## Implementation Order

1. **Phase 4 refactor** (highest priority - fixes config generation)
2. **Phase 5 refactor** (second priority - enables agent generation)
3. **Phase 6 refactor** (third priority - improves validation)
4. **--start-phase flag** (nice-to-have - improves developer experience)

---

## Testing Plan

After each task:
1. Run on gira project
2. Verify outputs match bash version:
   - framework-config.json (proper stack, workspace detection)
   - Filtered skills (not all copied)
   - Agents generated (planner + implementers)
   - Validation passes

---

## Success Criteria

- ✅ framework-config.json has real stack data (not "Not found")
- ✅ Skills are filtered (5-10 skills, not 50+)
- ✅ Agents are generated (planner.md + implementer-{lang}.md)
- ✅ Phase 6 validates agent count and multi-stack coverage
- ✅ All behaviors match bash version

---

## Notes

- This refactor **reuses battle-tested utilities** instead of reimplementing
- Each phase calls Node.js scripts via `spawn()`
- TypeScript orchestration focuses on workflow logic, not business logic
- Preserves all bash functionality while gaining TypeScript benefits
