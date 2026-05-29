/**
 * Banned-glob detector.
 *
 * The four Phase 1 analyzers' execution-instructions promise that the
 * framework's `project-inspection.json` already carries every manifest,
 * lock file, CI config, infrastructure file, env template and workspace
 * config. The agents are told NOT to Glob these patterns because doing
 * so wastes the tool-call budget.
 *
 * This module:
 *   - exports `BANNED_GLOB_PATTERNS` — the canonical table of patterns
 *     the inspection already covers, grouped by inspection-field;
 *   - exports `detectBannedGlobs(patterns)` — pure function returning
 *     the subset of agent-called patterns that match any banned entry.
 *
 * The detector is called from `computeSoftWarnings()` when the sidecar
 * carries `globPatterns[]`; matched patterns surface in the run's
 * `soft_warnings[]` as `tech_stack_inspection_redundant_glob` (one
 * warning emitted, regardless of match count — the analyzer just needs
 * to know "you re-globbed inspection-covered patterns; cut it.").
 *
 * Stack-agnostic by construction: every entry is a literal glob pattern
 * the agent emitted; the table maps the SHAPE to the inspection field
 * that already supplies the answer.
 */

/**
 * Banned-glob entries. Each `pattern` is a substring that, when found
 * inside any agent-emitted glob argument, marks the call as redundant.
 * Use substring matching (not exact match) so brace-expansions and
 * comma-separated globs match on the inspection-covered piece.
 *
 * Adding a new entry: include the LITERAL pattern fragment the agent
 * would type. False positives are cheap (one extra soft warning) so err
 * toward generous matching.
 */
export const BANNED_GLOB_PATTERNS: ReadonlyArray<{
  readonly pattern: string;
  readonly inspectionField: string;
}> = [
  { pattern: '**/package.json', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/pyproject.toml', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/Cargo.toml', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/go.mod', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/Gemfile', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/composer.json', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/*.csproj', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/Package.swift', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/mix.exs', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/build.gradle', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/pom.xml', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/pubspec.yaml', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/requirements.txt', inspectionField: 'inspection.manifests[]' },
  { pattern: '**/setup.py', inspectionField: 'inspection.manifests[]' },

  { pattern: 'pnpm-lock.yaml', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'yarn.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'package-lock.json', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'bun.lockb', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'poetry.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'Pipfile.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'uv.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'Cargo.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'go.sum', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'Gemfile.lock', inspectionField: 'inspection.lock_files[]' },
  { pattern: 'composer.lock', inspectionField: 'inspection.lock_files[]' },

  { pattern: '**/.env', inspectionField: 'inspection.environment.template_files[]' },
  { pattern: '.env.example', inspectionField: 'inspection.environment.template_files[]' },
  { pattern: '.env.sample', inspectionField: 'inspection.environment.template_files[]' },
  { pattern: '.env.template', inspectionField: 'inspection.environment.template_files[]' },

  { pattern: 'Dockerfile', inspectionField: 'inspection.infrastructure[]' },
  { pattern: '**/Dockerfile', inspectionField: 'inspection.infrastructure[]' },
  {
    pattern: 'docker-compose',
    inspectionField: 'inspection.infrastructure[] + infrastructure_services_hints[]',
  },
  {
    pattern: 'compose.yml',
    inspectionField: 'inspection.infrastructure[] + infrastructure_services_hints[]',
  },
  {
    pattern: 'compose.yaml',
    inspectionField: 'inspection.infrastructure[] + infrastructure_services_hints[]',
  },

  { pattern: '.github/workflows/', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: '.gitlab-ci.yml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: '.circleci/config.yml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: 'Jenkinsfile', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: '.travis.yml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: 'azure-pipelines.yml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: 'bitbucket-pipelines.yml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: 'cloudbuild.yaml', inspectionField: 'inspection.ci_cd.config_files[]' },
  { pattern: 'buildspec.yml', inspectionField: 'inspection.ci_cd.config_files[]' },

  { pattern: 'pnpm-workspace.yaml', inspectionField: 'inspection.monorepo' },
  { pattern: 'lerna.json', inspectionField: 'inspection.monorepo' },
  { pattern: 'nx.json', inspectionField: 'inspection.monorepo' },
  { pattern: 'turbo.json', inspectionField: 'inspection.monorepo' },
  { pattern: 'go.work', inspectionField: 'inspection.monorepo' },
  { pattern: '.tool-versions', inspectionField: 'inspection.runtime_versions' },
  { pattern: '.nvmrc', inspectionField: 'inspection.runtime_versions' },
  { pattern: '.python-version', inspectionField: 'inspection.runtime_versions' },
  { pattern: '.ruby-version', inspectionField: 'inspection.runtime_versions' },

  { pattern: '**/README', inspectionField: 'inspection.documentation.readme_paths[]' },
  { pattern: '**/CONTRIBUTING', inspectionField: 'inspection.documentation.contributing_paths[]' },
];

/**
 * Detect which of the agent-called glob patterns match the banned table.
 * Returns the deduplicated subset (sorted, for stable output).
 *
 * Match is substring-based against each entry's `pattern`: when an
 * agent-emitted glob CONTAINS the literal pattern fragment, it counts
 * as banned. This catches both bare patterns and compound
 * brace-expansions like `{<glob1>,<glob2>}`.
 *
 * `globPatterns` is treated as a flat list; if a single agent call
 * passes multiple comma-separated globs in one `pattern` arg, the
 * caller can split before passing, or just pass the raw arg — the
 * substring matcher handles both.
 */
export function detectBannedGlobs(globPatterns: string[]): string[] {
  if (globPatterns.length === 0) return [];
  const matched = new Set<string>();
  for (const called of globPatterns) {
    if (typeof called !== 'string' || called.length === 0) continue;
    for (const entry of BANNED_GLOB_PATTERNS) {
      if (called.includes(entry.pattern)) {
        matched.add(entry.pattern);
      }
    }
  }
  return Array.from(matched).sort();
}

/**
 * The soft-warning code emitted when one or more banned patterns fired.
 * One code, regardless of how many entries matched — the agent doesn't
 * need a per-pattern reprimand; it needs the signal "you re-globbed
 * what inspection already has".
 */
export const REDUNDANT_GLOB_WARNING_CODE = 'tech_stack_inspection_redundant_glob';
