import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';
import matter from 'gray-matter';
import { computeGraphCommit, computeGraphVersion, invokeWikiAgent } from './agent-invoker.js';
import { buildCoreSpecs, buildPrompt, buildServiceSpec } from './document-specs.js';
import { buildContextSection, stripMarkdownFrontmatter, withFrontmatter } from './frontmatter.js';
import { getServices } from './service-discovery.js';
import {
  ALL_SCHEMA_FILENAMES,
  GENERATED_BY,
  LLM_WIKI_FILE_NAMES,
  REQUIRED_ANALYZERS,
  SCHEMA_FILENAME_BY_PROVIDER,
  type CoreLlmDocumentType,
  type GeneratedLlmWiki,
  type GeneratedWikiFile,
  type GeneratedWikiFilename,
  type WikiAnalyzerOutputs,
  type WikiDocumentSpec,
  type WikiGeneratorServiceOptions,
  type WikiGraphState,
  type WikiSource,
} from './types.js';
import { isEmptyValue, isRecord, slugifyServiceId, uniqueStrings } from './utils.js';

export * from './types.js';
export { slugifyServiceId } from './utils.js';
export {
  buildGraphDisciplineSection,
  upsertFencedSection,
  upsertLlmWikiContextSection,
} from './frontmatter.js';

export interface WikiGenerationMetadata {
  generatedAt: string;
  graphVersion: string;
  graphCommit: string;
}

export interface WikiStateJsonMeta {
  graph_commit: string;
  graph_sha: string;
  pipeline_version: string;
  last_indexed_commit: string;
  last_ingest_at: string;
  graph_stats?: CodeGraphStats;
}

export class WikiGeneratorService {
  constructor(private readonly options: WikiGeneratorServiceOptions) {}

  /**
   * Validate that inputs are sufficient to generate the wiki.
   * Called by the preparation node up-front so the parallel fan-out
   * never starts on missing inputs.
   */
  validate(): void {
    const { graph, analyzers, stackProfile } = this.options;

    if (!graph.available) {
      throw new Error('Code graph is required for wiki generation');
    }
    if (!graph.path) {
      throw new Error('Code graph path is required for wiki generation');
    }
    if (!existsSync(graph.path)) {
      throw new Error(`Code graph database not found: ${graph.path}`);
    }

    for (const analyzerKey of REQUIRED_ANALYZERS) {
      if (!analyzers[analyzerKey]) {
        throw new Error(`Required Phase 1 analyzer output missing: ${analyzerKey}`);
      }
    }

    if (getServices(stackProfile).length === 0) {
      throw new Error('stack_profile.services must include at least one service');
    }
  }

  /**
   * Compute deterministic metadata shared across every doc in this generation
   * pass (so frontmatter stays consistent).
   */
  computeMetadata(): WikiGenerationMetadata {
    return {
      generatedAt: this.options.generatedAt ?? new Date().toISOString(),
      graphVersion: computeGraphVersion(this.options.graph.path!),
      graphCommit: computeGraphCommit(this.options.projectPath),
    };
  }

  /**
   * Generate a single LLM-backed core doc by type. Invoked once per parallel
   * core-doc node.
   */
  async generateCoreDoc(
    documentType: CoreLlmDocumentType,
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): Promise<GeneratedWikiFile> {
    const spec = buildCoreSpecs(this.options).find((s) => s.documentType === documentType);
    if (!spec) {
      throw new Error(`Unknown core doc type: ${documentType}`);
    }
    return this.generateDocument(spec, generatedAt, graphVersion, graphCommit);
  }

  /**
   * Generate every per-service doc with bounded concurrency.
   *
   * Service docs are LLM-backed and each prompt carries the (sliced) Phase 1
   * analyzer JSON for that service. Unbounded `Promise.all` left half the
   * sessions in `pending` state during the gira smoke run with five services.
   * Default bound is 3 in flight; override via
   * `WikiGeneratorServiceOptions.serviceDocConcurrency`.
   *
   * Order of the returned array matches the service inventory order — the
   * downstream finalization node (and tests) rely on positional stability.
   */
  async generateServiceDocsConcurrent(
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): Promise<GeneratedWikiFile[]> {
    const services = getServices(this.options.stackProfile);
    const concurrency = Math.max(1, this.options.serviceDocConcurrency ?? 3);
    const results: GeneratedWikiFile[] = new Array(services.length);

    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, services.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= services.length) return;
        const spec = buildServiceSpec(
          services[index],
          this.options.analyzers,
          this.options.digestedUpstream,
        );
        results[index] = await this.generateDocument(spec, generatedAt, graphVersion, graphCommit);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /**
   * Deterministic SERVICES.md catalog — a thin reference/index into per-service
   * docs. No LLM call. Uses stackProfile description fields with graceful
   * fallbacks to the first narrative paragraph of the per-service doc body.
   * Filename is relative to the wiki/ subdirectory.
   */
  buildServicesCatalog(
    serviceDocs: GeneratedWikiFile[],
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): GeneratedWikiFile {
    const services = getServices(this.options.stackProfile);
    const rows = services.map((service) => {
      const serviceId = String(service.id ?? service.name);
      const slug = slugifyServiceId(serviceId);
      const description = extractServiceDescription(service, serviceId, serviceDocs);
      return `- [**${serviceId}**](services/${slug}.md) — ${description}`;
    });

    const body = [
      '# Services',
      '',
      'Catalog of services detected in this project. Each entry links to a dedicated',
      'service document under `services/`. See [ARCHITECTURE.md](ARCHITECTURE.md) for',
      'cross-service relationships. Per-service request lifecycles and integrations',
      'live inside the matching `services/<id>.md` page.',
      '',
      rows.length > 0 ? rows.join('\n') : '- No services detected.',
      '',
    ].join('\n');

    return {
      filename: 'wiki/SERVICES.md',
      content: withFrontmatter(body, {
        document_type: 'services',
        summary: 'Catalog of all services detected in this project with links to service docs.',
        confidence: 'high',
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_commit: graphCommit,
        graph_queries_used: [],
        sources: [],
        related: ['wiki/ARCHITECTURE.md'],
        last_verified: generatedAt,
        tags: ['services', 'catalog'],
      }),
    };
  }

