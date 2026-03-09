---
name: initialize-project
description: Deep codebase analysis and Claude Code configuration generator. Spawns parallel analyzers then an opus architect to produce CLAUDE.md and project-context skill. CRITICAL - Uses utility scripts for stack detection and skill/agent copying.
user-invokable: true
argument-hint: [project-path (optional, defaults to cwd)]
disable-model-invocation: true
context: inline
---

# Initialize Project — 5-Phase Automated Workflow

**⚠️ CRITICAL BEHAVIORAL RULES ⚠️**

1. **NO FILE READING ON MAIN THREAD** during Phases 1-4 (only agents read files)
2. **MUST RUN ALL 5 PHASES** without stopping
3. **MUST USE UTILITY SCRIPTS** in Phase 5 (not inline bash)
4. **MUST COPY SKILLS + AGENTS + COMMANDS** in Phase 5

---

## STEP 0: MANDATORY PHASE TRACKING

**BEFORE doing anything else**, create a todo list with ALL 5 phases using the TodoWrite tool:

```typescript
TodoWrite({
  todos: [
    {
      content: 'Phase 1: Launch parallel analysis agents',
      status: 'in_progress',
      activeForm: 'Launching parallel analysis agents'
    },
    {
      content: 'Phase 2: Consolidation & gap analysis',
      status: 'pending',
      activeForm: 'Consolidating analysis and asking user questions'
    },
    {
      content: 'Phase 3: Architecture synthesis',
      status: 'pending',
      activeForm: 'Synthesizing architecture with Opus agent'
    },
    {
      content: 'Phase 4: Write CLAUDE.md and project-context files',
      status: 'pending',
      activeForm: 'Writing configuration files'
    },
    {
      content: 'Phase 5: Stack detection & auto-configuration',
      status: 'pending',
      activeForm: 'Detecting stack, copying skills, generating agents'
    }
  ]
});
```

**After creating the todo list, immediately proceed to Phase 1.**

---

## Phase 1: Launch Parallel Analysis Agents

### Step 1.1: Launch Subagents

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 1: LAUNCHING PARALLEL ANALYSIS AGENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Launch **4 subagents in parallel** using the Task tool. Send all 4 Task calls in a **single message**.

Read and invoke each agent from `.claude/skills/initialize-project/agents/`:

1. **Structure & Architecture**: `./agents/01-structure-architecture.md`
2. **Data Flows & Auth**: `./agents/02-data-flows-auth.md`
3. **DevOps & Workflow**: `./agents/03-devops-workflow.md`
4. **Conventions & Patterns**: `./agents/04-conventions-patterns.md`

Set `run_in_background: true` for all agents.

Track the agent IDs returned.

### Step 1.2: Wait for Completion

Use `AgentOutputTool` with `block: true` to retrieve all 4 agent outputs.

```bash
echo "✓ Phase 1 complete - All 4 analysis reports received"
```

### Phase 1 Complete ✓

**Update TodoWrite**: Mark Phase 1 as "completed", mark Phase 2 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 2.

---

## Phase 2: Consolidation & Gap Analysis

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 2: CONSOLIDATION & GAP ANALYSIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 2.1: Compile Results

Read all 4 analysis reports. Create a consolidated summary organized by:

- Tech stack (exact versions)
- Architecture pattern and conventions
- Complex flows (auth, real-time, error handling, request lifecycle)
- Development workflow and commands
- Non-obvious patterns and gotchas

### Step 2.2: Identify Gaps

**CRITICAL**: The agents should have done thorough research and marked very few items as [NEEDS_VERIFICATION]. If you see many [NEEDS_VERIFICATION] items about code configuration, file locations, or technical patterns, DO NOT accept them - the agents failed to search properly.

Review the consolidated summary for ONLY these types of gaps:

**VALID GAPS TO ASK ABOUT:**

1. **Business Domain Context**: What is the application's purpose? Key user workflows?
2. **Deployment Infrastructure**: Where/how is production deployed? CI/CD pipelines?
3. **Team Conventions**: Branch naming, PR approval process, team-specific guidelines?
4. **External System Behavior**: Third-party API behaviors not documented in code

**INVALID GAPS** (these should have been found in code - reject if agents marked these):

- Config file locations (playwright.config.ts, tsconfig.json, etc.)
- Whether features are implemented (caching, persistence, error handling)
- Database error handling utilities
- Test framework configuration
- Any technical detail that exists in the codebase

If you find invalid gaps, that means the agents didn't search thoroughly enough.

### Step 2.3: Ask the Engineer

**BEFORE asking questions**: Review all gaps one more time. If a gap is about something in the codebase (config files, implementation details, technical patterns), DO NOT ask - search for it yourself using Glob, Grep, and Read tools until you find the answer.

**ONLY ask about**:

- Business domain and purpose
- Deployment and CI/CD infrastructure (if not in .github/workflows, .gitlab-ci.yml, etc.)
- Team policies and conventions (if not in CONTRIBUTING.md, docs/, etc.)

