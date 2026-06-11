/**
 * Phase 4: Version Control Extractor Helper
 *
 * Detects the VCS hosting platform a repository lives on by reading the git
 * `origin` remote URL and classifying it by host. Repo-level (not per-service):
 * every service in a monorepo shares the same host.
 *
 * Stack-agnostic — only inspects the git remote. Pure I/O, never throws:
 * a missing repo, missing remote, or unrecognized host all yield `undefined`.
 */

import { execSync } from 'child_process';
import { z } from 'zod';

export const ControlVersionProvidersSchema = z.enum([
  'github',
  'gitlab',
  'azure-devops',
  'bitbucket',
]);
export type ControlVersionProvidersType = z.infer<typeof ControlVersionProvidersSchema>;

/**
 * Host substring → canonical platform name. Order-sensitive: the first
 * substring found in the remote URL wins.
 */
const HOST_TABLE: ReadonlyArray<{ platform: ControlVersionProvidersType; match: string }> = [
  { platform: 'github', match: 'github.com' },
  { platform: 'gitlab', match: 'gitlab.' },
  { platform: 'azure-devops', match: 'dev.azure.com' },
  { platform: 'azure-devops', match: 'visualstudio.com' },
  { platform: 'bitbucket', match: 'bitbucket.org' },
];

/**
 * Read the git `origin` remote URL for a project. Returns `undefined` when the
 * directory is not a git repo or has no `origin` remote.
 */
function readOriginRemote(projectPath: string): string | undefined {
  try {
    const url = execSync('git remote get-url origin', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return url.length > 0 ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Detect the VCS hosting platform from the git origin remote.
 *
 * Handles both HTTPS (`https://github.com/org/repo.git`) and SSH
 * (`git@github.com:org/repo.git`) remote forms via case-insensitive
 * substring matching.
 *
 * @param projectPath - Project root path.
 * @returns Canonical platform name ("github", "gitlab", "azure-devops",
 *          "bitbucket") or `undefined` when no remote / unrecognized host.
 */
export function detectVersionControl(projectPath: string): ControlVersionProvidersType | undefined {
  if (!projectPath || projectPath.length === 0) return undefined;

  const remote = readOriginRemote(projectPath);
  if (!remote) return undefined;

  const lower = remote.toLowerCase();
  for (const { platform, match } of HOST_TABLE) {
    if (lower.includes(match)) return platform;
  }

  return undefined;
}
