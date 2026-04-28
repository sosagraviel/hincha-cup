import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../../../utils/logger.js';
import {
  WikiGeneratorService,
  upsertLlmWikiContextSection,
  type GeneratedWikiFile,
} from '../../../services/graph-wiki/wiki-generator.service.js';
import {
  ALL_SCHEMA_FILENAMES,
  SCHEMA_FILENAME_BY_PROVIDER,
} from '../../../services/graph-wiki/types.js';
import { buildContextSection } from '../../../services/graph-wiki/frontmatter.js';
import { getActiveProvider } from '../../../utils/provider-paths.js';

export async function wikiGenerationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 4b: Wiki Finalization');
  phaseLogger.info('Assembling wiki, writing files, updating context sections...');

  try {
    const docs = state.phase4_wiki_docs;
    if (!docs?.context) {
      throw new Error('phase4_wiki_docs.context missing');
    }
    const { context } = docs;
    const architecture = docs.architecture as GeneratedWikiFile | undefined;
    const dataFlows = docs.data_flows as GeneratedWikiFile | undefined;
    const patterns = docs.patterns as GeneratedWikiFile | undefined;
    const serviceDocs = (docs.service_docs ?? []) as GeneratedWikiFile[];

    if (!architecture || !dataFlows || !patterns) {
      throw new Error('One or more core wiki docs are missing from state');
    }

    const claudeMdPath = state.claude_md_path!;
    const projectContextPath = state.project_context_path!;
    const provider = getActiveProvider();

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider,
      analyzers: context.analyzers,
      stackProfile: context.stackProfile,
      digestedUpstream: context.digestedUpstream,
      codeGraphToolCatalog: state.code_graph_tool_catalog,
      graph: {
        available: state.code_graph_available,
        path: state.code_graph_path,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
    });

    const servicesCatalog = wiki.buildServicesCatalog(
      serviceDocs,
      context.generatedAt,
      context.graphVersion,
      context.graphCommit ?? 'unknown',
    );

    // Build the index AFTER every other page so its summary catalog can read
    // each page's frontmatter (summary / confidence / tags / related). Tier 1
    // retrieval at consumer time becomes one read instead of N.
    const indexInputPages: GeneratedWikiFile[] = [
      architecture,
      servicesCatalog,
      dataFlows,
      patterns,
      ...serviceDocs,
    ];
    const index = wiki.buildIndex(
      indexInputPages,
      context.generatedAt,
      context.graphVersion,
      context.graphCommit ?? 'unknown',
    );

    const wikiFiles: GeneratedWikiFile[] = [
      architecture,
      servicesCatalog,
      dataFlows,
      patterns,
      ...serviceDocs,
      index,
    ];

    const llmWikiPath = join(state.project_path, 'docs', 'llm-wiki');
    mkdirSync(llmWikiPath, { recursive: true });

    const activeSchemaFilename = SCHEMA_FILENAME_BY_PROVIDER[provider];
    const staleSchemaFiles = ALL_SCHEMA_FILENAMES.filter((name) => name !== activeSchemaFilename);
    for (const staleName of staleSchemaFiles) {
      const stalePath = join(llmWikiPath, staleName);
      if (existsSync(stalePath)) {
        phaseLogger.info(`removing stale schema doc from previous provider: ${staleName}`);
        unlinkSync(stalePath);
      }
    }

    const schemaDoc = wiki.buildSchemaDoc(
      state.project_path.split('/').pop() ?? 'project',
      context.generatedAt,
    );

    const changelog = wiki.buildChangelog(context.generatedAt, {
      added: wikiFiles.map((f) => String(f.filename)),
    });
    const log = wiki.buildLog(context.generatedAt, {
      type: 'ingest',
      summary: 'Initial wiki generation',
      touched_pages: wikiFiles.map((f) => String(f.filename)),
    });
    const stateJson = wiki.buildStateJson({
      graph_commit: context.graphCommit ?? 'unknown',
      graph_sha: context.graphVersion,
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: context.graphCommit ?? 'unknown',
      last_ingest_at: context.generatedAt,
    });

    const allFiles: GeneratedWikiFile[] = [...wikiFiles, schemaDoc, changelog, log, stateJson];

    const writtenFiles = allFiles.map((file) => {
      const filePath = join(llmWikiPath, String(file.filename));
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.content);
      return filePath;
    });

    const contextSection = buildContextSection({
      available: state.code_graph_available,
      path: state.code_graph_path,
      stats: state.code_graph_stats,
      error: state.code_graph_error,
    });

    const claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(claudeMdPath, upsertLlmWikiContextSection(claudeMdContent, contextSection));

    const projectContextContent = readFileSync(projectContextPath, 'utf-8');
    writeFileSync(
      projectContextPath,
      upsertLlmWikiContextSection(projectContextContent, contextSection),
    );

    phaseLogger.success(`✓ Written LLM wiki: ${llmWikiPath}`);
    phaseLogger.success('✓ Updated context references');

    return {
      phase4_wiki_generation: {
        llm_wiki_written: true,
        files: writtenFiles,
        timestamp: new Date().toISOString(),
      },
      llm_wiki_path: llmWikiPath,
      llm_wiki_files: writtenFiles,
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      current_phase: 'phase4_wiki_generation',
    };
  } catch (error) {
    const errorMessage = `Wiki generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
