import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';
import matter from 'gray-matter';
import { computeGraphCommit, computeGraphVersion, invokeWikiAgent } from './agent-invoker.js';
import { buildCoreSpecs, buildPrompt, buildServiceSpec } from './document-specs.js';
import { buildContextSection, stripMarkdownFrontmatter, withFrontmatter } from './frontmatter.js';
import { collectAnalyzerGraphQueries, getServices } from './service-discovery.js';
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
export { upsertLlmWikiContextSection } from './frontmatter.js';

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
      'cross-service relationships and [DATA-FLOWS.md](DATA-FLOWS.md) for execution flows.',
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
        related: ['wiki/ARCHITECTURE.md', 'wiki/DATA-FLOWS.md'],
        last_verified: generatedAt,
      }),
    };
  }

  /**
   * Deterministic navigation index. Filename is relative to the wiki/ subdirectory.
   */
  buildIndex(generatedAt: string, graphVersion: string, graphCommit: string): GeneratedWikiFile {
    return this.generateIndexDocument(
      generatedAt,
      graphVersion,
      graphCommit,
      getServices(this.options.stackProfile),
    );
  }

  /**
   * Emit the provider-specific schema document (CLAUDE.md, AGENTS.md, or COPILOT.md).
   * Exactly one such file is emitted per run — never both CLAUDE.md and AGENTS.md.
   * Body content is identical across providers; only the filename differs.
   */
  buildSchemaDoc(projectName: string, generatedAt: string): GeneratedWikiFile {
    const { provider } = this.options;
    const schemaFilename = SCHEMA_FILENAME_BY_PROVIDER[provider];
    const body = buildSchemaDocBody(projectName, schemaFilename);

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

    const [architecture, dataFlows, patterns] = await Promise.all([
      this.generateCoreDoc('architecture', generatedAt, graphVersion, graphCommit),
      this.generateCoreDoc('data-flow', generatedAt, graphVersion, graphCommit),
      this.generateCoreDoc('pattern', generatedAt, graphVersion, graphCommit),
    ]);

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
    const index = this.buildIndex(generatedAt, graphVersion, graphCommit);

    const wikiPages: GeneratedWikiFile[] = [
      architecture,
      servicesCatalog,
      dataFlows,
      patterns,
      ...serviceDocs,
      index,
    ];

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
      contextSection: buildContextSection(this.options.graph),
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

    return {
      filename: wikiFilename,
      content: withFrontmatter(body, {
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
      }),
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
    generatedAt: string,
    graphVersion: string,
    graphCommit: string,
    services: Record<string, unknown>[],
  ): GeneratedWikiFile {
    const projectName = basename(this.options.projectPath);
    const graphQueriesUsed = uniqueStrings(collectAnalyzerGraphQueries(this.options.analyzers));
    const serviceLinks = services.map((service) => {
      const serviceId = String(service.id ?? service.name);
      return `- [${serviceId}](services/${slugifyServiceId(serviceId)}.md)`;
    });

    const body = [
      `# ${projectName} LLM Wiki`,
      '',
      'Generated graph-backed documentation for agents working in this repository.',
      '',
      '## Core Documents',
      '- [Architecture](ARCHITECTURE.md)',
      '- [Services](SERVICES.md)',
      '- [Data flows](DATA-FLOWS.md)',
      '- [Patterns](PATTERNS.md)',
      '',
      '## Service Documents',
      serviceLinks.length > 0 ? serviceLinks.join('\n') : '- No services detected.',
      '',
      '## How Agents Should Use This',
      '- Read the relevant page before broad code changes.',
      '- Treat these documents as orientation, then inspect source files for implementation details.',
      '- Prefer pages with graph evidence and follow up with graph MCP tools when relationships matter.',
    ].join('\n');

    return {
      filename: 'wiki/index.md',
      content: withFrontmatter(body, {
        document_type: 'index',
        summary: `Navigation index for the ${projectName} LLM wiki.`,
        confidence: 'high',
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_commit: graphCommit,
        graph_queries_used: graphQueriesUsed,
        sources: [],
        related: [
          'wiki/ARCHITECTURE.md',
          'wiki/SERVICES.md',
          'wiki/DATA-FLOWS.md',
          'wiki/PATTERNS.md',
        ],
        last_verified: generatedAt,
      }),
    };
  }
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

function buildSchemaDocBody(projectName: string, schemaFilename: string): string {
  return (
    [
      `# ${projectName} — LLM Wiki Schema`,
      '',
      '## Purpose',
      '',
      "This directory is the project's LLM-owned knowledge base. Agents read from `wiki/`, cite pages by path, and rely on the provenance frontmatter to distinguish facts from inferences.",
      '',
      '## Layers',
      '',
      "- `raw/` — genuinely-raw, human-authored or externally-pulled source material. Sub-directories: `snapshots/` (pinned human-authored project docs) and `external/` (opt-in cached external docs). Phase 1 analyzer outputs are NOT stored here — they live in `.claude-temp/initialize-project/phase1-outputs/` per the framework's disk-first idempotency pattern. Graph stats live in `.state.json`. AI agents read `raw/`; they never write.",
      '- `wiki/` — LLM-generated, source of truth for agent queries.',
      `- \`${schemaFilename}\` (this file) — schema / ingest / lint / query rules. Filename matches the active provider (\`CLAUDE.md\` for Claude Code, \`AGENTS.md\` for Codex CLI, \`COPILOT.md\` for GitHub Copilot). Only one of these exists at any time; the others are removed on provider switch.`,
      '- `CHANGELOG.md` — Keep-a-Changelog format, one section per ingest or refresh.',
      '- `log.md` — append-only chronological log.',
      '- `.state.json` — machine state (`last_indexed_commit`, `graph_sha`, `graph_commit`, `pipeline_version`, `last_ingest_at`, `graph_stats`).',
      '',
      '## Frontmatter contract (every file under wiki/)',
      '',
      '```yaml',
      'document_type: <architecture|data-flow|pattern|service|services|index|schema>',
      'summary: <single line, <=160 chars, load-bearing for retrieval>',
      'confidence: <high|medium|low>',
      'generated_at: <iso>',
      'generated_by: ai-agentic-framework@<version>',
      'graph_version: <sha256 of .code-review-graph/graph.db>',
      'graph_commit: <git sha at build time>',
      'graph_queries_used: [mcp__code_graph__...]',
      'sources:',
      '  - { path: <relative-to-project-root>, sha256: <hash>, ingested_at: <iso>, commit: <git sha> }',
      'related: [<wiki-relative-paths>]',
      'last_verified: <iso>',
      '```',
      '',
      '## Ingest workflow (agent-executable)',
      '',
      '1. Read source. Extract atomic facts.',
      '2. Update (do not duplicate) affected wiki pages. Preserve prose whose source-chunk hash has not changed.',
      '3. Update `wiki/index.md` if the navigation changed.',
      '4. Update `sources[]` on every page touched.',
      '5. Append one structured entry to `log.md`.',
      '6. Add a line to the `## [Unreleased]` block of `CHANGELOG.md` under the correct section (Added/Changed/Deprecated/Removed/Fixed).',
      '7. Run `/wiki-lint` before committing.',
      '',
      '## Lint policy',
      '',
      '- Structural (fail PR): broken wikilinks; `sources[]` pointing to non-existent paths; missing required frontmatter keys; `graph_version` mismatch with current `.code-review-graph/graph.db`.',
      '- Semantic (warn): orphan pages; stale claims; LLM-detected contradictions across changed-set + 1-hop.',
      '',
      '## Query policy',
      '',
      'Agents should query in this order: (1) wiki by slug + `summary`, (2) graph by symbol/community/flow, (3) grep/read only if both miss. Cite what you used.',
      '',
      '## Off-limits',
      '',
      '- Do not edit `raw/` by hand. Re-ingest via `/wiki-refresh` instead.',
      '- Do not remove `.state.json` or tombstone a page without appending a `Removed` entry to `CHANGELOG.md`.',
    ].join('\n') + '\n'
  );
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

  const framework = firstNonEmptyString([
    isRecord(service.frameworks) ? service.frameworks.main : undefined,
    service.language,
    service.type,
  ]);
  if (framework) {
    return `${framework} service.`;
  }

  return 'No description available.';
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
