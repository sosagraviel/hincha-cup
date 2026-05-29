import { existsSync } from 'fs';
import { basename } from 'path';
import matter from 'gray-matter';
import { invokeWikiAgent } from './agent-invoker.js';
import { buildCoreSpecs, buildPrompt, buildServiceSpec } from './document-specs.js';
import { buildContextSection, stripMarkdownFrontmatter, withFrontmatter } from './frontmatter.js';
import { getServices } from './service-discovery.js';
import {
  LLM_WIKI_FILE_NAMES,
  REQUIRED_ANALYZERS,
  SCHEMA_FILENAME_BY_PROVIDER,
  type CoreLlmDocumentType,
  type GeneratedLlmWiki,
  type GeneratedWikiFile,
  type GeneratedWikiFilename,
  type WikiDocumentSpec,
  type WikiGeneratorServiceOptions,
  type WikiPageFrontmatter,
  type WikiStateJson,
} from './types.js';
import { isEmptyValue, isRecord, slugifyServiceId } from './utils.js';

export * from './types.js';
export { slugifyServiceId } from './utils.js';
export {
  buildGraphDisciplineSection,
  upsertFencedSection,
  upsertLlmWikiContextSection,
} from './frontmatter.js';

/**
 * Default cap for per-service wiki concurrency. Set to 8 — high enough that
 * a 50-service monorepo finishes wiki generation in 6–8 parallel passes, low
 * enough that we don't trip subscription-mode rate limits.
 *
 * Override via the `FRAMEWORK_WIKI_CONCURRENCY` env var or by passing
 * `serviceDocConcurrency` to the `WikiGeneratorService` constructor.
 */
export const WIKI_CONCURRENCY_DEFAULT = 8;

/**
 * Resolve the per-service-doc concurrency cap. Stack-agnostic: the resolver
 * looks at (1) the explicit option, (2) the env var, (3) the default — in
 * that order. The caller separately bounds the result by the number of
 * services so a project with N services never spawns more than N workers.
 */
export function resolveWikiConcurrencyCap(explicit: number | undefined): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 1) {
    return Math.floor(explicit);
  }
  const fromEnv = process.env.FRAMEWORK_WIKI_CONCURRENCY;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return WIKI_CONCURRENCY_DEFAULT;
}

export class WikiGeneratorService {
  constructor(private readonly options: WikiGeneratorServiceOptions) {}

  /**
   * Validate that inputs are sufficient to generate the wiki. Called by the
   * preparation node up-front so the parallel fan-out never starts on missing
   * inputs.
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
   * Single ISO timestamp shared across every doc in this generation pass so
   * `last_updated` stays consistent.
   */
  computeGeneratedAt(): string {
    return this.options.generatedAt ?? new Date().toISOString();
  }

  /**
   * Generate a single LLM-backed core doc by type.
   */
  async generateCoreDoc(
    documentType: CoreLlmDocumentType,
    generatedAt: string,
  ): Promise<GeneratedWikiFile> {
    const spec = buildCoreSpecs(this.options).find((s) => s.documentType === documentType);
    if (!spec) {
      throw new Error(`Unknown core doc type: ${documentType}`);
    }
    return this.generateDocument(spec, generatedAt);
  }

  /**
   * Generate every per-service doc with bounded concurrency.
   *
   * Concurrency = `min(services.length, cap)`. The cap defaults to
   * `WIKI_CONCURRENCY_DEFAULT` (8) and can be overridden via the
   * `FRAMEWORK_WIKI_CONCURRENCY` env var or `serviceDocConcurrency` option.
   * Stack-agnostic: scales with the SSoT service count for the project that
   * just ran — a 1-service project gets concurrency 1; a 50-service project
   * gets the cap.
   *
   * Order of the returned array matches the service inventory order.
   */
  async generateServiceDocsConcurrent(generatedAt: string): Promise<GeneratedWikiFile[]> {
    const services = getServices(this.options.stackProfile);
    const cap = resolveWikiConcurrencyCap(this.options.serviceDocConcurrency);
    const concurrency = Math.max(1, Math.min(cap, services.length));
    const results: GeneratedWikiFile[] = new Array(services.length);

    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= services.length) return;
        const spec = buildServiceSpec(
          services[index],
          this.options.analyzers,
          this.options.digestedUpstream,
        );
        results[index] = await this.generateDocument(spec, generatedAt);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /**
   * Deterministic SERVICES.md catalog — a thin pointer-index into per-service
   * docs. No LLM call.
   */
  buildServicesCatalog(serviceDocs: GeneratedWikiFile[], generatedAt: string): GeneratedWikiFile {
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
      'cross-service relationships.',
      '',
      rows.length > 0 ? rows.join('\n') : '- No services detected.',
      '',
    ].join('\n');

