/**
 * Provider-aware path resolution utility.
 *
 * Replaces all hardcoded '.claude/' directory references with provider-aware
 * path resolution. Call setActiveProvider() once during initialization, then
 * use the resolve functions throughout the codebase.
 */

import { join } from 'path';
import { Provider, type ProviderPaths } from '../providers/types.js';

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

// Module-level active provider (set during initialization)
let activeProvider: Provider = Provider.CLAUDE;

/**
 * Set the active provider for path resolution.
 * Called once during framework initialization.
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
 * Resolve a project-relative path using the provider's config directory.
 *
 * Examples:
 *   resolveConfigPath('/project') -> "/project/.claude"
 *   resolveConfigPath('/project', 'skills', 'my-skill') -> "/project/.claude/skills/my-skill"
 */
export function resolveConfigPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.configDir, ...segments);
}

/**
 * Get the instruction file path for the active provider.
 * Returns: "/project/.claude/CLAUDE.md" or "/project/.codex/AGENTS.md"
 */
export function resolveInstructionFilePath(projectPath: string): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.configDir, paths.instructionFile);
}

/**
 * Get the temp directory path for the active provider.
 */
export function resolveTempPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.tempDir, ...segments);
}

/**
 * Get the backup directory path.
 */
export function resolveBackupPath(projectPath: string, ...segments: string[]): string {
  const paths = getProviderPaths();
  return join(projectPath, paths.backupDir, ...segments);
}

/**
 * Get the framework config path (framework-config.json in provider dir).
 */
export function resolveFrameworkConfigPath(projectPath: string): string {
  return resolveConfigPath(projectPath, 'framework-config.json');
}

/**
 * Get the instruction file name for display purposes.
 */
export function getInstructionFileName(provider?: Provider): string {
  return getProviderPaths(provider).instructionFile;
}

/**
 * All registered providers — single source of truth for "which providers does
 * the framework know about". Any code that needs to enumerate per-provider
 * directory names should derive from this, not hardcode provider variants.
 */
const ALL_PROVIDERS = Object.keys(PROVIDER_PATHS) as Provider[];

/**
 * Config dir names for every provider (e.g., `['.claude', '.codex']`).
 */
export function getAllProviderConfigDirs(): string[] {
  return ALL_PROVIDERS.map((p) => PROVIDER_PATHS[p].configDir);
}

/**
 * Temp dir names for every provider (e.g., `['.claude-temp', '.codex-temp']`).
 */
export function getAllProviderTempDirs(): string[] {
  return ALL_PROVIDERS.map((p) => PROVIDER_PATHS[p].tempDir);
}

/**
 * Backup dir names for every provider (e.g., `['.claude-backups', '.codex-backups']`).
 */
export function getAllProviderBackupDirs(): string[] {
  return ALL_PROVIDERS.map((p) => PROVIDER_PATHS[p].backupDir);
}

/**
 * All framework-managed directory names across every registered provider.
 * Use this for gitignore entries, file scanners, excluded-dirs lists —
 * anywhere you'd otherwise hardcode both `.claude*` and `.codex*` variants.
 *
 * Always returns both variants so projects that switch providers don't need
 * preflight re-runs.
 */
export function getAllProviderManagedDirs(): string[] {
  return [
    ...getAllProviderConfigDirs(),
    ...getAllProviderTempDirs(),
    ...getAllProviderBackupDirs(),
  ];
}
