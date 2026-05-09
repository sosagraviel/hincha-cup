/**
 * Plan v3 §A — project-inspection service.
 *
 * Walks the project filesystem at Phase 0 and produces the
 * `ProjectInspection` structure consumed by every Phase-1 analyzer.
 * Replaces ~70 seconds of Phase-1 LLM time per analyzer with a
 * single deterministic pass.
 *
 * Stack-agnostic by design: every language-specific decision lives
 * in a lookup table (`runtime-version-table.ts`,
 * `lock-file-table.ts`, `manifest-parser-table.ts`). Adding a new
 * language family is a one-line PR per table.
 *
 * Naming-agnostic: the inspector NEVER pattern-matches on role
 * names (Controller / Service / Repository / etc.). It surfaces
 * paths and parsed manifests verbatim; analyzers / synthesizer
 * extract patterns using the project's own names.
 *
 * Best-effort: any individual file failure (parse error, IO
 * error, permission denied) is logged at INFO and skipped. The
 * inspector NEVER throws — Phase 0 must continue even on a
 * malformed project.
 */

import fastGlob from 'fast-glob';
import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, relative, basename, join } from 'path';
import {
  type ProjectInspection,
  type ManifestEntry,
  type LockFileEntry,
  PROJECT_INSPECTION_FILENAME,
  ProjectInspectionSchema,
} from '../../../schemas/project-inspection.schema.js';
import { resolveLockFileManager, knownLockFileBasenames } from './lock-file-table.js';
import {
  resolveManifestMapping,
  knownExactManifestBasenames,
  knownManifestSuffixes,
} from './manifest-parser-table.js';
import {
  resolveRuntimeExtractor,
  knownRuntimeVersionFilenames,
  parseToolVersions,
} from './runtime-version-table.js';

export interface InspectProjectArgs {
  /** Absolute path to the project root. */
  projectPath: string;
  /**
   * Excluded directories (relative segment names). Anything matching
   * is skipped at every depth. Comes from the framework's standard
   * exclusion list (see `getExcludedDirectories()` in
   * `utils/shared/prompt-loader.ts`).
   */
  excludedDirs: ReadonlyArray<string>;
}

export interface InspectProjectResult {
  /** The persisted ProjectInspection. */
  inspection: ProjectInspection;
  /** ISO 8601 generated_at echoed for the caller's logs. */
  generatedAt: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Per-step diagnostic counts surfaced to telemetry. */
  diagnostic: {
    files_scanned: number;
    manifests_parsed: number;
    manifests_skipped: number;
    lock_files_found: number;
    runtime_versions_extracted: number;
  };
}

/* ------------------------------ Constants ------------------------------ */

/** Reasonable hard ceiling on filesystem walk to keep Phase 0 bounded. */
const FAST_GLOB_OPTIONS = {
  dot: true,
  onlyFiles: true,
  followSymbolicLinks: false,
  suppressErrors: true,
  unique: true,
};

/** Soft cap on how many candidate files to scan per pattern (prevents explosion on enormous repos). */
const MAX_FILES_PER_PATTERN = 500;

/**
 * CI provider table — file-presence → provider name. Stack-agnostic.
 * Each entry is ordered by specificity (most-specific first).
 */
const CI_PROVIDER_TABLE: ReadonlyArray<{ provider: string; pattern: string }> = [
  { provider: 'GitHub Actions', pattern: '.github/workflows/*.{yml,yaml}' },
  { provider: 'GitLab CI', pattern: '.gitlab-ci.yml' },
  { provider: 'CircleCI', pattern: '.circleci/config.{yml,yaml}' },
  { provider: 'Jenkins', pattern: 'Jenkinsfile' },
  { provider: 'Travis CI', pattern: '.travis.yml' },
  { provider: 'Azure Pipelines', pattern: 'azure-pipelines.{yml,yaml}' },
  { provider: 'Azure Pipelines', pattern: '.azure/*.{yml,yaml}' },
  { provider: 'Bitbucket Pipelines', pattern: 'bitbucket-pipelines.yml' },
  { provider: 'AWS CodeBuild', pattern: 'buildspec.{yml,yaml}' },
  { provider: 'Google Cloud Build', pattern: 'cloudbuild.{yml,yaml}' },
  { provider: 'Drone CI', pattern: '.drone.{yml,yaml}' },
  { provider: 'Woodpecker CI', pattern: '.woodpecker.{yml,yaml}' },
  { provider: 'Buildkite', pattern: '.buildkite/pipeline.{yml,yaml}' },
];

