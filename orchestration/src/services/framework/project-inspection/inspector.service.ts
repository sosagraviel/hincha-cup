/**
 * Project-inspection service.
 *
 * Walks the project filesystem at Phase 0 and produces the
 * `ProjectInspection` structure consumed by every Phase-1 analyzer.
 *
 * Stack-agnostic by design: every language-specific decision lives
 * in a lookup table (`runtime-version-table.ts`,
 * `lock-file-table.ts`, `manifest-parser-table.ts`). Adding a new
 * language family is a one-line PR per table.
 *
 * Naming-agnostic: the inspector NEVER pattern-matches on role
 * names. It surfaces paths and parsed manifests verbatim.
 *
 * Best-effort: any individual file failure is logged and skipped.
 * The inspector NEVER throws — Phase 0 must continue even on a
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

const FAST_GLOB_OPTIONS = {
  dot: true,
  onlyFiles: true,
  followSymbolicLinks: false,
  suppressErrors: true,
  unique: true,
};

const MAX_FILES_PER_PATTERN = 500;

/**
 * CI provider table — file-presence → provider name. Stack-agnostic.
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
 * Stack-agnostic and order-sensitive: the first match wins.
 */
const WORKSPACE_TOOL_TABLE: ReadonlyArray<{ tool: string; pattern: string }> = [
  { tool: 'pnpm workspaces', pattern: 'pnpm-workspace.yaml' },
  { tool: 'Nx', pattern: 'nx.json' },
  { tool: 'Turborepo', pattern: 'turbo.json' },
  { tool: 'Lerna', pattern: 'lerna.json' },
  { tool: 'go workspaces', pattern: 'go.work' },
];

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

  const manifestEntries: ManifestEntry[] = [];

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

  const { repositoryType, monorepo } = await detectRepositoryShape({
    projectPath: args.projectPath,
    baseGlobOptions,
    manifestEntries,
  });

  const infrastructure = await detectInfrastructure(baseGlobOptions);
  const ciCd = await detectCiCd(baseGlobOptions);
  const environment = await detectEnvironment(args.projectPath, baseGlobOptions);
  const documentation = await detectDocumentation(baseGlobOptions);
  const portCandidates = await detectPortCandidates(args.projectPath, baseGlobOptions);
  const infrastructureServicesHints = await detectInfrastructureServicesHints(
    args.projectPath,
    baseGlobOptions,
  );

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
    ...(infrastructureServicesHints.length > 0
      ? { infrastructure_services_hints: infrastructureServicesHints }
      : {}),
  };

  const validated = ProjectInspectionSchema.parse(inspection);

  return {
    inspection: validated,
    generatedAt,
    durationMs: Date.now() - startedAt,
    diagnostic,
  };
}

