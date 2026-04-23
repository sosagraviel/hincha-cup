# Phase 5: Instruction File Generation

## Objective

Update the Phase 3 synthesis and Phase 4 extraction to generate provider-specific instruction files: `CLAUDE.md` for Claude or `AGENTS.md` for Codex.

## Why This Phase Exists

Claude Code reads `CLAUDE.md` for project context and instructions. Codex CLI reads `AGENTS.md` for the same purpose. While the core content is similar (tech stack, file placement, commands), the format and conventions differ:

- **CLAUDE.md**: Follows Claude Code's expected structure with `# ProjectName`, `## Tech Stack`, `## File Placement`, `## Essential Commands`
- **AGENTS.md**: Follows Codex's conventions. Can include any instructions but should follow Codex's discovery pattern and size constraints (32 KiB default cap).

The Phase 3 synthesis agent generates the instruction file content. The Phase 4 extractor writes it. Both need to be provider-aware.

## Dependencies

- Phase 1 (Provider types)
- Phase 4 (Provider-aware paths)

## Steps

### Step 5.1: Update Phase 3 Synthesis Prompts

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/prompts/agent.md`

**Why:** The Phase 3 synthesizer agent is told to produce `# CLAUDE.md Content`. It must produce content appropriate for the active provider.

The synthesis prompt needs to be parameterized. The synthesis node should inject a variable telling the agent which format to produce.

**Option A (preferred):** Modify the Phase 3 node to inject the target instruction file name into the prompt:

```typescript
// In synthesis.node.ts, when building the prompt:
const instructionFileName = getInstructionFileName(); // 'CLAUDE.md' or 'AGENTS.md'
const prompt = originalPrompt.replace(
  /CLAUDE\.md/g,
  instructionFileName
);
```

**Option B:** Keep the synthesis output format-agnostic and transform during extraction.

**Decision: Option A** because it's simpler and the synthesizer produces better content when it knows the target format.

### Step 5.2: Update Synthesis Extraction Markers

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/validators/extract-synthesis-markdown.ts`

**Why:** The extraction regex looks for `# CLAUDE.md Content` as a section marker. Must also recognize `# AGENTS.md Content`.

```typescript
// Current pattern:
const claudemdMatch = content.match(/# CLAUDE\.md Content/);

// Updated pattern (accept either):
const instructionFileMatch = content.match(/# (?:CLAUDE\.md|AGENTS\.md) Content/);
```

### Step 5.3: Update Synthesis Validators

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/validators/validate-claude-md-content.ts`

**Why:** The validator checks for CLAUDE.md-specific structure. For AGENTS.md, the structure expectations may differ slightly.

Rename the function to be provider-agnostic:

```typescript
/**
 * Validate instruction file content structure and quality
 * Works for both CLAUDE.md and AGENTS.md
 */
