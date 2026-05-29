import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import { WikiGeneratorService } from '../../../../services/graph-wiki/wiki-generator.service.js';
import { getActiveProvider } from '../../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../../services/framework/debug-store/index.js';

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
      phase: getInitializeProjectPhase('phase4Wiki'),
      graph: {
        available: state.code_graph_available,
        path: state.code_graph_path,
        stats: state.code_graph_stats,
        error: state.code_graph_error,
      },
    });

    phaseLogger.info('Generating per-service docs in parallel...');
    const serviceDocs = await wiki.generateServiceDocsConcurrent(context.generatedAt);
    phaseLogger.success(`✓ Generated ${serviceDocs.length} service doc(s)`);

    return {
      phase4_wiki_docs: { service_docs: serviceDocs },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = `Service docs generation failed: ${err.message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);
    if (err.stack) phaseLogger.error(err.stack);
    phaseLogger.warn(
      'Wiki generation is non-fatal — continuing with an empty service_docs list. Phase 6 will surface phase4_wiki_status=degraded so the gap is visible.',
    );

    // Eagerly mark the wiki status as degraded so the finalization node
    // (which only sees architecture + service_docs and would otherwise emit
    // status='ok') downgrades correctly. Phase 6 then routes missing
    // service-doc files to warnings instead of errors.
    return {
      phase4_wiki_docs: { service_docs: [] },
      phase4_wiki_generation: {
        llm_wiki_written: false,
        files: [],
        timestamp: new Date().toISOString(),
        status: 'degraded',
        reason: errorMessage,
      },
      errors: [errorMessage],
    };
  }
}
