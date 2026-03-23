import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { TestOrchestratorService } from '../../services/implement-ticket/test-orchestrator.service.js';

/**
 * Phase 5: Testing Node
 *
 * This node runs comprehensive tests with coverage validation:
 * - Runs unit tests with coverage collection
 * - Runs integration tests
 * - Runs E2E tests (10-minute timeout)
 * - Validates coverage >= 80% (configurable threshold)
 * - Hard stop if tests fail or coverage below threshold
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 4 outputs from disk, NOT from state
 *
 * @param state - Current workflow state
 * @returns Updated state with phase5 completion flag
 */
export async function phase5TestingNode(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase5Dir = join(tempDir, 'phase5');

  console.log('\n[Phase 5: Testing] Starting test execution...');

  // 1. Check if already complete (idempotency)
  const completionMarkerPath = join(phase5Dir, 'testing-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 5: Testing] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase6_visual',
      phase5_complete: true,
      phase5_testing: completionData.testing_data
    };
  }

  try {
    // 2. Validate Phase 4 completed (read from disk, NOT state)
    console.log('[Phase 5: Testing] Validating Phase 4 completion...');
    const phase4Dir = join(tempDir, 'phase4');
    const phase4CompletionPath = join(phase4Dir, 'implementation-complete.json');

    if (!existsSync(phase4CompletionPath)) {
      throw new Error(
        'Phase 4 not complete. Run Phase 4 first or use --start-phase 4'
      );
    }
    console.log('[Phase 5: Testing] ✓ Phase 4 verified');

    // 3. Read implementation data from Phase 4 (from disk)
    const implementationDataPath = join(phase4Dir, 'implementation-data.json');
    if (!existsSync(implementationDataPath)) {
      throw new Error('Implementation data not found from Phase 4');
    }

    const implementationData = JSON.parse(readFileSync(implementationDataPath, 'utf-8'));
    console.log(`[Phase 5: Testing] ✓ Implementation data loaded (${implementationData.files_modified.length} files modified)`);

    // 4. Read stack profile from Phase 0 (from disk)
    const phase0Dir = join(tempDir, 'phase0');
    const stackProfilePath = join(phase0Dir, 'stack-profile.json');

    if (!existsSync(stackProfilePath)) {
      throw new Error('Stack profile not found from Phase 0');
    }

    const stackProfile = JSON.parse(readFileSync(stackProfilePath, 'utf-8'));
    console.log(`[Phase 5: Testing] ✓ Stack profile loaded`);

    // 5. Read framework config from Phase 0 (from disk)
    const frameworkConfigPath = join(phase0Dir, 'framework-config.json');
    if (!existsSync(frameworkConfigPath)) {
      throw new Error('Framework config not found from Phase 0');
    }

    const frameworkConfig = JSON.parse(readFileSync(frameworkConfigPath, 'utf-8'));
    console.log(`[Phase 5: Testing] ✓ Framework config loaded`);

    // 6. Create test orchestrator
    const testOrchestrator = new TestOrchestratorService(
      projectPath,
      frameworkConfig
    );

    // 7. Run all tests with coverage (80% threshold)
    console.log('[Phase 5: Testing] Running all tests with coverage...');
    console.log('[Phase 5: Testing] Coverage threshold: 80%\n');

    let allTestResults;
    try {
      allTestResults = await testOrchestrator.runAllTests(true, 80);

      console.log('\n[Phase 5: Testing] ✓ All tests completed');

    } catch (error: any) {
      // Hard stop if tests fail or coverage below threshold
      const errorMessage = error.message || 'Test execution failed';
      console.error(`[Phase 5: Testing] ✗ ${errorMessage}`);

      // Save partial results before failing
      mkdirSync(phase5Dir, { recursive: true });
      writeFileSync(
        join(phase5Dir, 'test-failure.txt'),
        `Test Failure:\n${errorMessage}\n\nStack:\n${error.stack || 'N/A'}`
      );

      throw new Error(
        `Phase 5 failed: ${errorMessage}\n\n` +
        `This is a HARD STOP - tests must pass before continuing.\n` +
        `Fix the failing tests and re-run from Phase 5.`
      );
    }

    // 8. Validate test results
    const failedTests = allTestResults.filter(r => !r.passed);
    if (failedTests.length > 0) {
      const failureDetails = failedTests.map(r =>
        `${r.testType}: ${r.failedTests} failed out of ${r.totalTests} total`
      ).join('\n');

      throw new Error(
        `Tests failed:\n${failureDetails}\n\n` +
        `This is a HARD STOP - all tests must pass before continuing.`
      );
    }

    // 9. Validate coverage (if collected)
    const resultsWithCoverage = allTestResults.filter(r => r.coverage);
    if (resultsWithCoverage.length > 0) {
      const lowCoverage = resultsWithCoverage.filter(r => r.coverage!.overall < 80);

      if (lowCoverage.length > 0) {
        const coverageDetails = lowCoverage.map(r =>
          `${r.testType}: ${r.coverage!.overall.toFixed(2)}% (threshold: 80%)`
        ).join('\n');

        throw new Error(
          `Coverage below threshold:\n${coverageDetails}\n\n` +
          `This is a HARD STOP - coverage must be >= 80% before continuing.`
        );
      }
    }

    // 10. Log test summary
    console.log('\n[Phase 5: Testing] Test Summary:');
    for (const result of allTestResults) {
      console.log(`  • ${result.testType.toUpperCase()}: ${result.passedTests}/${result.totalTests} passed (${(result.duration / 1000).toFixed(2)}s)`);
      if (result.coverage) {
        console.log(`    Coverage: ${result.coverage.overall.toFixed(2)}%`);
      }
    }
    console.log('');

    // 11. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 5: Testing] Writing outputs to disk...');
    mkdirSync(phase5Dir, { recursive: true });

    // Save test results
    writeFileSync(
      join(phase5Dir, 'test-results.json'),
      JSON.stringify(allTestResults, null, 2)
    );

    // Save test summary markdown
    const testSummaryLines: string[] = [];
    testSummaryLines.push('# Test Results Summary\n');
    testSummaryLines.push(`**Ticket ID**: ${ticketId}`);
    testSummaryLines.push(`**Timestamp**: ${new Date().toISOString()}\n`);

    for (const result of allTestResults) {
      const icon = result.passed ? '✅' : '❌';
      testSummaryLines.push(`## ${icon} ${result.testType.toUpperCase()} Tests\n`);
      testSummaryLines.push(`- **Status**: ${result.passed ? 'PASSED' : 'FAILED'}`);
      testSummaryLines.push(`- **Tests**: ${result.passedTests}/${result.totalTests} passed`);
      testSummaryLines.push(`- **Failed**: ${result.failedTests}`);
      testSummaryLines.push(`- **Skipped**: ${result.skippedTests}`);
      testSummaryLines.push(`- **Duration**: ${(result.duration / 1000).toFixed(2)}s\n`);

      if (result.coverage) {
        testSummaryLines.push('### Coverage\n');
        testSummaryLines.push(`- **Overall**: ${result.coverage.overall.toFixed(2)}%`);
        testSummaryLines.push(`- **Lines**: ${result.coverage.lines.percentage.toFixed(2)}% (${result.coverage.lines.covered}/${result.coverage.lines.total})`);
        testSummaryLines.push(`- **Statements**: ${result.coverage.statements.percentage.toFixed(2)}% (${result.coverage.statements.covered}/${result.coverage.statements.total})`);
        testSummaryLines.push(`- **Functions**: ${result.coverage.functions.percentage.toFixed(2)}% (${result.coverage.functions.covered}/${result.coverage.functions.total})`);
        testSummaryLines.push(`- **Branches**: ${result.coverage.branches.percentage.toFixed(2)}% (${result.coverage.branches.covered}/${result.coverage.branches.total})\n`);
      }
    }

    writeFileSync(
      join(phase5Dir, 'test-summary.md'),
      testSummaryLines.join('\n')
    );

    // Save testing data
    const testingData = {
      test_results: allTestResults,
      total_tests: allTestResults.reduce((sum, r) => sum + r.totalTests, 0),
      passed_tests: allTestResults.reduce((sum, r) => sum + r.passedTests, 0),
      failed_tests: allTestResults.reduce((sum, r) => sum + r.failedTests, 0),
      all_passed: allTestResults.every(r => r.passed),
      overall_passed: allTestResults.every(r => r.passed),
      coverage_threshold_met: resultsWithCoverage.every(r => r.coverage!.overall >= 80),
      timestamp: new Date().toISOString()
    };

    writeFileSync(
      join(phase5Dir, 'testing-data.json'),
      JSON.stringify(testingData, null, 2)
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify({
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        testing_data: testingData
      }, null, 2)
    );

    console.log('[Phase 5: Testing] ✓ Outputs written to disk');
    console.log(`[Phase 5: Testing] ✓ Phase complete (outputs: ${phase5Dir})`);

    // 12. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase6_visual',
      phase5_complete: true,
      phase5_testing: testingData
    };

  } catch (error) {
    const errorMessage = `Testing failed: ${(error as Error).message}`;
    console.error(`[Phase 5: Testing] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed'
    };
  }
}