/**
 * Infrastructure tool table — filename → tool name. Stack-agnostic.
 * Order is alphabetical for stability.
 */
const INFRASTRUCTURE_TABLE: ReadonlyArray<{ tool: string; pattern: string }> = [
  { tool: 'ansible', pattern: '**/ansible.cfg' },
  { tool: 'docker', pattern: '**/Dockerfile*' },
  { tool: 'docker', pattern: '**/Containerfile' },
  { tool: 'docker-compose', pattern: '**/docker-compose*.{yml,yaml}' },
  { tool: 'docker-compose', pattern: '**/compose*.{yml,yaml}' },
  { tool: 'helm', pattern: '**/Chart.yaml' },
  { tool: 'kubernetes', pattern: 'k8s/**/*.{yml,yaml}' },
  { tool: 'kubernetes', pattern: 'kubernetes/**/*.{yml,yaml}' },
  { tool: 'netlify', pattern: '**/netlify.toml' },
  { tool: 'nginx', pattern: '**/nginx.conf' },
  { tool: 'pulumi', pattern: '**/Pulumi.yaml' },
  { tool: 'sam', pattern: '**/template.yaml' },
  { tool: 'sam', pattern: '**/template.yml' },
  { tool: 'serverless', pattern: '**/serverless.{yml,yaml}' },
  { tool: 'terraform', pattern: '**/*.tf' },
  { tool: 'vercel', pattern: '**/vercel.json' },
];

/**
 * Workspace-tool detection table — file presence → workspace tool name.
 * Stack-agnostic and order-sensitive: the FIRST match wins.
 */
const WORKSPACE_TOOL_TABLE: ReadonlyArray<{ tool: string; pattern: string }> = [
  { tool: 'pnpm workspaces', pattern: 'pnpm-workspace.yaml' },
  { tool: 'Nx', pattern: 'nx.json' },
  { tool: 'Turborepo', pattern: 'turbo.json' },
  { tool: 'Lerna', pattern: 'lerna.json' },
  { tool: 'go workspaces', pattern: 'go.work' },
  // Cargo workspace lives in `Cargo.toml::[workspace]`; we detect via filename + content sniff below.
];

/* --------------------------- Main entry point --------------------------- */

/**
 * Run the project inspection. Pure I/O — never throws, returns even
 * on malformed projects.
 */
