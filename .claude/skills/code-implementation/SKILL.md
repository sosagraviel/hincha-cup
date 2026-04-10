---
name: code-implementation
description: Language-aware code implementation orchestrator. Use when asked to "implement this feature", "write the code", or "implement the plan". Detects project stack, spawns appropriate implementer agent, and coordinates the implementation workflow.
argument-hint: '[JIRA-KEY or path/to/plan.md]'
---

# Code Implementation Orchestrator

High-level orchestrator that coordinates the implementation workflow by detecting the project stack and delegating to specialized implementer agents.

## Purpose

This skill orchestrates code implementation by:

1. **Loading the implementation plan** from `/analyze-requirements`
2. **Detecting the project stack** (language, framework, database)
3. **Spawning the appropriate implementer agent** (implementer-typescript, implementer-python, etc.)
4. **Monitoring implementation progress** and handling errors
5. **Running quality checks** after implementation completes

**Input:** Implementation plan (from `/analyze-requirements`) or Jira key
**Output:** Complete implementation ready for quality checks and PR creation

## When to Use

Activate this skill when:

- After creating an implementation plan with `/analyze-requirements`
- User requests "implement the feature" or "write the code"
- Ready to start coding based on requirements
- Need to create/modify multiple files following a plan
- Want stack-specific best practices automatically applied

## Workflow

### Phase 1: Load Implementation Plan

First, ensure an implementation plan exists:

1. **Check for plan file**: Look for `/tmp/plan_{JIRA_KEY}.md` or plan file path provided
2. **Load plan if missing**: If no plan exists, run `/analyze-requirements {JIRA_KEY}` first
3. **Read plan contents**: Load the complete plan into context

**If plan is missing:**

```
User must run /analyze-requirements first. Prompt them:
"Implementation plan not found. Running /analyze-requirements {JIRA_KEY} first..."
```

**Plan structure should include:**

- Summary of changes
- Files to create (with descriptions)
- Files to modify (with changes needed)
- Files to delete (if any)
- Implementation steps in order
- Design decisions and rationale
- Edge cases to handle
- Testing requirements

### Phase 2: Detect Project Stack

Detect the primary language and framework to spawn the correct implementer agent.

**Detection logic:**

**Python projects:**

- Indicators: `pyproject.toml`, `setup.py`, `requirements.txt`, `*.py` files
- Frameworks: FastAPI (`"fastapi"` in dependencies), Django (`"django"`), Flask (`"flask"`)
- Stack name: `python`

**TypeScript/JavaScript projects:**

- Indicators: `package.json`, `tsconfig.json`, `*.ts` or `*.tsx` files
- Frameworks: Next.js (`"next"`), React (`"react"`), NestJS (`"nestjs"`), Express (`"express"`)
- Stack name: `typescript` or `javascript`

**Other languages (future):**

- Java: `pom.xml`, `build.gradle` → `java`
- Go: `go.mod` → `go`
- Ruby: `Gemfile` → `ruby`
- PHP: `composer.json` → `php`

**If stack detection fails:**

- Prompt user: "Cannot detect project language. Supported: TypeScript, Python. Please specify: --stack typescript|python"
- Exit and ask for manual stack specification

### Phase 3: Spawn Implementer Agent

Based on detected stack, spawn the appropriate implementer agent:

**For TypeScript projects:**

```bash
# Spawn implementer-typescript agent
claude-code agents run implementer-typescript
```

**For Python projects:**

```bash
# Spawn implementer-python agent
claude-code agents run implementer-python
```

**Pass context to agent:**

- Implementation plan file path
- Jira key (if applicable)
- Detected framework
- Any specific requirements from original user request

**Agent responsibilities** (defined in implementer templates):

- Follow the implementation plan exactly
- Write quality code with proper types/hints
- Match existing project conventions
- Search for reusable code before creating new functions
- Handle errors appropriately
- Run linting and type checking
- Document design decisions

### Phase 4: Monitor Implementation Progress

While the implementer agent is running:

1. **Track file operations**: Monitor which files are created/modified
2. **Check for errors**: Watch for compilation errors, lint errors, import issues
3. **Validate progress**: Ensure agent is following the plan steps in order
4. **Handle blockers**: If agent gets stuck, provide guidance or escalate

**Common issues to watch for:**

- Circular import dependencies
- Missing dependencies (need to install packages)
- Type errors that require design decisions
- Compilation failures
- Files not found (wrong paths)

**Error handling:**

- Max 3 retry attempts for compilation errors
- If agent makes reasonable design decision due to ambiguity, accept it
- Document all decisions in code comments
- If blocked beyond 3 retries, escalate to user for clarification

### Phase 5: Verify Implementation Completeness

