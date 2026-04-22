import { existsSync } from 'fs';
import { basename } from 'path';
import matter from 'gray-matter';
import { computeGraphVersion, invokeWikiAgent } from './agent-invoker.js';
import { buildCoreSpecs, buildPrompt, buildServiceSpec } from './document-specs.js';
import {
  buildContextSection,
  stripMarkdownFrontmatter,
  withFrontmatter,
} from './frontmatter.js';
import { collectAnalyzerGraphQueries, getServices } from './service-discovery.js';
import {
  AI_KNOWLEDGE_FILE_NAMES,
  GENERATED_BY,
  REQUIRED_ANALYZERS,
  type CoreLlmDocumentType,
  type GeneratedAiKnowledgeWiki,
  type GeneratedWikiFile,
  type GeneratedWikiFilename,
  type WikiDocumentSpec,
  type WikiGeneratorServiceOptions,
} from './types.js';
import { isEmptyValue, isRecord, slugifyServiceId, uniqueStrings } from './utils.js';

export * from './types.js';
export { slugifyServiceId } from './utils.js';
export { upsertAiKnowledgeContextSection } from './frontmatter.js';

export interface WikiGenerationMetadata {
  generatedAt: string;
  graphVersion: string;
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
  ): Promise<GeneratedWikiFile> {
    const spec = buildCoreSpecs(this.options).find((s) => s.documentType === documentType);
    if (!spec) {
      throw new Error(`Unknown core doc type: ${documentType}`);
    }
    return this.generateDocument(spec, generatedAt, graphVersion);
  }

  /**
   * Generate every per-service doc concurrently via Promise.all.
   * Order of the returned array matches the service inventory order.
   */
  async generateServiceDocsConcurrent(
    generatedAt: string,
    graphVersion: string,
  ): Promise<GeneratedWikiFile[]> {
    const services = getServices(this.options.stackProfile);
    return Promise.all(
      services.map((service) => {
        const spec = buildServiceSpec(service, this.options.analyzers);
        return this.generateDocument(spec, generatedAt, graphVersion);
      }),
    );
  }

  /**
   * Deterministic SERVICES.md catalog — a thin reference/index into per-service
   * docs. No LLM call. Uses stackProfile description fields with graceful
   * fallbacks to the first narrative paragraph of the per-service doc body.
   */
  buildServicesCatalog(
    serviceDocs: GeneratedWikiFile[],
    generatedAt: string,
    graphVersion: string,
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
      filename: 'SERVICES.md',
      content: withFrontmatter(body, {
        document_type: 'services',
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_queries_used: [],
      }),
    };
  }

  /**
   * Deterministic navigation index. Same behavior as before.
   */
  buildIndex(generatedAt: string, graphVersion: string): GeneratedWikiFile {
    return this.generateIndexDocument(generatedAt, graphVersion, getServices(this.options.stackProfile));
  }

  /**
   * Backwards-compat orchestrator. Keeps the public API stable for tests and
   * any callers that still want a single sequential path. Internally uses the
   * new granular methods so only one code path is exercised.
   */
  async generateAll(): Promise<GeneratedAiKnowledgeWiki> {
    this.validate();

    const { generatedAt, graphVersion } = this.computeMetadata();

    const [architecture, dataFlows, patterns] = await Promise.all([
      this.generateCoreDoc('architecture', generatedAt, graphVersion),
      this.generateCoreDoc('data-flow', generatedAt, graphVersion),
      this.generateCoreDoc('pattern', generatedAt, graphVersion),
    ]);

    const serviceDocs = await this.generateServiceDocsConcurrent(generatedAt, graphVersion);
    const servicesCatalog = this.buildServicesCatalog(serviceDocs, generatedAt, graphVersion);
    const index = this.buildIndex(generatedAt, graphVersion);

    const files: GeneratedWikiFile[] = [
      architecture,
      servicesCatalog,
      dataFlows,
      patterns,
      ...serviceDocs,
      index,
    ];

    return {
      files,
      contextSection: buildContextSection(this.options.graph),
    };
  }

  /**
   * Generate a single document from a spec. Made public so nodes can exercise
   * this path directly without going through generateAll.
   */
  async generateDocument(
    spec: WikiDocumentSpec,
    generatedAt: string,
    graphVersion: string,
  ): Promise<GeneratedWikiFile> {
    const prompt = buildPrompt(spec, this.options.projectPath);
    const rawBody = await this.invokeAgent(spec, prompt);
    const body = stripMarkdownFrontmatter(rawBody).trim();

    return {
      filename: spec.filename,
      content: withFrontmatter(body, {
        document_type: spec.documentType,
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_queries_used: spec.graphQueriesUsed,
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
    services: Record<string, unknown>[],
  ): GeneratedWikiFile {
    const projectName = basename(this.options.projectPath);
    const graphQueriesUsed = uniqueStrings(collectAnalyzerGraphQueries(this.options.analyzers));
    const serviceLinks = services.map((service) => {
      const serviceId = String(service.id ?? service.name);
      return `- [${serviceId}](services/${slugifyServiceId(serviceId)}.md)`;
    });

    const body = [
      `# ${projectName} AI Knowledge Wiki`,
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
      filename: 'index.md',
      content: withFrontmatter(body, {
        document_type: 'index',
        generated_at: generatedAt,
        generated_by: GENERATED_BY,
        graph_version: graphVersion,
        graph_queries_used: graphQueriesUsed,
      }),
    };
  }
}

export function getExpectedAiKnowledgeFiles(stackProfile: unknown): GeneratedWikiFilename[] {
  return [
    ...AI_KNOWLEDGE_FILE_NAMES,
    ...getServices(stackProfile).map(
      (service) =>
        `services/${slugifyServiceId(String(service.id ?? service.name))}.md` as GeneratedWikiFilename,
    ),
  ];
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
  const doc = serviceDocs.find((d) => d.filename === `services/${slug}.md`);
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
