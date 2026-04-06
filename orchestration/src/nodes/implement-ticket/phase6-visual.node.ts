import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { EnvironmentManagerService } from '../../services/implement-ticket/environment-manager.service.js';
import { ScreenshotService, type ComparisonResult } from '../../services/implement-ticket/screenshot.service.js';
import { AgentFactory } from '../../utils/shared/agent-factory/index.js';
import { buildVisualVerifierPrompt, buildImplementerPrompt, getProjectAgentPath } from '../../services/implement-ticket/shared/index.js';
import { TestOrchestratorService } from '../../services/implement-ticket/test-orchestrator.service.js';

/**
 * Phase 6: Visual Verification Node
 *
 * This node performs visual regression testing with iteration loop:
 * - Captures "after" screenshots
 * - Compares with "before" screenshots from Phase 3
 * - If diff > 5%: Invokes visual-verifier agent, applies fixes, iterates
 * - Max 5 iterations to converge visual changes
 * - Non-blocking: Continues even if max iterations reached
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 3 and Phase 5 outputs from disk, NOT from state
 * - Non-blocking: Visual verification is best-effort, includes verdict in PR
 *
 * @param state - Current workflow state
 * @returns Updated state with phase6 completion flag
 */
export async function phase6VisualNode(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const frameworkPath = state.framework_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase6Dir = join(tempDir, 'phase6');

  console.log('\n[Phase 6: Visual Verification] Starting visual regression testing...');

  const completionMarkerPath = join(phase6Dir, 'visual-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 6: Visual Verification] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase7_documentation',
      phase6_complete: true,
      phase6_visual: completionData.visual_data
    };
  }

  try {
    console.log('[Phase 6: Visual Verification] Validating Phase 5 completion...');
    const phase5Dir = join(tempDir, 'phase5');
    const phase5CompletionPath = join(phase5Dir, 'testing-complete.json');

    if (!existsSync(phase5CompletionPath)) {
      throw new Error(
        'Phase 5 not complete. Run Phase 5 first or use --start-phase 5'
      );
    }
    console.log('[Phase 6: Visual Verification] ✓ Phase 5 verified');

    const phase3Dir = join(tempDir, 'phase3');
    const envConfigPath = join(phase3Dir, 'environment-config.json');

    if (!existsSync(envConfigPath)) {
      console.log('[Phase 6: Visual Verification] ⚠ No environment config from Phase 3, skipping visual verification');
      return skipVisualVerification(phase6Dir, completionMarkerPath, ticketId);
    }

    const envConfig = JSON.parse(readFileSync(envConfigPath, 'utf-8'));

    if (!envConfig.playwrightInitialized) {
      console.log('[Phase 6: Visual Verification] ⚠ Playwright not initialized, skipping visual verification');
      return skipVisualVerification(phase6Dir, completionMarkerPath, ticketId);
    }

    // 5. Read "before" screenshots metadata from Phase 3
    const beforeScreenshotsPath = join(phase3Dir, 'screenshots-before.json');
    if (!existsSync(beforeScreenshotsPath)) {
      console.log('[Phase 6: Visual Verification] ⚠ No "before" screenshots found, skipping visual verification');
      return skipVisualVerification(phase6Dir, completionMarkerPath, ticketId);
    }

    const beforeScreenshots = JSON.parse(readFileSync(beforeScreenshotsPath, 'utf-8'));
    console.log(`[Phase 6: Visual Verification] ✓ Found ${beforeScreenshots.length} "before" screenshots`);

    // 6. Initialize environment manager and get Playwright page
    const envManager = new EnvironmentManagerService(projectPath);
    const page = envManager.getPlaywrightPage();

    if (!page) {
      console.log('[Phase 6: Visual Verification] ⚠ Could not get Playwright page, skipping visual verification');
      return skipVisualVerification(phase6Dir, completionMarkerPath, ticketId);
    }

    // 7. Read stack profile and framework config for test re-runs
    const phase0Dir = join(tempDir, 'phase0');
    const stackProfile = JSON.parse(readFileSync(join(phase0Dir, 'stack-profile.json'), 'utf-8'));
    const frameworkConfig = JSON.parse(readFileSync(join(phase0Dir, 'framework-config.json'), 'utf-8'));

    // 8. Iteration loop (max 5 iterations)
    const maxIterations = 5;
    const diffThreshold = 5.0; // 5% diff threshold
    let iteration = 0;
    let converged = false;
    let finalDiffResults: ComparisonResult[] = [];
    let finalAfterScreenshots: string[] = [];
    const iterationLog: string[] = [];

    console.log(`[Phase 6: Visual Verification] Starting iteration loop (max ${maxIterations} iterations, threshold ${diffThreshold}%)\n`);

    while (iteration < maxIterations && !converged) {
      iteration++;
      console.log(`\n[Phase 6: Visual Verification] === Iteration ${iteration}/${maxIterations} ===\n`);
      iterationLog.push(`\n## Iteration ${iteration}\n`);

      // 9. Capture "after" screenshots
      console.log('[Phase 6: Visual Verification] Capturing "after" screenshots...');
      const afterScreenshotsDir = join(phase6Dir, `screenshots-after-iter${iteration}`);
      mkdirSync(afterScreenshotsDir, { recursive: true });

      const screenshotService = new ScreenshotService(afterScreenshotsDir);
      const baseUrl = `http://localhost:${envConfig.port}`;

      // Capture same routes as "before" screenshots
      const routes = beforeScreenshots.map((s: any) => {
        const url = new URL(s.url);
        return url.pathname;
      });

      let afterScreenshots;
      try {
        afterScreenshots = await screenshotService.captureMultipleScreenshots(
          page,
          baseUrl,
          routes,
          `after-iter${iteration}`
        );

        console.log(`[Phase 6: Visual Verification] ✓ Captured ${afterScreenshots.length} screenshots`);
        iterationLog.push(`Captured ${afterScreenshots.length} "after" screenshots\n`);

      } catch (error: any) {
        console.log(`[Phase 6: Visual Verification] ⚠ Screenshot capture failed: ${error.message}`);
        iterationLog.push(`⚠ Screenshot capture failed: ${error.message}\n`);
        break; // Exit iteration loop, continue to next phase
      }

      // 10. Compare with "before" screenshots
      console.log('[Phase 6: Visual Verification] Comparing screenshots...');
      const diffDir = join(phase6Dir, `diffs-iter${iteration}`);
      mkdirSync(diffDir, { recursive: true });

      const diffResults: ComparisonResult[] = [];
      for (let i = 0; i < Math.min(beforeScreenshots.length, afterScreenshots.length); i++) {
        const beforePath = beforeScreenshots[i].path;
        const afterPath = afterScreenshots[i].path;
        const diffPath = join(diffDir, `diff-${i}.png`);

        try {
          const comparison = await screenshotService.compareScreenshots(
            beforePath,
            afterPath,
            diffPath,
            0.1 // threshold
          );

          diffResults.push(comparison);
          console.log(`  • Route ${i + 1}: ${comparison.diffPercentage.toFixed(2)}% diff (${comparison.diffPixels} pixels)`);

        } catch (error: any) {
          console.log(`  • Route ${i + 1}: Comparison failed - ${error.message}`);
          iterationLog.push(`⚠ Comparison failed for route ${i + 1}: ${error.message}\n`);
        }
      }

      finalDiffResults = diffResults;
      finalAfterScreenshots = afterScreenshots.map(s => s.path);

      // 11. Check convergence (all diffs <= threshold)
      const maxDiff = Math.max(...diffResults.map(r => r.diffPercentage), 0);
      const avgDiff = diffResults.length > 0
        ? diffResults.reduce((sum, r) => sum + r.diffPercentage, 0) / diffResults.length
        : 0;

      console.log(`\n[Phase 6: Visual Verification] Diff summary:`);
      console.log(`  • Max diff: ${maxDiff.toFixed(2)}%`);
      console.log(`  • Avg diff: ${avgDiff.toFixed(2)}%`);
      console.log(`  • Threshold: ${diffThreshold}%\n`);

      iterationLog.push(`Max diff: ${maxDiff.toFixed(2)}%, Avg diff: ${avgDiff.toFixed(2)}%\n`);

      if (maxDiff <= diffThreshold) {
        console.log('[Phase 6: Visual Verification] ✓ Converged (all diffs within threshold)');
        iterationLog.push(`✓ Converged - all diffs within ${diffThreshold}% threshold\n`);
        converged = true;
        break;
      }

      // 12. Not converged, invoke visual-verifier agent if not last iteration
      if (iteration < maxIterations) {
        console.log('[Phase 6: Visual Verification] Invoking visual-verifier agent...');
        iterationLog.push(`Invoking visual-verifier agent to analyze visual changes\n`);

        try {
          // Build context for visual verifier
          const beforePaths = beforeScreenshots.map((s: any) => s.path);
          const afterPaths = afterScreenshots.map(s => s.path);

          const inputPrompt = buildVisualVerifierPrompt(beforePaths, afterPaths, diffResults);

          // Create and invoke visual verifier agent
          const factory = await AgentFactory.create();
          const agent = await factory.createAgent({
            agentName: 'visual-verifier',
            agentFilePath: getProjectAgentPath(projectPath, 'visual-verifier.md'),
            projectPath,
            frameworkPath,
            timeout: 600000, // 10 minutes
          });

          const result = await agent.invoke({ inputPrompt });
          const visualVerdict = result.output;

          console.log('[Phase 6: Visual Verification] ✓ Visual verifier completed');
          iterationLog.push(`Visual verifier verdict:\n${visualVerdict.substring(0, 200)}...\n`);

          // 13. If visual verifier suggests fixes, invoke implementer
          if (visualVerdict.toLowerCase().includes('fix') || visualVerdict.toLowerCase().includes('issue')) {
            console.log('[Phase 6: Visual Verification] Applying visual fixes...');
            iterationLog.push(`Applying visual fixes via implementer agent\n`);

            const implementationPlan = readFileSync(join(tempDir, 'phase2', 'implementation-plan.md'), 'utf-8');
            const fullContext = readFileSync(join(tempDir, 'phase1', 'full-context.md'), 'utf-8');

            const fixContext = `${fullContext}\n\n## Visual Verification Feedback (Iteration ${iteration})\n\n${visualVerdict}`;

            // Build implementer prompt and invoke
            const implementerPrompt = buildImplementerPrompt(implementationPlan, fixContext);
            const primaryLanguage = stackProfile.primary_language?.toLowerCase() || 'generic';
            const agentFile = `implementer-${primaryLanguage}.md`;

            const implementerFactory = await AgentFactory.create();
            const implementerAgent = await implementerFactory.createAgent({
              agentName: `implementer-${primaryLanguage}`,
              agentFilePath: getProjectAgentPath(projectPath, agentFile),
              projectPath,
              frameworkPath,
              timeout: 900000, // 15 minutes
            });

            await implementerAgent.invoke({ inputPrompt: implementerPrompt });

            console.log('[Phase 6: Visual Verification] ✓ Fixes applied');

            // 14. Re-run tests to ensure fixes didn't break anything
            console.log('[Phase 6: Visual Verification] Re-running tests...');
            iterationLog.push(`Re-running tests to verify fixes\n`);

            const testOrchestrator = new TestOrchestratorService(
              projectPath,
              frameworkConfig
            );

            try {
              const testResults = await testOrchestrator.runAllTests(false); // No coverage
              const allPassed = testResults.every(r => r.passed);

              if (!allPassed) {
                console.error('[Phase 6: Visual Verification] ⚠ Tests failed after visual fixes');
                iterationLog.push(`⚠ Tests failed after visual fixes - stopping iteration\n`);
                break; // Stop iteration, continue to next phase
              }

              console.log('[Phase 6: Visual Verification] ✓ Tests passed');
              iterationLog.push(`✓ Tests passed after fixes\n`);

            } catch (error: any) {
              console.error(`[Phase 6: Visual Verification] ⚠ Test execution failed: ${error.message}`);
              iterationLog.push(`⚠ Test execution failed: ${error.message}\n`);
              break; // Stop iteration, continue to next phase
            }

          } else {
            console.log('[Phase 6: Visual Verification] Visual verifier approved changes, no fixes needed');
            iterationLog.push(`Visual verifier approved changes\n`);
            converged = true;
            break;
          }

        } catch (error: any) {
          console.error(`[Phase 6: Visual Verification] ⚠ Visual verifier invocation failed: ${error.message}`);
          iterationLog.push(`⚠ Visual verifier invocation failed: ${error.message}\n`);
          break; // Stop iteration, continue to next phase
        }
      }
    }

    // 15. Final verdict
    let finalVerdict: string;
    if (converged) {
      finalVerdict = `✓ PASSED - Visual verification converged after ${iteration} iteration(s)`;
    } else if (iteration >= maxIterations) {
      finalVerdict = `⚠ PARTIAL - Max iterations (${maxIterations}) reached, visual changes may require manual review`;
    } else {
      finalVerdict = `⚠ INCOMPLETE - Visual verification stopped early due to errors`;
    }

    console.log(`\n[Phase 6: Visual Verification] ${finalVerdict}\n`);
    iterationLog.push(`\n${finalVerdict}\n`);

    // 16. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 6: Visual Verification] Writing outputs to disk...');
    mkdirSync(phase6Dir, { recursive: true });

    writeFileSync(
      join(phase6Dir, 'diff-results.json'),
      JSON.stringify(finalDiffResults, null, 2)
    );

    writeFileSync(
      join(phase6Dir, 'screenshots-after-final.json'),
      JSON.stringify(finalAfterScreenshots, null, 2)
    );

    writeFileSync(
      join(phase6Dir, 'iteration-log.md'),
      `# Visual Verification Iteration Log\n\n${iterationLog.join('\n')}`
    );

    writeFileSync(
      join(phase6Dir, 'visual-verdict.md'),
      `# Visual Verification Verdict\n\n${finalVerdict}\n\n## Summary\n\n` +
      `- Iterations: ${iteration}/${maxIterations}\n` +
      `- Converged: ${converged}\n` +
      `- Final diff count: ${finalDiffResults.length}\n` +
      `- Max diff: ${Math.max(...finalDiffResults.map(r => r.diffPercentage), 0).toFixed(2)}%\n\n` +
      `## Details\n\n${iterationLog.join('\n')}`
    );

    const visualData = {
      screenshots_after: finalAfterScreenshots,
      diff_report: {
        converged,
        iterations: iteration,
        max_iterations: maxIterations,
        diff_threshold: diffThreshold,
        final_diff_results: finalDiffResults
      },
      diff_percentage: finalDiffResults.length > 0
        ? Math.max(...finalDiffResults.map(r => r.diffPercentage), 0)
        : 0,
      verdict: converged ? 'passed' as const : (iteration >= maxIterations ? 'failed' as const : 'skipped' as const),
      iteration_count: iteration,
      timestamp: new Date().toISOString()
    };

    writeFileSync(
      join(phase6Dir, 'visual-data.json'),
      JSON.stringify(visualData, null, 2)
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify({
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        visual_data: visualData
      }, null, 2)
    );

    console.log('[Phase 6: Visual Verification] ✓ Outputs written to disk');
    console.log(`[Phase 6: Visual Verification] ✓ Phase complete (outputs: ${phase6Dir})`);

    // 17. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase7_documentation',
      phase6_complete: true,
      phase6_visual: visualData
    };

  } catch (error) {
    const errorMessage = `Visual verification failed: ${(error as Error).message}`;
    console.error(`[Phase 6: Visual Verification] ✗ ${errorMessage}`);

    // Non-blocking: Log error but continue to next phase
    console.log('[Phase 6: Visual Verification] ⚠ Continuing to Phase 7 (visual verification is non-blocking)');

    return skipVisualVerification(phase6Dir, completionMarkerPath, ticketId, errorMessage);
  }
}