export function validateInstructionFileContent(content: string, provider?: Provider): string[] {
  const errors: string[] = [];
  const fileName = provider === Provider.CODEX ? 'AGENTS.md' : 'CLAUDE.md';
  const lines = content.split('\n');

  // Common validations (both providers)
  const hasProjectHeading = lines.some((line) => /^# [a-zA-Z]/.test(line.trim()));
  if (!hasProjectHeading) {
    errors.push(`${fileName} MISSING PROJECT NAME HEADING`);
  }

  const requiredSections = ['Tech Stack', 'File Placement', 'Essential Commands'];
  // ... same logic, just using fileName in messages ...

  // Provider-specific validations
  if (provider === Provider.CODEX) {
    // AGENTS.md should be under 32 KiB (Codex default cap)
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    if (sizeBytes > 32768) {
      errors.push(
        `${fileName} exceeds Codex's default 32 KiB limit (${(sizeBytes / 1024).toFixed(1)} KiB). ` +
        `Consider condensing or increase project_doc_max_bytes in Codex config.`
      );
    }
  }

  return errors;
}
```

### Step 5.4: Update Synthesis Hook

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/hooks/validate-synthesis.hook.ts`

**Why:** The stop hook validates synthesis output. It references `CLAUDE.md` in error messages and section detection.

Update to use the active provider's instruction file name.

### Step 5.5: Update Phase 3 Error Formatting

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/validators/format-errors-for-agent.ts`

**Why:** Error messages reference `CLAUDE.md` by name. Must use the correct provider file name.

### Step 5.6: AGENTS.md Content Differences

**Why this matters:** While the structure is similar, there are important differences in what AGENTS.md should contain vs CLAUDE.md:

| Section | CLAUDE.md | AGENTS.md | Notes |
|---------|----------|-----------|-------|
| Project heading | `# ProjectName` | `# ProjectName` | Same |
| Tech Stack | `## Tech Stack` | `## Tech Stack` | Same |
| File Placement | `## File Placement Guide` | `## File Placement Guide` | Same |
| Commands | `## Essential Commands` | `## Essential Commands` | Same |
| Key Conventions | `## Key Conventions` | `## Key Conventions` | Same |
| Tool permissions | Claude tool names (Read, Write, Edit, Bash, Grep, Glob) | Codex tool names (shell, file_read, file_write, etc.) | Different tool naming |
| MCP references | `.claude/mcp.json` | MCP via `codex mcp add` | Different config mechanism |

The synthesizer should produce content that uses the correct tool names and config paths for the target provider. This is handled by injecting provider context into the prompt (Step 5.1).

### Step 5.7: Add Provider Context to Synthesis Prompt

**File to modify:** `orchestration/src/nodes/initialize-project/phase3/prompts/execution-instructions.md`

**Why:** The execution instructions tell the synthesizer what format to produce. Must include provider-specific guidance.

Add a conditional section:

```markdown
## Target Provider: {{PROVIDER_NAME}}

{{#if IS_CLAUDE}}
Generate a CLAUDE.md file following Claude Code conventions:
- Use Claude tool names: Read, Write, Edit, Bash, Grep, Glob
- Reference .claude/ directory for configuration
- Include Claude-specific hooks guidance if applicable
{{/if}}

{{#if IS_CODEX}}
Generate an AGENTS.md file following Codex CLI conventions:
- Use Codex tool names: shell, file operations are auto-managed
- Reference .codex/ directory for configuration
- Keep content under 32 KiB (Codex default size cap)
- Do not reference Claude-specific features (hooks in settings.json, --tools flag)
{{/if}}
```

## Files Modified

| Action | File | Why |
|--------|------|-----|
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts` | Inject provider name into prompt |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/prompts/agent.md` | Parameterize instruction file name |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/prompts/execution-instructions.md` | Add provider-specific guidance |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/validators/extract-synthesis-markdown.ts` | Accept both CLAUDE.md and AGENTS.md markers |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/validators/validate-claude-md-content.ts` | Rename to provider-agnostic, add AGENTS.md size check |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/validators/format-errors-for-agent.ts` | Use dynamic file name in messages |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/hooks/validate-synthesis.hook.ts` | Use dynamic file name |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/validators/types.ts` | Update type names if needed |
| MODIFY | `orchestration/src/nodes/initialize-project/phase3/validators/index.ts` | Export updated validators |

## Acceptance Criteria

1. When provider is Claude, synthesis produces `# CLAUDE.md Content` section (existing behavior)
2. When provider is Codex, synthesis produces `# AGENTS.md Content` section
3. Extraction correctly handles both section markers
4. Validation works for both file formats
5. AGENTS.md content stays under 32 KiB
6. Error messages reference the correct file name for the active provider

## Notes for Implementer

- The Phase 3 synthesis is an LLM call. The agent prompt is at `orchestration/src/nodes/initialize-project/phase3/prompts/agent.md`. The execution instructions are at `orchestration/src/nodes/initialize-project/phase3/prompts/execution-instructions.md`.
- The prompt builder at `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` may need updates to pass provider context.
- The synthesis node builds the prompt at `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts`. Look for where it assembles the prompt from agent.md + execution-instructions.md + Phase 1/2 outputs.
- Keep backward compatibility: the extraction should work with BOTH section markers so that cached/persisted synthesis outputs from prior runs still work.
- The 32 KiB limit for AGENTS.md is configurable in Codex via `project_doc_max_bytes`. Our validation should warn, not error, if slightly over.