After implementer agent finishes:

**Check all planned files were handled:**

```
For each file in "Files to Create" section:
  - Verify file exists
  - Verify file has content (not empty stub)

For each file in "Files to Modify" section:
  - Verify modifications were made
  - Check git diff to confirm changes

For each file in "Files to Delete" section:
  - Verify file was removed (or flag for manual review)
```

**Language-specific verification:**

**Python:**

- Run: `python -m py_compile {file}` for each new .py file
- Verify no syntax errors
- Check type hints are present (if project uses them)

**TypeScript:**

- Run: `npx tsc --noEmit` to verify compilation
- Check no type errors
- Verify imports resolve correctly

**If verification fails:**

- Identify missing files or errors
- Ask implementer agent to fix issues
- Re-run verification
- Max 2 verification retry attempts

### Phase 6: Run Quality Checks

Once implementation is verified complete:

1. **Linting**: Run project's linter (`eslint`, `ruff`, etc.)
2. **Type checking**: Run type checker (`tsc`, `mypy`, etc.)
3. **Code formatting**: Run formatter (`prettier`, `black`, etc.)
4. **Import validation**: Check no circular imports, all imports resolve

**For TypeScript/JavaScript:**

```bash
pnpm run lint:check     # or npm run lint
pnpm run type:check     # or npx tsc --noEmit
pnpm run format:check   # or npx prettier --check
```

**For Python:**

```bash
ruff check .            # or flake8
mypy .                  # type checking
black --check .         # formatting
```

**If quality checks fail:**

- Fix automatically if possible (run formatters, auto-fix linters)
- Ask implementer agent to fix remaining issues
- Document any intentional deviations from style guide
- Max 2 fix attempts before escalating

### Phase 7: Prepare for Next Phase

After successful implementation and quality checks:

1. **Summarize changes**: List all files created/modified/deleted
2. **Highlight design decisions**: Note any ambiguities resolved and how
3. **Report next steps**: Recommend running `/tester-unit` or `/code-quality-check`
4. **Save implementation log**: Store summary in `/tmp/implementation_{JIRA_KEY}.log`

**Output summary format:**

```markdown
# Implementation Complete: {JIRA_KEY}

## Stack Detected

- Language: {typescript|python}
- Framework: {nestjs|fastapi|react|etc}

## Files Changed

### Created

- path/to/file1.ts - Description
- path/to/file2.ts - Description

### Modified

- path/to/existing.ts - Changes made

### Deleted

- path/to/old.ts - Reason for deletion

## Design Decisions

1. Decision: Choice made when plan was ambiguous
   - Rationale: Why this choice
   - Documented in: file.ts:123

## Quality Checks

- ✓ Linting: Passed
- ✓ Type checking: Passed
- ✓ Formatting: Passed
- ✓ Imports: All resolve correctly

## Next Steps

1. Run unit tests: /tester-unit {JIRA_KEY}
2. Run integration tests: /tester-integration {JIRA_KEY}
3. Security review: /security-review
4. Create PR: /create-pr {JIRA_KEY}
```

## Stack-Specific Patterns

### TypeScript Projects

**Conventions to follow:**

- Use explicit return types on exported functions
- Prefer `interface` over `type` for object shapes (unless union types needed)
- Use `import type` for type-only imports
- Follow existing component patterns (React.FC vs function components)
- Match existing file naming (PascalCase vs kebab-case)

**Quality tools:**

- ESLint with `--max-warnings=0`
- TypeScript compiler in strict mode
- Prettier for formatting

### Python Projects

**Conventions to follow:**

- Use type hints on all function parameters and returns
- Use `from __future__ import annotations` for forward references
- Follow existing docstring style (Google vs Sphinx)
- Match async/await patterns if project uses them
- Use Pydantic for validation if project uses it

**Quality tools:**

- Ruff for linting
- Mypy for type checking
- Black for formatting

## Error Handling

### Missing Plan File

```
Error: Implementation plan not found

Resolution:
1. Check if /tmp/plan_{JIRA_KEY}.md exists
2. If not, run: /analyze-requirements {JIRA_KEY}
3. Once plan exists, retry /code-implementation {JIRA_KEY}
```

### Stack Detection Failed

```
Error: Cannot detect project language

Resolution:
1. Ensure you're in project root directory
2. Look for package.json (TypeScript) or pyproject.toml (Python)
3. If multi-language project, specify: --stack typescript|python
4. If unsupported language, request new implementer agent template
```

### Implementer Agent Not Found

```
Error: Implementer agent 'implementer-{stack}' not found

Resolution:
1. Check .claude/agents/ directory
2. Verify agent file exists: implementer-{stack}.md
3. If missing, project may not be initialized
4. Run: /initialize-project to set up agents
```

