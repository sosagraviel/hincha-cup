# Phase 8: Implement-Ticket Integration

## Objective

Update the implement-ticket skill and its supporting services to work with both Claude and Codex providers.

## Why This Phase Exists

The implement-ticket is the primary development workflow. Per CLAUDE.md, the active implementation is the skill at `skills/020-development-workflow/implement-ticket/SKILL.md` (not the orchestration workflow). This skill:
- Reads from `.claude/framework-config.json` and `.claude/CLAUDE.md`
- Spawns planner and implementer agents from `.claude/agents/`
- Saves artifacts to `.claude-temp/tickets/`
- References Claude-specific tool names in its instructions

All these paths and references must be provider-aware.

## Dependencies

- Phase 1-6 (all foundational phases)

## Steps

### Step 8.1: Update Implement-Ticket Skill

**File to modify:** `skills/020-development-workflow/implement-ticket/SKILL.md`

**Why:** This skill is the user-facing workflow definition. It contains:
- Hardcoded `.claude-temp/` artifact paths
- References to Claude-specific tools (Read, Write, Edit, Bash, Grep, Glob)
- References to `.claude/` configuration paths

**Changes:**

1. Replace hardcoded `.claude-temp/` with a provider-aware convention:
```markdown
## Artifact Storage
- Claude: `.claude-temp/tickets/<TICKET_ID>/artifacts/`
- Codex: `.codex-temp/tickets/<TICKET_ID>/artifacts/`
- Use the active provider's temp directory
```

2. Tool name references should be provider-agnostic where possible, or conditional:
```markdown
## Tool Usage
Use the available tools to read and modify files. The exact tool names depend on your provider.
```

3. Agent references should use the provider's config directory:
```markdown
## Agent Files
- Planner: `<config-dir>/agents/planner.md`
- Implementer: `<config-dir>/agents/implementer-{lang}.md`
```

**Important note:** Since the SKILL.md is read by Claude Code or Codex CLI directly, and both have different tool sets, the skill should use language that works with either. Claude tools (Read, Write, Edit, Bash, Grep, Glob) and Codex tools (shell, file operations) are different names for similar capabilities.

### Step 8.2: Update Project Config Reader Service

**File to modify:** `orchestration/src/services/implement-ticket/project-config-reader.service.ts`

**Why:** Lines 61, 106, 418, 427-429 hardcode `.claude/` paths.

```typescript
// Line 61: const configPath = join(this.projectPath, '.claude', 'framework-config.json');
// Change to:
const configPath = resolveFrameworkConfigPath(this.projectPath);

// Line 106: const claudeMdPath = join(this.projectPath, '.claude', 'CLAUDE.md');
// Change to:
const instructionFilePath = resolveInstructionFilePath(this.projectPath);

// Lines 427-429: validation of required files
// Update to use provider-aware paths
```

### Step 8.3: Update Implement-Ticket Shared Utils

**File to modify:** `orchestration/src/services/implement-ticket/shared/index.ts`

**Why:** Line 100 hardcodes `join(projectPath, '.claude/agents', agentFile)`.

```typescript
// Change to:
return resolveConfigPath(projectPath, 'agents', agentFile);
```

### Step 8.4: Update Implement-Ticket State Schema

**File to modify:** `orchestration/src/state/schemas/implement-ticket.schema.ts`

**Why:** Comments reference `.claude/CLAUDE.md` and `.claude/framework-config.json`. Update comments and add provider field.

```typescript
provider: z.enum(['claude', 'codex']).optional().default('claude'),
stack_profile: z.any(),       // From <config-dir>/instruction-file
framework_config: z.any(),    // From <config-dir>/framework-config.json
```

### Step 8.5: Update Implement-Ticket CLI Entry Point

**File to modify:** `orchestration/src/cli/implement.ts`

**Why:** Same as initialize.ts - needs `--provider` flag and provider auto-detection.

Add the same provider selection logic as Phase 7 Step 7.1.