If you have valid gaps, present them as a **numbered list**:

```
I've completed the codebase analysis. Before generating the configuration files, I need
clarification on the following items:

1. [BUSINESS_CONTEXT] What is the primary business purpose of this application?
2. [DEPLOYMENT] Where is production deployed and what CI/CD system is used?
3. [TEAM_POLICY] What are the branch naming conventions?

Please answer each item. Type "skip" for any you'd like me to leave out or mark as TODO.
```

**If you have NO valid gaps** (all technical details were found in code): Skip directly to Phase 3 without asking any questions.

**Wait for the engineer's response** (only if you asked questions).

### Phase 2 Complete ✓

**Update TodoWrite**: Mark Phase 2 as "completed", mark Phase 3 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 3.

---

## Phase 3: Architecture Synthesis

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 3: ARCHITECTURE SYNTHESIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Launch the **architect synthesizer agent** using the Task tool.

Read and invoke: `./agents/05-architect-synthesizer.md`

Use `model: opus` and `subagent_type: general-purpose`.

Include in the prompt:

- Full consolidated analysis from Phase 2
- Engineer's answers from Phase 2.3 (if any)
- Project path from $ARGUMENTS (or current working directory)

**CRITICAL INSTRUCTIONS FOR THE AGENT**:

Add this to the agent prompt:

```
CRITICAL OUTPUT FORMAT:

You MUST return your output in this EXACT format with these EXACT section headers:

# CLAUDE.md Content

[Full markdown content of CLAUDE.md here - starting with # Project Name]

---

# project-context/SKILL.md Content

[Full markdown content of SKILL.md here - starting with the YAML frontmatter ---]

DO NOT:
- Write any files yourself
- Use the Write tool
- Create any directories
- Return content in any other format

DO:
- Return ONLY the two sections above
- Include complete content for both files
- Use the exact section headers shown
- Separate the two sections with exactly three dashes (---)
```

**Wait for the architect agent to return** the content for CLAUDE.md and project-context/SKILL.md.

**Verify the output format**: The agent's output should contain:
1. A line that says exactly `# CLAUDE.md Content`
2. Content for CLAUDE.md
3. A line with exactly `---`
4. A line that says exactly `# project-context/SKILL.md Content`
5. Content for project-context/SKILL.md (including YAML frontmatter)

If the output format is incorrect, you will need to manually extract or reformat the content before Phase 4.

### Phase 3 Complete ✓

**Update TodoWrite**: Mark Phase 3 as "completed", mark Phase 4 as "in_progress"

**CRITICAL CHECK**: Do NOT stop here. Immediately proceed to Phase 4.

---

## Phase 4: Write Configuration Files

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 4: WRITE & VERIFY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 4.1: Extract Content from Phase 3 Output

The architect agent from Phase 3 returned content in this format:

```markdown
# CLAUDE.md Content

[Content for CLAUDE.md]

---

# project-context/SKILL.md Content

[Content for SKILL.md including YAML frontmatter]
```

**CRITICAL**: Parse the Phase 3 output to extract:
1. Everything after `# CLAUDE.md Content` and before the `---` separator → this is the CLAUDE.md content
2. Everything after `# project-context/SKILL.md Content` → this is the project-context/SKILL.md content

**DO NOT**:
- ❌ Try to read template files from ai-agentic-framework
- ❌ Try to generate content yourself
- ❌ Use bash cat commands with HEREDOC
- ❌ Ignore the Phase 3 output

**DO**:
- ✅ Extract the content from the architect agent's output
- ✅ Use the Write tool to write the files
- ✅ Verify the content was extracted correctly before writing

### Step 4.2: Backup Existing Files

If `.claude/CLAUDE.md` exists, create a backup:

```bash
cp .claude/CLAUDE.md .claude/CLAUDE.md.backup
```

### Step 4.3: Create Directory Structure

```bash
mkdir -p .claude/skills/project-context
```

### Step 4.4: Write Files Using Write Tool

**CRITICAL**: Use the Write tool (NOT bash cat commands) to write both files:

1. Write `.claude/CLAUDE.md` with the extracted CLAUDE.md content
2. Write `.claude/skills/project-context/SKILL.md` with the extracted project-context content

**Example**:
```typescript
// Extract claudeContent from Phase 3 output (everything between "# CLAUDE.md Content" and "---")
Write({
  file_path: ".claude/CLAUDE.md",
  content: claudeContent
});

// Extract projectContextContent from Phase 3 output (everything after "# project-context/SKILL.md Content")
Write({
  file_path: ".claude/skills/project-context/SKILL.md",
  content: projectContextContent
});
```

### Step 4.5: Verify Files Written

Count lines to verify files were written:

```bash
wc -l .claude/CLAUDE.md .claude/skills/project-context/SKILL.md
```

Expected output: Both files should have content (50-300 lines each).

### Phase 4 Complete ✓

**Update TodoWrite**: Mark Phase 4 as "completed", mark Phase 5 as "in_progress"

