import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { ArtifactCollectorService } from '../../services/implement-ticket/artifact-collector.service.js';

/**
 * Phase 8: PR Creation Node
 *
 * This node creates a pull request with all artifacts:
 * - Collects screenshots, test results, coverage reports, logs
 * - Generates comprehensive PR description
 * - Creates `.tar.gz` archive of artifacts
 * - Git add, commit, push
 * - Creates PR via `gh pr create`
 * - Hard stop if git push or PR creation fails
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 5, 6, 7 outputs from disk, NOT from state
 * - Hard stop: PR creation must succeed before continuing
 *
 * @param state - Current workflow state
 * @returns Updated state with phase8 completion flag
 */
export async function phase8PRNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase8Dir = join(tempDir, 'phase8');

  console.log('\n[Phase 8: PR Creation] Starting PR creation...');

  const completionMarkerPath = join(phase8Dir, 'pr-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 8: PR Creation] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase9_review',
      phase8_complete: true,
      phase8_pr: completionData.pr_data,
    };
  }

  try {
    console.log('[Phase 8: PR Creation] Validating Phase 7 completion...');
    const phase7Dir = join(tempDir, 'phase7');
    const phase7CompletionPath = join(phase7Dir, 'documentation-complete.json');

    if (!existsSync(phase7CompletionPath)) {
      throw new Error('Phase 7 not complete. Run Phase 7 first or use --start-phase 7');
    }
    console.log('[Phase 8: PR Creation] ✓ Phase 7 verified');

    const phase5Dir = join(tempDir, 'phase5');
    const testResultsPath = join(phase5Dir, 'test-results.json');

    if (!existsSync(testResultsPath)) {
      throw new Error('Test results not found from Phase 5');
    }

    const testResults = JSON.parse(readFileSync(testResultsPath, 'utf-8'));
    console.log(`[Phase 8: PR Creation] ✓ Test results loaded`);

    const phase6Dir = join(tempDir, 'phase6');
    const visualDataPath = join(phase6Dir, 'visual-data.json');

    let visualVerification = null;
    let beforeScreenshots = null;
    let afterScreenshots = null;
    let diffResults = null;

    if (existsSync(visualDataPath)) {
      visualVerification = JSON.parse(readFileSync(visualDataPath, 'utf-8'));

      // Read screenshots metadata
      const beforeScreenshotsPath = join(tempDir, 'phase3', 'screenshots-before.json');
      const afterScreenshotsPath = join(phase6Dir, 'screenshots-after-final.json');
      const diffResultsPath = join(phase6Dir, 'diff-results.json');

      if (existsSync(beforeScreenshotsPath)) {
        beforeScreenshots = JSON.parse(readFileSync(beforeScreenshotsPath, 'utf-8'));
      }

      if (existsSync(afterScreenshotsPath)) {
        afterScreenshots = JSON.parse(readFileSync(afterScreenshotsPath, 'utf-8'));
      }

      if (existsSync(diffResultsPath)) {
        diffResults = JSON.parse(readFileSync(diffResultsPath, 'utf-8'));
      }

      console.log(`[Phase 8: PR Creation] ✓ Visual verification data loaded`);
    } else {
      console.log(`[Phase 8: PR Creation] ⚠ No visual verification data found`);
    }

    // 5. Create artifact collector
    const artifactCollector = new ArtifactCollectorService(projectPath, tempDir);

    // 6. Collect all artifacts
    console.log('[Phase 8: PR Creation] Collecting artifacts...');

    const artifactCollection = await artifactCollector.collectArtifacts(
      ticketId,
      testResults,
      visualVerification,
      beforeScreenshots,
      afterScreenshots,
      diffResults,
    );

    console.log(`[Phase 8: PR Creation] ✓ Artifacts collected`);
    console.log(`  • Screenshots: ${artifactCollection.artifacts.screenshots.length}`);
    console.log(`  • Test results: ${artifactCollection.artifacts.testResults.length}`);
    console.log(`  • Coverage reports: ${artifactCollection.artifacts.coverageReports.length}`);
    console.log(
      `  • Implementation logs: ${artifactCollection.artifacts.implementationLogs.length}`,
    );

    // 7. Get commit statistics
    const commitStats = artifactCollector.getCommitStatistics();
    console.log(
      `[Phase 8: PR Creation] ✓ Commit statistics: ${commitStats.filesChanged} files, +${commitStats.linesAdded}/-${commitStats.linesRemoved} lines`,
    );

    // 8. Check git status
    console.log('[Phase 8: PR Creation] Checking git status...');

    const gitStatus = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf-8',
    }).trim();

    if (!gitStatus) {
      console.log('[Phase 8: PR Creation] ⚠ No changes to commit (working tree clean)');
      throw new Error('No changes to commit - implementation may have failed or been reverted');
    }

    console.log(`[Phase 8: PR Creation] ✓ Found changes to commit`);

    // 9. Get current branch name
    const currentBranch = execSync('git branch --show-current', {
      cwd: projectPath,
      encoding: 'utf-8',
    }).trim();

    console.log(`[Phase 8: PR Creation] Current branch: ${currentBranch}`);

    // 10. Create commit message
    const commitMessage = generateCommitMessage(
      ticketId,
      artifactCollection,
      testResults,
      visualVerification,
    );

    console.log('[Phase 8: PR Creation] Commit message generated');

    // 11. Git add all changes
    console.log('[Phase 8: PR Creation] Staging changes...');

    execSync('git add .', {
      cwd: projectPath,
      stdio: 'pipe',
    });

    console.log('[Phase 8: PR Creation] ✓ Changes staged');

    // 12. Git commit
    console.log('[Phase 8: PR Creation] Creating commit...');

    try {
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      console.log('[Phase 8: PR Creation] ✓ Commit created');
    } catch (error: any) {
      throw new Error(`Git commit failed: ${error.message}`);
    }

    // 13. Git push
    console.log('[Phase 8: PR Creation] Pushing to remote...');

    try {
      execSync(`git push -u origin ${currentBranch}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      console.log('[Phase 8: PR Creation] ✓ Pushed to remote');
    } catch (error: any) {
      throw new Error(
        `Git push failed: ${error.message}\n\nMake sure you have push access to the repository.`,
      );
    }

    // 14. Create PR via gh CLI
    console.log('[Phase 8: PR Creation] Creating pull request...');

    const prTitle = generatePRTitle(ticketId);
    const prBody = artifactCollection.prDescription;

    // Detect base branch (main or master)
    let baseBranch = 'main';
    try {
      const remoteMainExists = execSync('git ls-remote --heads origin main', {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim();

      if (!remoteMainExists) {
        baseBranch = 'master';
      }
    } catch (error) {
      baseBranch = 'master'; // Fallback
    }

    let prUrl: string;
    try {
      // Use heredoc for PR body to handle special characters
      const prCommand = `gh pr create --base ${baseBranch} --title "${prTitle.replace(/"/g, '\\"')}" --body "$(cat <<'EOF'\n${prBody}\nEOF\n)"`;

      const prOutput = execSync(prCommand, {
        cwd: projectPath,
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();

      // Extract PR URL from output (usually last line)
      prUrl = prOutput.split('\n').filter(Boolean).pop() || '';

      if (!prUrl.startsWith('http')) {
        throw new Error(`Invalid PR URL: ${prUrl}`);
      }

      console.log(`[Phase 8: PR Creation] ✓ Pull request created: ${prUrl}`);
    } catch (error: any) {
      throw new Error(
        `PR creation failed: ${error.message}\n\nMake sure gh CLI is installed and authenticated.`,
      );
    }

    // 15. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 8: PR Creation] Writing outputs to disk...');
    mkdirSync(phase8Dir, { recursive: true });

    writeFileSync(join(phase8Dir, 'pr-url.txt'), prUrl);

    writeFileSync(join(phase8Dir, 'pr-description.md'), prBody);

    writeFileSync(join(phase8Dir, 'commit-message.txt'), commitMessage);

    writeFileSync(
      join(phase8Dir, 'artifact-collection.json'),
      JSON.stringify(artifactCollection, null, 2),
    );

    const prData = {
      pr_url: prUrl,
      pr_title: prTitle,
      pr_description: prBody,
      commit_message: commitMessage,
      branch: currentBranch,
      base_branch: baseBranch,
      commit_stats: commitStats,
      artifacts: artifactCollection.artifacts,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(join(phase8Dir, 'pr-data.json'), JSON.stringify(prData, null, 2));

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          pr_data: prData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 8: PR Creation] ✓ Outputs written to disk');
    console.log(`[Phase 8: PR Creation] ✓ Phase complete (outputs: ${phase8Dir})`);
    console.log(`\n✨ Pull Request: ${prUrl}\n`);

    // 16. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase9_review',
      phase8_complete: true,
      phase8_pr: prData,
    };
  } catch (error) {
    const errorMessage = `PR creation failed: ${(error as Error).message}`;
    console.error(`[Phase 8: PR Creation] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}

/**
 * Generate PR title from ticket ID
 */
function generatePRTitle(ticketId: string): string {
  return `feat(${ticketId}): Implementation`;
}

/**
 * Generate commit message with artifacts summary
 */
function generateCommitMessage(
  ticketId: string,
  artifactCollection: any,
  testResults: any[],
  visualVerification: any,
): string {
  const lines: string[] = [];

  lines.push(`feat(${ticketId}): Implementation`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('Automated implementation via Claude Code implement-ticket workflow.');
  lines.push('');

  // Test results
  lines.push('## Test Results');
  for (const result of testResults) {
    const icon = result.passed ? '✅' : '❌';
    lines.push(`${icon} ${result.testType}: ${result.passedTests}/${result.totalTests} passed`);
    if (result.coverage) {
      lines.push(`   Coverage: ${result.coverage.overall.toFixed(2)}%`);
    }
  }
  lines.push('');

  // Visual verification
  if (visualVerification) {
    if (visualVerification.converged) {
      lines.push('## Visual Verification');
      lines.push('✅ Visual regression testing passed');
      lines.push(`   Iterations: ${visualVerification.iterations}`);
      lines.push('');
    } else if (visualVerification.verdict && !visualVerification.skipped) {
      lines.push('## Visual Verification');
      lines.push('⚠️  Visual changes detected - see PR for diff images');
      lines.push('');
    }
  }

  // Footer
  lines.push('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
  lines.push('');
  lines.push('Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>');

  return lines.join('\n');
}
