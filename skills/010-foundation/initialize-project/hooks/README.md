# Validation Hooks

This directory contains validation hooks for the initialize-project skill. Hooks enforce quality standards at critical workflow boundaries.

## Hook Types

### 1. SubagentStop Hook
**File**: `validate-subagent-output.py`
**Trigger**: When analyzer agents complete
**Purpose**: Validates JSON output format and checks for quality issues

**Exit Codes**:
- `0` - Validation passed, allow continuation
- `2` - Validation failed, block continuation

**Validations**:
- Valid JSON format
- Required fields present (agent_name, timestamp, findings)
- Agent name is one of the 4 expected analyzers
- Findings is a valid object
- NEEDS_VERIFICATION count ≤ 3
- Findings not empty or sparse

### 2. TaskCompleted Hook
**File**: `validate-phase-completion.py`
**Trigger**: When a phase task completes
**Purpose**: Validates that phase outputs exist and are valid

**Exit Codes**:
- `0` - Phase completed successfully
- `2` - Phase incomplete, block continuation

**Phase Validations**:
- **Phase 1**: All 4 analyzer outputs exist
- **Phase 2**: Consolidation file exists and valid
- **Phase 3**: Synthesis output exists with section markers
- **Phase 4**: CLAUDE.md and project-context written with correct line counts
- **Phase 5**: Skills, agents, and commands copied

### 3. Stop Hook
**File**: `validate-final-state.py`
**Trigger**: At skill completion
**Purpose**: Validates all 6 phases completed and logs final metrics

**Exit Code**: `0` (informational only, doesn't block)

**Validations**:
- All 6 phases completed
- CLAUDE.md line count (30-200)
- project-context line count (50-800)
- Skills count (≥10 recommended)
- Agents count (≥3 required)

## Installation

1. **Copy settings template**:
   ```bash
   cp templates/settings.json.template PROJECT_ROOT/.claude/settings.json
   ```

2. **Update project path** in settings.json (if needed)

3. **Make hooks executable**:
   ```bash
   chmod +x hooks/*.py
   ```

4. **Ensure Python 3 is installed**:
   ```bash
   python3 --version
   ```

## Testing Hooks

### Test SubagentStop Hook

Create a test JSON file:
```bash
cat > test-analyzer-output.json <<'EOF'
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "2026-03-10T12:00:00Z",
  "findings": {
    "repository_type": "monorepo",
    "languages": ["TypeScript", "Python"],
    "frameworks": ["NestJS", "React"]
  }
}
EOF
```

Test validation:
```bash
cat test-analyzer-output.json | python3 hooks/validate-subagent-output.py
```

Expected output:
```
✓ Subagent output validation passed
```

Test with invalid JSON:
```bash
echo "not json" | python3 hooks/validate-subagent-output.py
```

Expected: Exit code 2

### Test TaskCompleted Hook

Set up test environment:
```bash
export PROJECT_PATH=/path/to/test/project
export CURRENT_PHASE=1

# Create test outputs
mkdir -p $PROJECT_PATH/.claude-temp/phase1-outputs
echo '{}' > $PROJECT_PATH/.claude-temp/phase1-outputs/01-structure-architecture.json
echo '{}' > $PROJECT_PATH/.claude-temp/phase1-outputs/02-tech-stack-dependencies.json
echo '{}' > $PROJECT_PATH/.claude-temp/phase1-outputs/03-code-patterns-testing.json
echo '{}' > $PROJECT_PATH/.claude-temp/phase1-outputs/04-data-flows-integrations.json
```

Test validation:
```bash
python3 hooks/validate-phase-completion.py
```

Expected output:
```
Validating Phase 1 completion...
✓ Phase 1 validation passed
```

### Test Stop Hook

Set up complete project structure:
```bash
export PROJECT_PATH=/path/to/test/project

# Create test files
mkdir -p $PROJECT_PATH/.claude
mkdir -p $PROJECT_PATH/.claude/skills/project-context
mkdir -p $PROJECT_PATH/.claude/agents
mkdir -p $PROJECT_PATH/.claude/commands

echo "---\n# Test\n" > $PROJECT_PATH/.claude/CLAUDE.md
echo "---\n# Test\n" > $PROJECT_PATH/.claude/skills/project-context/SKILL.md
```

Test validation:
```bash
python3 hooks/validate-final-state.py
```

Expected: Displays metrics summary

## Hook Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": { "agentName": ["structure-architecture-analyzer"] },
        "command": "python3 .claude/skills/initialize-project/hooks/validate-subagent-output.py",
        "stdin": "agentOutput"
      }
    ],
    "TaskCompleted": [
      {
        "matcher": { "taskDescription": "Phase 1: Parallel Analysis" },
        "command": "PROJECT_PATH={{project_path}} CURRENT_PHASE=1 python3 .claude/skills/initialize-project/hooks/validate-phase-completion.py"
      }
    ],
    "Stop": [
      {
        "matcher": { "skillName": "initialize-project" },
        "command": "PROJECT_PATH={{project_path}} python3 .claude/skills/initialize-project/hooks/validate-final-state.py"
      }
    ]
  }
}
```

## Debugging

Enable verbose output:
```bash
# Add debug statements in hooks
python3 -u hooks/validate-subagent-output.py 2>&1 | tee hook-debug.log
```

Check exit codes:
```bash
python3 hooks/validate-subagent-output.py
echo "Exit code: $?"
```

## Disabling Hooks

To disable a hook, set `"enabled": false` in settings.json:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": { "agentName": ["structure-architecture-analyzer"] },
        "command": "...",
        "enabled": false
      }
    ]
  }
}
```

## Hook Development

When adding new hooks:

1. Follow the exit code convention (0=pass, 2=block)
2. Print errors to stderr
3. Use environment variables for configuration
4. Add comprehensive testing documentation
5. Update settings.json template

## Troubleshooting

**Hook not triggering**:
- Check matcher configuration
- Verify hook script is executable
- Check Claude Code logs

**Hook failing unexpectedly**:
- Test hook manually with sample data
- Check Python version compatibility
- Verify all file paths are correct

**Hook blocking when it shouldn't**:
- Review validation logic
- Check for false positives
- Consider adding warnings instead of errors
