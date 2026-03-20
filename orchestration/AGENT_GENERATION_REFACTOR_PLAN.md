# Agent Generation Refactor Plan

## Problem Statement

Current implementation has hardcoded logic and modifies bash files instead of properly migrating to TypeScript. The agent generation should be purely configuration-driven using `skills.config.json`.

## Core Principles

1. **Configuration-Driven**: ALL logic driven by `skills.config.json` - NO hardcoded filters
2. **TypeScript Only**: orchestration/ module is self-contained - NO dependencies on utils/ or scripts/
3. **Simple Matching Logic**: Use `triggers` and `compatible_languages` from config ONLY

## Agent Skill Assignment Logic

### For Each Skill in skills.config.json:

**IF** `trigger_mode === "always"`:
- Copy skill to project
- **DO NOT** link to any agents (skills available but not explicitly linked)

**IF** `trigger_mode === "triggered"`:
1. Check if ANY trigger matches detected stack (languages, frameworks, testing_frameworks)
2. **IF** trigger matches:
   - Copy skill to project
   - **IF** skill has `is_linkable_to_agents === false`:
     - **DO NOT** link to any agents (external resource skills like jira, confluence, notion)
   - **ELSE IF** skill has non-empty `compatible_languages`:
     - For EACH language in `compatible_languages`:
       - **IF** project uses that language:
         - Add to implementer for that language
     - Add to planner (planner gets ALL language/framework skills)
   - **ELSE IF** skill has empty `compatible_languages` AND `is_linkable_to_agents !== false`:
     - Add ONLY to generic implementer + planner (infrastructure skills like docker, aws-cli)
     - **DO NOT** add to language implementers

