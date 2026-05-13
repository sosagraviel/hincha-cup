import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { logger } from '../../../../utils/logger.js';
import { WikiGeneratorService } from '../../../../services/graph-wiki/wiki-generator.service.js';
import { getActiveProvider } from '../../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../../services/framework/debug-store/index.js';
import { readAnalyzerOutputs, readStackProfile, resolveWikiPaths } from './utils.js';

export async function wikiPreparationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  const phaseLogger = logger.child('Phase 4b: Wiki Preparation');
  phaseLogger.info('Validating wiki inputs and loading analyzers...');

  try {
    const { tempDir, claudeMdPath, architecturalNarrativePath, phase1Dir } =
      resolveWikiPaths(state);

    if (!existsSync(claudeMdPath)) {
      throw new Error(`CLAUDE.md not found: ${claudeMdPath}`);
    }
    if (!existsSync(architecturalNarrativePath)) {
      throw new Error(
        `architectural-narrative.md not found: ${architecturalNarrativePath}. ` +
          'Phase 4a must persist the synthesis architectural narrative before wiki preparation.',
      );
    }
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const analyzers = readAnalyzerOutputs(phase1Dir);
    const stackProfile = readStackProfile(tempDir, state);
    const provider = getActiveProvider();

    // Load digested upstream — the wiki-generator agent runs closed-book over
    // these. Phase 3 synthesis lives at <tempDir>/synthesis-raw.md (written by
    // the synthesis node); CLAUDE.md and the architectural narrative were
    // both produced in Phase 4a. The wiki-generator no longer reads
    // project-context — that monolithic skill was split into prescriptive
    // convention skills not consumed by the wiki.
    const synthesisPath = join(tempDir, 'synthesis-raw.md');
    const digestedUpstream = {
      synthesis: existsSync(synthesisPath) ? readFileSync(synthesisPath, 'utf-8') : undefined,
      claudeMd: existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : undefined,
      architecturalNarrative: readFileSync(architecturalNarrativePath, 'utf-8'),
    };

    const wiki = new WikiGeneratorService({
      projectPath: state.project_path,
      frameworkPath: state.framework_path,
      provider,
      analyzers,
      stackProfile,
      digestedUpstream,
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

    wiki.validate();
    const generatedAt = wiki.computeGeneratedAt();

    phaseLogger.success('✓ Wiki inputs validated');

    return {
      phase4_wiki_docs: {
        context: {
          analyzers,
          stackProfile,
          generatedAt,
          digestedUpstream,
        },
      },
      claude_md_path: claudeMdPath,
      architectural_narrative_path: architecturalNarrativePath,
      temp_dir: tempDir,
    };
  } catch (error) {
    const errorMessage = `Wiki preparation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
