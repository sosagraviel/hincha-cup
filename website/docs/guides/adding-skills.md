---
sidebar_position: 4
title: Adding Skills
description: Extend the framework with custom skills. Skills provide AI agents with context and capabilities.
---

# Adding Skills

Extend the framework with custom skills. Skills provide AI agents with context and capabilities.

Skills are invoked the same way regardless of the target provider — only the prefix changes: `/skill-name` in Claude Code, `$skill-name` in Codex CLI. When the project is initialized for Codex, skills are written to `.codex/skills/` instead of `.claude/skills/` and the instruction file is `AGENTS.md` instead of `CLAUDE.md`; the skill definitions themselves are identical. See the [Project Structure reference](../reference/project-structure.md) for where generated skills land.

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
      "trigger_mode": "always" | "triggered" | "generated",  // Optional, defaults to "triggered"
      "triggers": ["trigger1", "trigger2"],  // ONLY for "triggered"
      "compatible_languages": ["typescript"],  // Optional
      "is_linkable_to_agents": true,  // Optional
      "agent_roles": ["planner", "implementer"]  // Optional
    }
  ]
}
```

### Field Reference

| Field | Required | Description | Impact (what it does at sync time) |
|-------|----------|-------------|------------------------------------|
| `name` | Yes | Unique identifier | Folder the skill is copied to (`.claude/skills/{name}/` or `.codex/skills/{name}/`) and the slash command users invoke (`/name`). Category nesting under `skills/` is flattened away. |
| `path` | Yes | Relative from `skills/` directory | Where the resolver reads the skill's source files. A wrong path means the skill is silently not copied. |
| `description` | Yes | Human-readable description | Catalog/config metadata only — **not** the text the agent reads (that lives in SKILL.md frontmatter). |
| `trigger_mode` | No (default `triggered`) | `always` (all projects), `triggered` (stack-based), `generated` (auto-created) | Decides **whether** the skill is copied. `always` → every project. `triggered` → only if a trigger matches the detected stack. `generated` → never copied from `skills/`; created fresh during init. |
| `triggers` | Conditional | Required for `triggered` mode. Array of stack triggers | If the end user's detected stack (`framework-config.json` → `stack_profile`) contains **any one** of these (OR logic), the skill gets copied. Ignored for `always`/`generated`. |
| `compatible_languages` | No | Languages this skill applies to | Does **not** gate copying. Routes the skill to language-specific `implementer-{lang}` agents; if omitted, the skill attaches to the generic implementer instead. |
| `is_linkable_to_agents` | No | Whether the skill is auto-attached to agents | Controls agent auto-attachment, not copying. `false` → still copied to disk and slash-invokable, but never added to any agent's frontmatter. Defaults to attached. |
| `agent_roles` | No | `planner`, `implementer`, or both | Restricts which agent roles get the skill in their frontmatter (default: both). E.g. `["implementer"]` keeps tooling skills out of the planner's preloaded context. Only applies when `is_linkable_to_agents` is not `false`. |

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

**`generated`**: Synthesized from your code during init (e.g., the convention skills `code-conventions`, `multi-file-workflows`, `testing-conventions`)
```json
{
  "name": "code-conventions",
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
- triggers, trigger_mode, compatible_languages, is_linkable_to_agents, agent_roles

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
ls /path/to/test-rust-project/.claude/skills/mastering-rust   # or .codex/skills/mastering-rust for Codex
```

---

## How Skills Load

**Process**:
1. Load `skills.config.json`
2. Read the detected project stack from `framework-config.json` → `stack_profile` (languages, frameworks, packages — written earlier during initialization)
3. Match skills:
   - `always` → include
   - `triggered` → include if triggers match stack
   - `generated` → skip (created later)
4. Copy matched skills to `.claude/skills/` (or `.codex/skills/`), flattened to `{skill-name}/`
5. Attach linkable skills to the relevant agents' frontmatter (gated by `is_linkable_to_agents` and `agent_roles`)

> Skill loading **reads** `framework-config.json` for stack matching — it does not modify it. The config is written earlier, during context generation.

**Matching logic**: `triggers` array uses OR logic - any match includes the skill.

---

## User-Facing Skills

When adding skills to your own project (not contributing to the framework):

1. **Create skill in framework**: Add to `skills/` directory
2. **Register in config**: Add entry to `skills.config.json`
3. **Re-initialize project**: Run initialization to sync skills
4. **Verify**: Check `.claude/skills/` (or `.codex/skills/`) in your project

**Example workflow**:
```bash
# Add skill to framework
cd qubika-agentic-framework
mkdir -p skills/custom/my-skill
# Create SKILL.md, update skills.config.json

# Re-initialize your project
cd /path/to/your-project
./qubika-agentic-framework/scripts/initialize-project.sh
```

---

## Troubleshooting

### Skill not syncing
1. Check `trigger_mode` matches intent
2. For `triggered`: verify triggers match project stack
3. Validate JSON: `cat skills.config.json | jq .`
4. Check detected stack: `cat .claude/framework-config.json | jq .stack_profile` (use `.codex/framework-config.json` on Codex)
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

## Best Practices

### Skill Naming
- Use descriptive names: `mastering-rust`, not `rust`
- Follow existing patterns: `mastering-{language}`, `{framework}-patterns`
- Avoid generic names: `helper`, `utils`

### Skill Content
- Include practical code examples
- Cover common patterns and best practices
- Reference official documentation
- Keep focused on specific use cases

### Trigger Selection
- Be specific with triggers
- Test with real projects
- Consider version differences
- Document trigger rationale

### Testing
- Test on multiple projects
- Verify skill syncing
- Check agent integration
- Validate content accuracy

---

## Skill Categories

Common skill categories in the framework:

| Category | Folder | Examples |
|----------|--------|----------|
| Foundation | `010-foundation` | start-task, code-conventions, testing-conventions |
| Development Workflow | `020-development-workflow` | implement-ticket, create-sdd-ticket, skill-creator, wiki-refresh |
| Quality Assurance | `030-quality-assurance` | create-pr, pr-reviewer, security-review, jest-coverage-automation |
| Integrations | `040-integrations` | jira, fetch-ticket-context, notion-document-manager, figma-design-fetcher |
| Language Frameworks | `050-language-frameworks` | mastering-typescript, mastering-python-skill, react-frontend |
| Documentation | `060-documentation` | design-doc-mermaid |
| Infrastructure | `070-infrastructure` | developing-with-docker, triage-incident |
| Cloud Platforms | `080-cloud-platforms` | mastering-aws-cdk, mastering-aws-cli, using-firebase |

**Numbering convention**: Categories are numbered in steps of 10 to allow for future expansion.

---

## Advanced: Custom Agents

Set `is_linkable_to_agents: true` to auto-attach a skill to the relevant agents' frontmatter (so it's preloaded into their context). Use `agent_roles` to scope which roles receive it; omit it to attach to both planner and implementer:

```json
{
  "name": "custom-validator",
  "path": "custom/validator",
  "description": "Custom validation logic",
  "trigger_mode": "always",
  "is_linkable_to_agents": true,
  "agent_roles": ["implementer"]
}
```

With `compatible_languages` set, the skill attaches only to the matching `implementer-{lang}` agents; without it, it attaches to the generic implementer. Skills with `is_linkable_to_agents: false` are still copied to disk and remain slash-invokable — they just aren't preloaded into any agent.
