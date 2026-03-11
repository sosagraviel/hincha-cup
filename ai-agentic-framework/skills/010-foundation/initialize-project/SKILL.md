---
name: initialize-project
description: Initialize a project with AI Agentic Framework using deterministic workflow-orchestrated process. Works for 1000+ projects across ANY stack (TypeScript, Python, Ruby, Go, Rust, Elixir, etc.).
user-invokable: true
argument-hint: [project-path (optional, defaults to cwd)]
disable-model-invocation: true
version: 2.0.0
---

# Initialize Project (Workflow-Orchestrated v2.0)

This skill initializes a project for AI-assisted development using a **deterministic workflow** that executes **26 steps across 6 phases** programmatically.

## Architecture

**Workflow-orchestrated** (not AI-driven):
- Bash/Node scripts control execution flow
- Subagents handle analysis and synthesis
- Validation gates between every phase
- Auto-repair and retry mechanisms
- Hooks enforce quality standards

## Execution

Run the orchestration script:

```bash
bash .claude/skills/initialize-project/scripts/orchestrate-initialization.sh \
  $(pwd) \
  /Users/ignaciobarreto/itIsHere/projects/ai-agentic-framework
```

This script:
1. **Phase 1**: Launches 4 parallel analysis agents (structure, tech stack, patterns, data flows)
2. **Phase 2**: Consolidates findings, identifies gaps, asks clarifying questions
3. **Phase 3**: Invokes Opus synthesizer to generate CLAUDE.md + project-context
4. **Phase 4**: Writes files with validation (format, length, schema)
5. **Phase 5**: Copies skills, generates agents, copies commands
6. **Phase 6**: Final validation and metrics

## Key Principles

1. **Deterministic Process** - Always same 26 steps, same workflow
2. **Variable Outputs** - Content tailored per stack (Django ≠ NestJS ≠ Phoenix)
3. **Validation at Every Boundary** - Format, length, schema checks with auto-repair
4. **Retry with Feedback** - Up to 3 attempts with error context
5. **Stack Agnostic** - Supports TypeScript, Python, Go, Rust, Ruby, Elixir, Java, PHP

## Outputs

After completion:
- `.claude/CLAUDE.md` - Quick reference (100-150 lines)
- `.claude/skills/project-context/SKILL.md` - Deep knowledge (250-400 lines)
- `.claude/skills/*` - Language-specific skills (10-20 skills)
- `.claude/agents/*` - Generated agents (3-8 agents: planner, implementers, testers, reviewer)
- `.claude/commands/*` - Slash commands

## Success Metrics

- Format validation: 100% (with auto-repair)
- CLAUDE.md length: < 200 lines (95%+ under 150)
- project-context length: 250-400 lines
- Required skills linked: 100%
- Phase completion: 100% (all 6 phases)
- Time: < 180 seconds

## Troubleshooting

If initialization fails:
1. Check log: `PROJECT_PATH/.claude-temp/initialization.log`
2. Review failed output: `PROJECT_PATH/.claude-temp/failed-outputs/`
3. Retry with: `KEEP_TEMP=true bash orchestrate-initialization.sh ...`

## Technical Details

- **Orchestration**: `scripts/orchestrate-initialization.sh`
- **Validators**: `utils/validators/*.js`
- **Schemas**: `config/schemas/*.schema.json`
- **Hooks**: `hooks/*.py`
- **Agents**: `.claude/agents/*.md`

Full documentation: `TRANSFORMATION_PLAN.md`