    const frontmatter: WikiPageFrontmatter = {
      document_type: 'services',
      summary: 'Catalog of services detected in this project with links to service docs.',
      last_updated: generatedAt,
      tags: ['services', 'catalog'],
      related: ['ARCHITECTURE.md'],
    };

    return {
      filename: 'wiki/SERVICES.md',
      content: withFrontmatter(body, frontmatter as unknown as Record<string, unknown>),
    };
  }

  /**
   * Deterministic summary catalog. One entry per generated wiki page, with
   * summary / document_type / tags / related read directly from each page's
   * frontmatter. A 25-page wiki collapses Tier 1 retrieval from 25 reads to one.
   */
  buildIndex(pages: GeneratedWikiFile[], generatedAt: string): GeneratedWikiFile {
    return this.generateIndexDocument(pages, generatedAt);
  }

  /**
   * Emit the provider-specific schema document (CLAUDE.md, AGENTS.md, or
   * COPILOT.md). Exactly one such file is emitted per run.
   */
  buildSchemaDoc(projectName: string): GeneratedWikiFile {
    const { provider, stackProfile } = this.options;
    const schemaFilename = SCHEMA_FILENAME_BY_PROVIDER[provider];
    const services = getServices(stackProfile);
    const body = buildSchemaDocBody(projectName, schemaFilename, services);

    return {
      filename: schemaFilename,
      content: body,
    };
  }

  /**
   * Emit .state.json for the wiki root. New shape: `{ repos: Record<string,
   * commit>, last_refresh_at }`. `repos` is `{ ".": HEAD }` for single-repo
   * and `{ <child-name>: HEAD, ... }` for multi-repo. Graph state lives in
   * `.code-review-graph/.state.json`, not here.
   */
  buildStateJson(state: WikiStateJson): GeneratedWikiFile {
    return {
      filename: '.state.json',
      content: JSON.stringify(state, null, 2) + '\n',
    };
  }

  /**
   * Full orchestration: generate all wiki pages and the schema doc. Returns
   * every file in one GeneratedLlmWiki result. The state file is built
   * separately by Phase 4 (it needs per-repo HEAD discovery).
   */
  async generateAll(): Promise<GeneratedLlmWiki> {
    this.validate();

    const generatedAt = this.computeGeneratedAt();
    const projectName = basename(this.options.projectPath);

    // ARCHITECTURE.md is the only cross-cutting LLM-generated wiki page.
    const architecture = await this.generateCoreDoc('architecture', generatedAt);

    const serviceDocs = await this.generateServiceDocsConcurrent(generatedAt);
    const servicesCatalog = this.buildServicesCatalog(serviceDocs, generatedAt);

    // Build the index AFTER every other page so it can read each page's
    // frontmatter (summary / tags / related) and emit the catalog inline.
    const indexInputPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs];
    const index = this.buildIndex(indexInputPages, generatedAt);

    const wikiPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs, index];

    const schemaDoc = this.buildSchemaDoc(projectName);

    const files: GeneratedWikiFile[] = [...wikiPages, schemaDoc];

    return {
      files,
      contextSection: buildContextSection(
        this.options.graph,
        SCHEMA_FILENAME_BY_PROVIDER[this.options.provider],
      ),
    };
  }

  /**
   * Generate a single document from a spec. Filename is prefixed with `wiki/`.
   */
  async generateDocument(spec: WikiDocumentSpec, generatedAt: string): Promise<GeneratedWikiFile> {
    const prompt = buildPrompt(spec, this.options.projectPath);
    const rawBody = await this.invokeAgent(spec, prompt);
    const body = stripMarkdownFrontmatter(rawBody).trim();

    const wikiFilename = spec.filename.startsWith('wiki/')
      ? spec.filename
      : (`wiki/${spec.filename}` as GeneratedWikiFilename);

    const frontmatter: WikiPageFrontmatter = {
      document_type: spec.documentType,
      summary: extractSummary(body),
      last_updated: generatedAt,
    };
    if (spec.tags && spec.tags.length > 0) {
      frontmatter.tags = spec.tags;
    }
    if (spec.serviceId) {
      frontmatter.service_id = spec.serviceId;
    }

    return {
      filename: wikiFilename,
      content: withFrontmatter(body, frontmatter as unknown as Record<string, unknown>),
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
  ): GeneratedWikiFile {
    const projectName = basename(this.options.projectPath);

    const entries = pages
      .filter((page) => page.filename !== 'wiki/index.md')
      .map((page) => readIndexEntry(page))
      .filter((entry): entry is IndexEntry => entry !== null);

    const grouped = groupIndexEntries(entries);

    const body: string[] = [
      `# ${projectName} LLM Wiki`,
      '',
      'Summary catalog of every page in this wiki. Each line carries the page summary, document type, tags, and related pages — frontmatter inline so a single read of `index.md` serves Tier 1 retrieval.',
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

    const frontmatter: WikiPageFrontmatter = {
      document_type: 'index',
      summary: `Summary catalog for the ${projectName} LLM wiki — one line per page, frontmatter inline.`,
      last_updated: generatedAt,
      related: ['ARCHITECTURE.md', 'SERVICES.md'],
    };

    return {
      filename: 'wiki/index.md',
      content: withFrontmatter(body.join('\n'), frontmatter as unknown as Record<string, unknown>),
    };
  }
}

interface IndexEntry {
  filename: string;
  documentType: string;
  summary: string;
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
  const linkPath = entry.filename.startsWith('wiki/')
    ? entry.filename.slice('wiki/'.length)
    : entry.filename;
  const linkText = entry.filename.startsWith('wiki/services/')
    ? entry.filename.slice('wiki/services/'.length).replace(/\.md$/, '')
    : linkPath.replace(/\.md$/, '');

  const parts: string[] = [`- [${linkText}](${linkPath}) — *${entry.documentType}*`];
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
 * The wiki schema doc is the runtime router for any agent that wants to
 * consult this project's LLM wiki. Project-specific (services templated in),
 * routing rules universal. Capped at ~150 lines so loading it never costs
 * more than a wiki page body.
 */
function buildSchemaDocBody(
  projectName: string,
  schemaFilename: string,
  services: Record<string, unknown>[],
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
    'Top-level docs under `wiki/`: `index.md`, `ARCHITECTURE.md`, `SERVICES.md`. Per-service docs under `wiki/services/<id>.md`. Every page carries `document_type` / `summary` / `last_updated` / `tags` / `related` frontmatter; `index.md` aggregates that frontmatter inline so a single read serves Tier 1 retrieval. Prescriptive content (conventions, workflows, testing rules) lives in skills, not in the wiki.',
    '',
    '## How to query (decision table)',
    '',
    '| Question is about… | Read first | Drill into… |',
    '|---|---|---|',
    '| architecture, topology, monorepo shape | `wiki/index.md` (summaries) → `wiki/ARCHITECTURE.md` | `wiki/services/<id>.md` for service-specific detail |',
    '| a specific service | `wiki/SERVICES.md` (catalog) | `wiki/services/<id>.md` |',
    '| request lifecycle, auth, middleware, integrations | `wiki/SERVICES.md` (find the relevant service) | `wiki/services/<id>.md` |',
    '| "I don\'t know which page" | `grep -i "<term>" wiki/index.md`, then read matched pages | follow `[[wikilinks]]` in matched pages, depth ≤ 2 |',
    '',
    '## Tier discipline',
    '',
    '1. **Tier 1 (always):** read `wiki/index.md`. One file, summaries inline. Pick the 1–3 pages whose summaries match your question.',
    '2. **Tier 2 (on relevance):** read those page bodies. Stop.',
    '3. **Tier 3 (on demand):** follow `**Related:**` `[[wikilinks]]` on the matched pages. Cap traversal at depth 2.',
    '4. **Fallback:** if the wiki does not answer your question, call graph MCP tools (below). Do **not** re-read the wiki cover-to-cover.',
    '',
    '## Keeping the wiki fresh',
    '',
    'Use `/wiki-refresh` after changes have landed to update pages whose facts drifted. The skill diffs against the per-repo commits in `.state.json`, asks an LLM to identify affected pages using `index.md` as the routing table, and surgically edits each. Use `/wiki-add-service <name>` to create a new service-doc page for a service that exists in the project but has no wiki page yet.',
    '',
  ];

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

  lines.push('## Off-limits');
  lines.push('');
  lines.push(
    `- Do not edit \`${schemaFilename}\` by hand. It is regenerated whenever the active provider's wiki is rebuilt.`,
  );
  lines.push('- Do not edit `.state.json` by hand. `/wiki-refresh` owns it.');
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
 * Derives a stack-agnostic role one-liner from `service.type` and `service.frameworks.main`.
 * Returns undefined when signal is insufficient; caller falls back to the next layer.
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
