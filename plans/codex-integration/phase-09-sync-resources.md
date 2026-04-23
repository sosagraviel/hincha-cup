# Phase 9: Sync & Resource Management

## Objective

Update the sync-framework-resources script and related services to support syncing to the correct provider directory, and handle the case where a project may be initialized for multiple providers.

## Why This Phase Exists

The `sync-framework-resources.ts` script is the mechanism that keeps project-level skills, agents, and commands up to date with the framework. It currently:
- Reads from `framework/skills/`, `framework/agents/templates/`, `framework/commands/`
- Writes to `project/.claude/skills/`, `project/.claude/agents/`, `project/.claude/commands/`
- Tracks resource state in `project/.claude/framework-config.json`
- Creates backups in `project/.claude-backups/`

All these paths must be provider-aware. Additionally, the sync script needs to know which provider to sync for (or sync for all initialized providers).

## Dependencies

- Phase 4 (Provider-aware paths)

## Steps

### Step 9.1: Update Sync Script Entry Point

**File to modify:** `orchestration/src/scripts/sync-framework-resources.ts`

**Why:** The main() function must detect the active provider and sync to the correct directory.

**Changes:**

1. Add provider detection:
```typescript
async function main() {
  // Detect provider from environment or framework-config.json
  const provider = detectSyncProvider(config);
  setActiveProvider(provider);
  // ... rest of sync logic uses resolveConfigPath() from Phase 4
}

function detectSyncProvider(config: SyncConfig): Provider {
  // Check environment override
  if (process.env.PROVIDER === 'codex') return Provider.CODEX;
  if (process.env.PROVIDER === 'claude') return Provider.CLAUDE;

  // Check which config directories exist
  const hasClaude = existsSync(join(config.projectPath, '.claude', 'framework-config.json'));
  const hasCodex = existsSync(join(config.projectPath, '.codex', 'framework-config.json'));

  if (hasCodex && !hasClaude) return Provider.CODEX;
  if (hasClaude && !hasCodex) return Provider.CLAUDE;
  if (hasCodex && hasClaude) {
    // Both exist - sync both, or prefer env var
    logger.warn('Both .claude/ and .codex/ found. Set PROVIDER env var to choose. Defaulting to claude.');
    return Provider.CLAUDE;
  }

  // Default
  return Provider.CLAUDE;
}
```

2. Update all path references to use `resolveConfigPath()`:
```typescript
// Line 93: const configFile = join(config.projectPath, '.claude/framework-config.json');
// Change to:
const configFile = resolveFrameworkConfigPath(config.projectPath);

// Line 158: const skillsPath = join(config.projectPath, '.claude/skills');
// Change to:
const skillsPath = resolveConfigPath(config.projectPath, 'skills');

// ... and so on for all 7+ references
```

### Step 9.2: Update Validate Prerequisites

**File to modify:** `orchestration/src/scripts/sync-framework-resources.ts`

**Why:** `validatePrerequisites()` checks for `framework-config.json` at the hardcoded path.

```typescript
async function validatePrerequisites(config: SyncConfig): Promise<void> {
  const configFile = resolveFrameworkConfigPath(config.projectPath);
  if (!existsSync(configFile)) {
    throw new Error(
      `framework-config.json not found at ${configFile}. Run initialize-project first.`
    );
  }
}
```

### Step 9.3: Update Backup Creation

**File to modify:** `orchestration/src/scripts/sync-framework-resources.ts`

**Why:** Backups go to `.claude-backups/`. Must use provider-aware backup path.

```typescript
async function createBackup(config: SyncConfig): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0] + 'Z';
  const backupDir = resolveBackupPath(config.projectPath, timestamp);
  await mkdir(backupDir, { recursive: true });

  // Backup skills
  const skillsPath = resolveConfigPath(config.projectPath, 'skills');
  // ... rest uses provider-aware paths
}
```

### Step 9.4: Update Sync Helpers Service