### Compilation Errors After Implementation

```
Error: TypeScript compilation failed after implementation

Resolution:
1. Review type errors from tsc output
2. Ask implementer agent to fix type issues
3. If ambiguous type needed, make reasonable choice
4. Document choice in code comment
5. Max 3 retry attempts
```

### Verification Failed

```
Error: Not all planned files were created

Resolution:
1. Identify missing files from plan
2. Check implementer agent logs for errors
3. Ask agent to create missing files
4. If persistent failure, escalate to user
```

## Best Practices

### 1. Always Load Plan First

**Good:**

- Check for plan file existence
- Load complete plan into context
- Pass plan to implementer agent

**Bad:**

- Start coding without a plan
- Make up requirements as you go
- Skip planning phase

### 2. Let Specialized Agents Handle Details

**Good:**

- Detect stack, spawn correct implementer agent
- Let agent make framework-specific decisions
- Trust agent to follow best practices

**Bad:**

- Try to implement code in this orchestrator skill
- Override implementer agent's decisions
- Mix generic and specialized logic

### 3. Verify Before Progressing

**Good:**

- Check all files created/modified
- Run compilation and linting
- Confirm implementation matches plan

**Bad:**

- Skip verification step
- Assume implementation is complete
- Move to next phase without checking

### 4. Document Design Decisions

**Good:**

- Note any ambiguities encountered
- Document resolution in code comments
- Report decisions in implementation summary

**Bad:**

- Make silent assumptions
- Skip documentation
- Leave decisions unexplained

## Integration with Workflow

This skill is part of the complete SDLC workflow:

```
1. /fetch-ticket-context {JIRA_KEY}
   ↓
2. /analyze-requirements {JIRA_KEY}
   ↓
3. /code-implementation {JIRA_KEY}  ← THIS SKILL
   ↓
4. /tester-unit {JIRA_KEY}
   ↓
5. /tester-integration {JIRA_KEY}
   ↓
6. /code-quality-check
   ↓
7. /security-review
   ↓
8. /create-pr {JIRA_KEY}
```

## Examples

### Example 1: TypeScript Feature Implementation

**Input:**

```bash
/code-implementation PROJ-123
```

**Execution:**

```
Loading implementation plan: /tmp/plan_PROJ-123.md
Detected stack: typescript (nestjs)
Spawning agent: implementer-typescript

Implementer agent working:
  ✓ Created src/modules/oauth/service/oauth.service.ts
  ✓ Created src/modules/oauth/controller/oauth.controller.ts
  ✓ Modified src/modules/user/service/user.service.ts
  ✓ Created packages/shared/src/dtos/oauth.dto.ts

Running quality checks:
  ✓ ESLint: Passed (0 warnings)
  ✓ TypeScript: Compiled successfully
  ✓ Prettier: All files formatted
  ✓ Imports: All resolve correctly

Implementation complete!
Next: /tester-unit PROJ-123
```

### Example 2: Python Feature Implementation

**Input:**

```bash
/code-implementation API-456
```

**Execution:**

```
Loading implementation plan: /tmp/plan_API-456.md
Detected stack: python (fastapi)
Spawning agent: implementer-python

Implementer agent working:
  ✓ Created src/features/profile/provider.py
  ✓ Created src/features/profile/models.py
  ✓ Created src/features/profile/routes.py
  ✓ Modified src/api/main.py (added profile routes)
  ✓ Created tests/test_profile.py

Running quality checks:
  ✓ Ruff: Passed (0 errors)
  ✓ Mypy: Type checking passed
  ✓ Black: All files formatted

Implementation complete!
Next: /tester-unit API-456
```

## Troubleshooting

**Issue: "Implementer agent gets stuck on compilation error"**

- Solution: Review error message, provide guidance to agent
- Max 3 retries, then escalate to user if still failing

**Issue: "Files created but don't match plan"**

- Solution: Re-read plan, ask agent to correct implementation
- Verify agent understood requirements correctly

**Issue: "Quality checks fail after implementation"**

- Solution: Auto-fix what's possible (formatting, auto-fix lint rules)
- Ask agent to fix remaining issues manually
- Max 2 fix attempts

**Issue: "Cannot detect stack in multi-language project"**

- Solution: User must specify dominant stack: --stack typescript|python
- Or implement feature in each language separately

## References

- Planner Agent: `.claude/agents/planner.md`
- Implementer Agents: `.claude/agents/implementer-*.md`
- Stack Detection: `.claude/skills/initialize-project/SKILL.md`
- Analyze Requirements: `.claude/skills/analyze-requirements/SKILL.md`
- Code Quality: `.claude/skills/code-quality-check/SKILL.md`