  /**
   * Deterministic summary catalog. One entry per generated wiki page, with
   * summary / document_type / confidence / tags / related read directly from
   * each page's frontmatter. A 25-page wiki collapses Tier 1 retrieval from
   * 25 reads to one. Filename is relative to the wiki/ subdirectory.
   */
  buildIndex(
    pages: GeneratedWikiFile[],
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): GeneratedWikiFile {
    return this.generateIndexDocument(pages, generatedAt, graphVersion, graphCommit);
  }

  /**
   * Emit the provider-specific schema document (CLAUDE.md, AGENTS.md, or COPILOT.md).
   * Exactly one such file is emitted per run — never both CLAUDE.md and AGENTS.md.
   * Body content is identical across providers; only the filename differs.
   */
  buildSchemaDoc(projectName: string, generatedAt: string): GeneratedWikiFile {
    const { provider, codeGraphToolCatalog, stackProfile } = this.options;
    const schemaFilename = SCHEMA_FILENAME_BY_PROVIDER[provider];
    const services = getServices(stackProfile);
    const body = buildSchemaDocBody(projectName, schemaFilename, services, codeGraphToolCatalog);

    return {
      filename: schemaFilename,
      content: body,
    };
  }

  /**
   * Emit a Keep-a-Changelog formatted CHANGELOG.md for the wiki root.
   */
  buildChangelog(generatedAt: string, initialEntry: { added: string[] }): GeneratedWikiFile {
    const dateStr = generatedAt.slice(0, 10);
    const addedLines = initialEntry.added.map((item) => `- ${item}`).join('\n');
    const body = [
      '# Changelog',
      '',
      'All notable changes to this wiki are documented in this file.',
      '',
      'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).',
      '',
      '## [Unreleased]',
      '',
      `## [${dateStr}] — Initial generation`,
      '',
      '### Added',
      addedLines,
      '',
    ].join('\n');

    return {
      filename: 'CHANGELOG.md',
      content: body,
    };
  }

  /**
   * Emit a single append-only entry to log.md.
   */
  buildLog(
    generatedAt: string,
    entry: { type: 'ingest'; summary: string; touched_pages: string[] },
  ): GeneratedWikiFile {
    const logEntry = JSON.stringify({
      ts: generatedAt,
      type: entry.type,
      summary: entry.summary,
      touched_pages: entry.touched_pages,
      lint_ok: true,
    });

    return {
      filename: 'log.md',
      content: `${logEntry}\n`,
    };
  }

  /**
   * Emit .state.json for the wiki root. Includes graph_stats when available
   * so consumers can read graph metrics without re-deriving them from Phase 1.
   */
  buildStateJson(meta: WikiStateJsonMeta): GeneratedWikiFile {
    return {
      filename: '.state.json',
      content:
        JSON.stringify(
          {
            graph_commit: meta.graph_commit,
            graph_sha: meta.graph_sha,
            pipeline_version: meta.pipeline_version,
            last_indexed_commit: meta.last_indexed_commit,
            last_ingest_at: meta.last_ingest_at,
            graph_stats: meta.graph_stats ?? null,
          },
          null,
          2,
        ) + '\n',
    };
  }

  /**
   * Emit raw/manifest.json indexing only the genuinely-raw files under
   * raw/snapshots/ and raw/external/. Each entry carries a doc_id (relative
   * path under raw/), sha256, ingested_at, commit, and touched_pages.
   * Analyzer JSONs and graph stats are NOT listed here — they live in
   * .claude-temp/ and .state.json respectively.
   */
  buildRawManifest(sources: WikiSource[]): GeneratedWikiFile {
    const entries = sources.map((s) => ({
      doc_id: s.path,
      sha256: s.sha256,
      ingested_at: s.ingested_at,
      commit: s.commit,
      touched_pages: [] as string[],
    }));

    return {
      filename: 'raw/manifest.json',
      content:
        JSON.stringify(
          {
            generated_at: new Date().toISOString(),
            sources: entries,
          },
          null,
          2,
        ) + '\n',
    };
  }

