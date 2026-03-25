# Adding Skills

Single config file. Simple trigger matching. Production-ready.

> For the full `SKILL.md` authoring contract — frontmatter schema, archetypes, validation rules, and templates — see [SKILLS_SPEC.md](SKILLS_SPEC.md).

## How It Works

**1. Stack detection** scans project → finds: `["typescript", "react", "jest"]`

**2. Skill matching** checks `skills/skills.config.json`:
```json
{
  "name": "react-frontend",
  "path": "050-language-frameworks/react-frontend",
  "trigger_mode": "triggered",
  "triggers": ["react", "nextjs"],
  "compatible_languages": ["typescript", "javascript"]
}
```

**3. If "react" detected** → skill synced to project's `.claude/skills/` folder

**That's it.**

## Adding a New Skill

### Step 1: Create Skill Directory and Content

Create the skill folder inside the appropriate category:

```bash
mkdir -p skills/050-language-frameworks/svelte-patterns
```

Add your skill content in a `SKILL.md` file:

```bash
echo "# Svelte Patterns" > skills/050-language-frameworks/svelte-patterns/SKILL.md
```

Include agents, hooks, references, or any other resources your skill needs in this directory.

### Step 2: Register in skills.config.json

Edit `skills/skills.config.json` and add your skill entry:

```json
{
  "name": "svelte-patterns",
  "path": "050-language-frameworks/svelte-patterns",
  "description": "Svelte component patterns",
  "trigger_mode": "triggered",
  "triggers": ["svelte"],
  "compatible_languages": ["typescript", "javascript"],
  "is_linkable_to_agents": true
}
```

**Field explanations:**

- **`trigger_mode`** (required): How the skill is activated
  - `"always"` - Copied to every project automatically
  - `"triggered"` - Copied when specific technologies are detected
  - `"generated"` - Dynamically created during initialization (rare)

- **`triggers`** (required for `triggered` mode): Array of technology identifiers that activate this skill
  - Technologies are detected from `package.json`, language files, or framework configs
  - Examples: `["react"]`, `["jest", "vitest"]`, `["docker", "dockerfile"]`

- **`compatible_languages`** (optional): Languages this skill works with
  - Empty array `[]` means language-agnostic (e.g., Jira integration)
  - Examples: `["typescript", "javascript"]`, `["python"]`

- **`is_linkable_to_agents`** (optional, default: `true`): Whether AI agents can reference this skill
  - `false` means the skill is NOT linked to agents (e.g., workflow-only skills)
  - `true` or omitted means agents can use this skill as context

### Step 3: Update Framework and Sync to Target Project

After adding your skill to the framework in your target project, run the sync again:

```bash
# From the framework root
./scripts/sync-framework-resources.sh
```

This script:
1. Reads your project's `.claude/framework-config.json` to detect technologies
2. Matches detected technologies against skill triggers
3. Copies matching skills to `.claude/skills/` in your project
4. Updates agents and hooks as needed to link the new skill

**Done.** Your skill is now available in the target project.

## Quick Examples

### Adding a New Language

**Example: Kotlin**

1. **Create skill:**
```bash
mkdir -p skills/050-language-frameworks/mastering-kotlin
echo "# Kotlin Patterns" > skills/050-language-frameworks/mastering-kotlin/SKILL.md
```

2. **Add to config:**
```json
{
  "name": "mastering-kotlin",
  "path": "050-language-frameworks/mastering-kotlin",
  "description": "Kotlin best practices",
  "trigger_mode": "triggered",
  "triggers": ["kotlin"],
  "compatible_languages": ["kotlin"]
}
```

3. **Sync to project:**
```bash
./scripts/sync-framework-resources.sh
```

**Done.** Stack detection reads from `.claude/framework-config.json` created during initialization.

### Adding a New Framework

**Example: Remix**

1. **Create skill:**
```bash
mkdir -p skills/050-language-frameworks/remix-patterns
echo "# Remix Patterns" > skills/050-language-frameworks/remix-patterns/SKILL.md
```

