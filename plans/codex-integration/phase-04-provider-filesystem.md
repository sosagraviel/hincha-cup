# Phase 4: Provider-Aware File System

## Objective

Replace all hardcoded `.claude/` directory references with provider-aware path resolution, so resources are written to `.claude/` for Claude or `.codex/` for Codex.

## Why This Phase Exists

There are **60+ hardcoded `.claude/` references** across the codebase. These appear in:
- Sync scripts writing to `project/.claude/skills/`, `project/.claude/agents/`, `project/.claude/commands/`
- Phase 4 context generation writing `CLAUDE.md` to `project/.claude/CLAUDE.md`
- Phase 5 resources writing to `project/.claude/`
- Phase 6 validation checking `project/.claude/` files exist
- Config reader loading from `project/.claude/framework-config.json`
- Test fixtures expecting `.claude/` paths

Without this phase, all generated resources would go to `.claude/` even when using Codex, and Codex CLI wouldn't find its `AGENTS.md` or `.codex/` configuration.

## Dependencies

- Phase 1 (Provider types with `ProviderPaths`)

## Steps

### Step 4.1: Create Path Resolver Utility

**File to create:** `orchestration/src/utils/provider-paths.ts`

**Why:** A single utility that all code can call to get the correct provider-specific paths. Replaces all hardcoded `.claude/` strings.

```typescript
import { join } from 'path';
import type { ProviderPaths } from '../providers/types.js';
import { Provider } from '../providers/types.js';

/**
 * Default paths per provider
 */
const PROVIDER_PATHS: Record<Provider, ProviderPaths> = {
  [Provider.CLAUDE]: {
    configDir: '.claude',
    instructionFile: 'CLAUDE.md',
    tempDir: '.claude-temp',
    backupDir: '.claude-backups',
    homeConfigDir: '.claude',
    hooksFile: 'settings.json',
    credentialsPath: '.claude/.credentials.json',
  },
  [Provider.CODEX]: {
    configDir: '.codex',
    instructionFile: 'AGENTS.md',
    tempDir: '.codex-temp',
    backupDir: '.codex-backups',
    homeConfigDir: '.codex',
    hooksFile: 'hooks.json',
    credentialsPath: '.codex/auth.json',
  },
};

// Module-level provider (set during initialization)
let activeProvider: Provider = Provider.CLAUDE;

/**
 * Set the active provider for path resolution
 * Called once during framework initialization
 */
export function setActiveProvider(provider: Provider): void {
  activeProvider = provider;
}

/**
 * Get the active provider
 */
export function getActiveProvider(): Provider {
  return activeProvider;
}

/**
 * Get provider paths for a specific or the active provider
 */
export function getProviderPaths(provider?: Provider): ProviderPaths {
  return PROVIDER_PATHS[provider || activeProvider];
}

/**
 * Resolve a project-relative path using the provider's config directory
 *
 * Examples:
 *   resolveConfigPath(projectPath) -> "/project/.claude" or "/project/.codex"
 *   resolveConfigPath(projectPath, 'skills', 'my-skill') -> "/project/.claude/skills/my-skill"
 *   resolveConfigPath(projectPath, 'CLAUDE.md') -> "/project/.claude/CLAUDE.md"
 *   resolveConfigPath(projectPath, 'AGENTS.md') -> "/project/.codex/AGENTS.md"
 */
export function resolveConfigPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.configDir, ...segments);
}

/**
 * Get the instruction file path for the active provider
 * Returns: "/project/.claude/CLAUDE.md" or "/project/.codex/AGENTS.md"
 */
export function resolveInstructionFilePath(projectPath: string): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.configDir, paths.instructionFile);
}

/**
 * Get the temp directory path for the active provider
 */
export function resolveTempPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.tempDir, ...segments);
}

/**
 * Get the backup directory path
 */
export function resolveBackupPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.backupDir, ...segments);
}

/**
 * Get the framework config path
 * Note: framework-config.json is OUR file, not the provider's.
 * It lives in the provider's config dir for discovery, but the name is consistent.
 */
export function resolveFrameworkConfigPath(projectPath: string): string {
  return resolveConfigPath(projectPath, 'framework-config.json');
}

/**
 * Get the instruction file name for display purposes
 */
export function getInstructionFileName(): string {
  return getProviderPaths().instructionFile;
}
```