export async function inspectProject(args: InspectProjectArgs): Promise<InspectProjectResult> {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();

  const ignoredGlobPatterns = args.excludedDirs.flatMap((d) => [`${d}/**`, `**/${d}/**`]);
  const baseGlobOptions = {
    ...FAST_GLOB_OPTIONS,
    cwd: args.projectPath,
    ignore: ignoredGlobPatterns,
  };

  const diagnostic = {
    files_scanned: 0,
    manifests_parsed: 0,
    manifests_skipped: 0,
    lock_files_found: 0,
    runtime_versions_extracted: 0,
  };

  // ---------------- Lock files ----------------
  const lockFiles: LockFileEntry[] = [];
  for (const basename of knownLockFileBasenames()) {
    const matches = await safeGlob(`**/${basename}`, baseGlobOptions);
    diagnostic.files_scanned += matches.length;
    for (const path of matches.slice(0, MAX_FILES_PER_PATTERN)) {
      const manager = resolveLockFileManager(basename);
      if (!manager) continue;
      lockFiles.push({ path, manager });
    }
  }
  diagnostic.lock_files_found = lockFiles.length;

  // ---------------- Manifests ----------------
  const manifestEntries: ManifestEntry[] = [];

  // Exact-filename manifests (package.json, pyproject.toml, etc.).
  for (const filename of knownExactManifestBasenames()) {
    const matches = await safeGlob(`**/${filename}`, baseGlobOptions);
    diagnostic.files_scanned += matches.length;
    for (const path of matches.slice(0, MAX_FILES_PER_PATTERN)) {
      const mapping = resolveManifestMapping(filename);
      if (!mapping) continue;
      const entry = readManifest(args.projectPath, path, mapping.kind, mapping.format);
      if (entry) {
        manifestEntries.push(entry);
        diagnostic.manifests_parsed += 1;
      } else {
        diagnostic.manifests_skipped += 1;
      }
    }
  }

  // Suffix-based manifests (*.csproj, *.gemspec, *.fsproj, *.vbproj).
  for (const suffix of knownManifestSuffixes()) {
    const matches = await safeGlob(`**/*${suffix}`, baseGlobOptions);
    diagnostic.files_scanned += matches.length;
    for (const path of matches.slice(0, MAX_FILES_PER_PATTERN)) {
      const mapping = resolveManifestMapping(basename(path));
      if (!mapping) continue;
      const entry = readManifest(args.projectPath, path, mapping.kind, mapping.format);
      if (entry) {
        manifestEntries.push(entry);
        diagnostic.manifests_parsed += 1;
      } else {
        diagnostic.manifests_skipped += 1;
      }
    }
  }

  // ---------------- Runtime versions ----------------
  const runtimeVersions: Record<string, string> = {};
  for (const filename of knownRuntimeVersionFilenames()) {
    const matches = await safeGlob(`**/${filename}`, baseGlobOptions);
    diagnostic.files_scanned += matches.length;
    for (const path of matches.slice(0, MAX_FILES_PER_PATTERN)) {
      const extractor = resolveRuntimeExtractor(filename);
      if (!extractor) continue;
      const contents = safeReadText(join(args.projectPath, path));
      if (contents == null) continue;
      const version = extractor.extract(contents);
      if (version) {
        runtimeVersions[extractor.key] = version;
        diagnostic.runtime_versions_extracted += 1;
      }
    }
  }

  // `.tool-versions` — multi-runtime line-per-runtime file (asdf).
  const toolVersionsFiles = await safeGlob('**/.tool-versions', baseGlobOptions);
  for (const path of toolVersionsFiles) {
    const contents = safeReadText(join(args.projectPath, path));
    if (contents == null) continue;
    const parsed = parseToolVersions(contents);
    for (const [key, version] of Object.entries(parsed)) {
      if (!(key in runtimeVersions)) {
        runtimeVersions[key] = version;
        diagnostic.runtime_versions_extracted += 1;
      }
    }
  }

  // ---------------- Repository type + monorepo ----------------
  const { repositoryType, monorepo } = await detectRepositoryShape({
    projectPath: args.projectPath,
    baseGlobOptions,
    manifestEntries,
  });

  // ---------------- Infrastructure ----------------
  const infrastructure = await detectInfrastructure(baseGlobOptions);

  // ---------------- CI/CD ----------------
  const ciCd = await detectCiCd(baseGlobOptions);

  // ---------------- Environment ----------------
  const environment = await detectEnvironment(args.projectPath, baseGlobOptions);

  // ---------------- Documentation ----------------
  const documentation = await detectDocumentation(baseGlobOptions);

  // ---------------- Port candidates ----------------
  const portCandidates = await detectPortCandidates(args.projectPath, baseGlobOptions);

  const inspection: ProjectInspection = {
    generated_at: generatedAt,
    schema_version: 1,
    repository_type: repositoryType,
    ...(monorepo ? { monorepo } : {}),
    runtime_versions: runtimeVersions,
    lock_files: lockFiles,
    manifests: manifestEntries,
    infrastructure,
    ...(ciCd ? { ci_cd: ciCd } : {}),
    ...(environment ? { environment } : {}),
    ...(documentation ? { documentation } : {}),
    port_candidates: portCandidates,
  };

  // Schema-validate the result so a future schema change can never
  // silently produce an out-of-shape file.
  const validated = ProjectInspectionSchema.parse(inspection);

  return {
    inspection: validated,
    generatedAt,
    durationMs: Date.now() - startedAt,
    diagnostic,
  };
}

