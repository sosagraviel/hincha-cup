/**
 * Deterministic `## Tech Stack` CANDIDATE renderer. Emits one `### <service>`
 * block per service (a single-repo is just the one-service case), each listing
 * that service's framework + its own production dependencies, plus a shared
 * preamble (non-folded runtimes + monorepo package manager / workspace tool).
 * The synthesizer curates each block into a single bullet — this output is NOT
 * pasted verbatim.
 *
 * Stack-agnostic: every entry is read from the bundle; no hardcoded language /
 * framework name tokens.
 */

interface TechStackInput {
  /** Map of language → file count from Phase 4 file-counter / inspection. */
  languages?: Record<string, number> | unknown;
  /** runtime versions map keyed by language family. */
  runtimes?: Record<string, unknown> | unknown;
  /**
   * Services array (from structure-architecture-analyzer). Each entry
   * may have `frameworks.main` we surface as a top-level framework
   * line.
   */
  services?: Array<{
    id?: string;
    type?: string;
    framework_main?: string;
    language?: string;
  }>;
  /** Build tools / package managers / test runners detected per inspection / analyzers. */
  build_tools?: unknown;
  /** Monorepo metadata (workspace tool, package manager). */
  monorepo?: unknown;
  /**
   * Tech-stack analyzer `findings.dependencies` slice
   * (`{ by_service: { <id>: { production, development } } }`). Production
   * dependencies are surfaced as version-bearing bullets so the Tech Stack
   * is more than a single framework line in single-repo projects.
   */
  dependencies?: unknown;
}

/**
 * Per-service dependency cap. Each `### <service>` block lists at most this many
 * of its own production dependencies; the synthesizer curates the block down to
 * one bullet (framework + its most important deps).
 */
const MAX_DEPS_PER_SERVICE = 5;

/**
 * Render the `## Tech Stack` CANDIDATE. Uniform across single- and multi-service
 * projects: a shared preamble (non-folded runtimes + monorepo package manager /
 * workspace tool) followed by one `### <service>` block per service — a
 * single-repo is simply the one-service case. Each block carries that service's
 * own framework + production dependencies (never a global union). The
 * synthesizer turns each block into one bullet (`- **<id>** (<lang>) — …`).
 */
export function renderTechStackMarkdown(input: TechStackInput): string {
  const services = input.services ?? [];
  const out: string[] = ['## Tech Stack', ''];

  const runtimes = isRecord(input.runtimes) ? input.runtimes : {};
  const foldedRuntimeKeys = new Set<string>();
  for (const svc of services) {
    const lang = (svc.language ?? '').toLowerCase();
    if (lang && typeof runtimes[lang] === 'string' && (runtimes[lang] as string).length > 0) {
      foldedRuntimeKeys.add(lang);
    }
  }

  for (const [name, version] of Object.entries(runtimes)) {
    if (typeof version !== 'string' || version.length === 0) continue;
    if (name === 'tool-versions-raw') continue;
    if (foldedRuntimeKeys.has(name.toLowerCase())) continue;
    out.push(`- **${capitaliseLangName(name)}** ${version} — runtime`);
  }
  appendMonorepoLines(out, input.monorepo);

  for (const svc of services) {
    const id = (svc.id ?? svc.type ?? '').trim();
    if (!id) continue;
    const deps = productionDepsForService(input.dependencies, id);
    const fwRaw = (svc.framework_main ?? '').trim();
    const fw = fwRaw ? splitDependencySpec(fwRaw) : null;
    if (!fw && deps.length === 0 && !svc.language) continue;

    out.push('', `### ${id}${serviceLangLabel(svc.language, runtimes)}`);

    const fwKey = fw ? fw.name.toLowerCase() : '';
    if (fw) {
      const fwVersion =
        fw.version || deps.find((d) => d.name.toLowerCase() === fwKey)?.version || '';
      out.push(`- **${fw.name}**${fwVersion ? ` ${fwVersion}` : ''} — framework`);
    }

    let shown = 0;
    for (const dep of deps) {
      if (dep.name.toLowerCase() === fwKey) continue;
      if (shown >= MAX_DEPS_PER_SERVICE) break;
      out.push(`- **${dep.name}**${dep.version ? ` ${dep.version}` : ''}`);
      shown += 1;
    }
  }

  if (out.length === 2) {
    out.push('(not determined by analysis)');
  }

  return out.join('\n') + '\n';
}

