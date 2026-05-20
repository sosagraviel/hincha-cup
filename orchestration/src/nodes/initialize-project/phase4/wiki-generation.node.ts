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
import { buildWikiStateAtHead } from '../../../services/graph-wiki/wiki-state.js';
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
      phaseLogger.warn(
        'phase4_wiki_docs.context missing — wiki finalization skipped (status=failed)',
      );
      return {
        phase4_wiki_generation: {
          llm_wiki_written: false,
          files: [],
          timestamp: new Date().toISOString(),
          status: 'failed',
          reason: 'phase4_wiki_docs.context missing — preparation never ran',
        },
      };
    }
    const { context } = docs;
    const architectureCandidate = docs.architecture as
      | (GeneratedWikiFile & { _failed?: boolean; error?: string })
      | undefined;
    const serviceDocs = (docs.service_docs ?? []) as GeneratedWikiFile[];

    const architectureFailed = architectureCandidate?._failed === true;
    if (!architectureCandidate || architectureFailed) {
      const reason = architectureFailed
        ? `architecture doc generation failed: ${architectureCandidate?.error ?? 'unknown'}`
        : 'architecture doc missing from state';
      phaseLogger.warn(`${reason} — finalizing wiki in degraded mode (no ARCHITECTURE.md)`);
      return {
        phase4_wiki_generation: {
          llm_wiki_written: false,
          files: [],
          timestamp: new Date().toISOString(),
          status: 'degraded',
          reason,
        },
      };
    }
    const architecture = architectureCandidate as GeneratedWikiFile;

    const claudeMdPath = state.claude_md_path!;
    const provider = getActiveProvider();

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider,
      analyzers: context.analyzers,
      stackProfile: context.stackProfile,
      digestedUpstream: context.digestedUpstream,
      phase: getInitializeProjectPhase('phase4Wiki'),
      graph: {
        available: state.code_graph_available,
        path: state.code_graph_path,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
    });

    const servicesCatalog = wiki.buildServicesCatalog(serviceDocs, context.generatedAt);

    // Build the index AFTER every other page so its summary catalog can read
    // each page's frontmatter (summary / tags / related). Tier 1 retrieval at
    // consumer time becomes one read instead of N.
    const indexInputPages: GeneratedWikiFile[] = [architecture, servicesCatalog, ...serviceDocs];
    const index = wiki.buildIndex(indexInputPages, context.generatedAt);

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

    const schemaDoc = wiki.buildSchemaDoc(state.project_path.split('/').pop() ?? 'project');

    // Build .state.json with the new shape: `{ repos: { ".": HEAD } }` for
    // single-repo or `{ repos: { <child>: HEAD, ... } }` for multi-repo. The
    // /wiki-refresh skill diffs against these per-repo commits on subsequent
    // runs. Graph state lives in `.code-review-graph/.state.json` — not here.
    const wikiState = buildWikiStateAtHead(state.project_path, state.framework_path);
    const stateJson = wiki.buildStateJson(wikiState);

    const allFiles: GeneratedWikiFile[] = [...wikiFiles, schemaDoc, stateJson];

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
    // (CLAUDE.md / AGENTS.md). Idempotent across re-runs.
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

    // Honor an upstream 'degraded' marker emitted by the service-docs node
    // when only a subset of service docs were generated (typical cause:
    // CLI rate-limit). Also detect partial coverage by comparing
    // serviceDocs.length against the stack-profile service list — keeps the
    // signal accurate when the upstream marker is absent for any reason.
    const upstreamStatus = state.phase4_wiki_generation?.status;
    const upstreamReason = state.phase4_wiki_generation?.reason;
    const expectedServiceCount = Array.isArray(
      (context.stackProfile as { services?: unknown[] } | undefined)?.services,
    )
      ? ((context.stackProfile as { services: unknown[] }).services.length ?? 0)
      : 0;
    const partial = expectedServiceCount > 0 && serviceDocs.length < expectedServiceCount;
    const status: 'ok' | 'degraded' = upstreamStatus === 'degraded' || partial ? 'degraded' : 'ok';
    const reason =
      status === 'degraded'
        ? (upstreamReason ??
          `service-doc coverage is partial: generated ${serviceDocs.length} of ${expectedServiceCount} expected docs`)
        : undefined;
    if (status === 'degraded') {
      phaseLogger.warn(` ⚠ wiki status downgraded to 'degraded' — ${reason}`);
    }

    return {
      phase4_wiki_generation: {
        llm_wiki_written: true,
        files: writtenFiles,
        timestamp: new Date().toISOString(),
        status,
        ...(reason ? { reason } : {}),
      },
      llm_wiki_path: llmWikiPath,
      llm_wiki_files: writtenFiles,
      claude_md_path: claudeMdPath,
      current_phase: 'phase4_wiki_generation',
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = `Wiki generation failed: ${err.message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);
    if (err.stack) phaseLogger.error(err.stack);
    phaseLogger.warn(
      'Wiki finalization is non-fatal — CLAUDE.md, framework-config.json, skills, and Phase 5 resources still ship.',
    );

    return {
      phase4_wiki_generation: {
        llm_wiki_written: false,
        files: [],
        timestamp: new Date().toISOString(),
        status: 'failed',
        reason: err.message,
      },
      errors: [errorMessage],
    };
  }
}