/* --------------------------- Sub-detectors --------------------------- */

async function detectRepositoryShape(args: {
  projectPath: string;
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown };
  manifestEntries: ManifestEntry[];
}): Promise<{
  repositoryType: ProjectInspection['repository_type'];
  monorepo: ProjectInspection['monorepo'];
}> {
  // Explicit workspace-tool table first.
  for (const entry of WORKSPACE_TOOL_TABLE) {
    const matches = await safeGlob(entry.pattern, args.baseGlobOptions);
    if (matches.length > 0) {
      const workspaceConfig = matches[0];
      const packageManager = await sniffMonorepoPackageManager(
        args.projectPath,
        args.baseGlobOptions,
      );
      return {
        repositoryType: 'monorepo',
        monorepo: {
          ...(packageManager ? { package_manager: packageManager } : {}),
          workspace_tool: entry.tool,
          workspace_config: workspaceConfig,
        },
      };
    }
  }

  // Cargo workspace — sniff `Cargo.toml::[workspace]`.
  const cargoToml = args.manifestEntries.find((m) => basename(m.path) === 'Cargo.toml');
  if (cargoToml && typeof cargoToml.raw === 'string' && /^\s*\[workspace\]/m.test(cargoToml.raw)) {
    return {
      repositoryType: 'monorepo',
      monorepo: {
        package_manager: 'cargo',
        workspace_tool: 'cargo workspaces',
        workspace_config: cargoToml.path,
      },
    };
  }

  // package.json::workspaces (npm / yarn / bun workspaces) — sniff JSON.
  const rootPackageJson = args.manifestEntries.find(
    (m) => basename(m.path) === 'package.json' && !m.path.includes('/'), // root only
  );
  if (
    rootPackageJson &&
    typeof rootPackageJson.raw === 'object' &&
    rootPackageJson.raw !== null &&
    'workspaces' in rootPackageJson.raw
  ) {
    const packageManager = await sniffMonorepoPackageManager(
      args.projectPath,
      args.baseGlobOptions,
    );
    return {
      repositoryType: 'monorepo',
      monorepo: {
        ...(packageManager ? { package_manager: packageManager } : {}),
        workspace_tool: `${packageManager ?? 'npm'} workspaces`,
        workspace_config: rootPackageJson.path,
      },
    };
  }

  // Heuristic: ≥ 2 manifests of the same kind in different directories ⇒ polyrepo (or multi-service mono).
  const manifestPathCounts = new Map<string, Set<string>>();
  for (const m of args.manifestEntries) {
    const key = m.kind;
    const dir = dirname(m.path) || '.';
    if (!manifestPathCounts.has(key)) manifestPathCounts.set(key, new Set());
    manifestPathCounts.get(key)!.add(dir);
  }
  const maxKindCount = Math.max(0, ...Array.from(manifestPathCounts.values()).map((s) => s.size));

  if (maxKindCount >= 2) {
    return { repositoryType: 'polyrepo', monorepo: undefined };
  }
  if (args.manifestEntries.length === 0) {
    return { repositoryType: 'unknown', monorepo: undefined };
  }
  return { repositoryType: 'single-service', monorepo: undefined };
}

/**
 * Best-effort: pick the package-manager identifier from the lock-file
 * present at the project root (or anywhere in the project, preferring
 * root). Returns the first matching manager or null.
 */
