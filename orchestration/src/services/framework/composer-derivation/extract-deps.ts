/**
 * Manifest dependency extraction.
 *
 * Pure functions that pull the list of dependency token strings out of
 * a parsed manifest entry. Stack-agnostic: handles every manifest
 * shape the Phase 0 inspector knows about (JSON for `package.json` /
 * `composer.json`, raw text for `pyproject.toml` / `Gemfile` /
 * `go.mod` / `Cargo.toml` / `pom.xml` / `build.gradle*` / `*.csproj`).
 *
 * `extractDepsFromManifest()` returns a deduped, sorted array of
 * dep-name tokens. Tokens are returned verbatim from the manifest so
 * the registry's substring match (case-insensitive) can find them.
 * If a manifest format isn't recognised the function returns `[]` —
 * never throws.
 */

import type { ManifestEntry } from '../../../schemas/project-inspection.schema.js';

export function extractDepsFromManifest(entry: ManifestEntry): string[] {
  const kind = entry.kind.toLowerCase();
  const raw = entry.raw;

  if (isRecord(raw)) {
    if (kind === 'package.json') return depsFromPackageJson(raw);
    if (kind === 'composer.json') return depsFromComposerJson(raw);
  }

  if (typeof raw === 'string') {
    if (kind === 'pyproject.toml') return depsFromPyprojectToml(raw);
    if (kind === 'requirements.txt') return depsFromRequirementsTxt(raw);
    if (kind === 'pipfile') return depsFromPipfile(raw);
    if (kind === 'cargo.toml') return depsFromCargoToml(raw);
    if (kind === 'gemfile' || kind.endsWith('.gemspec')) return depsFromGemfile(raw);
    if (kind === 'go.mod') return depsFromGoMod(raw);
    if (kind === 'pom.xml') return depsFromPomXml(raw);
    if (kind === 'build.gradle' || kind === 'build.gradle.kts') return depsFromGradle(raw);
    if (kind.endsWith('.csproj') || kind.endsWith('.fsproj') || kind.endsWith('.vbproj'))
      return depsFromMsbuild(raw);
    if (kind === 'mix.exs') return depsFromMixExs(raw);
    if (kind === 'pubspec.yaml') return depsFromPubspec(raw);
  }

  return [];
}

function depsFromPackageJson(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const obj = raw[section];
    if (isRecord(obj)) for (const k of Object.keys(obj)) out.add(k);
  }
  return Array.from(out).sort();
}

function depsFromComposerJson(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const section of ['require', 'require-dev']) {
    const obj = raw[section];
    if (isRecord(obj)) for (const k of Object.keys(obj)) out.add(k);
  }
  return Array.from(out).sort();
}

function depsFromPyprojectToml(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["{]/gm)) {
    const name = m[1];
    if (
      name === 'python' ||
      name === 'tool' ||
      name === 'project' ||
      name === 'authors' ||
      name === 'name' ||
      name === 'version' ||
      name === 'description'
    )
      continue;
    out.add(name);
  }
  for (const m of raw.matchAll(/\bdependencies\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const pkgM of m[1].matchAll(/["']([A-Za-z0-9_.-][A-Za-z0-9_./-]*)/g)) {
      out.add(pkgM[1].split(/[<>=!~;[\s]/)[0]);
    }
  }
  return Array.from(out)
    .filter((n) => n.length > 0)
    .sort();
}

function depsFromRequirementsTxt(raw: string): string[] {
  const out = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = trimmed.split(/[<>=!~;[\s]/)[0];
    if (name) out.add(name);
  }
  return Array.from(out).sort();
}

function depsFromPipfile(raw: string): string[] {
  return depsFromPyprojectToml(raw); // same shape (TOML)
}

function depsFromCargoToml(raw: string): string[] {
  const out = new Set<string>();
  const sections = raw.split(/^\[[^\]]+\]/m);
  const headers = raw.match(/^\[[^\]]+\]/gm) ?? [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const body = sections[i + 1] ?? '';
    if (!/\bdependencies\]?\s*$/.test(header) && !/\bdev-dependencies\]/.test(header)) continue;
    for (const m of body.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)) out.add(m[1]);
  }
  return Array.from(out).sort();
}

function depsFromGemfile(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)) out.add(m[1]);
  for (const m of raw.matchAll(/add_(?:development_|runtime_)?dependency\s+["']([^"']+)["']/g))
    out.add(m[1]);
  return Array.from(out).sort();
}

function depsFromGoMod(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/^\s*require\s+([^\s(]+)\s+v/gm)) out.add(m[1]);
  const blocks = raw.matchAll(/require\s*\(([^)]+)\)/g);
  for (const block of blocks) {
    for (const m of block[1].matchAll(/^\s*([^\s/]+\/[^\s]+)\s+v/gm)) out.add(m[1]);
  }
  return Array.from(out).sort();
}

function depsFromPomXml(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(
    /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g,
  )) {
    out.add(`${m[1].trim()}:${m[2].trim()}`);
    out.add(m[2].trim());
  }
  return Array.from(out).sort();
}

function depsFromGradle(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(
    /(?:implementation|api|compile|runtimeOnly|testImplementation|kapt|annotationProcessor)\s*[("']\s*['"]?([^'"\s:)]+:[^'"\s:)]+)(?::[^'"\s)]+)?['"]?/g,
  )) {
    const coord = m[1];
    out.add(coord);
    const [, artifact] = coord.split(':');
    if (artifact) out.add(artifact);
  }
  return Array.from(out).sort();
}

function depsFromMsbuild(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/<PackageReference\s+Include="([^"]+)"/g)) out.add(m[1]);
  return Array.from(out).sort();
}

function depsFromMixExs(raw: string): string[] {
  const out = new Set<string>();
  for (const m of raw.matchAll(/\{:([a-zA-Z0-9_]+)\s*,/g)) out.add(m[1]);
  return Array.from(out).sort();
}

function depsFromPubspec(raw: string): string[] {
  const out = new Set<string>();
  let inDeps = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*(dependencies|dev_dependencies):\s*$/.test(line)) {
      inDeps = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inDeps = false;
      continue;
    }
    if (!inDeps) continue;
    const m = line.match(/^\s{2,}([A-Za-z0-9_]+):/);
    if (m) out.add(m[1]);
  }
  return Array.from(out).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
