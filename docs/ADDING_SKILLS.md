# Adding Skills to the Framework

This guide covers how framework developers add new skills to the registry and how users receive them through the sync process.

---

## Table of Contents

1. [For Framework Developers](#for-framework-developers)
2. [For Users](#for-users)
3. [Skill Categories](#skill-categories)
4. [Examples](#examples)
5. [Troubleshooting](#troubleshooting)

---

## For Framework Developers

### How to Add a New Skill

Framework developers manually add skills to the skill registry. There is no automated tooling - this ensures quality control and intentional skill additions.

#### Step 1: Create the Skill Directory

Create your skill in the appropriate category under `skills/`:

```
skills/
  050-language-frameworks/
    my-new-skill/
      SKILL.md          # Required: Main skill documentation
      references/       # Optional: Reference materials
      examples/         # Optional: Example code
      scripts/          # Optional: Automation scripts
```

#### Step 2: Register the Skill

Edit `utils/skill-registry.js` to add your skill to the appropriate location:

**For Language-Specific Skills:**

```javascript
// In SKILL_REGISTRY.implementation.languages
python: {
  core: ['mastering-python-skill', 'my-new-python-skill'], // Add here
  backend: {
    fastapi: ['fastapi-patterns'], // Or framework-specific
  },
}
```

**For Always-Copied Skills:**

Edit `utils/skill-selection.js`:

```javascript
const ALWAYS_COPIED_SKILLS = [
  // ... existing skills
  { name: 'my-new-skill', category: '020-development-workflow' },
];
```

**For Framework-Specific Skills:**

```javascript
// In SKILL_REGISTRY.implementation.languages.typescript.frontend
react: ['react-frontend', 'atomic-design-react', 'my-new-react-skill'],
```

**For Testing Framework Skills:**

```javascript
// In SKILL_REGISTRY.testing
unit: {
  jest: ['jest-coverage-automation', 'my-new-jest-skill'],
  vitest: ['jest-coverage-automation'], // vitest can use jest patterns
  pytest: ['pytest-patterns'],
},
```

**For Infrastructure Skills:**

```javascript
// In SKILL_REGISTRY.infrastructure
containers: {
  docker: ['developing-with-docker', 'my-docker-skill'],
},
cloud: {
  aws: ['mastering-aws-cli', 'my-aws-skill'],
  'aws-cdk': ['mastering-aws-cdk'],
},
```

#### Step 3: Test the Skill

1. Create a test project or use an existing one
2. Run the sync script to verify the skill is detected and added
3. Verify agents that should use the skill have it in their skills list
4. Test that the skill content is accessible and useful

```bash
# Test sync on a project with matching stack
./scripts/sync-framework-resources.sh ~/test-project

# Verify skill was added
ls -la ~/test-project/.claude/skills/*/my-new-skill

# Check agent has the skill
cat ~/test-project/.claude/agents/implementer-typescript.md | grep "my-new-skill"
```

#### Step 4: Document the Skill

Ensure your `SKILL.md` includes:

```markdown
---
name: my-new-skill
description: Brief one-line description
version: 1.0.0
category: 050-language-frameworks
applies_to: [typescript, javascript]
---

# My New Skill

## Purpose

Clear description of what this skill provides and when to use it.

## Prerequisites

- List any dependencies
- Required tools or configurations
- Minimum framework version

## Usage

How to apply this skill in practice.

## Examples

Concrete code examples demonstrating the skill.

## References

- External documentation
- Related skills
```

#### Step 5: Commit and Push

```bash
# Add the skill and registry changes
git add utils/skill-registry.js skills/050-language-frameworks/my-new-skill/
git commit -m "feat: add my-new-skill for TypeScript projects"
git push origin main
```

Users running sync will now receive this skill if their stack matches.

---

### Skill Naming Conventions

- **Use lowercase with hyphens**: `my-skill-name`
- **Be descriptive**: `mastering-typescript` not `ts`
- **Include framework/tool name**: `react-frontend`, `jest-coverage-automation`
- **Use "mastering" for comprehensive skills**: `mastering-git-cli`
- **Keep it concise**: 2-4 words maximum

**Good Examples:**
- `react-frontend`
- `mastering-python-skill`
- `jest-coverage-automation`
- `developing-with-docker`

**Bad Examples:**
- `reactSkill` (use hyphens, not camelCase)
- `r` (too short, not descriptive)
- `react_frontend` (use hyphens, not underscores)
- `the-ultimate-comprehensive-react-frontend-development-guide` (too long)

---

### Skill Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| `010-foundation` | Core workflow skills | `start-task`, `project-context` |
| `020-development-workflow` | Development process | `implement-ticket`, `create-sdd-ticket` |
| `030-quality-assurance` | Testing and quality | `jest-coverage-automation`, `code-quality-check` |
| `040-integrations` | External tools | `jira`, `mastering-github-agent-skill` |
| `050-language-frameworks` | Language/framework | `mastering-typescript`, `react-frontend` |
| `060-documentation` | Docs and diagrams | `design-doc-mermaid` |
| `070-infrastructure` | DevOps and infra | `developing-with-docker` |
| `080-cloud-platforms` | Cloud services | `mastering-aws-cli`, `using-firebase` |

---

## For Users

### How Sync Auto-Adds New Skills

When framework developers add new skills to the registry, users receive them automatically during sync based on their project's stack profile.

#### Running Sync

```bash
# From the framework directory
cd ~/ai-agentic-framework

# Run sync on your project
./scripts/sync-framework-resources.sh ~/my-project
```

Or if the framework is in a different location:

```bash
/path/to/ai-agentic-framework/scripts/sync-framework-resources.sh ~/my-project
```

#### What Happens During Sync

1. **Discovery**: Sync reads your stack profile from `framework-config.json`
2. **Comparison**: Compares skills you should have vs. skills you currently have
3. **Detection**: Identifies new skills that match your stack but aren't installed
4. **Addition**: Automatically copies missing skills to `.claude/skills/`
5. **Agent Update**: If new skills affect your agents, they are regenerated
6. **Tracking**: New skills are tracked in `framework-config.json`

#### Example Output

```bash
$ ./scripts/sync-framework-resources.sh ~/my-react-project

🔄 Framework Resource Sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Project:   /Users/dev/my-react-project
  Framework: /Users/dev/ai-agentic-framework

Step 1: Validating prerequisites...
✓ Prerequisites validated

Step 2: Detecting framework version...
  Current framework version:    2.1.0
  Configured framework version: 2.0.0
  ⚠️  Framework version mismatch - full sync recommended

Step 3: Detecting user modifications...
  ✓ No user modifications detected

Step 4: Creating backup...
✓ Backup created

Step 5: Syncing skills...
  ✓ Skills updated:  1
  ✓ Skills added:    0
  ℹ️  Skills skipped: 0

Step 5.5: Detecting new skills from registry...
  Found 2 new skill(s) in registry based on stack profile
  ✓ New skills discovered: 2
  ✓ New skills added:      2
  ℹ️  Skills ignored:       0

  Checking for affected agents...
  ⚠️  1 agent(s) will be regenerated due to new skills

Step 6: Syncing agents...
  ✓ Regenerated: implementer-typescript (new skills added)
  ✓ Agents updated:  0
  ✓ Agents added:    0
  ℹ️  Agents skipped: 3

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SYNC COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
  Skills:  1 updated, 0 added, 2 new from registry, 0 skipped
  Agents:  0 updated, 0 added, 1 regenerated (new skills), 3 skipped

✅ Successfully synced 3 resource(s)
```

---

### Ignoring Skills

If you don't want certain skills auto-added, add them to the `ignored_skills` array in your project's `framework-config.json`:

```json
{
  "schema_version": "1.0.0",
  "framework_version": "2.0.0",
  "ignored_skills": [
    "mastering-python-skill",
    "vue-frontend",
    "050-language-frameworks/angular-patterns"
  ],
  "project_metadata": { ... },
  "resource_state": { ... }
}
```

**When to ignore skills:**
- Skill not relevant to your specific project
- You have a custom version of the skill
- Skill causes conflicts with existing setup
- You prefer not to use the framework's approach for that area

**Both formats are supported:**
- Short name: `"vue-frontend"`
- Full path: `"050-language-frameworks/vue-frontend"`

---

### Checking Available Skills

#### See what skills are in the framework

```bash
# List all skills by category
ls -la /path/to/ai-agentic-framework/skills/*/

# List skills in a specific category
ls -la /path/to/ai-agentic-framework/skills/050-language-frameworks/
```

#### See what skills are installed in your project

```bash
# List all installed skills
ls -la .claude/skills/*/

# Check a specific skill
cat .claude/skills/050-language-frameworks/mastering-typescript/SKILL.md
```

#### See what skills an agent uses

```bash
# Check agent's preloaded skills
cat .claude/agents/implementer-typescript.md | grep -A 20 "preload:"
```

---

## Examples

### Example 1: Developer Adds a New Next.js Skill

#### Developer Action

1. Create the skill directory:
```bash
mkdir -p skills/050-language-frameworks/nextjs-patterns
```

2. Create `SKILL.md` with Next.js patterns and best practices

3. Edit `utils/skill-registry.js`:
```javascript
typescript: {
  core: ['mastering-typescript'],
  frontend: {
    react: ['react-frontend', 'atomic-design-react'],
    vue: ['vue-frontend'],
    nextjs: ['nextjs-patterns'], // NEW SKILL
  },
}
```

4. Test and commit:
```bash
git add utils/skill-registry.js skills/050-language-frameworks/nextjs-patterns/
git commit -m "feat: add nextjs-patterns skill"
git push
```

#### User Experience

User pulls the framework update and runs sync:

```bash
$ cd ~/ai-agentic-framework
$ git pull

$ ./scripts/sync-framework-resources.sh ~/my-nextjs-app

Step 5.5: Detecting new skills from registry...
  Found 1 new skill(s) in registry based on stack profile
  ✓ New skills discovered: 1
  ✓ New skills added:      1 (nextjs-patterns)

  Checking for affected agents...
  ⚠️  1 agent(s) will be regenerated due to new skills

Step 6: Syncing agents...
  ✓ Regenerated: implementer-typescript (new skills added)
```

---

### Example 2: User Ignores an Unwanted Skill

User has a Python project but doesn't want the `mastering-pytorch-rl-nlp-agentic-skill`:

#### User Action

Edit `.claude/framework-config.json`:

```json
{
  "ignored_skills": [
    "mastering-pytorch-rl-nlp-agentic-skill"
  ]
}
```

#### Sync Output

```bash
$ ./scripts/sync-framework-resources.sh

Step 5.5: Detecting new skills from registry...
  ✓ New skills discovered: 1
  ✓ New skills added:      0
  ℹ️  Skills ignored:       1
```

---

### Example 3: Multiple New Skills Trigger Agent Regeneration

Framework adds 3 new React-related skills:

#### Developer Actions

```javascript
// utils/skill-registry.js
react: [
  'react-frontend',
  'atomic-design-react',
  'react-hooks-patterns',      // NEW
  'react-performance-optimization', // NEW
  'react-testing-library-patterns'  // NEW
],
```

#### User Experience

```bash
Step 5.5: Detecting new skills from registry...
  Found 3 new skill(s) in registry based on stack profile
  ✓ New skills discovered: 3
  ✓ New skills added:      3

  Checking for affected agents...
  ⚠️  2 agent(s) will be regenerated due to new skills

Step 6: Syncing agents...
  ✓ Regenerated: implementer-typescript (new skills added)
  ✓ Regenerated: tester-unit-typescript (new skills added)
```

Both implementer and tester agents get regenerated because they both use React skills in their configuration.

---

## Troubleshooting

### Skill Not Being Added

**Problem**: You expect a skill to be added but it's not showing up.

**Solutions**:

1. **Check stack profile matches**

```bash
# View your stack profile
cat .claude/framework-config.json | grep -A 30 "stack_profile"

# Verify the skill's language/framework is in your profile
```

2. **Check if skill is ignored**

```bash
cat .claude/framework-config.json | grep -A 5 "ignored_skills"
```

3. **Check skill exists in framework**

```bash
ls -la /path/to/framework/skills/*/skill-name
```

4. **Check skill is registered**

```bash
grep -r "skill-name" /path/to/framework/utils/skill-registry.js
```

---

### Agent Not Regenerated

**Problem**: New skill was added but agent wasn't updated.

**Solutions**:

1. **Check if agent uses the skill**

The agent will only regenerate if the skill is in its skill list. Check `AGENT_SKILL_MAPPING` in `utils/skill-registry.js`:

```javascript
// Example: implementer agent for TypeScript
implementer: {
  getSkills: (stackProfile, language) => {
    const skills = [];
    // ...check if your new skill is included in the logic
```

2. **Manually trigger regeneration**

```bash
# Re-run sync
./scripts/sync-framework-resources.sh ~/my-project
```

3. **Check agent is framework-managed**

```bash
cat .claude/framework-config.json | grep -A 10 "implementer-typescript"
# Look for "managed_by_framework": true
```

---

### Removing an Unwanted Skill

**Problem**: A skill was auto-added but you don't want it.

**Solutions**:

1. **Add to ignored list** (recommended):

```json
{
  "ignored_skills": ["unwanted-skill-name"]
}
```

2. **Manually remove**:

```bash
# Delete the skill directory
rm -rf .claude/skills/050-language-frameworks/unwanted-skill

# Remove from framework-config.json
# Edit resource_state.skills and remove the entry
```

3. **Re-run sync to verify**:

```bash
./scripts/sync-framework-resources.sh ~/my-project
# Should show skill as ignored, not re-added
```

---

### Skill Added to Wrong Project

**Problem**: Sync added a skill to a project that doesn't need it.

**Root Cause**: Stack profile might be incorrectly detecting a language/framework.

**Solutions**:

1. **Check stack detection**:

```bash
cat .claude/framework-config.json | jq .stack_profile
```

2. **Update stack profile** if incorrect (advanced):

You can manually edit `framework-config.json` to fix incorrect detections, but this is not recommended. Better to fix detection logic in the framework.

3. **Ignore the skill**:

```json
{
  "ignored_skills": ["incorrectly-added-skill"]
}
```

---

## Best Practices

### For Framework Developers

1. **Test thoroughly** before committing new skills
2. **Document clearly** in `SKILL.md`
3. **Use semantic versioning** for skill versions
4. **Consider backward compatibility** when updating existing skills
5. **Update relevant agents** if skill applies to them
6. **Announce new skills** to users in release notes

### For Users

1. **Run sync regularly** to get new skills and updates
2. **Review ignored_skills** periodically to see if you still need them ignored
3. **Check backup directories** if sync causes issues
4. **Report skill issues** to framework maintainers
5. **Customize skills** in your project if needed (mark as user-modified)

---

## Advanced Topics

### Custom Skill Development (Users)

Users can create custom skills that won't be touched by sync:

1. Create skill in `.claude/skills/`
2. Manually add to `framework-config.json` with `"managed_by_framework": false`
3. Sync will never modify or delete it

```json
{
  "resource_state": {
    "skills": {
      "999-custom/my-custom-skill": {
        "source_path": "custom",
        "managed_by_framework": false,
        "user_modified": false
      }
    }
  }
}
```

### Skill Dependencies

Skills can depend on other skills. This is tracked in `framework-config.json`:

```json
{
  "dependencies": ["prerequisite-skill-name"]
}
```

Currently, sync doesn't enforce dependencies automatically, but this may be added in future versions.

---

## FAQ

**Q: What happens if I modify a framework-managed skill?**

A: Sync detects the modification by comparing file hashes and will skip updating that skill to preserve your changes.

**Q: Can I use both the short name and full path in ignored_skills?**

A: Yes, both formats work: `"skill-name"` and `"category/skill-name"`

**Q: How do I know which skills my stack should have?**

A: Run sync and check the discovery output, or review `utils/skill-registry.js` for your language/framework.

**Q: Can I force a skill to be re-added after ignoring it?**

A: Yes, remove it from `ignored_skills` and run sync again.

**Q: What if sync fails to add a skill?**

A: Check the error output. Common issues: skill doesn't exist in framework, permission issues, or corrupted framework files.

---

## Related Documentation

- [Sync Process](./SYNC_PROCESS.md) - Detailed sync algorithm
- [Skill Registry](../utils/skill-registry.js) - Source code for skill organization
- [Agent Generation](../utils/agent-generation.js) - How agents are created

---

**Last Updated**: 2026-03-13
**Framework Version**: 2.0+