### Step 4.2: Update Synthesis Extractor

**File to modify:** `orchestration/src/nodes/initialize-project/phase4/helpers/synthesis-extractor.ts`

**Why:** Currently hardcodes `join(projectPath, '.claude', 'CLAUDE.md')`. Must use provider-aware path.

**Changes:**

```typescript
import { resolveConfigPath, resolveInstructionFilePath, getInstructionFileName } from '../../../../utils/provider-paths.js';

export function extractAndWriteSynthesis(synthesisContent, projectPath, logger): SynthesisExtractionResult {
  // ...existing extraction logic...

  // Write instruction file (CLAUDE.md or AGENTS.md)
  const instructionFilePath = resolveInstructionFilePath(projectPath);
  mkdirSync(resolveConfigPath(projectPath), { recursive: true });
  writeFileSync(instructionFilePath, claudeMdContent);
  logger.success(`Written: ${instructionFilePath}`);

  // Write project-context/SKILL.md
  const projectContextDir = resolveConfigPath(projectPath, 'skills', 'project-context');
  mkdirSync(projectContextDir, { recursive: true });
  const projectContextPath = join(projectContextDir, 'SKILL.md');
  writeFileSync(projectContextPath, normalizedProjectContext);

  return {
    claudeMdContent,                    // Keep field name for backward compat
    projectContextContent: normalizedProjectContext,
    claudeMdPath: instructionFilePath,  // Now provider-aware
    projectContextPath,
  };
}
```

### Step 4.3: Update Context Generation Node

**File to modify:** `orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`

**Why:** Line 308 hardcodes `join(state.project_path, '.claude', 'framework-config.json')`.

Change to use `resolveFrameworkConfigPath(state.project_path)`.

### Step 4.4: Update Sync Helpers Service

**File to modify:** `orchestration/src/services/framework/sync-helpers.service.ts`

**Why:** Lines 70, 109, 230 hardcode `.claude/` paths for skill, agent, and command targets.

Replace all `join(projectPath, '.claude', ...)` with `resolveConfigPath(projectPath, ...)`.

### Step 4.5: Update Config Updater Service

**File to modify:** `orchestration/src/services/framework/config-updater.service.ts`

**Why:** Lines 55, 222, 338, 361 hardcode `.claude/` paths.

Replace all `.claude/` references with `resolveConfigPath()`.

### Step 4.6: Update Sync Framework Resources Script

**File to modify:** `orchestration/src/scripts/sync-framework-resources.ts`

**Why:** Lines 93, 158, 173, 292, 401, 426, 517 hardcode `.claude/` paths.

Replace all with provider-aware path calls.

### Step 4.7: Update Project Config Reader Service

**File to modify:** `orchestration/src/services/implement-ticket/project-config-reader.service.ts`

**Why:** Lines 61, 106, 418, 427-429 hardcode `.claude/` paths for reading framework config and CLAUDE.md.

### Step 4.8: Update Phase 6 Validation

**File to modify:** `orchestration/src/nodes/initialize-project/phase6/validation.node.ts` and helpers

**Why:** Validation checks that files exist at `.claude/` paths. Must check the correct provider directory.

Update `file-validator.ts` and `phase-completion-validator.ts` to use `resolveConfigPath()`.

### Step 4.9: Update Implement-Ticket Shared Utils

**File to modify:** `orchestration/src/services/implement-ticket/shared/index.ts`

**Why:** Line 100 hardcodes `join(projectPath, '.claude/agents', agentFile)`.