**File to modify:** `orchestration/src/services/framework/sync-helpers.service.ts`

**Why:** `addSingleSkill()`, `updateSingleSkill()`, `regenerateSingleAgent()`, `syncSingleCommand()` all have hardcoded `.claude/` paths.

Replace all `join(projectPath, '.claude', ...)` with `resolveConfigPath(projectPath, ...)`.

### Step 9.5: Update Config Updater Service

**File to modify:** `orchestration/src/services/framework/config-updater.service.ts`

**Why:** The config updater reads/writes `framework-config.json` and tracks resource state. All paths are hardcoded to `.claude/`.

```typescript
constructor(projectPath: string, frameworkPath: string) {
  this.projectPath = projectPath;
  this.frameworkPath = frameworkPath;
  // Line 55: this.configPath = join(projectPath, '.claude', 'framework-config.json');
  this.configPath = resolveFrameworkConfigPath(projectPath);
}
```

### Step 9.6: Update Bash Sync Script

**File to modify:** `scripts/sync-framework-resources.sh`

**Why:** The bash wrapper should accept `--provider` and pass it as PROVIDER env var.

```bash
#!/bin/bash
# Parse --provider flag
for i in "$@"; do
  case $i in
    --provider=*)
      export PROVIDER="${i#*=}"
      ;;
  esac
done

# ... existing script logic
```

### Step 9.7: Handle Dual-Provider Projects

**Why:** A project might be initialized for both Claude and Codex (e.g., some developers use Claude, others use Codex). The sync script should support syncing to both.

**Add `--all-providers` flag:**

```typescript
if (process.env.SYNC_ALL_PROVIDERS === 'true') {
  // Sync to both .claude/ and .codex/
  for (const provider of [Provider.CLAUDE, Provider.CODEX]) {
    const configExists = existsSync(
      join(config.projectPath, provider === Provider.CLAUDE ? '.claude' : '.codex', 'framework-config.json')
    );
    if (configExists) {
      setActiveProvider(provider);
      await syncForCurrentProvider(config);
    }
  }
}
```

### Step 9.8: Add Provider Field to framework-config.json

**File to modify:** `orchestration/src/schemas/framework-config.schema.ts`

**Why:** The framework-config.json should record which provider it was initialized for, so the sync script can auto-detect.

```typescript
// Add to schema:
provider: z.enum(['claude', 'codex']).optional().default('claude'),
```

This field is set during Phase 4 context generation and used by the sync script for auto-detection.

## Files Modified

| Action | File | Why |
|--------|------|-----|
| MODIFY | `orchestration/src/scripts/sync-framework-resources.ts` | Provider-aware sync logic |
| MODIFY | `orchestration/src/services/framework/sync-helpers.service.ts` | Provider-aware target paths |
| MODIFY | `orchestration/src/services/framework/config-updater.service.ts` | Provider-aware config path |
| MODIFY | `orchestration/src/schemas/framework-config.schema.ts` | Add provider field |
| MODIFY | `scripts/sync-framework-resources.sh` | --provider flag |

## Acceptance Criteria

1. `./scripts/sync-framework-resources.sh --provider=codex` syncs to `.codex/`
2. Auto-detection works based on which config directory exists
3. Backups go to the correct provider's backup directory
4. Resource state tracking works in the correct `framework-config.json`
5. Dual-provider projects can be synced with `--all-providers`
6. The `provider` field in `framework-config.json` is set and used

## Notes for Implementer

- The sync script is at `orchestration/src/scripts/sync-framework-resources.ts` and runs via `npm run sync-framework-resources`.
- The `framework-config.json` is the central config file. Its path changes based on provider, but its schema and content are the same.
- When syncing skills for Codex, the skills content should be the same (skills are provider-agnostic markdown). Only the target directory differs.
- Agent templates may need provider-specific rendering (handled in Phase 7 Step 7.8).
- Test with: `PROVIDER=codex npm run sync-framework-resources`
