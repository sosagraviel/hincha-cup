/**
 * Phase 4: Infrastructure Extractor Helper
 *
 * Extracts and normalises infrastructure information from Phase 1 tech-stack
 * analyzer output. Drops category abstractions emitted by the analyzer
 * (`containerization`, `orchestration`, etc.) and substitutes concrete
 * technology names from project filesystem evidence.
 *
 * Stack-agnostic — only generic file-presence checks. No language assumptions.
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Category words the analyzer sometimes emits in place of concrete
 * technology names. Matched case-insensitively; dropped from output.
 */
const CATEGORY_WORDS = new Set([
  'containerization',
  'orchestration',
  'orchestrator',
  'infrastructure',
  'infrastructure-as-code',
  'iac',
  'cloud',
  'serverless-compute',
  'compute',
  'storage',
  'networking',
  'observability',
  'monitoring',
  'identity',
  'security',
]);

interface FilesystemProbe {
  technology: string;
  /** Paths (relative to project root). Existence of any one is enough. */
  evidence: string[];
}

const FILESYSTEM_PROBES: FilesystemProbe[] = [
  {
    technology: 'docker-compose',
    evidence: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  },
  {
    technology: 'docker',
    evidence: ['Dockerfile', 'dockerfile', 'Dockerfile.dev', 'Dockerfile.prod', '.dockerignore'],
  },
  {
    technology: 'kubernetes',
    evidence: ['k8s', '.k8s', 'kubernetes', 'manifests', 'helm'],
  },
  { technology: 'terraform', evidence: ['terraform', 'main.tf', '.terraform'] },
  { technology: 'pulumi', evidence: ['Pulumi.yaml', 'pulumi'] },
  { technology: 'serverless', evidence: ['serverless.yml', 'serverless.yaml'] },
  { technology: 'sam', evidence: ['template.yaml', 'samconfig.toml'] },
  { technology: 'cdk', evidence: ['cdk.json'] },
  { technology: 'ansible', evidence: ['playbook.yml', 'ansible.cfg', 'roles'] },
  { technology: 'nginx', evidence: ['nginx.conf', 'nginx.dev.conf'] },
];

/**
 * Extract + normalise infrastructure from Phase 1 tech-stack
 * analyzer findings, optionally augmented with concrete technology
 * names detected from the project filesystem.
 *
 * @param techStackFindings - Findings slice from tech-stack analyzer.
 * @param projectPath - Project root path. When provided, the
 *                      filesystem probes run; when undefined, only
 *                      analyzer-emitted entries (sans categories)
 *                      are returned.
 * @returns Sorted, deduped list of concrete technology names.
 */
export function extractInfrastructure(techStackFindings: unknown, projectPath?: string): string[] {
  const tools = new Set<string>();

  const fromAnalyzer = readInfrastructureArray(techStackFindings);
  for (const entry of fromAnalyzer) {
    const cleaned = entry.trim().toLowerCase();
    if (cleaned.length === 0) continue;
    if (CATEGORY_WORDS.has(cleaned)) continue;
    tools.add(cleaned);
  }

  if (projectPath && projectPath.length > 0) {
    for (const probe of FILESYSTEM_PROBES) {
      for (const candidate of probe.evidence) {
        if (existsAtRoot(projectPath, candidate)) {
          tools.add(probe.technology);
          break;
        }
      }
    }
  }

  return Array.from(tools).sort();
}

function readInfrastructureArray(findings: unknown): string[] {
  if (!findings || typeof findings !== 'object') return [];
  const f = findings as Record<string, unknown>;
  const v = f.infrastructure;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function existsAtRoot(root: string, relative: string): boolean {
  const p = join(root, relative);
  if (!existsSync(p)) return false;
  try {
    const st = statSync(p);
    return st.isFile() || st.isDirectory();
  } catch {
    return false;
  }
}
