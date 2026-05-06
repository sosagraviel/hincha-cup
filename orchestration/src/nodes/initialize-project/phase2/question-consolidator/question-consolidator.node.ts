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

/**
 * Plan 14 §C.9.2 — gap-count threshold below which the LLM
 * consolidator is NOT spawned. Below this threshold there's almost
 * never a duplicate to merge; spawning the agent costs ~10-15s for
 * zero expected gain. Calibrated against the typical post-Plan-14
 * distribution: 0–2 gaps per analyzer × 4 analyzers = 0–8 gaps;
 * after the deterministic exact-text dedupe pre-pass collapses
 * literal duplicates, most projects fall under 4.
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

  // Read Phase 1 outputs from disk (not from state)
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

  // Surface graph-tool-result overflows from Phase 1 — every overflow means an
  // analyzer's tool call exceeded the per-call token cap and the framework
  // dumped 200+ KB to a sidecar the agent could not usefully consume. Today
  // these are silent; making them visible is the only way to catch prompt
  // regressions before they degrade analysis quality across many runs.
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
    // ========================================================================
    // STEP 1: MERGE ANALYSES
    // ========================================================================
    phaseLogger.info(' Step 1: Merging analyzer outputs...');

    const consolidated = analysisConsolidator(analyzers);

    const consolidatedPath = join(tempDir, 'phase2-consolidation.json');
    writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    phaseLogger.info(' ✓ Consolidation complete');
    logger.blank();

    // ========================================================================
    // STEP 2: GAP ANALYSIS
    // ========================================================================
    phaseLogger.info(' Step 2: Analyzing gaps...');

    const consolidationData = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));
    let gaps: Gap[] = [];

    // Extract gaps from identified_gaps array (which are strings)
    // We need to reconstruct Gap objects from the consolidated analysis
    if (consolidationData.identified_gaps && consolidationData.identified_gaps.length > 0) {
      // Re-run gap extraction to get structured data
      gaps = extractStructuredGaps(analyzers);
    }

    const conflictsCount = consolidationData.conflicting_findings?.length || 0;

    phaseLogger.info(`  Gaps identified: ${gaps.length}`);
    phaseLogger.info(`  Conflicts detected: ${conflictsCount}`);
    logger.blank();

    // ========================================================================
    // STEP 3: QUESTION CONSOLIDATION (if > 1 gap)
    // ========================================================================
    if (gaps.length > 1) {
      phaseLogger.info(' Step 3: Consolidating similar questions...');

      // Plan 14 §C.9.3: deterministic exact-text dedupe BEFORE the
      // LLM. This collapses literal-duplicate questions (multiple
      // analyzers asking the same question with byte-identical
      // wording) at near-zero cost — a single Map walk over the
      // gaps array. The LLM only sees genuinely paraphrased
      // duplicates that need semantic merge.
      const dedupePass = exactTextDedupe(gaps);
      if (dedupePass.eliminatedDuplicates > 0) {
        phaseLogger.info(
          `  Pre-pass dedupe: collapsed ${dedupePass.eliminatedDuplicates} exact-text duplicate(s) ` +
            `(${gaps.length} → ${dedupePass.dedupedGaps.length} gap(s))`,
        );
      }

      // Plan 14 §C.9.2: ≤3-gap fast path. If the deterministic
      // pass already brought the gap count to ≤3, skip the LLM
      // entirely. The LLM's value is semantic paraphrase merging;
      // below 3 gaps the chance of two paraphrases being mergeable
      // is vanishingly small (and even if missed, the operator
      // sees both items and the cost is just one extra question).
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

        // Pass the DEDUPED set to the LLM, not the raw set —
        // shorter input, faster response, no semantic work for
        // duplicates the deterministic pass already merged.
        const consolidationResult = await consolidateQuestions(
          dedupePass.dedupedGaps,
          state.project_path,
          state.framework_path,
          tempDir,
          consolidatedPath,
        );

        if (consolidationResult.success && consolidationResult.consolidated) {
          // Update consolidation.json with consolidated gaps
          const consolidatedGaps = consolidationResult.consolidated.consolidated_gaps;

          // Ensure every gap has an agent field (fallback to first consolidated_from if missing)
          consolidatedGaps.forEach((gap) => {
            if (!gap.agent && gap.consolidated_from && gap.consolidated_from.length > 0) {
              gap.agent = gap.consolidated_from[0];
            }
          });

          // Merge the deterministic groups (from the pre-pass) with the
          // LLM's groups so the run report shows both layers of
          // consolidation.
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

      // Convert single gap to ConsolidatedGap format
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

    // ========================================================================
    // STEP 4: INTERACTIVE QUESTIONS (if needed)
    // ========================================================================
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
        // Stop all ora spinners to prevent interference with user input
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

    // ========================================================================
    // STEP 5: FINALIZE CONSOLIDATION
    // ========================================================================
    phaseLogger.info(' Step 4: Finalizing consolidation...');

    const finalConsolidation = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));

    phaseLogger.success('Consolidation ready for synthesis');
    phaseLogger.info(`  File: ${consolidatedPath}`);
    logger.blank();

    phaseLogger.info(' ✓ Complete');
    phaseLogger.info(`  - Gaps identified: ${gaps.length}`);

    return {
      // Mark Phase 1 as completed (Phase 6 validation checks this)
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