async function detectRepositoryShape(args: {
  projectPath: string;
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown };
  manifestEntries: ManifestEntry[];
}): Promise<{
  repositoryType: ProjectInspection['repository_type'];
  monorepo: ProjectInspection['monorepo'];
}> {
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

  const rootPackageJson = args.manifestEntries.find(
    (m) => basename(m.path) === 'package.json' && !m.path.includes('/'),
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

  const out: Record<string, number[]> = {};
  for (const [dir, set] of Object.entries(result)) {
    out[dir] = Array.from(set).sort((a, b) => a - b);
  }
  return out;
}

function extractPortNumbers(body: string): number[] {
  const out: number[] = [];
  for (const match of body.matchAll(/(?:^|\b)([A-Z_]*PORT)\s*=\s*(\d+)/gm)) {
    const n = parseInt(match[2], 10);
    if (Number.isFinite(n) && n > 0 && n <= 65535) out.push(n);
  }
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

/**
 * Extract NAMED infrastructure-service → port pairs from common compose /
 * emulator config shapes.
 *
 * Stack-agnostic, regex-driven (no yaml dep). Source files covered:
 *   - docker-compose.{yml,yaml} / compose.{yml,yaml} → service-block parser
 *   - firebase.json → emulators.<name>.port
 *
 * The output feeds the data-flows analyzer's `infrastructure_services[]`
 * field. The analyzer still owns SaaS opt-outs and the wiki-label
 * normalisation — the inspector just provides the raw {name, port,
 * source_file} signal so the analyzer doesn't have to re-Glob and
 * re-parse the same files.
 */
async function detectInfrastructureServicesHints(
  projectPath: string,
  baseGlobOptions: { cwd: string; ignore: string[]; [k: string]: unknown },
): Promise<Array<{ name: string; port: number; source_file: string }>> {
  const hints: Array<{ name: string; port: number; source_file: string }> = [];

  const composeFiles = await safeGlob('**/docker-compose*.{yml,yaml}', baseGlobOptions);
  composeFiles.push(...(await safeGlob('**/compose.{yml,yaml}', baseGlobOptions)));

  for (const relPath of composeFiles) {
    const contents = safeReadText(join(projectPath, relPath));
    if (contents == null) continue;
    const parsed = parseDockerComposeServicePorts(contents);
    for (const entry of parsed) {
      hints.push({ ...entry, source_file: relPath });
    }
  }

  const firebaseFiles = await safeGlob('**/firebase.json', baseGlobOptions);
  for (const relPath of firebaseFiles) {
    const contents = safeReadText(join(projectPath, relPath));
    if (contents == null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    const emulators = (parsed as Record<string, unknown>).emulators;
    if (!isObject(emulators)) continue;
    for (const [name, value] of Object.entries(emulators as Record<string, unknown>)) {
      if (!isObject(value)) continue;
      const port = (value as Record<string, unknown>).port;
      if (typeof port === 'number' && Number.isFinite(port) && port > 0 && port <= 65535) {
        hints.push({ name, port, source_file: relPath });
      }
    }
  }

  const seen = new Set<string>();
  const out: typeof hints = [];
  for (const h of hints) {
    const key = `${h.source_file}::${h.name}::${h.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * Regex-based docker-compose service-block parser. Extracts
 * `<service_name>: ports: ["<host>:<container>", …]` mappings.
 * Returns one entry per (service, first host port). Variables like
 * `${X_PORT:-5432}` are resolved to the default when present; otherwise
 * we use the literal numeric host port. The agent retains responsibility
 * for handling exotic shapes (multi-line literals, anchors / aliases).
 */
function parseDockerComposeServicePorts(yaml: string): Array<{ name: string; port: number }> {
  const lines = yaml.split('\n');
  const out: Array<{ name: string; port: number }> = [];

  let inServices = false;
  let servicesIndent = -1;
  let currentService: string | null = null;
  let currentServiceIndent = -1;
  let inPorts = false;
  let portsIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.replace(/#.*$/, '').trimEnd();
    if (stripped.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;

    if (!inServices) {
      const m = stripped.match(/^services\s*:\s*$/);
      if (m) {
        inServices = true;
        servicesIndent = indent;
      }
      continue;
    }

    if (indent <= servicesIndent && stripped.trim().length > 0) {
      inServices = false;
      currentService = null;
      inPorts = false;
      continue;
    }

    const serviceHeader = stripped.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*$/);
    if (serviceHeader && indent > servicesIndent) {
      if (currentService !== null && indent > currentServiceIndent) {
        if (serviceHeader[1] === 'ports') {
          inPorts = true;
          portsIndent = indent;
        }
        continue;
      }
      currentService = serviceHeader[1];
      currentServiceIndent = indent;
      inPorts = false;
      continue;
    }

    if (currentService !== null && indent > currentServiceIndent) {
      const inlinePorts = stripped.match(/^\s*ports\s*:\s*\[(.+)\]\s*$/);
      if (inlinePorts) {
        const port = extractFirstHostPort(inlinePorts[1]);
        if (port != null) {
          out.push({ name: currentService, port });
        }
        continue;
      }
    }

    if (!inPorts || currentService == null) continue;

    if (indent <= portsIndent && !stripped.trimStart().startsWith('-')) {
      inPorts = false;
      continue;
    }

    const portLine = stripped.trim();
    if (!portLine.startsWith('-')) continue;
    const value = portLine
      .slice(1)
      .trim()
      .replace(/^["']|["']$/g, '');

    let port: number | null = null;
    const interpMatch = value.match(/^\$\{[^}]*:-(\d+)\}/);
    if (interpMatch) {
      port = parseInt(interpMatch[1], 10);
    } else {
      const colonIdx = value.indexOf(':');
      const hostSide = colonIdx >= 0 ? value.slice(0, colonIdx) : value;
      if (/^\d+$/.test(hostSide)) port = parseInt(hostSide, 10);
    }
    if (port != null && port > 0 && port <= 65535) {
      out.push({ name: currentService, port });
      inPorts = false;
    }
  }

  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract the FIRST host port from a YAML flow-array body. Accepts:
 *   `"6379:6379"` → 6379
 *   `6379:6379`   → 6379
 *   `"${X:-5432}:5432"` → 5432
 *   `6379`        → 6379
 */
function extractFirstHostPort(body: string): number | null {
  const first = body
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  const interp = first.match(/^\$\{[^}]*:-(\d+)\}/);
  if (interp) {
    const n = parseInt(interp[1], 10);
    if (n > 0 && n <= 65535) return n;
  }
  const colonIdx = first.indexOf(':');
  const hostSide = colonIdx >= 0 ? first.slice(0, colonIdx) : first;
  if (/^\d+$/.test(hostSide)) {
    const n = parseInt(hostSide, 10);
    if (n > 0 && n <= 65535) return n;
  }
  return null;
}

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
    if (stat.size > 1_000_000) return null;
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

  let raw: unknown = contents;
  if (format === 'json') {
    try {
      raw = JSON.parse(contents);
    } catch {
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