/**
 * Skip visual verification and continue to next phase
 * (Used when Playwright not initialized or screenshots not found)
 */
function skipVisualVerification(
  phase6Dir: string,
  completionMarkerPath: string,
  ticketId: string,
  reason?: string
): Partial<ImplementTicketState> {
  mkdirSync(phase6Dir, { recursive: true });

  const skipReason = reason || 'No visual verification performed (Playwright not initialized or screenshots not found)';

  const visualData = {
    screenshots_after: [],
    diff_report: {
      converged: false,
      iterations: 0,
      max_iterations: 0,
      diff_threshold: 5.0,
      final_diff_results: []
    },
    diff_percentage: 0,
    verdict: 'skipped' as const,
    iteration_count: 0,
    timestamp: new Date().toISOString()
  };

  writeFileSync(
    join(phase6Dir, 'visual-verdict.md'),
    `# Visual Verification Verdict\n\n⚠ SKIPPED\n\n**Reason**: ${skipReason}\n`
  );

  writeFileSync(
    join(phase6Dir, 'visual-data.json'),
    JSON.stringify(visualData, null, 2)
  );

  writeFileSync(
    completionMarkerPath,
    JSON.stringify({
      completed_at: new Date().toISOString(),
      ticket_id: ticketId,
      visual_data: visualData
    }, null, 2)
  );

  return {
    current_phase: 'phase7_documentation',
    phase6_complete: true,
    phase6_visual: visualData
  };
}

