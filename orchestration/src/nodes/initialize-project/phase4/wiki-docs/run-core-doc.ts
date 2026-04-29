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

export type CoreDocSlot = 'architecture' | 'data_flows' | 'patterns';

const SLOT_LABEL: Record<CoreDocSlot, string> = {
  architecture: 'ARCHITECTURE.md',
  data_flows: 'DATA-FLOWS.md',
  patterns: 'PATTERNS.md',
};

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

    const file = await wiki.generateCoreDoc(
      documentType,
      context.generatedAt,
      context.graphVersion,
      context.graphCommit ?? 'unknown',
    );

    phaseLogger.success(`✓ Generated ${SLOT_LABEL[slot]}`);

    const update: Phase4WikiDocs = { [slot]: file };
    return { phase4_wiki_docs: update };
  } catch (error) {
    const errorMessage = `${SLOT_LABEL[slot]} generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