### Step 4.10: Update Preflight Checks .gitignore Handling

**File to modify:** `orchestration/src/utils/preflight-checks.ts`

**Why:** The `.gitignore` automation uses hardcoded `.claude-temp` and `.claude-backups`. Must include both providers' directories.

```typescript
const requiredEntries = [
  '.claude-temp', '.claude-backups',
  '.codex-temp', '.codex-backups',
  frameworkDirName,
];
```

### Step 4.11: Update Initialize-Project State Schema

**File to modify:** `orchestration/src/state/schemas/initialize-project.schema.ts`

**Why:** The state has `claude_md_path` and `claude_md` fields. These should be renamed to be provider-agnostic, or we add parallel fields.

**Decision: Keep existing field names for backward compatibility, but add aliases:**

```typescript
// Existing (keep for backward compat)
claude_md_path: z.string().optional(),
// New alias
instruction_file_path: z.string().optional(), // Same as claude_md_path but provider-agnostic
```

### Step 4.12: Update Prompt Loader Excluded Directories

**File to modify:** `orchestration/src/utils/shared/prompt-loader.ts`

**Why:** Line 39 has `.claude` in the excluded directories list. Must also exclude `.codex`.

Add `.codex` to the excluded directories list.

## Complete List of Files to Modify

| File | Hardcoded `.claude/` References | Change To |
|------|-------------------------------|-----------|
| `phase4/helpers/synthesis-extractor.ts` | `.claude/CLAUDE.md`, `.claude/skills/` | `resolveConfigPath()` |
| `phase4/context-generation.node.ts` | `.claude/framework-config.json` | `resolveFrameworkConfigPath()` |
| `services/framework/sync-helpers.service.ts` | `.claude/skills/`, `.claude/commands/` | `resolveConfigPath()` |
| `services/framework/config-updater.service.ts` | `.claude/framework-config.json`, `.claude/skills/`, `.claude/agents/` | `resolveConfigPath()` |
| `scripts/sync-framework-resources.ts` | `.claude/framework-config.json`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/` | `resolveConfigPath()` |
| `services/implement-ticket/project-config-reader.service.ts` | `.claude/framework-config.json`, `.claude/CLAUDE.md`, `.claude/project-context/` | `resolveConfigPath()` |
| `nodes/initialize-project/phase6/*.ts` | `.claude/CLAUDE.md`, `.claude/framework-config.json`, `.claude/skills/`, `.claude/agents/`, `.claude/commands/` | `resolveConfigPath()` |
| `services/implement-ticket/shared/index.ts` | `.claude/agents/` | `resolveConfigPath()` |
| `utils/preflight-checks.ts` | `.claude-temp`, `.claude-backups` | Both providers |
| `utils/shared/prompt-loader.ts` | `.claude` in exclusions | Add `.codex` |
| `state/schemas/initialize-project.schema.ts` | `claude_md` field names | Add aliases |

## Acceptance Criteria

1. `setActiveProvider(Provider.CODEX)` causes all path resolution to use `.codex/`
2. `setActiveProvider(Provider.CLAUDE)` preserves existing behavior exactly
3. No hardcoded `.claude/` strings remain in non-test source files (except backward-compat aliases)
4. `.gitignore` includes both providers' temp/backup directories
5. Provider is set once during initialization and consistently used throughout the pipeline

## Notes for Implementer

- The `setActiveProvider()` must be called early in the pipeline (CLI entry point, before any path resolution).
- Use search-and-replace carefully: some `.claude` references are in test fixtures and should remain as-is (tests create their own mock paths).
- The `framework-config.json` file name stays the same regardless of provider - only the parent directory changes.
- The instruction file content format may differ between CLAUDE.md and AGENTS.md - that's handled in Phase 5, not here. This phase only handles the file paths.
- When both providers are installed on the same project, files exist in both `.claude/` and `.codex/`. This is by design - each provider reads its own directory.
