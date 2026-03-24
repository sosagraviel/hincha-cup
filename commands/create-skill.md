---
name: create-skill
description: Create, improve, evaluate, and benchmark skills using the skill-creator workflow
---

# /create-skill

Create new skills, improve existing skills, and measure skill performance with structured evaluations.

## Usage

```bash
/create-skill [ACTION] [OPTIONS]
```

### Actions

- `create` - Create a new skill from scratch
- `improve` - Improve an existing skill's instructions or description
- `evaluate` - Run structured evaluation against a skill
- `benchmark` - Run comparative benchmarks between skill versions

### Examples

### Example 1: Create a new skill
```bash
/create-skill create --name my-new-skill --category development-workflow
```

### Example 2: Improve an existing skill
```bash
/create-skill improve --skill-path skills/020-development-workflow/create-sdd-ticket
```

### Example 3: Evaluate a skill
```bash
/create-skill evaluate --skill-path skills/030-quality-assurance/code-quality-check
```

### Example 4: Benchmark skill versions
```bash
/create-skill benchmark --skill-path skills/020-development-workflow/implement-ticket
```

## Workflow

### Phase 1: Input Parsing
- Detect action mode (create/improve/evaluate/benchmark)
- Validate arguments and paths
- Load existing skill if applicable

### Phase 2: Execution
- **Create**: Capture user intent, interview for requirements, generate SKILL.md following framework conventions, register in skills.config.json
- **Improve**: Analyze current skill, identify weaknesses, generate improved version with structured iteration
- **Evaluate**: Run eval suite with analyzer/comparator/grader agents from the skill-creator toolkit
- **Benchmark**: Compare versions with blind evaluation and variance analysis

### Phase 3: Output
- Write skill files to appropriate `skills/{NNN-category}/` directory
- Update `skills/skills.config.json` registration
- Generate evaluation reports (if evaluate/benchmark)

## Framework Conventions

All skills created through this command MUST comply with the framework's specification and conventions. The skill-creator skill reads and applies these documents automatically:

### Required References

| Document | Path | Purpose |
|----------|------|---------|
| **Skills Specification** | `docs/SKILLS_SPEC.md` | Canonical authoring contract: frontmatter schema, archetypes, validation rules, anti-patterns |
| **Adding Skills Guide** | `docs/ADDING_SKILLS.md` | Registration procedure for `skills/skills.config.json` |
| **Workflow Template** | `docs/templates/SKILL_TEMPLATE_WORKFLOW.md` | Starter template for workflow/orchestration skills |
| **Reference Template** | `docs/templates/SKILL_TEMPLATE_REFERENCE.md` | Starter template for reference/mastery skills |
| **Skills Config** | `skills/skills.config.json` | Runtime skill registry — every skill must be registered here |
| **Skill Catalog** | `SKILL_CATALOG.md` | Framework-wide catalog — update after adding a new skill |

### Key Rules

- Place skills under `skills/{NNN-category}/{skill-name}/` using the Johnny Decimal system
- Frontmatter must include: `name`, `description` (with "Use when..." phrases), `version`, `category`, `keywords`, `allowed-tools`, `last_updated`
- Choose one archetype: **Workflow** (numbered phases) or **Reference** (Quick Start + Core Concepts)
- Register in `skills/skills.config.json` with `trigger_mode` and optional `triggers`
- Keep `SKILL.md` under 500 lines — move detailed content to `references/` subdirectory

## Integration with Other Skills

- **project-context**: Consulted for framework conventions during skill creation
- **code-quality-check**: Can validate generated skill code

## Prerequisites

- Python 3.x (for evaluation scripts)
- Framework repository cloned locally

## Output Format

```
Skill: skill-name
Location: skills/{category}/{skill-name}/SKILL.md
Registry: Updated skills/skills.config.json

[Additional details based on action]
```

---

**Version**: 1.0.0
**Last Updated**: 2026-03-24
**Category**: development-workflow