  /**
   * Copy root-level markdown files from the project into raw/snapshots/, stamping each with sha256.
   *
   * Also forwards any externally-ingested docs from
   * `<projectPath>/docs/llm-wiki/raw/external/` through to the output. The
   * `/ingest-external-docs` skill stages PDFs / Confluence exports / ADRs there
   * with content-addressed filenames; the wiki-generator preserves them
   * verbatim so the on-disk wiki survives a regeneration without losing
   * externally-authored context. The wiki agent absorbs the content into
   * per-service docs via the digestedUpstream pipeline (a future iteration
   * will read these files into `digestedUpstream` automatically).
   */
  collectRawSnapshots(projectPath: string): GeneratedWikiFile[] {
    const rootMarkdownFiles = ['README.md', 'CONTRIBUTING.md'];
    const files: GeneratedWikiFile[] = [];

    for (const fileName of rootMarkdownFiles) {
      const filePath = join(projectPath, fileName);
      if (!existsSync(filePath)) {
        continue;
      }
      const content = readFileSync(filePath, 'utf-8');
      const sha256 = createHash('sha256').update(content).digest('hex');
      const snapshotContent = `<!-- sha256:${sha256} -->\n${content}`;
      files.push({
        filename: `raw/snapshots/${fileName}`,
        content: snapshotContent,
      });
    }

    try {
      const entries = readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }
        if (rootMarkdownFiles.includes(entry.name)) {
          continue;
        }
        const filePath = join(projectPath, entry.name);
        const content = readFileSync(filePath, 'utf-8');
        const sha256 = createHash('sha256').update(content).digest('hex');
        files.push({
          filename: `raw/snapshots/${entry.name}`,
          content: `<!-- sha256:${sha256} -->\n${content}`,
        });
      }
    } catch {}

    // Pass through externally-ingested docs from the prior /wiki-refresh run
    // (or from an explicit /ingest-external-docs invocation). The skill drops
    // these under `<projectPath>/docs/llm-wiki/raw/external/`; the
    // wiki-generator forwards them with their original filenames so the on-disk
    // path survives regeneration.
    const externalRoot = join(projectPath, 'docs', 'llm-wiki', 'raw', 'external');
    if (existsSync(externalRoot)) {
      try {
        const externalEntries = readdirSync(externalRoot, { withFileTypes: true });
        for (const entry of externalEntries) {
          if (!entry.isFile()) continue;
          // Forward any committed file. The skill is responsible for the
          // content shape (`.md` for markdown, raw bytes for diagrams);
          // we don't second-guess the staging contract.
          const filePath = join(externalRoot, entry.name);
          const content = readFileSync(filePath, 'utf-8');
          files.push({
            filename: `raw/external/${entry.name}` as `raw/${string}`,
            content,
          });
        }
      } catch {}
    }

    return files;
  }

  /**
   * Full orchestration: generate all wiki pages, raw files, and governance docs.
   * Returns every file in one GeneratedLlmWiki result.
   */
  async generateAll(): Promise<GeneratedLlmWiki> {
    this.validate();

    const { generatedAt, graphVersion, graphCommit } = this.computeMetadata();
    const projectName = basename(this.options.projectPath);

    // ARCHITECTURE.md is the only cross-cutting LLM-generated wiki page.
    // The previous DATA-FLOWS.md and PATTERNS.md were retired:
    //   - data flows now live per-service in wiki/services/<id>.md
    //   - patterns are prescriptive, in code-conventions / testing-conventions skills
    const architecture = await this.generateCoreDoc(
      'architecture',
      generatedAt,
      graphVersion,
      graphCommit,
    );

    const serviceDocs = await this.generateServiceDocsConcurrent(
      generatedAt,
      graphVersion,
      graphCommit,
    );
    const servicesCatalog = this.buildServicesCatalog(
      serviceDocs,
      generatedAt,
      graphVersion,
      graphCommit,
    );

    // Build the index AFTER every other page so it can read each page's
    // frontmatter (summary / confidence / tags / related) and emit the summary
    // catalog inline. Tier 1 retrieval becomes one read, not N.
    const indexInputPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs];
    const index = this.buildIndex(indexInputPages, generatedAt, graphVersion, graphCommit);

    const wikiPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs, index];

    const rawSnapshots = this.collectRawSnapshots(this.options.projectPath);
    const rawManifest = this.buildRawManifest([]);

    const schemaDoc = this.buildSchemaDoc(projectName, generatedAt);
    const touchedPages = wikiPages.map((f) => f.filename as string);
    const changelog = this.buildChangelog(generatedAt, { added: touchedPages });
    const log = this.buildLog(generatedAt, {
      type: 'ingest',
      summary: `Initial wiki generation for ${projectName}`,
      touched_pages: touchedPages,
    });
    const stateJson = this.buildStateJson({
      graph_commit: graphCommit,
      graph_sha: graphVersion,
      pipeline_version: GENERATED_BY,
      last_indexed_commit: graphCommit,
      last_ingest_at: generatedAt,
      graph_stats: this.options.graph.stats,
    });

    const files: GeneratedWikiFile[] = [
      ...wikiPages,
      ...rawSnapshots,
      rawManifest,
      schemaDoc,
      changelog,
      log,
      stateJson,
    ];

    return {
      files,
      contextSection: buildContextSection(
        this.options.graph,
        SCHEMA_FILENAME_BY_PROVIDER[this.options.provider],
      ),
    };
  }

  /**
   * Generate a single document from a spec. Made public so nodes can exercise
   * this path directly without going through generateAll.
   * Filename is prefixed with wiki/ to place it under the canonical wiki subdirectory.
   */
  async generateDocument(
    spec: WikiDocumentSpec,
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): Promise<GeneratedWikiFile> {
    const prompt = buildPrompt(spec, this.options.projectPath);
    const rawBody = await this.invokeAgent(spec, prompt);
    const body = stripMarkdownFrontmatter(rawBody).trim();

    const wikiFilename = spec.filename.startsWith('wiki/')
      ? spec.filename
      : (`wiki/${spec.filename}` as GeneratedWikiFilename);

    const frontmatter: Record<string, unknown> = {
      document_type: spec.documentType,
      summary: extractSummary(body),
      confidence: 'medium',
      generated_at: generatedAt,
      generated_by: GENERATED_BY,
      graph_version: graphVersion,
      graph_commit: graphCommit,
      graph_queries_used: spec.graphQueriesUsed,
      sources: [],
      related: [],
      last_verified: generatedAt,
      ...spec.frontmatterExtras,
    };
    if (spec.tags && spec.tags.length > 0) {
      frontmatter.tags = spec.tags;
    }

    return {
      filename: wikiFilename,
      content: withFrontmatter(body, frontmatter),
    };
  }

  private invokeAgent(spec: WikiDocumentSpec, prompt: string): Promise<string> {
    if (this.options.agentInvoker) {
      return this.options.agentInvoker({
        documentType: spec.documentType,
        filename: spec.filename,
        prompt,
      });
    }
    return invokeWikiAgent(this.options, spec.documentType, spec.filename, prompt);
  }

  private generateIndexDocument(
    pages: GeneratedWikiFile[],
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
  ): GeneratedWikiFile {
    const projectName = basename(this.options.projectPath);
    // Plan §C 3.2 (gira-exhaustive followup): index.md is a deterministic
    // catalog — it does not query the graph. Emit an empty
    // graph_queries_used (was: union across all 4 analyzers, which leaked
    // architectural-analyzer queries into a page that never used them).
    const graphQueriesUsed: string[] = [];

    const entries = pages
      .filter((page) => page.filename !== 'wiki/index.md')
      .map((page) => readIndexEntry(page))
      .filter((entry): entry is IndexEntry => entry !== null);

    const grouped = groupIndexEntries(entries);

    const body: string[] = [
      `# ${projectName} LLM Wiki`,
      '',
      'Summary catalog of every page in this wiki. Each line carries the page summary, document type, confidence, tags, and related pages — frontmatter inline so a single read of `index.md` serves Tier 1 retrieval.',
      '',
      `_Generated at ${generatedAt} from graph version \`${graphVersion.slice(0, 12)}\`._`,
      '',
    ];

    for (const group of INDEX_GROUP_ORDER) {
      const groupEntries = grouped.get(group.documentType) ?? [];
      if (groupEntries.length === 0) continue;
      body.push(`## ${group.heading}`);
      body.push('');
      for (const entry of groupEntries) {
        body.push(formatIndexLine(entry));
      }
      body.push('');
    }

    body.push('## How agents should use this');
    body.push('');
    body.push(
      '- Start with this index. Read the 1–3 page bodies whose summaries match your question.',
    );
    body.push(
      '- Follow `**Related:**` `[[wikilinks]]` only when the matched pages reference them.',
    );
    body.push('- Stop wikilink traversal at depth 2.');
    body.push(
      '- If the wiki does not answer your question, fall back to graph MCP tools — never re-read the wiki cover-to-cover.',
    );

    return {
      filename: 'wiki/index.md',
      content: withFrontmatter(body.join('\n'), {
        document_type: 'index',
        summary: `Summary catalog for the ${projectName} LLM wiki — one line per page, frontmatter inline.`,
        confidence: 'high',
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_commit: graphCommit,
        graph_queries_used: graphQueriesUsed,
        sources: [],
        related: ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md'],
        last_verified: generatedAt,
      }),
    };
  }
}

