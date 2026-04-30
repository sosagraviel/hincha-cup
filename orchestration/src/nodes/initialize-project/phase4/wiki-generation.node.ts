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
  GRAPH_DISCIPLINE_CONTEXT_END,
  GRAPH_DISCIPLINE_CONTEXT_START,
  SCHEMA_FILENAME_BY_PROVIDER,
} from '../../../services/graph-wiki/types.js';
import {
  buildContextSection,
  buildGraphDisciplineSection,
  upsertFencedSection,
} from '../../../services/graph-wiki/frontmatter.js';
import { getActiveProvider } from '../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../services/framework/debug-store/index.js';

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
    const serviceDocs = (docs.service_docs ?? []) as GeneratedWikiFile[];

    if (!architecture) {
      throw new Error('Core wiki doc (architecture) is missing from state');
    }

    const claudeMdPath = state.claude_md_path!;
    const provider = getActiveProvider();

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider,
      analyzers: context.analyzers,
      stackProfile: context.stackProfile,
      digestedUpstream: context.digestedUpstream,
      codeGraphToolCatalog: state.code_graph_tool_catalog,
      // Phase coordinate so debug attempts go under phase-4-wiki/ instead of
      // phase-unknown/ — see plans/2026-04-29-gira-init-run-audit-refactor.md F2.
      phase: getInitializeProjectPhase('phase4Wiki'),
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
    const indexInputPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs];
    const index = wiki.buildIndex(
      indexInputPages,
      context.generatedAt,
      context.graphVersion,
      context.graphCommit ?? 'unknown',
    );

    const wikiFiles: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs, index];

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

    const contextSection = buildContextSection(
      {
        available: state.code_graph_available,
        path: state.code_graph_path,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
      activeSchemaFilename,
    );
    const disciplineSection = buildGraphDisciplineSection();

    // Upsert both fenced sections into the project's main schema doc
    // (CLAUDE.md / AGENTS.md). The wiki context pointer only needs to live in
    // ONE place — the schema doc that every Claude or Codex agent already
    // reads at session start. The three prescriptive convention skills
    // (code-conventions, multi-file-workflows, testing-conventions) carry
    // prescriptive rules only and intentionally do NOT reference the wiki.
    // Idempotent across re-runs: the regex replaces the prior section in
    // place rather than appending duplicates.
    const claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(
      claudeMdPath,
      upsertFencedSection(
        upsertLlmWikiContextSection(claudeMdContent, contextSection),
        disciplineSection,
        GRAPH_DISCIPLINE_CONTEXT_START,
        GRAPH_DISCIPLINE_CONTEXT_END,
      ),
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