/**
 * `(<Language>[ <runtime-version>])` block label. Folds the runtime version into
 * the label only when the language name is itself a `runtimes` key
 * (python→python, go→go, ruby→ruby, …), so it never mislabels, e.g., a Node
 * version on a TypeScript service (whose runtime key is `node`, not the language).
 */
function serviceLangLabel(language: string | undefined, runtimes: Record<string, unknown>): string {
  const lang = (language ?? '').trim();
  if (!lang) return '';
  const v = runtimes[lang.toLowerCase()];
  const version = typeof v === 'string' && v.length > 0 ? ` ${v}` : '';
  return ` (${capitaliseLangName(lang)}${version})`;
}

/** Append monorepo package-manager / workspace-tool lines when present. */
function appendMonorepoLines(out: string[], monorepo: unknown): void {
  if (!isRecord(monorepo)) return;
  const pm = monorepo.package_manager;
  if (typeof pm === 'string' && pm.length > 0) {
    out.push(`- **${pm}** — package manager`);
  }
  const tool = monorepo.workspace_tool ?? monorepo.tool;
  if (typeof tool === 'string' && tool.length > 0) {
    out.push(`- **${tool}** — workspace tool`);
  }
}

function capitaliseLangName(name: string): string {
  const lower = name.toLowerCase();
  const specials: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    nodejs: 'Node.js',
    node: 'Node.js',
    csharp: 'C#',
    cpp: 'C++',
    fsharp: 'F#',
    objectivec: 'Objective-C',
    php: 'PHP',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yaml: 'YAML',
    shell: 'Shell',
    bash: 'Bash',
    tsx: 'TSX',
    jsx: 'JSX',
    sql: 'SQL',
    dotnet: '.NET',
    golang: 'Go',
    go: 'Go',
  };
  if (specials[lower]) return specials[lower];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Production dependencies for a single service, parsed and deduped within that
 * service, order preserved. Used by the multi-service per-service candidate so
 * each `### <service>` block lists only its own dependencies.
 */
function productionDepsForService(
  raw: unknown,
  serviceId: string,
): Array<{ name: string; version: string }> {
  const byService = isRecord(raw) && isRecord(raw.by_service) ? raw.by_service : {};
  const svc = byService[serviceId];
  const production = isRecord(svc) && Array.isArray(svc.production) ? svc.production : [];
  const out: Array<{ name: string; version: string }> = [];
  const seen = new Set<string>();
  for (const entry of production) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    const { name, version } = splitDependencySpec(entry);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, version });
  }
  return out;
}

/**
 * Split a dependency / framework spec into `{ name, version }`. Handles npm
 * (`express@4.18.2`, `@scope/pkg@^1.2.3`), pip-style operators
 * (`fastapi>=0.115.0`), pip extras (`uvicorn[standard]>=0.30`), and
 * space-versioned framework names (`NestJS 11`). Names are returned verbatim
 * — no case normalisation — so `PyJWT` / `SQLAlchemy` survive intact.
 */
function splitDependencySpec(raw: string): { name: string; version: string } {
  const s = raw.trim();
  const atIdx = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@');
  if (atIdx > 0) {
    return { name: s.slice(0, atIdx), version: cleanVersion(s.slice(atIdx + 1)) };
  }
  const m = s.match(/^(@?[^\s<>=~!^;[]+(?:\/[^\s<>=~!^;[]+)?)\s*(.*)$/);
  if (m && m[1]) {
    return { name: m[1], version: cleanVersion(m[2] ?? '') };
  }
  return { name: s, version: '' };
}

/** Strip pip extras (`[standard]`) and environment markers (`; python_version…`). */
function cleanVersion(raw: string): string {
  return raw
    .replace(/^\[[^\]]*\]/, '')
    .replace(/;.*$/, '')
    .trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