**🚨 CRITICAL: DO NOT STOP HERE! 🚨**

This is NOT the end. You have NOT completed the task.

**IMMEDIATELY proceed to Phase 5** (Stack Detection & Auto-Configuration).

Do NOT wait for user input. Do NOT display a completion message yet.

---

## Phase 5: Stack Detection & Auto-Configuration

**CRITICAL**: This phase MUST complete successfully. DO NOT stop after Phase 4.

**Update TodoWrite**: Mark Phase 5 as "in_progress" before starting.

### Run Phase 5 Script

Execute the Phase 5 orchestration script that handles all stack detection, skill copying, agent generation, and command setup:

```bash
bash ai-agentic-framework/skills/010-foundation/initialize-project/scripts/run-phase5.sh \
  <project-root> \
  ai-agentic-framework
```

**What this script does:**
1. Detects stack using `stack-detection.js` utility
2. Selects and copies skills using `skill-selection.js` utility
3. Generates agents using `agent-generation.js` utility
4. Copies slash commands to `.claude/commands/`
5. Generates INDEX.md files for skills and agents
6. Displays detected stack summary
7. Cleans up temporary files

**Expected Output:**
- Skills copied to `.claude/skills/` (10-30 skills depending on stack)
- Agents generated in `.claude/agents/` (3-10 agents depending on languages)
- Commands copied to `.claude/commands/` (3-5 commands)
- Stack profile displayed with detected languages, frameworks, databases, testing tools

### Phase 5 Complete ✓

**Update TodoWrite**: Mark Phase 5 as "completed"

```text
✓ Phase 5 complete - All skills, agents, and commands configured
```

---

## Phase 6: Final Validation & Summary

### Step 6.1: Completion Checklist

Verify all phases completed:

```bash
echo "Running completion checklist..."

checklist=(
  "Phase 1: 4 agent reports received"
  "Phase 2: User questions answered"
  "Phase 3: Architect synthesis completed"
  "Phase 4: CLAUDE.md and project-context written"
  "Phase 5: Skills copied, agents generated, commands copied"
)

for item in "${checklist[@]}"; do
  echo "  ✓ $item"
done
```

### Step 6.2: Display Final Summary

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PROJECT INITIALIZATION COMPLETE! 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Display comprehensive summary:

```markdown
## 📋 Generated Files

### Core Configuration

✓ .claude/CLAUDE.md - Commands, conventions, stack reference
✓ .claude/skills/project-context/SKILL.md - Hard-to-discover architectural knowledge

### Skills

✓ .claude/skills/INDEX.md - Skill inventory
[List installed skills by category]

### Agents

✓ .claude/agents/INDEX.md - Agent inventory
✓ planner.md (Opus) - Implementation planning
✓ implementer-[language].md (Sonnet) - Development
✓ tester-unit-[language].md (Sonnet) - Test coverage

### Commands

✓ .claude/commands/implement-ticket.md
✓ .claude/commands/create-sdd-ticket.md
✓ .claude/commands/initialize-project.md

### Stack Detected

[Display from stack-profile.json]

## 🚀 Next Steps

1. Load project context: `/project-context`
2. Start working on tickets: `/implement-ticket <ticket-id>`
3. Review skills: `ls .claude/skills/`
4. Review agents: `ls .claude/agents/`
```

### Phase 6 Complete ✓

**ALL PHASES COMPLETED SUCCESSFULLY.**

Ask: "Would you like me to explain any section, or start working on a ticket?"

---

## Core Philosophy

**Only document what's hard to discover.** The AI can `ls`, `grep`, and `read` files instantly.

- **DO NOT include**: endpoint lists, entity field lists, module directories, env var tables, Docker service tables, component inventories
- **DO include**: multi-step flows (auth pipelines, real-time chains), non-obvious conventions (guard stacking, sort prefix), patterns where wrong approach causes bugs

**Maintenance test**: If adding an endpoint/entity/env var requires updating the file, that content should NOT be in the file.

---

## Core Rules

- **NEVER assume** - Report only what you find in code
- **Quote exact values** - Versions from package.json, patterns from tsconfig
- **Ask the engineer** for anything that cannot be determined from code
- **No hallucinated paths** - Verify every path with Glob or Read

---

## Error Handling

| Error                    | Resolution                                        |
| ------------------------ | ------------------------------------------------- |
| Subagent timeout         | Retry with focused scope                          |
| No package.json found    | Ask engineer for language/framework               |
| Utility script not found | Verify ai-agentic-framework path                  |
| Stack detection fails    | Check file permissions, verify config files exist |

---

## Success Criteria

1. ✓ CLAUDE.md exists with accurate stack info
2. ✓ project-context skill exists with hard-to-discover knowledge
3. ✓ Skills copied based on detected stack
4. ✓ Agents generated with stack-specific commands
5. ✓ Commands copied to .claude/commands/
6. ✓ No file reading on main thread during Phases 1-4
7. ✓ All 5 phases completed without stopping