### Step 8.6: Update Figma Export Service

**File to modify:** `orchestration/src/services/implement-ticket/figma-export.service.ts`

**Why:** Lines 10, 139, 215 reference `.claude/mcp.json` for MCP configuration. Codex uses a different MCP configuration mechanism.

```typescript
// Line 215: const mcpConfigPath = join(this.projectPath, '.claude', 'mcp.json');
// Change to:
const mcpConfigPath = resolveConfigPath(this.projectPath, 'mcp.json');
// Note: Codex MCP is configured via `codex mcp add`, not a JSON file.
// May need provider-specific handling here.
```

### Step 8.7: Update Other Implement-Ticket Skills

**Files to check and update:**
- `skills/020-development-workflow/architect-agent/` - template workspaces reference `.claude/`
- `skills/020-development-workflow/create-pr/` - may reference `.claude-temp/`
- `skills/020-development-workflow/pr-reviewer/` - may reference Claude-specific patterns

For each, replace hardcoded `.claude/` with provider-agnostic language.

### Step 8.8: Update Architect Agent Templates

**Files to modify:**
- `skills/020-development-workflow/architect-agent/templates/code-agent-workspace/CLAUDE.md`
- `skills/020-development-workflow/architect-agent/templates/architect-workspace/CLAUDE.md`

**Why:** These are template CLAUDE.md files for architect workspaces. For Codex, they should be AGENTS.md files.

**Approach:** Create parallel AGENTS.md versions, or make the template rendering provider-aware.

### Step 8.9: Update Implement-Ticket Bash Launcher

**File to modify:** `scripts/implement-ticket.sh`

**Why:** Same as initialize-project.sh - needs `--provider` flag passthrough.

## Files Modified

| Action | File | Why |
|--------|------|-----|
| MODIFY | `skills/020-development-workflow/implement-ticket/SKILL.md` | Provider-agnostic tool/path references |
| MODIFY | `orchestration/src/services/implement-ticket/project-config-reader.service.ts` | Provider-aware paths |
| MODIFY | `orchestration/src/services/implement-ticket/shared/index.ts` | Provider-aware agent paths |
| MODIFY | `orchestration/src/state/schemas/implement-ticket.schema.ts` | Add provider field |
| MODIFY | `orchestration/src/cli/implement.ts` | Add --provider flag |
| MODIFY | `orchestration/src/services/implement-ticket/figma-export.service.ts` | Provider-aware MCP path |
| MODIFY | `skills/020-development-workflow/architect-agent/templates/*/CLAUDE.md` | Provider-aware templates |
| MODIFY | `scripts/implement-ticket.sh` | --provider flag passthrough |
| CHECK | `skills/020-development-workflow/create-pr/` | Provider references |
| CHECK | `skills/020-development-workflow/pr-reviewer/` | Provider references |

## Acceptance Criteria

1. `./scripts/implement-ticket.sh TICKET-123 --provider codex` works end-to-end
2. The skill reads config from `.codex/` when provider is Codex
3. Artifacts are saved to `.codex-temp/` when provider is Codex
4. Agent files are read from `.codex/agents/` when provider is Codex
5. The planner and implementer agents are spawned via Codex CLI when provider is Codex
6. MCP configuration is handled correctly for both providers
7. Architect agent templates work with both providers

## Notes for Implementer

- The SKILL.md at `skills/020-development-workflow/implement-ticket/SKILL.md` is the user-invokable skill, NOT the orchestration workflow. It's read directly by Claude Code / Codex CLI.
- Tool names differ: Claude has `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`. Codex has `shell` for most operations. The skill should use natural language descriptions of actions rather than specific tool names where possible.
- The `project-config-reader.service.ts` is the service that reads `.claude/framework-config.json` at runtime. It needs the most changes.
- The Figma MCP integration (figma-export.service.ts) needs special handling because Claude and Codex configure MCP differently.
- Test the full implement-ticket flow with a real Jira ticket using both providers.
