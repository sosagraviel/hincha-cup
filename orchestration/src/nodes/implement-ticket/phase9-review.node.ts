import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { ReviewLoopService } from '../../services/implement-ticket/review-loop.service.js';
import { TestOrchestratorService } from '../../services/implement-ticket/test-orchestrator.service.js';

/**
 * Phase 9: Review Loop Node
 *
 * This node runs automated PR review iterations:
 * - Invokes PR review skill (code quality, best practices)
 * - Invokes security review skill (vulnerability scanning)
 * - Extracts blocking and major issues
 * - Applies auto-fixes via implementer agent
 * - Re-runs tests to verify fixes didn't break anything
 * - Iteration loop (max 3 iterations)
 * - Convergence detection (>10% improvement per iteration)
 * - Divergence detection (issue count increases)
 * - Non-blocking: Continues even if max iterations reached
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 8 outputs from disk, NOT from state
 * - Non-blocking: Review loop is best-effort, manual review may be needed
 *
 * @param state - Current workflow state
 * @returns Updated state with phase9 completion flag
 */
export async function phase9ReviewNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const frameworkPath = state.framework_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase9Dir = join(tempDir, 'phase9');

  console.log('\n[Phase 9: Review Loop] Starting automated PR review...');

  const completionMarkerPath = join(phase9Dir, 'review-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 9: Review Loop] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase10_cleanup',
      phase9_complete: true,
      phase9_review: completionData.review_data,
    };
  }

  try {
    console.log('[Phase 9: Review Loop] Validating Phase 8 completion...');
    const phase8Dir = join(tempDir, 'phase8');
    const phase8CompletionPath = join(phase8Dir, 'pr-complete.json');

    if (!existsSync(phase8CompletionPath)) {
      throw new Error('Phase 8 not complete. Run Phase 8 first or use --start-phase 8');
    }
    console.log('[Phase 9: Review Loop] ✓ Phase 8 verified');

    const prDataPath = join(phase8Dir, 'pr-data.json');
    if (!existsSync(prDataPath)) {
      throw new Error('PR data not found from Phase 8');
    }

    const prData = JSON.parse(readFileSync(prDataPath, 'utf-8'));
    const prUrl = prData.pr_url;

    console.log(`[Phase 9: Review Loop] ✓ PR URL: ${prUrl}`);

    const phase0Dir = join(tempDir, 'phase0');
    const stackProfile = JSON.parse(readFileSync(join(phase0Dir, 'stack-profile.json'), 'utf-8'));
    const frameworkConfig = JSON.parse(
      readFileSync(join(phase0Dir, 'framework-config.json'), 'utf-8'),
    );

    // 5. Create review loop service
    const reviewLoopService = new ReviewLoopService(
      projectPath,
      frameworkPath,
      3, // maxIterations
      10.0, // convergenceThreshold (10%)
    );

    // 6. Create test orchestrator
    const testOrchestrator = new TestOrchestratorService(projectPath, frameworkConfig);

    // 7. Run review loop
    console.log('[Phase 9: Review Loop] Starting review iterations...\n');

    let reviewLoopResult;
    try {
      reviewLoopResult = await reviewLoopService.runReviewLoop(prUrl, testOrchestrator);

      console.log('\n[Phase 9: Review Loop] ✓ Review loop completed');
    } catch (error: any) {
      console.error(`[Phase 9: Review Loop] ⚠ Review loop failed: ${error.message}`);
      console.log('[Phase 9: Review Loop] Continuing to Phase 10 (review loop is non-blocking)');

      // Non-blocking: Continue to cleanup even if review fails
      return skipReviewLoop(phase9Dir, completionMarkerPath, ticketId, error.message);
    }

    // 9. Log review summary
    console.log('\n[Phase 9: Review Loop] Review Summary:');
    console.log(
      `  • Final status: ${reviewLoopResult.finalPassed ? 'PASSED ✅' : 'REQUIRES MANUAL REVIEW ⚠️'}`,
    );
    console.log(`  • Iterations: ${reviewLoopResult.iterations.length}`);
    console.log(`  • Convergence: ${reviewLoopResult.convergence}`);
    console.log(`  • Issues resolved: ${reviewLoopResult.totalIssuesResolved}`);
    console.log('');

    // 10. Log iteration details
    for (const iteration of reviewLoopResult.iterations) {
      console.log(`  Iteration ${iteration.iteration}:`);
      console.log(
        `    - PR review: ${iteration.prReview.blockerCount} blockers, ${iteration.prReview.majorCount} major`,
      );
      console.log(
        `    - Security review: ${iteration.securityReview.blockerCount} blockers, ${iteration.securityReview.majorCount} major`,
      );
      console.log(`    - Fixes applied: ${iteration.fixesApplied.length}`);
      console.log(`    - Tests passed: ${iteration.testsPassedAfterFix ? 'Yes' : 'No'}`);
      console.log(`    - Improvement: ${iteration.improvement.toFixed(2)}%`);
    }
    console.log('');

    // 11. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 9: Review Loop] Writing outputs to disk...');
    mkdirSync(phase9Dir, { recursive: true });

    writeFileSync(
      join(phase9Dir, 'review-results.json'),
      JSON.stringify(reviewLoopResult, null, 2),
    );

    const reviewSummary: string[] = [];
    reviewSummary.push(`# Review Loop Summary for ${ticketId}\n`);
    reviewSummary.push(`**PR URL**: ${prUrl}`);
    reviewSummary.push(`**Timestamp**: ${new Date().toISOString()}\n`);

    reviewSummary.push(`## Final Status\n`);
    reviewSummary.push(`- **Passed**: ${reviewLoopResult.finalPassed ? 'Yes ✅' : 'No ⚠️'}`);
    reviewSummary.push(`- **Convergence**: ${reviewLoopResult.convergence}`);
    reviewSummary.push(`- **Iterations**: ${reviewLoopResult.iterations.length}`);
    reviewSummary.push(`- **Issues Resolved**: ${reviewLoopResult.totalIssuesResolved}\n`);

    reviewSummary.push(`## Iteration Details\n`);

    for (const iteration of reviewLoopResult.iterations) {
      reviewSummary.push(`### Iteration ${iteration.iteration}\n`);
      reviewSummary.push(`**PR Review**:`);
      reviewSummary.push(`- Blockers: ${iteration.prReview.blockerCount}`);
      reviewSummary.push(`- Major: ${iteration.prReview.majorCount}`);
      reviewSummary.push(`- Minor: ${iteration.prReview.minorCount}\n`);

      reviewSummary.push(`**Security Review**:`);
      reviewSummary.push(`- Blockers: ${iteration.securityReview.blockerCount}`);
      reviewSummary.push(`- Major: ${iteration.securityReview.majorCount}`);
      reviewSummary.push(`- Minor: ${iteration.securityReview.minorCount}\n`);

      reviewSummary.push(`**Actions**:`);
      reviewSummary.push(`- Fixes applied: ${iteration.fixesApplied.length}`);
      reviewSummary.push(`- Tests passed: ${iteration.testsPassedAfterFix ? 'Yes' : 'No'}`);
      reviewSummary.push(`- Issue count before: ${iteration.issueCountBefore}`);
      reviewSummary.push(`- Issue count after: ${iteration.issueCountAfter}`);
      reviewSummary.push(`- Improvement: ${iteration.improvement.toFixed(2)}%\n`);
    }

    if (!reviewLoopResult.finalPassed) {
      reviewSummary.push(`## ⚠️ Manual Review Required\n`);

      if (reviewLoopResult.convergence === 'max_iterations') {
        reviewSummary.push(
          `Maximum iterations (3) reached. Some issues may still exist. Please review the PR manually.`,
        );
      } else if (reviewLoopResult.convergence === 'diverged') {
        reviewSummary.push(`Issue count increased during iteration. Manual intervention required.`);
      } else {
        reviewSummary.push(`Review loop did not converge. Please review the PR manually.`);
      }
    }

    writeFileSync(join(phase9Dir, 'review-summary.md'), reviewSummary.join('\n'));

    const reviewData = {
      pr_review_results: reviewLoopResult,
      security_review_results:
        reviewLoopResult.iterations.length > 0
          ? reviewLoopResult.iterations[reviewLoopResult.iterations.length - 1].securityReview
          : undefined,
      iteration_count: reviewLoopResult.iterations.length,
      all_resolved: reviewLoopResult.finalPassed,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(join(phase9Dir, 'review-data.json'), JSON.stringify(reviewData, null, 2));

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          review_data: reviewData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 9: Review Loop] ✓ Outputs written to disk');
    console.log(`[Phase 9: Review Loop] ✓ Phase complete (outputs: ${phase9Dir})`);

    // 12. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase10_cleanup',
      phase9_complete: true,
      phase9_review: reviewData,
    };
  } catch (error) {
    const errorMessage = `Review loop failed: ${(error as Error).message}`;
    console.error(`[Phase 9: Review Loop] ✗ ${errorMessage}`);

    // Non-blocking: Log error but continue to cleanup
    console.log('[Phase 9: Review Loop] ⚠ Continuing to Phase 10 (review loop is non-blocking)');

    return skipReviewLoop(phase9Dir, completionMarkerPath, ticketId, errorMessage);
  }
}

/**
 * Skip review loop and continue to next phase
 */
function skipReviewLoop(
  phase9Dir: string,
  completionMarkerPath: string,
  ticketId: string,
  reason: string,
): Partial<ImplementTicketState> {
  mkdirSync(phase9Dir, { recursive: true });

  const reviewData = {
    pr_review_results: {
      finalPassed: false,
      convergence: 'skipped',
      iterations: [],
      totalIssuesResolved: 0,
      skipped: true,
      skip_reason: reason,
    },
    security_review_results: undefined,
    iteration_count: 0,
    all_resolved: false,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    join(phase9Dir, 'review-summary.md'),
    `# Review Loop Summary\n\n⚠ SKIPPED\n\n**Reason**: ${reason}\n\n` +
      `Manual PR review recommended.`,
  );

  writeFileSync(join(phase9Dir, 'review-data.json'), JSON.stringify(reviewData, null, 2));

  writeFileSync(
    completionMarkerPath,
    JSON.stringify(
      {
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        review_data: reviewData,
      },
      null,
      2,
    ),
  );

  return {
    current_phase: 'phase10_cleanup',
    phase9_complete: true,
    phase9_review: reviewData,
  };
}
