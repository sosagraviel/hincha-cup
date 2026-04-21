import { existsSync } from 'fs';
import { basename } from 'path';
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
  type GeneratedAiKnowledgeWiki,
  type GeneratedWikiFile,
  type GeneratedWikiFilename,
  type WikiDocumentSpec,
  type WikiGeneratorServiceOptions,
} from './types.js';
import { slugifyServiceId, uniqueStrings } from './utils.js';

export * from './types.js';
export { slugifyServiceId } from './utils.js';
export { upsertAiKnowledgeContextSection } from './frontmatter.js';

export class WikiGeneratorService {
  constructor(private readonly options: WikiGeneratorServiceOptions) {}

  async generateAll(): Promise<GeneratedAiKnowledgeWiki> {
    this.validateInputs();

    const generatedAt = this.options.generatedAt ?? new Date().toISOString();
    const graphVersion = computeGraphVersion(this.options.graph.path!);
    const services = getServices(this.options.stackProfile);
    const files: GeneratedWikiFile[] = [];

    for (const spec of buildCoreSpecs(this.options)) {
      files.push(await this.generateDocument(spec, generatedAt, graphVersion));
    }

    for (const service of services) {
      const spec = buildServiceSpec(service, this.options.analyzers);
      files.push(await this.generateDocument(spec, generatedAt, graphVersion));
    }

    files.push(this.generateIndexDocument(generatedAt, graphVersion, services));

    return {
      files,
      contextSection: buildContextSection(this.options.graph),
    };
  }

  private async generateDocument(
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

  private validateInputs(): void {
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
