# Adding Skills

Single config file. Simple trigger matching. Production-ready.

> For the full `SKILL.md` authoring contract — frontmatter schema, archetypes, validation rules, and templates — see [SKILLS_SPEC.md](SKILLS_SPEC.md).

## How It Works

**1. Stack detection** scans project → finds: `["typescript", "react", "jest"]`

**2. Skill matching** checks `utils/skills.config.json`:
```json
{
  "name": "react-frontend",
  "path": "skills/050-language-frameworks/react-frontend",
  "triggers": ["react", "nextjs"]
}
```

**3. If "react" detected** → skill copied to project

**That's it.**

## Adding a New Skill

### 1. Create Skill Directory

```bash
mkdir -p skills/050-language-frameworks/svelte-patterns
echo "# Svelte Patterns" > skills/050-language-frameworks/svelte-patterns/SKILL.md
```

### 2. Add to Config

Edit `utils/skills.config.json`, add one object:

```json
{
  "name": "svelte-patterns",
  "path": "skills/050-language-frameworks/svelte-patterns",
  "triggers": ["svelte"],
  "description": "Svelte component patterns"
}
```

**Done.** Detection auto-finds "svelte" in dependencies.

## Adding a New Language

**Example: Kotlin**

### 1. Create Skill

```bash
mkdir -p skills/050-language-frameworks/mastering-kotlin
echo "# Kotlin Patterns" > skills/050-language-frameworks/mastering-kotlin/SKILL.md
```

### 2. Add to Config

```json
{
  "name": "mastering-kotlin",
  "path": "skills/050-language-frameworks/mastering-kotlin",
  "triggers": ["kotlin"],
  "description": "Kotlin best practices"
}
```

**Done.** Stack detection reads from `framework-config.json` created during project initialization.

## Adding a New Framework

**Example: Remix**

### 1. Create Skill

```bash
mkdir -p skills/050-language-frameworks/remix-patterns
```

### 2. Add to Config

```json
{
  "name": "remix-patterns",
  "path": "skills/050-language-frameworks/remix-patterns",
  "triggers": ["remix"],
  "description": "Remix framework patterns"
}
```

**Done.** Initialize-project agents detect all frameworks automatically.

## Config File Reference

**Location:** `utils/skills.config.json`

**Structure:**
```json
{
  "skills": [
    {
      "name": "skill-name",
      "path": "skills/category/skill-name",
      "always": true,              // Optional: always copy
      "triggers": ["tech1", "tech2"],  // Optional: copy if detected
      "description": "Brief description"
    }
  ]
}
```

**Rules:**
- Either `always: true` OR `triggers: [...]` (not both)
- Triggers match ANY detected technology
- Path is relative to framework root

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

## Detection Reference

**Detection happens during:** `initialize-project` workflow

**How it works:**
1. AI agents analyze project (Phase 1-3 of initialize-project)
2. Agents detect languages, frameworks, testing tools, cloud platforms
3. Results saved to `.claude/framework-config.json` in `stack_profile`
4. All future operations read from this config

**No manual detection needed.** AI agents handle everything.

## Examples

### Always-Copied Skill

```json
{
  "name": "start-task",
  "path": "skills/010-foundation/start-task",
  "always": true,
  "description": "Task initialization workflow"
}
```

### Multi-Trigger Skill

```json
{
  "name": "jest-coverage-automation",
  "path": "skills/030-quality-assurance/jest-coverage-automation",
  "triggers": ["jest", "vitest"],
  "description": "Jest/Vitest test coverage"
}
```

### ML Library Skill

```json
{
  "name": "mastering-pytorch-rl-nlp-agentic-skill",
  "path": "skills/050-language-frameworks/mastering-pytorch-rl-nlp-agentic-skill",
  "triggers": ["pytorch", "torch", "tensorflow"],
  "description": "PyTorch ML/AI patterns"
}
```

## User Workflow

Users get skills automatically via sync:

```bash
./scripts/sync-framework-resources.sh ~/project
```

Skills matching detected stack auto-added to `.claude/skills/`.

**Ignoring skills** (in project's `framework-config.json`):
```json
{
  "ignored_skills": ["skill-name"]
}
```

## Testing

```bash
# Test stack detection
node utils/stack/cli.js ~/my-project

# Expected output:
# {
#   "languages": ["typescript"],
#   "frameworks": { "frontend": ["react"], "backend": [] },
#   "testing": ["jest"],
#   ...
# }

# Test skill resolution
node -e "
const { resolveSkills } = require('./utils/core/skill-resolver');
const detected = ['typescript', 'react', 'jest'];
const skills = resolveSkills(detected, '.');
console.log(skills.map(s => s.name));
"
```

---

**Framework Version:** 2.0+
