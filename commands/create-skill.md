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

When creating skills for this framework, follow these conventions:
- Place skills under the appropriate `skills/{NNN-category}/` directory
- Use the frontmatter schema: name, description, version, category, keywords, allowed-tools, last_updated
- Register new skills in `skills/skills.config.json`
- Follow the existing skill structure (SKILL.md + optional agents/, references/, scripts/, assets/)

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