interface IndexEntry {
  filename: string;
  documentType: string;
  summary: string;
  confidence?: string;
  tags: string[];
  related: string[];
}

const INDEX_GROUP_ORDER: ReadonlyArray<{ documentType: string; heading: string }> = [
  { documentType: 'architecture', heading: 'Architecture' },
  { documentType: 'services', heading: 'Services catalog' },
  { documentType: 'service', heading: 'Per-service docs' },
];

function readIndexEntry(page: GeneratedWikiFile): IndexEntry | null {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(page.content);
  } catch {
    return null;
  }
  const data = parsed.data as Record<string, unknown>;
  const documentType = typeof data.document_type === 'string' ? data.document_type : '';
  if (!documentType) return null;
  return {
    filename: page.filename,
    documentType,
    summary: typeof data.summary === 'string' ? data.summary : '',
    confidence: typeof data.confidence === 'string' ? data.confidence : undefined,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === 'string')
      : [],
    related: Array.isArray(data.related)
      ? data.related.filter((r): r is string => typeof r === 'string')
      : [],
  };
}

function groupIndexEntries(entries: IndexEntry[]): Map<string, IndexEntry[]> {
  const grouped = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.documentType) ?? [];
    list.push(entry);
    grouped.set(entry.documentType, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.filename.localeCompare(b.filename));
  }
  return grouped;
}