2. **Add to config:**
```json
{
  "name": "remix-patterns",
  "path": "050-language-frameworks/remix-patterns",
  "description": "Remix framework patterns",
  "trigger_mode": "triggered",
  "triggers": ["remix"],
  "compatible_languages": ["typescript", "javascript"]
}
```

3. **Sync to project:**
```bash
./scripts/sync-framework-resources.sh /path/to/your/project
```

**Done.** Initialize-project agents detect all frameworks automatically.

## Config File Reference

**Location:** `skills/skills.config.json`

**Structure:**
```json
{
  "version": "1.0.0",
  "skills": [
    {
      "name": "skill-name",
      "path": "category/skill-name",
      "description": "Brief description",
      "trigger_mode": "triggered",
      "triggers": ["tech1", "tech2"],
      "compatible_languages": ["typescript", "javascript"],
      "is_linkable_to_agents": true
    }
  ]
}
```

**Required Fields:**
- `name`: Unique identifier for the skill
- `path`: Relative path from `skills/` directory (e.g., `"050-language-frameworks/react-frontend"`)
- `description`: Brief explanation of what the skill provides
- `trigger_mode`: One of `"always"`, `"triggered"`, or `"generated"`

**Optional Fields:**
- `triggers`: Array of technology identifiers (required when `trigger_mode: "triggered"`)
- `compatible_languages`: Array of programming languages (empty array for language-agnostic skills)
- `is_linkable_to_agents`: Boolean, defaults to `true` (set `false` for workflow-only skills)

**Rules:**
- Triggers match ANY detected technology from the project's stack profile
- Path is relative to the `skills/` directory
- When `trigger_mode: "always"`, omit `triggers` field

## Skill Categories

| Path Prefix | Purpose |
|-------------|---------|
| `skills/010-foundation/` | Core workflow (always copied) |
| `skills/020-development-workflow/` | Development process |
| `skills/030-quality-assurance/` | Testing, quality |
| `skills/040-integrations/` | External tools |
| `skills/050-language-frameworks/` | Languages, frameworks |
| `skills/060-documentation/` | Docs, diagrams |
| `skills/070-infrastructure/` | DevOps, containers |
| `skills/080-cloud-platforms/` | Cloud services |

## Technology Detection

**Detection happens during:** Project initialization (`initialize-project` workflow)

**How it works:**

1. **AI agents analyze the project** (Phase 1-3 of initialize-project)
   - Scan `package.json`, `requirements.txt`, `go.mod`, etc.
   - Detect languages from file extensions and build configs
   - Identify frameworks, testing tools, and cloud platforms

2. **Results are saved** to `.claude/framework-config.json`:
   ```json
   {
     "stack_profile": {
       "languages": ["typescript", "javascript"],
       "frameworks": {
         "frontend": ["react", "nextjs"],
         "backend": []
       },
       "testing": ["jest", "playwright"],
       "databases": ["postgresql"],
       "infrastructure": ["docker"],
       "cloud_platforms": ["aws"]
     }
   }
   ```

3. **Future operations read this config** - all skill matching, agent behavior, and automation adapt to the detected stack

**No manual detection needed.** The framework's AI agents handle everything automatically.

## Config Examples

### Always-Copied Skill

Foundation skills that apply to every project:

```json
{
  "name": "start-task",
  "path": "010-foundation/start-task",
  "description": "Task initialization workflow",
  "trigger_mode": "always"
}
```

### Multi-Trigger Skill

Skills activated by multiple technologies:

```json
{
  "name": "jest-coverage-automation",
  "path": "030-quality-assurance/jest-coverage-automation",
  "description": "Jest testing framework automation",
  "trigger_mode": "triggered",
  "triggers": ["jest"],
  "compatible_languages": ["typescript", "javascript"]
}
```

### Integration Skill (Not Linkable to Agents)

External tool integrations that shouldn't be agent context:

```json
{
  "name": "jira",
  "path": "040-integrations/jira",
  "description": "Jira integration and workflows",
  "trigger_mode": "triggered",
  "triggers": ["jira"],
  "compatible_languages": [],
  "is_linkable_to_agents": false
}
```

### Cloud Platform Skill (Linkable to Agents)

Infrastructure skills that agents can use:

```json
{
  "name": "mastering-aws-cdk",
  "path": "080-cloud-platforms/mastering-aws-cdk",
  "description": "AWS CDK infrastructure as code",
  "trigger_mode": "triggered",
  "triggers": ["aws-cdk", "@aws-cdk"],
  "compatible_languages": ["typescript", "javascript", "python"],
  "is_linkable_to_agents": true
}
```

## Syncing Skills to Projects

After adding or modifying a skill in the framework, sync it to target projects:

```bash
./scripts/sync-framework-resources.sh /path/to/your/project
```

**What happens during sync:**

1. Reads `.claude/framework-config.json` from the target project
2. Extracts the `stack_profile` (detected technologies)
3. Matches technologies against skill `triggers` in `skills.config.json`
4. Copies matching skills to `.claude/skills/` in the target project
5. Updates agents and hooks that depend on synced skills

**Ignoring specific skills** (in project's `.claude/framework-config.json`):

```json
{
  "ignored_skills": ["skill-name", "another-skill"]
}
```

Skills in the ignore list won't be synced even if their triggers match.

## Testing Your Skill

### Verify Config Syntax

Check that `skills.config.json` is valid:

```bash
cat skills/skills.config.json | jq .
```

If there are syntax errors, `jq` will report them.

### Test Skill Sync

1. **Create or use a test project** with the technologies your skill targets

2. **Ensure the project has `.claude/framework-config.json`** with matching technologies:
   ```json
   {
     "stack_profile": {
       "languages": ["typescript"],
       "frameworks": { "frontend": ["react"] }
     }
   }
   ```

3. **Run sync:**
   ```bash
   ./scripts/sync-framework-resources.sh /path/to/test-project
   ```

4. **Verify the skill was copied:**
   ```bash
   ls /path/to/test-project/.claude/skills/
   # Should show your skill folder
   ```

### Validate Skill Content

Ensure your skill follows the spec:

```bash
# Check that SKILL.md exists
test -f skills/050-language-frameworks/your-skill/SKILL.md && echo "✓ SKILL.md found"

# Verify frontmatter if using structured format
head -20 skills/050-language-frameworks/your-skill/SKILL.md
```

## Complete Workflow Summary

**End-to-end process for adding a new skill:**

### 1. Create the Skill

```bash
# Choose appropriate category (010-foundation, 020-development-workflow, etc.)
mkdir -p skills/050-language-frameworks/my-new-skill

# Add skill content
touch skills/050-language-frameworks/my-new-skill/SKILL.md

# Optional: Add agents, hooks, or references
mkdir -p skills/050-language-frameworks/my-new-skill/agents
mkdir -p skills/050-language-frameworks/my-new-skill/hooks
```

### 2. Register in skills.config.json

Edit `skills/skills.config.json` and add your entry:

```json
{
  "name": "my-new-skill",
  "path": "050-language-frameworks/my-new-skill",
  "description": "Clear, concise description",
  "trigger_mode": "triggered",
  "triggers": ["technology-name"],
  "compatible_languages": ["typescript", "javascript"],
  "is_linkable_to_agents": true
}
```

**Key fields to configure:**
- **`trigger_mode`**: `"always"` (copied to all projects) or `"triggered"` (copied when tech detected)
- **`triggers`**: Technologies that activate this skill (e.g., `["react"]`, `["docker"]`)
- **`is_linkable_to_agents`**: `false` if this skill should NOT be referenced by agents (workflow-only)
- **`compatible_languages`**: Empty array `[]` for language-agnostic skills

### 3. Update Framework in Target Project and Sync

```bash
# Sync the updated framework to your project
./scripts/sync-framework-resources.sh /path/to/your/project
```

This automatically:
- Matches your skill's triggers against the project's detected technologies
- Copies the skill to `.claude/skills/` if triggers match
- Updates agents and hooks as needed

### 4. Verify

```bash
# Check the skill was synced
ls /path/to/your/project/.claude/skills/my-new-skill

# Verify SKILL.md is present
cat /path/to/your/project/.claude/skills/my-new-skill/SKILL.md
```

**Done!** Your skill is now active in the project and available to AI agents.

---

**Framework Version:** 2.0+