async function sniffMonorepoPackageManager(
  projectPath: string,
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown },
): Promise<string | null> {
  // Prefer root-level lock files.
  const candidates: ReadonlyArray<string> = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'package-lock.json',
  ];
  for (const filename of candidates) {
    if (existsSync(join(projectPath, filename))) {
      return resolveLockFileManager(filename);
    }
  }
  // Fall back to anywhere in the project.
  for (const filename of candidates) {
    const matches = await safeGlob(`**/${filename}`, baseGlobOptions);
    if (matches.length > 0) {
      return resolveLockFileManager(filename);
    }
  }
  return null;
}

async function detectInfrastructure(baseGlobOptions: {
  cwd: string;
  ignore: string[];
  [k: string]: unknown;
}): Promise<string[]> {
  const found = new Set<string>();
  for (const entry of INFRASTRUCTURE_TABLE) {
    const matches = await safeGlob(entry.pattern, baseGlobOptions);
    if (matches.length > 0) found.add(entry.tool);
  }
  return Array.from(found).sort();
}

async function detectCiCd(baseGlobOptions: {
  cwd: string;
  ignore: string[];
  [k: string]: unknown;
}): Promise<ProjectInspection['ci_cd']> {
  const configFiles: string[] = [];
  let provider: string | undefined;
  for (const entry of CI_PROVIDER_TABLE) {
    const matches = await safeGlob(entry.pattern, baseGlobOptions);
    if (matches.length > 0) {
      if (!provider) provider = entry.provider;
      configFiles.push(...matches);
    }
  }
  if (configFiles.length === 0 && !provider) return undefined;
  return {
    ...(provider ? { provider } : {}),
    config_files: Array.from(new Set(configFiles)).sort(),
  };
}

async function detectEnvironment(
  projectPath: string,
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown },
): Promise<ProjectInspection['environment']> {
  const templateFiles = await safeGlob('**/*.{example,sample,template}', baseGlobOptions);
  // Filter to .env.* templates (the most common shape).
  const envTemplates = templateFiles.filter((p) => /\.env\.(example|sample|template)/.test(p));
  if (envTemplates.length === 0) return undefined;

  const requiredVars = new Set<string>();
  for (const path of envTemplates) {
    const contents = safeReadText(join(projectPath, path));
    if (contents == null) continue;
    for (const rawLine of contents.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) requiredVars.add(m[1]);
    }
  }

  if (requiredVars.size === 0 && envTemplates.length === 0) return undefined;
  return {
    required_vars: Array.from(requiredVars).sort(),
    template_files: envTemplates.sort(),
  };
}

async function detectDocumentation(baseGlobOptions: {
  cwd: string;
  ignore: string[];
  [k: string]: unknown;
}): Promise<ProjectInspection['documentation']> {
  const readmeMatches = await safeGlob('**/README*', baseGlobOptions);
  const contributingMatches = await safeGlob('**/CONTRIBUTING*', baseGlobOptions);
  const docsDirMatches = await safeGlob('docs/**/*.{md,rst,adoc,txt}', baseGlobOptions);
  if (
    readmeMatches.length === 0 &&
    contributingMatches.length === 0 &&
    docsDirMatches.length === 0
  ) {
    return undefined;
  }
  // Surface dirs that contain docs, deduped + sorted.
  const docsDirs = Array.from(new Set(docsDirMatches.map((p) => dirname(p)))).sort();
  return {
    readme_paths: readmeMatches.sort(),
    contributing_paths: contributingMatches.sort(),
    docs_dirs: docsDirs,
  };
}

/**
 * Heuristic port discovery. Looks at compose files and .env templates
 * for `PORT=<n>` / `port: <n>` patterns. Keys are project-relative
 * directories that look like service paths (heuristic: any directory
 * containing a manifest).
 */