function formatIndexLine(entry: IndexEntry): string {
  // Strip the leading `wiki/` so the link is relative to index.md (which lives
  // alongside the wiki/ subdirectory's pages).
  const linkPath = entry.filename.startsWith('wiki/')
    ? entry.filename.slice('wiki/'.length)
    : entry.filename;
  const linkText = entry.filename.startsWith('wiki/services/')
    ? entry.filename.slice('wiki/services/'.length).replace(/\.md$/, '')
    : linkPath.replace(/\.md$/, '');

  const meta: string[] = [entry.documentType];
  if (entry.confidence) meta.push(`confidence: ${entry.confidence}`);

  const parts: string[] = [`- [${linkText}](${linkPath}) — *${meta.join(', ')}*`];
  if (entry.summary) parts.push(`— ${entry.summary}`);

  let line = parts.join(' ');
  if (entry.tags.length > 0) {
    line += ` **Tags:** ${entry.tags.join(', ')}.`;
  }
  if (entry.related.length > 0) {
    const wikilinks = entry.related
      .map((r) => r.replace(/^wiki\//, '').replace(/\.md$/, ''))
      .map((r) => `[[${r}]]`)
      .join(', ');
    line += ` **Related:** ${wikilinks}.`;
  }
  return line;
}

export function getExpectedLlmWikiFiles(stackProfile: unknown): GeneratedWikiFilename[] {
  return [
    ...LLM_WIKI_FILE_NAMES.map((name) => `wiki/${name}` as GeneratedWikiFilename),
    ...getServices(stackProfile).map(
      (service) =>
        `wiki/services/${slugifyServiceId(String(service.id ?? service.name))}.md` as GeneratedWikiFilename,
    ),
  ];
}

/**
 * The wiki schema doc is the **runtime router** for any agent that wants to
 * consult this project's LLM wiki. It is project-specific (services / graph
 * tools templated in) but the routing rules are universal. Capped at ~150
 * lines so loading it never costs more than a wiki page body. The frontmatter
 * contract lives in the framework docs (CLAUDE_DIR_LAYOUT.md), not here —
 * developer-facing documentation does not belong in the runtime router.
 */
function buildSchemaDocBody(
  projectName: string,
  schemaFilename: string,
  services: Record<string, unknown>[],
  graphToolCatalog?: Array<{ name: string; description: string }>,
): string {
  const serviceList =
    services.length > 0
      ? services
          .map((s) => `\`${slugifyServiceId(String(s.id ?? s.name))}\``)
          .slice(0, 12)
          .join(', ') + (services.length > 12 ? `, … (${services.length} total)` : '')
      : '_none detected_';
  const serviceCount = services.length;

  const lines: string[] = [
    `# ${projectName} — LLM Wiki router`,
    '',
    '## Wiki at a glance',
    '',
    `This directory is the LLM-owned knowledge base for **${projectName}**. ${serviceCount === 0 ? 'No services were detected.' : `${serviceCount} service${serviceCount === 1 ? '' : 's'}: ${serviceList}.`}`,
    '',
    'Top-level docs under `wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`. Per-service docs under `wiki/services/<id>.md` (each carries the service-specific request lifecycle, integrations, and data flows). Every page carries summary / document_type / confidence / tags / related frontmatter; `index.md` aggregates that frontmatter inline so a single read serves Tier 1 retrieval. Prescriptive content (conventions, multi-file workflows, testing rules) lives in `.claude/skills/code-conventions/`, `.claude/skills/multi-file-workflows/`, and `.claude/skills/testing-conventions/` — not in the wiki.',
    '',
    '## How to query (decision table)',
    '',
    '| Question is about… | Read first | Drill into… |',
    '|---|---|---|',
    '| **how to run / set up the project locally** | `wiki/getting-started.md` (canonical wrappers + README extracts) | `framework-config.json::stack_profile.command_catalog` for the full per-service breakdown |',
    '| architecture, topology, monorepo shape | `wiki/index.md` (summaries) → `wiki/ARCHITECTURE.md` | `wiki/services/<id>.md` for service-specific detail |',
    '| a specific service | `wiki/SERVICES.md` (catalog) | `wiki/services/<id>.md` |',
    '| request lifecycle, auth, middleware, integrations | `wiki/SERVICES.md` (find the relevant service) | `wiki/services/<id>.md` (per-service flow + integrations live there) |',
    '| testing rules, code conventions, multi-file workflows (prescriptive) | `.claude/skills/testing-conventions/SKILL.md` / `code-conventions/SKILL.md` / `multi-file-workflows/SKILL.md` | — (these live OUTSIDE the wiki — wiki is descriptive only) |',
    '| "I don\'t know which page" | `grep -i "<term>" wiki/index.md`, then read matched pages | follow `[[wikilinks]]` in matched pages, depth ≤ 2 |',
    '',
    '## Tier discipline',
    '',
    '1. **Tier 1 (always):** read `wiki/index.md`. One file, summaries inline. Pick the 1–3 pages whose summaries match your question.',
    '2. **Tier 2 (on relevance):** read those page bodies. Stop.',
    '3. **Tier 3 (on demand):** follow `**Related:**` `[[wikilinks]]` on the matched pages. Cap traversal at depth 2.',
    '4. **Fallback:** if the wiki does not answer your question, call graph MCP tools (below). Do **not** re-read the wiki cover-to-cover.',
    '',
    '## How pages cite sources',
    '',
    'Provenance lives in **YAML frontmatter**, not in the page body. Every page has:',
    '',
    '- `sources: [...]` — the upstream documents that fed the page (analyzer JSON paths, synthesis output, etc.).',
    "- `confidence: high | medium | low` — aggregate confidence in the page's claims.",
    '- `tags: [...]` and `related: [[...]]` — navigation hints.',
    '',
    'Page bodies use only:',
    '',
    '- **`[[wikilinks]]`** for in-wiki cross-references (Karpathy LLM-wiki convention; renders correctly in Obsidian, the framework wiki linter, and any markdown viewer).',
    '- **`(not determined by analysis)`** for gaps the upstream analysis did not surface.',
    '- Plain prose otherwise.',
    '',
    "There are **no inline `^[...]` footnotes** anywhere in the wiki. The Stop hook rejects them on generation, and `wiki-lint` flags them on subsequent edits. If you need to know where a fact came from, read the page's `sources:` field.",
    '',
  ];

  // Optional section: live graph-tool catalog from Phase 0. Present only when
  // the workflow captured a non-empty catalog from the running MCP server, so
  // the router can never claim a tool that the server does not expose.
  if (graphToolCatalog && graphToolCatalog.length > 0) {
    lines.push('## Available graph tools');
    lines.push('');
    lines.push(
      'Live MCP tool catalog from `code-review-graph` (auto-discovered at init time). Call by exact name; the server will reject names that are not in this list.',
    );
    lines.push('');
    for (const tool of graphToolCatalog) {
      const desc = tool.description.split('\n')[0].trim();
      lines.push(`- \`${tool.name}\` — ${desc}`);
    }
    lines.push('');
  }

  // Graph navigation discipline — short summary in the router doc, with a
  // pointer to the canonical fenced section in the project's CLAUDE.md /
  // AGENTS.md. Keeping the full body in one place (the project root file)
  // avoids triple-copy drift between the prompt-builder, the router doc, and
  // the project root. The router only needs to forbid the load-bearing call
  // and tell the agent where to read the rest.
  lines.push('## Graph navigation discipline');
  lines.push('');
  lines.push(
    'If the wiki answers your question, you do not need to call any graph tool at all. The discipline below applies when you fall back to the graph.',
  );
  lines.push('');
  lines.push(
    `**Forbidden:** \`mcp__code_graph__get_architecture_overview_tool\` — its response cannot be bounded and overflows. Use \`mcp__code_graph__get_minimal_context_tool\` (~100 tokens) as the cheap entry point, then drill in selectively with \`list_communities_tool({ detail_level: "minimal" })\`, \`get_community_tool({ include_members: false })\`, \`get_hub_nodes_tool\`, \`get_bridge_nodes_tool\`.`,
  );
  lines.push('');
  // Provider-aware file location for the canonical discipline section. Claude
  // writes CLAUDE.md under .claude/; Codex writes AGENTS.md under .codex/.
  const projectInstructionDir =
    schemaFilename === 'CLAUDE.md'
      ? '.claude'
      : schemaFilename === 'AGENTS.md'
        ? '.codex'
        : `.${schemaFilename.toLowerCase().replace(/\.md$/, '')}`;
  lines.push(
    `**Lean defaults everywhere:** \`detail_level: "minimal"\`, \`limit: 20\` MAX on \`semantic_search_nodes_tool\`, \`include_members: false\` on \`get_community_tool\`, \`include_source: false\` on \`get_flow_tool\`. Full rules and drill-in budgets: see the \`Graph navigation discipline\` section in \`<project>/${projectInstructionDir}/${schemaFilename}\`.`,
  );
  lines.push('');

  lines.push('## Ingest workflow');
  lines.push('');
  lines.push(
    'When sources change (`/wiki-refresh`), update affected pages in place — never overwrite. Steps:',
  );
  lines.push('');
  lines.push('1. Extract atomic facts from changed sources.');
  lines.push(
    '2. Update (do not duplicate) the pages those facts touch. Preserve prose whose source-chunk hash has not changed.',
  );
  lines.push("3. Update `wiki/index.md` if the page's summary, tags, or related changed.");
  lines.push('4. Update `sources[]` on every touched page.');
  lines.push('5. Append one structured entry to `log.md`.');
  lines.push(
    '6. Add a line to `## [Unreleased]` in `CHANGELOG.md` under Added / Changed / Deprecated / Removed / Fixed.',
  );
  lines.push('7. Run `/wiki-lint` before committing.');
  lines.push('');
  lines.push('## Off-limits');
  lines.push('');
  lines.push('- Do not edit `raw/` by hand. Re-ingest via `/wiki-refresh` instead.');
  lines.push(
    '- Do not remove `.state.json` or tombstone a page without appending a `Removed` entry to `CHANGELOG.md`.',
  );
  lines.push(
    `- Do not edit \`${schemaFilename}\` by hand. It is regenerated whenever the active provider's wiki is rebuilt.`,
  );
  lines.push('');

  return lines.join('\n');
}

function extractSummary(body: string): string {
  const firstLine = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'));
  if (!firstLine) {
    return 'Generated wiki page.';
  }
  return firstLine.length <= 160 ? firstLine : `${firstLine.slice(0, 157)}...`;
}

function extractServiceDescription(
  service: Record<string, unknown>,
  serviceId: string,
  serviceDocs: GeneratedWikiFile[],
): string {
  // Plan §C 3.4 (gira-exhaustive followup, 2026-05-05): the catalog
  // is a pointer index, not a long-form summary. Prefer a stack-agnostic
  // role one-liner derived from `service.type` + `service.frameworks.main`
  // before falling back to free-form description fields. Pre-fix the
  // catalog inlined the whole first-paragraph of each service doc,
  // bloating the catalog to 30+ lines for 5 services on the gira run.
  const role = deriveStackAgnosticRole(service);
  if (role) return role;

  const explicit = firstNonEmptyString([
    service.description,
    service.purpose,
    service.role,
    service.summary,
  ]);
  if (explicit) {
    return explicit;
  }

  const slug = slugifyServiceId(serviceId);
  const doc = serviceDocs.find(
    (d) => d.filename === `wiki/services/${slug}.md` || d.filename === `services/${slug}.md`,
  );
  if (doc) {
    const firstParagraph = extractFirstParagraph(doc.content);
    if (firstParagraph) {
      return firstParagraph;
    }
  }

  return 'No description available.';
}

/**
 * Stack-agnostic role one-liner. Plan §B.21 (gira-exhaustive followup):
 * `<role>` is a noun phrase derived from `service.type` and the main
 * framework name. The mapping covers every language family the
 * framework targets — JS/TS, Python, Java, Kotlin, Ruby, PHP, Go,
 * Rust, .NET, Scala, Elixir.
 *
 * Returns undefined when there is not enough signal to derive a
 * canonical phrase (e.g. an `infrastructure` type with no framework);
 * caller falls back to the next layer.
 */
export function deriveStackAgnosticRole(service: Record<string, unknown>): string | undefined {
  const type =
    typeof service.type === 'string' && service.type.trim().length > 0
      ? service.type.trim().toLowerCase()
      : undefined;
  const mainFrameworkRaw = isRecord(service.frameworks)
    ? typeof service.frameworks.main === 'string'
      ? service.frameworks.main.trim()
      : undefined
    : undefined;
  const mainFrameworkClean = mainFrameworkRaw
    ? mainFrameworkRaw.replace(/\s+[\^~>=<]?[\d][\w.\-*]*\s*$/, '').trim()
    : undefined;
  const mainFrameworkLower = mainFrameworkClean?.toLowerCase();

  // Type + framework family lookup. Each key matches a substring of the
  // lowercased framework name; first match wins. Stack-agnostic — the
  // tokens are framework family names, not language-specific identifiers.
  const FRAMEWORK_BY_TYPE: Record<string, Array<{ pattern: RegExp; phrase: string }>> = {
    backend: [
      { pattern: /\bnest(?:js)?\b/, phrase: 'NestJS REST/WebSocket API' },
      { pattern: /\bexpress(?:js)?\b/, phrase: 'Express HTTP service' },
      { pattern: /\bfastify\b/, phrase: 'Fastify HTTP service' },
      { pattern: /\bkoa\b/, phrase: 'Koa HTTP service' },
      { pattern: /\bhapi\b/, phrase: 'Hapi HTTP service' },
      { pattern: /\bdjango\b/, phrase: 'Django REST API' },
      { pattern: /\bflask\b/, phrase: 'Flask HTTP service' },
      { pattern: /\bfastapi\b/, phrase: 'FastAPI HTTP service' },
      { pattern: /\bquart\b/, phrase: 'Quart HTTP service' },
      { pattern: /\baiohttp\b/, phrase: 'aiohttp HTTP service' },
      { pattern: /\btornado\b/, phrase: 'Tornado HTTP service' },
      { pattern: /\bspring(?:[\s-]boot)?\b/, phrase: 'Spring Boot service' },
      { pattern: /\bquarkus\b/, phrase: 'Quarkus service' },
      { pattern: /\bmicronaut\b/, phrase: 'Micronaut service' },
      { pattern: /\bktor\b/, phrase: 'Ktor service' },
      { pattern: /\brails\b/, phrase: 'Rails API' },
      { pattern: /\bsinatra\b/, phrase: 'Sinatra HTTP service' },
      { pattern: /\bhanami\b/, phrase: 'Hanami service' },
      { pattern: /\blaravel\b/, phrase: 'Laravel HTTP service' },
      { pattern: /\bsymfony\b/, phrase: 'Symfony HTTP service' },
      { pattern: /\bslim\b/, phrase: 'Slim HTTP service' },
      { pattern: /\bgin\b/, phrase: 'Go HTTP service' },
      { pattern: /\becho\b/, phrase: 'Go HTTP service' },
      { pattern: /\bchi\b/, phrase: 'Go HTTP service' },
      { pattern: /\bfiber\b/, phrase: 'Go HTTP service' },
      { pattern: /\baxum\b/, phrase: 'Axum HTTP service' },
      { pattern: /\brocket\b/, phrase: 'Rocket HTTP service' },
      { pattern: /\bactix(?:[\s-]web)?\b/, phrase: 'Actix HTTP service' },
      { pattern: /\basp\.net\b|\baspnetcore\b|\baspnet\b/, phrase: 'ASP.NET service' },
      { pattern: /\bplay(?:framework)?\b/, phrase: 'Play HTTP service' },
      { pattern: /\bakka(?:[\s-]http)?\b/, phrase: 'Akka HTTP service' },
      { pattern: /\bphoenix\b/, phrase: 'Phoenix HTTP service' },
    ],
    frontend: [
      { pattern: /\breact\b/, phrase: 'React SPA' },
      { pattern: /\bvue\b/, phrase: 'Vue SPA' },
      { pattern: /\bangular\b/, phrase: 'Angular SPA' },
      { pattern: /\bsvelte(?:kit)?\b/, phrase: 'Svelte SPA' },
      { pattern: /\bsolid(?:js)?\b/, phrase: 'SolidJS SPA' },
      { pattern: /\bnext(?:\.?js)?\b/, phrase: 'Next.js app' },
      { pattern: /\bnuxt\b/, phrase: 'Nuxt app' },
      { pattern: /\bremix\b/, phrase: 'Remix app' },
      { pattern: /\bastro\b/, phrase: 'Astro site' },
      { pattern: /\bgatsby\b/, phrase: 'Gatsby static site' },
    ],
    worker: [
      { pattern: /\bbull(?:mq)?\b/, phrase: 'Background worker' },
      { pattern: /\bsidekiq\b/, phrase: 'Sidekiq worker' },
      { pattern: /\bcelery\b/, phrase: 'Celery worker' },
      { pattern: /\b(?:rq|huey|dramatiq)\b/, phrase: 'Background worker' },
      { pattern: /\basynq\b/, phrase: 'Asynq worker' },
      { pattern: /\bquartz\b/, phrase: 'Quartz scheduled worker' },
      { pattern: /\bhangfire\b/, phrase: 'Hangfire worker' },
    ],
    mobile: [
      { pattern: /\breact[\s-]native\b/, phrase: 'React Native app' },
      { pattern: /\bflutter\b/, phrase: 'Flutter app' },
      { pattern: /\bionic\b/, phrase: 'Ionic app' },
      { pattern: /\bxamarin\b/, phrase: 'Xamarin app' },
      { pattern: /\bswift(?:ui)?\b/, phrase: 'iOS app' },
      { pattern: /\bandroid\b/, phrase: 'Android app' },
    ],
    desktop: [
      { pattern: /\belectron\b/, phrase: 'Electron app' },
      { pattern: /\btauri\b/, phrase: 'Tauri app' },
    ],
  };

  if (type && mainFrameworkLower) {
    const candidates = FRAMEWORK_BY_TYPE[type] ?? [];
    for (const { pattern, phrase } of candidates) {
      if (pattern.test(mainFrameworkLower)) return phrase;
    }
  }

  // Fallback by service type alone (no framework match). Mirrors the
  // examples in plan §B.21 — library / cli / serverless / etc. are
  // self-describing.
  const TYPE_FALLBACK: Record<string, string> = {
    library: 'Internal library',
    cli: 'CLI tool',
    serverless: 'Serverless function bundle',
    worker: 'Background worker',
    frontend: 'Frontend app',
    backend: 'Backend service',
    mobile: 'Mobile app',
    desktop: 'Desktop app',
    infrastructure: 'Infrastructure component',
  };
  if (type && TYPE_FALLBACK[type]) {
    // Even on fallback, prefix with the framework name when one is
    // present so the role still carries stack signal.
    if (mainFrameworkClean && mainFrameworkClean.length <= 40) {
      return `${mainFrameworkClean} ${TYPE_FALLBACK[type].toLowerCase()}`;
    }
    return TYPE_FALLBACK[type];
  }

  return undefined;
}

function firstNonEmptyString(candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function extractFirstParagraph(markdown: string): string | undefined {
  const parsed = matter(markdown);
  const body = parsed.content;
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('```')) {
      continue;
    }
    if (line.length > 300) {
      return `${line.slice(0, 297).trimEnd()}...`;
    }
    if (!isEmptyValue(line)) {
      return line;
    }
  }
  return undefined;
}
