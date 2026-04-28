import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import { WikiGeneratorService } from '../../../../services/graph-wiki/wiki-generator.service.js';
import { getActiveProvider } from '../../../../utils/provider-paths.js';

export async function wikiServiceDocsNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child('Phase 4b: services/*.md');

  try {
    const context = state.phase4_wiki_docs?.context;
    if (!context) {
      throw new Error('phase4_wiki_docs.context missing — preparation node must run first');
    }

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider: getActiveProvider(),
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

    phaseLogger.info('Generating per-service docs in parallel...');
    const serviceDocs = await wiki.generateServiceDocsConcurrent(
      context.generatedAt,
      context.graphVersion,
      context.graphCommit ?? 'unknown',
    );
    phaseLogger.success(`✓ Generated ${serviceDocs.length} service doc(s)`);

    return {
      phase4_wiki_docs: { service_docs: serviceDocs },
    };
  } catch (error) {
    const errorMessage = `Service docs generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