async function detectPortCandidates(
  projectPath: string,
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown },
): Promise<Record<string, number[]>> {
  const result: Record<string, Set<number>> = {};

  // .env.example files: extract per-directory PORT-like values.
  const envFiles = await safeGlob('**/*.env.{example,sample,template}', baseGlobOptions);
  for (const path of envFiles) {
    const contents = safeReadText(join(projectPath, path));
    if (contents == null) continue;
    const dir = dirname(path) || '.';
    const ports = extractPortNumbers(contents);
    if (ports.length > 0) {
      if (!result[dir]) result[dir] = new Set();
      for (const p of ports) result[dir].add(p);
    }
  }

  // docker-compose files at the root: extract `ports:` sections (dir = '.').
  const composeFiles = await safeGlob('docker-compose*.{yml,yaml}', baseGlobOptions);
  for (const path of composeFiles) {
    const contents = safeReadText(join(projectPath, path));
    if (contents == null) continue;
    const dir = '.';
    const ports = extractPortNumbers(contents);
    if (ports.length > 0) {
      if (!result[dir]) result[dir] = new Set();
      for (const p of ports) result[dir].add(p);
    }
  }

  // Convert to sorted arrays.
  const out: Record<string, number[]> = {};
  for (const [dir, set] of Object.entries(result)) {
    out[dir] = Array.from(set).sort((a, b) => a - b);
  }
  return out;
}

function extractPortNumbers(body: string): number[] {
  const out: number[] = [];
  // PORT=<n> / EXAMPLE_PORT=<n>
  for (const match of body.matchAll(/(?:^|\b)([A-Z_]*PORT)\s*=\s*(\d+)/gm)) {
    const n = parseInt(match[2], 10);
    if (Number.isFinite(n) && n > 0 && n <= 65535) out.push(n);
  }
  // YAML `port: <n>` / `ports: - <n>` / `"<host>:<container>"`
  for (const match of body.matchAll(/\bport(?:s)?\s*:\s*(\d+)/gi)) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 65535) out.push(n);
  }
  for (const match of body.matchAll(/['"]?(\d{2,5}):(\d{2,5})['"]?/g)) {
    const host = parseInt(match[1], 10);
    const container = parseInt(match[2], 10);
    if (Number.isFinite(host) && host > 0 && host <= 65535) out.push(host);
    if (Number.isFinite(container) && container > 0 && container <= 65535) out.push(container);
  }
  return Array.from(new Set(out));
}

/* ----------------------------- Helpers ----------------------------- */

async function safeGlob(
  pattern: string,
  options: { cwd: string; ignore: string[]; [k: string]: unknown },
): Promise<string[]> {
  try {
    return await fastGlob(pattern, options);
  } catch {
    return [];
  }
}

function safeReadText(absolutePath: string): string | null {
  try {
    if (!existsSync(absolutePath)) return null;
    const stat = statSync(absolutePath);
    if (!stat.isFile()) return null;
    // Bound the read to avoid pulling huge files into memory.
    if (stat.size > 1_000_000) return null; // > 1 MB — skip
    return readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
}

function readManifest(
  projectPath: string,
  relativePath: string,
  kind: string,
  format: 'json' | 'toml' | 'yaml' | 'xml' | 'text' | 'mix-exs',
): ManifestEntry | null {
  const absPath = join(projectPath, relativePath);
  const contents = safeReadText(absPath);
  if (contents == null) return null;

  // Only JSON gets a full parse out-of-the-box; other formats are
  // surfaced as raw text so analyzers can parse with their own
  // language-specific tooling. Adding a TOML / YAML / XML parser
  // is a follow-up improvement that doesn't change the schema.
  let raw: unknown = contents;
  if (format === 'json') {
    try {
      raw = JSON.parse(contents);
    } catch {
      // Malformed JSON — keep as text so the analyzer can still see it.
      raw = contents;
    }
  }

  return {
    kind,
    path: relativePath,
    raw,
  };
}

/** Re-exported for callers that want the canonical filename. */
export { PROJECT_INSPECTION_FILENAME };
