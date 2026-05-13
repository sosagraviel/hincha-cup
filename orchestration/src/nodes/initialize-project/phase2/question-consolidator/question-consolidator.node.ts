import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import { analysisConsolidator } from './analysis-consolidator.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../../../utils/logger.js';
import type { Gap, ConsolidatedGap } from './types.js';
import { extractStructuredGaps } from './helpers/extract-structured-gaps.js';
import { consolidateQuestions } from './helpers/consolidate-questions.js';
import { askGapQuestions } from './helpers/ask-gap-questions.js';
import { exactTextDedupe } from './helpers/exact-text-dedupe.js';
import { resolveTempPath } from '../../../../utils/provider-paths.js';
import { buildComposerViewsFromDisk } from '../composer-views/build-composer-views.js';
import { mkdirSync } from 'fs';

/**
 * Gap-count threshold below which the LLM consolidator is NOT spawned. After
 * the deterministic exact-text dedupe pre-pass, most projects fall under 4
 * gaps; below this threshold the LLM's semantic-merge value is negligible.
 */
const LLM_CONSOLIDATOR_THRESHOLD = 3;

/**
 * Consolidates outputs from all 4 Phase 1 analyzer agents
 * Includes gap question consolidation and interactive questioning
 */
export async function consolidationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 2: Consolidation');
  phaseLogger.info(' Starting...');

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const phase1Dir = join(tempDir, 'phase1-outputs');

  if (!existsSync(phase1Dir)) {
    throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
  }

  phaseLogger.info(' Loading Phase 1 outputs from disk...');

  const phase1Files = [
    '01-structure-architecture.json',
    '02-tech-stack-dependencies.json',
    '03-code-patterns-testing.json',
    '04-data-flows-integrations.json',
  ];

  const analyzers: any[] = [];

  for (const filename of phase1Files) {
    const filePath = join(phase1Dir, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Phase 1 output file not found: ${filePath}`);
    }
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    analyzers.push(content);
    phaseLogger.success(`  ✓ Loaded ${filename}`);
  }

  phaseLogger.info(' ✓ All Phase 1 outputs loaded from disk');

  for (const a of analyzers) {
    const count = typeof a.graph_overflow_count === 'number' ? a.graph_overflow_count : 0;
    if (count > 0) {
      const tools = Array.isArray(a.graph_overflow_tools)
        ? a.graph_overflow_tools.join(', ')
        : 'unknown';
      phaseLogger.warn(
        ` ⚠ ${a.agent_name ?? 'analyzer'} hit ${count} graph-tool overflow${count === 1 ? '' : 's'} on: ${tools}. Re-tighten parameters in execution-instructions.md (lean defaults, drill-in caps).`,
      );
    }
  }

  try {
    phaseLogger.info(' Step 1: Merging analyzer outputs...');

    const consolidated = analysisConsolidator(analyzers);

    const consolidatedPath = join(tempDir, 'phase2-consolidation.json');
    writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    phaseLogger.info(' ✓ Consolidation complete');
    logger.blank();

    phaseLogger.info(' Step 2: Analyzing gaps...');

    const consolidationData = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));
    let gaps: Gap[] = [];

    if (consolidationData.identified_gaps && consolidationData.identified_gaps.length > 0) {
      gaps = extractStructuredGaps(analyzers);
    }

    const conflictsCount = consolidationData.conflicting_findings?.length || 0;

    phaseLogger.info(`  Gaps identified: ${gaps.length}`);
    phaseLogger.info(`  Conflicts detected: ${conflictsCount}`);
    logger.blank();

    if (gaps.length > 1) {
      phaseLogger.info(' Step 3: Consolidating similar questions...');

      const dedupePass = exactTextDedupe(gaps);
      if (dedupePass.eliminatedDuplicates > 0) {
        phaseLogger.info(
          `  Pre-pass dedupe: collapsed ${dedupePass.eliminatedDuplicates} exact-text duplicate(s) ` +
            `(${gaps.length} → ${dedupePass.dedupedGaps.length} gap(s))`,
        );
      }

      if (dedupePass.dedupedGaps.length <= LLM_CONSOLIDATOR_THRESHOLD) {
        phaseLogger.info(
          `  Fast path: ≤${LLM_CONSOLIDATOR_THRESHOLD} gap(s) after dedupe — skipping LLM consolidator (saves ~10-15s).`,
        );
        consolidationData.gaps = dedupePass.dedupedGaps;
        consolidationData.question_consolidation = {
          original_gap_count: gaps.length,
          consolidated_gap_count: dedupePass.dedupedGaps.length,
          reduction_percentage:
            gaps.length > 0
              ? Math.round(((gaps.length - dedupePass.dedupedGaps.length) / gaps.length) * 100)
              : 0,
          consolidation_groups: dedupePass.deterministicGroups,
          fast_path: true,
        };
        writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));
        gaps = dedupePass.dedupedGaps;
        logger.blank();
      } else {
        phaseLogger.info('  Running AI-powered question consolidation agent...');
        logger.blank();

        const consolidationResult = await consolidateQuestions(
          dedupePass.dedupedGaps,
          state.project_path,
          state.framework_path,
          tempDir,
          consolidatedPath,
        );

        if (consolidationResult.success && consolidationResult.consolidated) {
          const consolidatedGaps = consolidationResult.consolidated.consolidated_gaps;

          consolidatedGaps.forEach((gap) => {
            if (!gap.agent && gap.consolidated_from && gap.consolidated_from.length > 0) {
              gap.agent = gap.consolidated_from[0];
            }
          });

          const llmGroups =
            consolidationResult.consolidated.consolidation_metadata.consolidation_groups ?? [];
          const mergedGroups = [
            ...dedupePass.deterministicGroups,
            ...llmGroups.map((g, idx) => ({
              ...g,
              group_id: dedupePass.deterministicGroups.length + idx + 1,
            })),
          ];

          consolidationData.gaps = consolidatedGaps;
          consolidationData.question_consolidation = {
            ...consolidationResult.consolidated.consolidation_metadata,
            original_gap_count: gaps.length,
            consolidation_groups: mergedGroups,
            fast_path: false,
            deterministic_eliminated: dedupePass.eliminatedDuplicates,
          };
          writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));

          const newGapCount = consolidationResult.consolidated.consolidated_gaps.length;
          phaseLogger.info(`  Questions after consolidation: ${newGapCount} (was ${gaps.length})`);
          gaps = consolidationResult.consolidated.consolidated_gaps;
        } else {
          phaseLogger.info('  ⚠ WARNING: Question consolidation failed');
          phaseLogger.info('  Proceeding with deterministic dedupe result only');

          consolidationData.gaps = dedupePass.dedupedGaps;
          consolidationData.question_consolidation = {
            original_gap_count: gaps.length,
            consolidated_gap_count: dedupePass.dedupedGaps.length,
            reduction_percentage:
              gaps.length > 0
                ? Math.round(((gaps.length - dedupePass.dedupedGaps.length) / gaps.length) * 100)
                : 0,
            consolidation_groups: dedupePass.deterministicGroups,
            fast_path: true,
            llm_failure_fallback: true,
          };
          writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));
          gaps = dedupePass.dedupedGaps;
        }
        logger.blank();
      }
    } else if (gaps.length === 1) {
      phaseLogger.info(' Step 3: Only 1 gap found - skipping consolidation');

      const consolidatedGap: ConsolidatedGap = {
        ...gaps[0],
        consolidated_from: [gaps[0].agent],
        original_count: 1,
      };

      consolidationData.gaps = [consolidatedGap];
      writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));
      logger.blank();
    } else {
      phaseLogger.info(' Step 3: No gaps found - skipping consolidation');
      logger.blank();
    }

    const needsUserInput = gaps.length > 5 || conflictsCount > 0;

    if (needsUserInput) {
      phaseLogger.warn('Warning: Gaps or conflicts detected in analysis');
      phaseLogger.info(`  Gaps: ${gaps.length}`);
      phaseLogger.info(`  Conflicts: ${conflictsCount}`);
      logger.blank();

      const skipQuestions = process.env.SKIP_GAP_QUESTIONS === 'true';

      if (skipQuestions) {
        phaseLogger.info('ℹ SKIP_GAP_QUESTIONS=true - Continuing without user input');
        phaseLogger.info('  (Synthesis will proceed with available data)');
        logger.blank();
      } else {
        logger.stopAllSpinners();
        phaseLogger.info('Launching interactive questionnaire...');
        logger.blank();

        const askResult = await askGapQuestions(consolidatedPath, false);

        if (!askResult.success) {
          logger.blank();
          phaseLogger.error('❌ Error during gap questionnaire');
          logger.blank();
          phaseLogger.info('You can:');
          phaseLogger.info('  1. Set SKIP_GAP_QUESTIONS=true to skip questions');
          phaseLogger.info(`  2. Manually edit: ${consolidatedPath}`);
          phaseLogger.info('  3. Try again');
          logger.blank();

          return {
            errors: [...state.errors, 'Gap questionnaire failed'],
            current_phase: 'failed',
          };
        }

        phaseLogger.success('Gap clarifications complete');
        logger.blank();
      }
    } else {
      phaseLogger.success('No critical gaps requiring user input');
      logger.blank();
    }

    phaseLogger.info(' Step 4: Finalizing consolidation...');

    const finalConsolidation = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));

    phaseLogger.info(' Step 5: Building composer views...');
    const composerViewWarnings: string[] = [];
    try {
      const composerViewsDir = join(tempDir, 'composer-views');
      mkdirSync(composerViewsDir, { recursive: true });
      const bundle = buildComposerViewsFromDisk(tempDir, new Date().toISOString());
      writeFileSync(
        join(composerViewsDir, 'code-conventions.input.json'),
        JSON.stringify(bundle.code_conventions, null, 2),
      );
      writeFileSync(
        join(composerViewsDir, 'multi-file-workflows.input.json'),
        JSON.stringify(bundle.multi_file_workflows, null, 2),
      );
      writeFileSync(
        join(composerViewsDir, 'testing-conventions.input.json'),
        JSON.stringify(bundle.testing_conventions, null, 2),
      );
      writeFileSync(
        join(composerViewsDir, 'architecture-narrative.input.json'),
        JSON.stringify(bundle.architecture_narrative, null, 2),
      );
      writeFileSync(join(composerViewsDir, '_bundle.json'), JSON.stringify(bundle, null, 2));
      const presentSummary = [
        `code-conventions=${bundle.code_conventions.present.any_service_patterns ? '✓' : '∅'}`,
        `multi-file-workflows=${bundle.multi_file_workflows.present.any_request_lifecycle ? '✓' : '∅'}`,
        `testing-conventions=${bundle.testing_conventions.present.any_service_tests ? '✓' : '∅'}`,
        `architecture-narrative=${bundle.architecture_narrative.present.repository_shape_summary ? '✓' : '∅'}`,
      ].join(' ');
      phaseLogger.success(`  ✓ composer views written (${presentSummary})`);

      let emptyCount = 0;
      for (const flagsObj of [
        bundle.code_conventions.present,
        bundle.multi_file_workflows.present,
        bundle.testing_conventions.present,
        bundle.architecture_narrative.present,
      ]) {
        for (const [key, v] of Object.entries(flagsObj as Record<string, unknown>)) {
          if (key.endsWith('_source')) continue;
          if (v === false) emptyCount += 1;
        }
      }
      if (emptyCount >= 4) {
        composerViewWarnings.push(
          `[phase2] composer_view_empty_section_count=${emptyCount} — the synthesizer will skip several sections; review Phase 1 / Phase 1.5 outputs to see why analyzers found little to populate them with.`,
        );
        phaseLogger.warn(
          `  ⚠ ${emptyCount} composer-view section(s) empty (present.*: false). Synthesizer will skip them.`,
        );
      }
    } catch (err) {
      phaseLogger.warn(
        `  ⚠ composer-views build failed: ${(err as Error).message}. Phase 3 will fall back to legacy consolidation.`,
      );
    }
    logger.blank();

    phaseLogger.success('Consolidation ready for synthesis');
    phaseLogger.info(`  File: ${consolidatedPath}`);
    logger.blank();

    phaseLogger.info(' ✓ Complete');
    phaseLogger.info(`  - Gaps identified: ${gaps.length}`);

    return {
      phase1_analysis: {
        all_completed: true,
        completion_timestamp: new Date().toISOString(),
      },
      phase2_consolidation: {
        ...consolidated,
        ...finalConsolidation,
        timestamp: new Date().toISOString(),
      },
      current_phase: 'phase2_consolidation',
      ...(composerViewWarnings.length > 0
        ? { warnings: [...state.warnings, ...composerViewWarnings] }
        : {}),
    };
  } catch (error) {
    const errorMessage = `Consolidation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ Error: ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}
