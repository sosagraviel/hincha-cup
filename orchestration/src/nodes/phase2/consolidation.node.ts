import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { consolidateAnalyses } from '../../utils/consolidation.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Consolidates outputs from all 4 Phase 1 analyzer agents
 */
export async function consolidationNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  console.log('\n[Phase 2: Consolidation] Starting...');

  const phase1 = state.phase1_analysis;
  if (!phase1) {
    throw new Error('Phase 1 analysis not found in state');
  }

  const {
    structure_architecture,
    tech_stack_dependencies,
    code_patterns_testing,
    data_flows_integrations
  } = phase1;

  if (!structure_architecture || !tech_stack_dependencies ||
      !code_patterns_testing || !data_flows_integrations) {
    throw new Error('Not all Phase 1 analyzers completed successfully');
  }

  try {
    console.log('[Phase 2: Consolidation] Merging analyzer outputs...');

    const analyzers = [
      structure_architecture,
      tech_stack_dependencies,
      code_patterns_testing,
      data_flows_integrations
    ];

    const consolidated = consolidateAnalyses(analyzers);

    const tempDir = state.temp_dir!;
    const consolidatedPath = join(tempDir, 'phase2-consolidation.json');
    writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    console.log('[Phase 2: Consolidation] ✓ Complete');
    console.log(`  - Overlaps found: ${consolidated.consolidated_findings.overlaps?.length || 0}`);
    console.log(`  - Gaps identified: ${consolidated.identified_gaps?.length || 0}`);
    console.log(`  - Conflicts detected: ${consolidated.conflicting_findings?.length || 0}`);

    return {
      phase1_analysis: {
        ...phase1,
        all_completed: true,
        completion_timestamp: new Date().toISOString()
      },
      phase2_consolidation: consolidated,
      current_phase: 'phase2_consolidation'
    };

  } catch (error) {
    const errorMessage = `Consolidation failed: ${(error as Error).message}`;
    console.error('[Phase 2: Consolidation] ✗ Error:', errorMessage);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}