/**
 * Build context for visual verifier agent
 */
function buildVisualContext(
  diffResults: ComparisonResult[],
  beforeScreenshots: any[],
  afterScreenshots: any[],
  iteration: number
): string {
  const lines: string[] = [];

  lines.push(`# Visual Verification Context (Iteration ${iteration})\n`);
  lines.push('## Screenshot Comparison Results\n');

  for (let i = 0; i < diffResults.length; i++) {
    const diff = diffResults[i];
    const before = beforeScreenshots[i];
    const after = afterScreenshots[i];

    lines.push(`### Route ${i + 1}: ${before.url}\n`);
    lines.push(`- **Diff Percentage**: ${diff.diffPercentage.toFixed(2)}%`);
    lines.push(`- **Diff Pixels**: ${diff.diffPixels} out of ${diff.totalPixels}`);
    lines.push(`- **Passed Threshold (5%)**: ${diff.passed ? 'Yes' : 'No'}`);
    lines.push(`- **Before Screenshot**: ${before.path}`);
    lines.push(`- **After Screenshot**: ${after.path}`);
    lines.push(`- **Diff Image**: ${diff.diffImagePath}\n`);
  }

  lines.push('## Task\n');
  lines.push('Analyze the screenshot comparisons and determine:');
  lines.push('1. Are the visual changes intentional and acceptable?');
  lines.push('2. Are there any visual regressions or unintended changes?');
  lines.push('3. If there are issues, provide specific feedback for fixes.\n');

  return lines.join('\n');
}
