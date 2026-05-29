/**
 * Deterministic `## Tech Stack` section renderer. Produces a markdown
 * string the synthesizer copies verbatim into CLAUDE.md.
 *
 * Inputs are the curated synthesis bundle (summary slice) — the same
 * data structure the synthesizer would consume.
 *
 * Stack-agnostic: every entry is read from the bundle verbatim; no
 * hardcoded language / framework name tokens.
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
}

export function renderTechStackMarkdown(input: TechStackInput): string {
  const out: string[] = ['## Tech Stack', ''];

  const langs = normaliseLanguageMap(input.languages);
  for (const [name, count] of langs) {
    const display = capitaliseLangName(name);
    out.push(
      `- **${display}**${count !== undefined ? ` — ${count} file${count === 1 ? '' : 's'}` : ''}`,
    );
  }

  const runtimes = isRecord(input.runtimes) ? input.runtimes : {};
  for (const [name, version] of Object.entries(runtimes)) {
    if (typeof version !== 'string' || version.length === 0) continue;
    if (name === 'tool-versions-raw') continue;
    out.push(`- **${capitaliseLangName(name)}** ${version} — runtime`);
  }

  const frameworks = new Set<string>();
  for (const svc of input.services ?? []) {
    const fw = (svc.framework_main ?? '').trim();
    if (fw && !frameworks.has(fw)) {
      frameworks.add(fw);
      out.push(`- **${cleanFrameworkName(fw)}** — framework (${svc.id ?? svc.type ?? '—'})`);
    }
  }

  if (isRecord(input.monorepo)) {
    const pm = input.monorepo.package_manager;
    if (typeof pm === 'string' && pm.length > 0) {
      out.push(`- **${pm}** — package manager`);
    }
    const tool = input.monorepo.workspace_tool ?? input.monorepo.tool;
    if (typeof tool === 'string' && tool.length > 0) {
      out.push(`- **${tool}** — workspace tool`);
    }
  }

  if (out.length === 2) {
    out.push('(not determined by analysis)');
  }

  return out.join('\n') + '\n';
}

function normaliseLanguageMap(raw: unknown): Array<[string, number | undefined]> {
  if (!isRecord(raw)) {
    if (Array.isArray(raw)) {
      return raw
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .map((v) => [v, undefined] as [string, undefined]);
    }
    return [];
  }
  const entries: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number') entries.push([k, v]);
    else if (isRecord(v) && typeof v.count === 'number') entries.push([k, v.count]);
  }
  return entries.sort((a, b) => b[1] - a[1]);
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

function cleanFrameworkName(raw: string): string {
  return raw.replace(/[\s^~>=<].*$/, '').replace(/^@[^/]+\//, '');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
