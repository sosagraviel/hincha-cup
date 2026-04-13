# Adding Skills Guide

Extend the framework with custom skills. Skills provide AI agents with context and capabilities.

---

## Files to Touch

1. **Create skill**: `skills/{category}/{skill-name}/SKILL.md`
2. **Register skill**: `skills/skills.config.json`
3. **Test**: Run initialization on sample project

---

## skills.config.json Schema

```json
{
  "version": "1.0.0",
  "skills": [
    {
      "name": "skill-name",
      "path": "category-folder/skill-folder",
      "description": "Description",
      "trigger_mode": "always" | "triggered" | "generated",
      "triggers": ["trigger1", "trigger2"],  // ONLY for "triggered"
      "compatible_languages": ["typescript"],  // Optional
      "is_linkable_to_agents": true  // Optional
    }
  ]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (folder name in `.claude/skills/`) |
| `path` | Yes | Relative from `skills/` directory |
| `description` | Yes | Human-readable description |
| `trigger_mode` | Yes | `always` (all projects), `triggered` (stack-based), `generated` (auto-created) |
| `triggers` | Conditional | Required for `triggered` mode. Array of stack triggers |
| `compatible_languages` | No | Languages this skill supports |
| `is_linkable_to_agents` | No | Whether agents can invoke this skill |

### Trigger Modes

**`always`**: Core skills synced to all projects
```json
{
  "name": "start-task",
  "trigger_mode": "always"
}
```

**`triggered`**: Stack-specific skills (React, Jest, etc.)
```json
{
  "name": "jest-coverage-automation",
  "trigger_mode": "triggered",
  "triggers": ["jest"],
  "compatible_languages": ["typescript", "javascript"]
}
```

**`generated`**: Generated during init (e.g., project-context)
```json
{
  "name": "project-context",
  "trigger_mode": "generated"
}
```

### Common Triggers

**Languages**: `typescript`, `python`, `go`, `rust`, `java`
**Frameworks**: `react`, `next`, `vue`, `django`, `nestjs`
**Testing**: `jest`, `vitest`, `playwright`, `pytest`
**Cloud**: `aws-cdk`, `firebase`, `docker`

---

## SKILL.md Frontmatter

```markdown
---
name: "skill-name"
description: "Description for Claude"
argument-hint: "[optional-args]"  # Optional
allowed-tools: Read, Write, Bash  # Optional
---

# Skill Content

Your skill documentation here...
```

**Frontmatter fields**:
- `name`: Skill identifier
- `description`: What Claude sees (be descriptive)
- `argument-hint`: Optional usage hint
- `allowed-tools`: Optional tool restrictions

**NOT in frontmatter** (managed in skills.config.json):
- triggers, trigger_mode, compatible_languages, agents, priority

---

## Adding a New Skill

### Complete Example: Adding Rust Support

**1. Create skill directory and file**:
```bash
mkdir -p skills/050-language-frameworks/mastering-rust
```

**2. Write SKILL.md**:
```markdown
---
name: mastering-rust
description: Rust development: ownership, borrowing, async, Axum web apps, cargo ecosystem
---

# Mastering Rust

## Ownership
\`\`\`rust
fn process(data: &str) -> String {
    data.to_uppercase()
}
\`\`\`

## Web with Axum
\`\`\`rust
use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(|| async { "Hello" }));
    // ...
}
\`\`\`
```

**3. Add to skills.config.json**:
```json
{
  "skills": [
    {
      "name": "mastering-rust",
      "path": "050-language-frameworks/mastering-rust",
      "description": "Rust development patterns",
      "trigger_mode": "triggered",
      "triggers": ["rust"],
      "compatible_languages": ["rust"]
    }
  ]
}
```

**4. Test**:
```bash
# Create test project
cargo init test-rust-project

# Run initialization
cd orchestration
pnpm initialize -- -p /path/to/test-rust-project -f $(pwd)/..

# Verify
ls /path/to/test-rust-project/.claude/skills/mastering-rust
```

---

## How Skills Load

**Process**:
1. Load `skills.config.json`
2. Detect project stack (languages, frameworks, packages)
3. Match skills:
   - `always` → include
   - `triggered` → include if triggers match stack
   - `generated` → skip (created later)
4. Copy to `.claude/skills/`
5. Update `framework-config.json`

**Matching logic**: `triggers` array uses OR logic - any match includes the skill.

---

## Troubleshooting

### Skill not syncing
1. Check `trigger_mode` matches intent
2. For `triggered`: verify triggers match project stack
3. Validate JSON: `cat skills.config.json | jq .`
4. Check detected stack: `cat .claude/framework-config.json | jq .stack_profile`
5. Re-run: `DEBUG=1 pnpm initialize ...`

### Common mistakes
```json
// ❌ Wrong
{
  "trigger_mode": "trigger",  // Should be "triggered"
  "triggers": "jest"          // Should be ["jest"]
}

// ✅ Correct
{
  "trigger_mode": "triggered",
  "triggers": ["jest"]
}
```

### Path errors
- Path is relative to `skills/` directory
- Must have `SKILL.md` file
- Case-sensitive on Linux/Mac

---

**See Also**: [Skills Specification](../reference/SKILLS_SPEC.md), [Architecture](../architecture/ARCHITECTURE.md)
