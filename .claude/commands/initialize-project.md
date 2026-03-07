# Initialize Project - Deep Codebase Analysis & Configuration Generator

Deep codebase analysis and Claude Code configuration generator. Spawns parallel haiku analyzers then an opus architect to produce CLAUDE.md and a project-context skill. Use on any new or legacy codebase.

## Usage

```bash
/initialize-project [project-path]
```

**Arguments:**
- `project-path` (optional): Path to the project directory. Defaults to current working directory.

## What This Does

This command performs a complete 5-phase workflow to analyze your codebase and configure Claude Code:

1. **Phase 1**: Launch 4 parallel analysis agents to explore different aspects of your codebase
2. **Phase 2**: Consolidate findings and ask clarifying questions
3. **Phase 3**: Synthesize architecture with an Opus agent
4. **Phase 4**: Write `.claude/CLAUDE.md` and `.claude/skills/project-context/SKILL.md`
5. **Phase 5**: Detect stack, copy relevant skills, generate custom agents

## Output

After completion, you'll have:

- `.claude/CLAUDE.md` - Commands, conventions, and stack information
- `.claude/skills/project-context/SKILL.md` - Hard-to-discover flows and patterns
- `.claude/skills/` - Stack-specific skills automatically installed
- `.claude/agents/` - Custom agents for your stack (planner, implementers, testers)

## Implementation

To run this command, use the Skill tool to invoke the `initialize-project` skill:

```typescript
Skill({ skill: "initialize-project" })
```

The skill will handle all 5 phases autonomously and guide you through the process.

## Example

```bash
# Initialize current project
/initialize-project

# Initialize specific project
/initialize-project /path/to/my/project
```

## Next Steps After Initialization

1. Load project context: `/project-context`
2. Start working on tickets: `/implement-ticket <ticket-id>`
3. Review installed skills: `ls .claude/skills/`
4. Review generated agents: `ls .claude/agents/`

## Requirements

- Must be run from a project directory (or specify path)
- Project should ideally be a git repository
- Requires access to the internet for AI-powered analysis

## See Also

- `/start-task` - Create isolated worktree for parallel development
- `/implement-ticket` - Implement a ticket using AI agents
