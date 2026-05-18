import type {
  InitializeProjectState,
  Phase4WikiDocs,
} from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import {
  WikiGeneratorService,
  type CoreLlmDocumentType,
} from '../../../../services/graph-wiki/wiki-generator.service.js';
import { getActiveProvider } from '../../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../../services/framework/debug-store/index.js';

export type CoreDocSlot = 'architecture';

const SLOT_LABEL: Record<CoreDocSlot, string> = {
  architecture: 'ARCHITECTURE.md',
};

/**
 * Phase 4b core-doc node. Wraps `WikiGeneratorService.generateCoreDoc` and
 * captures any failure as a warning **without** marking the workflow as
 * `failed` — the operator still gets `CLAUDE.md`, `framework-config.json`,
 * and the rest of the deterministic Phase 4 artefacts. Phase 6 surfaces
 * `phase4_wiki_status` so the gap is visible on the terminal.
 *
 * Logs the full stack trace on failure (the previous catch swallowed it).
 */
export async function runCoreDocNode(
  state: InitializeProjectState,
  documentType: CoreLlmDocumentType,
  slot: CoreDocSlot,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child(`Phase 4b: ${SLOT_LABEL[slot]}`);
  phaseLogger.info(`Generating ${SLOT_LABEL[slot]}...`);

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

    const file = await wiki.generateCoreDoc(documentType, context.generatedAt);

    phaseLogger.success(`✓ Generated ${SLOT_LABEL[slot]}`);

    const update: Phase4WikiDocs = { [slot]: file };
    return { phase4_wiki_docs: update };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = `${SLOT_LABEL[slot]} generation failed: ${err.message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);
    if (err.stack) phaseLogger.error(err.stack);
    phaseLogger.warn(
      `Wiki generation is non-fatal — continuing without ${SLOT_LABEL[slot]}. Phase 6 will surface phase4_wiki_status=degraded so the gap is visible.`,
    );

    const update: Phase4WikiDocs = {
      [slot]: { _failed: true, error: err.message } as unknown as Phase4WikiDocs[typeof slot],
    };
    return {
      phase4_wiki_docs: update,
      errors: [errorMessage],
    };
  }
}