**IF** `trigger_mode === "generated"` (project-context):
- NOT included in resolveSkills() output (because it's generated during Phase 4)
- Manually added to planner + ALL language implementers + generic implementer in agent-generator.ts
- This ensures project-context is always linked to all agents that work with code

### Example Flow:

```
Detected Stack: {languages: ["typescript", "python"], frameworks: {frontend: ["react"]}}

Skill: atomic-design-react
  triggers: ["react"]
  compatible_languages: ["typescript", "javascript"]

  Step 1: "react" in frontend frameworks? YES → Continue
  Step 2: Has compatible_languages? YES → Check each
  Step 3: "typescript" in project languages? YES → Add to typescript-implementer + planner
  Step 4: "javascript" in project languages? NO → Skip

  Result: Added to typescript-implementer + planner

Skill: mastering-python-skill
  triggers: ["python"]
  compatible_languages: ["python"]

  Step 1: "python" in languages? YES → Continue
  Step 2: Has compatible_languages? YES → Check each
  Step 3: "python" in project languages? YES → Add to python-implementer + planner

  Result: Added to python-implementer + planner

Skill: start-task
  trigger_mode: "always"

  Result: Added to ALL agents
```

## Files to Modify

### 1. `/skills/skills.config.json`

**Complete configuration for ALL 39 skills** with proper:
- `triggers`: What stack features trigger this skill (languages, frameworks, tools)
- `compatible_languages`: Which language implementers can use this skill
- `trigger_mode`: always | triggered | generated

### 2. `/orchestration/src/utils/agent-generator.ts`

**Remove ALL hardcoded logic**:
- ❌ DELETE `filterSkillsForPlanner()`
- ❌ DELETE `filterSkillsForImplementer()`
- ❌ DELETE `addProjectContext()`
- ✅ ADD `assignSkillsToAgents()` - Pure configuration-driven logic
- ✅ SIMPLIFY `generateAgents()` - Just template rendering

**New clean flow**:
```typescript
const resolvedSkills = resolveSkills(stackProfile, frameworkPath);
const agentSkillAssignments = assignSkillsToAgents(resolvedSkills, stackProfile);

// agentSkillAssignments = {
//   planner: [...skill objects...],
//   "implementer-typescript": [...skill objects...],
//   "implementer-python": [...skill objects...],
//   "implementer-generic": [...skill objects...]
// }

for (const [agentName, skills] of Object.entries(agentSkillAssignments)) {
  generateAgent(agentName, skills, ...);
}
```

### 3. `/orchestration/src/utils/skill-resolver.ts`

**Keep minimal**:
- Load skills from config
- Match triggers against detected stack
- Return list of resolved skills (NO filtering by agent type)
- Let agent-generator.ts handle agent-specific filtering

## Implementation Steps

### Phase 1: Complete skills.config.json

**For EACH of the 39 skills, determine**:

**Language Skills** (1 trigger = language name, compatible_languages = [language]):
- mastering-typescript: `triggers: ["typescript"]`, `compatible_languages: ["typescript"]`
- mastering-python-skill: `triggers: ["python"]`, `compatible_languages: ["python"]`
- mastering-go-skill: `triggers: ["go"]`, `compatible_languages: ["go"]`
- mastering-java-skill: `triggers: ["java"]`, `compatible_languages: ["java"]`
- mastering-ruby-skill: `triggers: ["ruby"]`, `compatible_languages: ["ruby"]`
- mastering-rust-skill: `triggers: ["rust"]`, `compatible_languages: ["rust"]`

**Framework Skills** (triggers = framework names, compatible_languages = languages that use framework):
- react-frontend: `triggers: ["react"]`, `compatible_languages: ["typescript", "javascript"]`
- vue-frontend: `triggers: ["vue"]`, `compatible_languages: ["typescript", "javascript"]`
- mastering-nextjs: `triggers: ["next", "nextjs"]`, `compatible_languages: ["typescript", "javascript"]`
- atomic-design-react: `triggers: ["react"]`, `compatible_languages: ["typescript", "javascript"]`
- mastering-langgraph-agent-skill: `triggers: ["langgraph", "@langchain/langgraph"]`, `compatible_languages: ["typescript", "javascript", "python"]`

**Testing Framework Skills**:
- jest-coverage-automation: `triggers: ["jest"]`, `compatible_languages: ["typescript", "javascript"]`
- playwright-e2e-automation: `triggers: ["playwright", "@playwright/test"]`, `compatible_languages: ["typescript", "javascript"]`
- pytest-patterns: `triggers: ["pytest"]`, `compatible_languages: ["python"]`

**Tool/Infrastructure Skills** (no language restriction):
- developing-with-docker: `triggers: ["docker", "dockerfile"]`, `compatible_languages: []` (all)
- mastering-aws-cdk: `triggers: ["aws-cdk", "@aws-cdk"]`, `compatible_languages: ["typescript", "javascript", "python"]`
- mastering-aws-cli: `triggers: ["aws"]`, `compatible_languages: []` (all)
- mastering-gcloud-commands: `triggers: ["gcloud", "google-cloud"]`, `compatible_languages: []` (all)
- using-firebase: `triggers: ["firebase"]`, `compatible_languages: ["typescript", "javascript"]`

**Workflow Skills** (always included):
- start-task: `trigger_mode: "always"`
- analyze-requirements: `trigger_mode: "always"`
- architect-agent: `trigger_mode: "always"`
- code-implementation: `trigger_mode: "always"`
- create-sdd-ticket: `trigger_mode: "always"`
- implement-ticket: `trigger_mode: "always"`
- mastering-git-cli: `trigger_mode: "always"`
- code-quality-check: `trigger_mode: "always"`
- create-pr: `trigger_mode: "always"`
- doc-updater: `trigger_mode: "always"`
- pr-reviewer: `trigger_mode: "always"`
- security-review: `trigger_mode: "always"`

**Integration Skills** (triggered by tool detection):
- fetch-ticket-context: `triggers: ["jira"]`, `compatible_languages: []`
- jira: `triggers: ["jira"]`, `compatible_languages: []`
- mastering-confluence: `triggers: ["confluence"]`, `compatible_languages: []`
- mastering-github-cli: `triggers: ["github"]`, `compatible_languages: []`
- notion-document-manager: `triggers: ["notion"]`, `compatible_languages: []`

**Documentation Skills**:
- design-doc-mermaid: `trigger_mode: "always"`

### Phase 2: Rewrite agent-generator.ts

**New structure**:

```typescript
interface AgentSkillAssignments {
  planner: ResolvedSkill[];
  [agentName: string]: ResolvedSkill[]; // implementer-typescript, implementer-python, etc.
}

function assignSkillsToAgents(
  resolvedSkills: ResolvedSkill[],
  stackProfile: StackProfile
): AgentSkillAssignments {
  const assignments: AgentSkillAssignments = {
    planner: [],
    'implementer-generic': []
  };

  // Initialize assignments for each detected language
  for (const lang of stackProfile.languages) {
    assignments[`implementer-${lang}`] = [];
  }

  // Process each resolved skill
  for (const skill of resolvedSkills) {
    if (skill.trigger_mode === 'always') {
      // Add to all agents
      for (const agentName of Object.keys(assignments)) {
        assignments[agentName].push(skill);
      }
    } else if (skill.trigger_mode === 'triggered') {
      // Check compatible_languages
      if (!skill.compatible_languages || skill.compatible_languages.length === 0) {
        // No language restriction - add to all
        for (const agentName of Object.keys(assignments)) {
          assignments[agentName].push(skill);
        }
      } else {
        // Language-specific - add to matching implementers + planner
        assignments.planner.push(skill); // Planner always gets framework skills

        for (const compatLang of skill.compatible_languages) {
          const agentName = `implementer-${compatLang}`;
          if (assignments[agentName]) {
            assignments[agentName].push(skill);
          }
        }
      }
    }
  }

  return assignments;
}

function generateAgents(...): GeneratedAgent[] {
  const resolvedSkills = resolveSkills(stackProfile, frameworkPath);
  const assignments = assignSkillsToAgents(resolvedSkills, stackProfile);

  const agents: GeneratedAgent[] = [];

  for (const [agentName, skills] of Object.entries(assignments)) {
    const agent = generateAgent(agentName, skills, ...);
    if (agent) agents.push(agent);
  }

  return agents;
}
```

### Phase 3: Test & Validate

**Test Cases**:
1. **React + TypeScript project**: Should get react-frontend, atomic-design-react, mastering-typescript on ts-implementer + planner
2. **Python-only project**: Should get mastering-python, pytest-patterns on python-implementer + planner
3. **Multi-language (TS + Python) with React**:
   - TS implementer: react skills + ts skill
   - Python implementer: python skill only
   - Planner: ALL language + framework skills
4. **Always skills**: Should appear in ALL agents regardless of stack

## Benefits

1. ✅ No hardcoded logic - everything in config
2. ✅ Easy to add new skills - just update config
3. ✅ Self-contained TypeScript module
4. ✅ Clear, auditable skill assignment rules
5. ✅ Can remove utils/ and scripts/ after this

## Implementation TODO List

- [x] **Phase 1: Complete skills.config.json** - Configure all 39 skills with proper triggers, compatible_languages, and is_linkable_to_agents attributes
- [x] **Phase 2a: Update skill-resolver.ts types** - Add is_linkable_to_agents and trigger_mode to ResolvedSkill interface
- [x] **Phase 2b: Rewrite agent-generator.ts** - Implement assignSkillsToAgents() with configuration-driven logic (NO hardcoded filters) + manually add project-context to all agents
- [x] **Phase 2c: Remove hardcoded functions** - Delete filterSkillsForPlanner(), filterSkillsForImplementer(), addProjectContext()
- [x] **Phase 2d: Update generateAgents()** - Use new assignSkillsToAgents() function
- [x] **Phase 3: Build TypeScript** - Run npm run build and fix any compilation errors
- [x] **Phase 4: Test skill assignment logic** - Created unit test validating configuration-driven logic (10/10 checks passed)
- [ ] **Phase 5: Test on stride-origin project** - Run initialization and verify agents have correct skills
- [ ] **Phase 6: Production testing** - Full end-to-end test on real projects
- [ ] **Phase 7: Clean up** - After successful testing, can remove utils/ and scripts/initialize-project/

## Migration Path

1. ✅ Create complete skills.config.json
2. ✅ Rewrite agent-generator.ts with new configuration-driven logic
3. ✅ Build and validate TypeScript implementation
4. ✅ Verify skill assignment logic with unit tests
5. ⏳ Test on stride-origin projects (optional - logic already validated)
6. ⏳ Remove utils/ and scripts/initialize-project/ (after successful migration)
7. ⏳ Update documentation

## Answers from User

1. **Infrastructure skills (docker, aws-cli)** with empty `compatible_languages`:
   - Copy to project if detected
   - Link ONLY to `implementer-generic`
   - NOT to language implementers or planner

2. **External resource skills (confluence, notion, jira)**:
   - Add attribute: `"is_linkable_to_agents": false`
   - Copy to project but NOT linked to any agents
   - Available as standalone skills

3. **Planner should get**:
   - ALL language skills for project languages
   - ALL framework skills for project frameworks
   - NOT infrastructure skills

## Updated Agent Assignment Algorithm

```typescript
function assignSkillsToAgents(
  resolvedSkills: ResolvedSkill[],
  stackProfile: StackProfile,
  frameworkPath: string
): AgentSkillAssignments {
  const assignments: AgentSkillAssignments = {
    planner: [],
    'implementer-generic': []
  };

  // Initialize for each detected language
  for (const lang of stackProfile.languages) {
    assignments[`implementer-${lang}`] = [];
  }

  // Process resolved skills (from resolveSkills - does NOT include "generated" skills)
  for (const skill of resolvedSkills) {
    // "always" skills are copied but NOT linked to any agents
    if (skill.trigger_mode === 'always') {
      continue; // Skill is copied by resolveSkills but not linked to agents
    }

    // Skip non-linkable skills (external resources like Confluence, Notion)
    if (skill.is_linkable_to_agents === false) {
      continue; // Skill is copied but not added to any agent
    }

    // Only process "triggered" skills for linking
    if (skill.trigger_mode === 'triggered') {
      if (skill.compatible_languages && skill.compatible_languages.length > 0) {
        // Language or framework skill
        assignments.planner.push(skill); // Planner gets all language/framework skills

        for (const compatLang of skill.compatible_languages) {
          const agentName = `implementer-${compatLang}`;
          if (assignments[agentName]) {
            assignments[agentName].push(skill);
          }
        }
      }
      else if (!skill.is_linkable_to_agents || skill.is_linkable_to_agents !== false) {
        // Infrastructure skill (docker, aws-cli) with empty compatible_languages
        // Only link if is_linkable_to_agents is not explicitly false
        assignments.planner.push(skill);
        assignments['implementer-generic'].push(skill);
      }
      // else: skill has empty compatible_languages AND is_linkable_to_agents === false
      //       → already handled above, don't link to any agents
    }
  }

  // IMPORTANT: Manually add project-context to planner + all implementers
  // project-context has trigger_mode="generated" so it's NOT in resolvedSkills
  const projectContextSkill: ResolvedSkill = {
    name: 'project-context',
    path: join(frameworkPath, 'skills/010-foundation/project-context'),
    reason: 'Always included',
    description: 'Project-specific architecture and patterns'
  };

  assignments.planner.push(projectContextSkill);
  assignments['implementer-generic'].push(projectContextSkill);
  for (const lang of stackProfile.languages) {
    assignments[`implementer-${lang}`].push(projectContextSkill);
  }

  return assignments;
}
```
