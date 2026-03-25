import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { TestResults } from './test-orchestrator.service.js';
import type { ComparisonResult, ScreenshotMetadata } from './screenshot.service.js';

/**
 * Artifact Collector Service
 *
 * Collects artifacts for PR creation:
 * - Screenshots (before/after/diffs)
 * - Test results and coverage reports
 * - Implementation logs
 * - Visual verification verdict
 * - Generates PR description with artifacts
 * - Creates tar.gz archive
 */

export interface ArtifactCollection {
  prDescription: string;
  artifacts: {
    screenshots: string[];
    testResults: string[];
    coverageReports: string[];
    implementationLogs: string[];
    visualVerification?: string;
  };
  archivePath: string;
}

/**
 * Service for collecting implementation artifacts
 */
export class ArtifactCollectorService {
  private projectPath: string;
  private tempDir: string;

  constructor(projectPath: string, tempDir: string) {
    this.projectPath = projectPath;
    this.tempDir = tempDir;
  }

  /**
   * Collect all artifacts for PR
   *
   * @param ticketId - Ticket ID
   * @param testResults - Test results from Phase 5
   * @param visualVerification - Visual verification results from Phase 6
   * @param beforeScreenshots - Before screenshots
   * @param afterScreenshots - After screenshots
   * @param diffResults - Screenshot diff results
   * @returns Artifact collection
   */
  async collectArtifacts(
    ticketId: string,
    testResults: TestResults[],
    visualVerification?: any,
    beforeScreenshots?: ScreenshotMetadata[],
    afterScreenshots?: ScreenshotMetadata[],
    diffResults?: ComparisonResult[]
  ): Promise<ArtifactCollection> {
    console.log('\n[ArtifactCollector] Collecting artifacts...');

    const artifacts: ArtifactCollection['artifacts'] = {
      screenshots: [],
      testResults: [],
      coverageReports: [],
      implementationLogs: []
    };

    // 1. Collect screenshots
    if (beforeScreenshots && afterScreenshots) {
      artifacts.screenshots = this.collectScreenshots(
        beforeScreenshots,
        afterScreenshots,
        diffResults
      );
    }

    // 2. Collect test results
    artifacts.testResults = this.collectTestResults(testResults);

    // 3. Collect coverage reports
    artifacts.coverageReports = this.collectCoverageReports();

    // 4. Collect implementation logs
    artifacts.implementationLogs = this.collectImplementationLogs();

    // 5. Collect visual verification (if any)
    if (visualVerification) {
      artifacts.visualVerification = this.collectVisualVerification(visualVerification);
    }

    // 6. Generate PR description
    const prDescription = this.generatePRDescription(
      ticketId,
      testResults,
      visualVerification,
      diffResults
    );

    // 7. Create tar.gz archive
    const archivePath = await this.createArchive(ticketId, artifacts);

    console.log('[ArtifactCollector] ✓ Artifacts collected\n');

    return {
      prDescription,
      artifacts,
      archivePath
    };
  }

  /**
   * Collect screenshots
   */
  private collectScreenshots(
    beforeScreenshots: ScreenshotMetadata[],
    afterScreenshots: ScreenshotMetadata[],
    diffResults?: ComparisonResult[]
  ): string[] {
    const screenshots: string[] = [];

    // Add before screenshots
    screenshots.push(...beforeScreenshots.map(s => s.path));

    // Add after screenshots
    screenshots.push(...afterScreenshots.map(s => s.path));

    // Add diff images
    if (diffResults) {
      screenshots.push(...diffResults.map(d => d.diffImagePath));
    }

    console.log(`[ArtifactCollector] Collected ${screenshots.length} screenshots`);

    return screenshots;
  }

  /**
   * Collect test results
   */
  private collectTestResults(testResults: TestResults[]): string[] {
    const results: string[] = [];

    // Save test results to temp directory
    const testResultsPath = join(this.tempDir, 'phase5', 'test-results.json');
    if (existsSync(testResultsPath)) {
      results.push(testResultsPath);
    }

    console.log(`[ArtifactCollector] Collected ${results.length} test result files`);

    return results;
  }

  /**
   * Collect coverage reports
   */
  private collectCoverageReports(): string[] {
    const reports: string[] = [];

    // Look for coverage directory
    const coverageDir = join(this.projectPath, 'coverage');

    if (existsSync(coverageDir)) {
      // Collect HTML report
      const htmlReport = join(coverageDir, 'index.html');
      if (existsSync(htmlReport)) {
        reports.push(htmlReport);
      }

      // Collect coverage-summary.json
      const summaryJson = join(coverageDir, 'coverage-summary.json');
      if (existsSync(summaryJson)) {
        reports.push(summaryJson);
      }
    }

    console.log(`[ArtifactCollector] Collected ${reports.length} coverage reports`);

    return reports;
  }

  /**
   * Collect implementation logs
   */
  private collectImplementationLogs(): string[] {
    const logs: string[] = [];

    // Collect Phase 4 implementation log
    const phase4Dir = join(this.tempDir, 'phase4');
    const implementationLog = join(phase4Dir, 'implementation-log.md');

    if (existsSync(implementationLog)) {
      logs.push(implementationLog);
    }

    console.log(`[ArtifactCollector] Collected ${logs.length} implementation logs`);

    return logs;
  }

  /**
   * Collect visual verification verdict
   */
  private collectVisualVerification(visualVerification: any): string {
    const phase6Dir = join(this.tempDir, 'phase6');
    const verdictPath = join(phase6Dir, 'visual-verdict.md');

    if (existsSync(verdictPath)) {
      return readFileSync(verdictPath, 'utf-8');
    }

    return JSON.stringify(visualVerification, null, 2);
  }

  /**
   * Generate PR description
   */
  private generatePRDescription(
    ticketId: string,
    testResults: TestResults[],
    visualVerification?: any,
    diffResults?: ComparisonResult[]
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${ticketId}: Implementation Summary`);
    lines.push('');

    // Summary section (to be filled by user or extracted from context)
    lines.push('## Summary');
    lines.push('');
    lines.push('_Brief description of changes_');
    lines.push('');

    // Test Results
    lines.push('## Test Results');
    lines.push('');

    for (const result of testResults) {
      const icon = result.passed ? '✅' : '❌';
      lines.push(`### ${icon} ${result.testType.toUpperCase()} Tests`);
      lines.push('');
      lines.push(`- **Status**: ${result.passed ? 'PASSED' : 'FAILED'}`);
      lines.push(`- **Tests**: ${result.passedTests}/${result.totalTests} passed`);
      lines.push(`- **Duration**: ${(result.duration / 1000).toFixed(2)}s`);

      if (result.coverage) {
        lines.push(`- **Coverage**: ${result.coverage.overall.toFixed(2)}%`);
        lines.push(`  - Lines: ${result.coverage.lines.percentage.toFixed(2)}%`);
        lines.push(`  - Statements: ${result.coverage.statements.percentage.toFixed(2)}%`);
        lines.push(`  - Functions: ${result.coverage.functions.percentage.toFixed(2)}%`);
        lines.push(`  - Branches: ${result.coverage.branches.percentage.toFixed(2)}%`);
      }

      lines.push('');
    }

    // Visual Verification (if any)
    if (visualVerification && diffResults) {
      lines.push('## Visual Verification');
      lines.push('');

      const allPassed = diffResults.every(r => r.passed);
      const icon = allPassed ? '✅' : '⚠️';

      lines.push(`### ${icon} Screenshot Comparison`);
      lines.push('');

      for (const diff of diffResults) {
        const diffIcon = diff.passed ? '✅' : '⚠️';
        lines.push(`- ${diffIcon} Diff: ${diff.diffPercentage.toFixed(2)}% (${diff.diffPixels} pixels)`);
      }

      lines.push('');

      if (!allPassed) {
        lines.push('**Note**: Visual changes detected. Please review diff images in artifacts.');
        lines.push('');
      }
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
    lines.push('');
    lines.push('Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>');

    return lines.join('\n');
  }

  /**
   * Create tar.gz archive of artifacts
   */
  private async createArchive(
    ticketId: string,
    artifacts: ArtifactCollection['artifacts']
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `${ticketId}-artifacts-${timestamp}.tar.gz`;
    const archivePath = join(this.tempDir, archiveName);

    // Collect all artifact paths
    const allPaths: string[] = [
      ...artifacts.screenshots,
      ...artifacts.testResults,
      ...artifacts.coverageReports,
      ...artifacts.implementationLogs
    ];

    if (allPaths.length === 0) {
      console.log('[ArtifactCollector] No artifacts to archive');
      return archivePath;
    }

    try {
      // Create tar.gz archive
      const relativePaths = allPaths.map(p => relative(this.projectPath, p));
      const pathsArg = relativePaths.join(' ');

      execSync(
        `tar -czf ${archivePath} ${pathsArg}`,
        {
          cwd: this.projectPath,
          stdio: 'pipe'
        }
      );

      console.log(`[ArtifactCollector] ✓ Created archive: ${archivePath}`);

      return archivePath;

    } catch (error: any) {
      console.error(`[ArtifactCollector] Failed to create archive: ${error.message}`);
      return archivePath;
    }
  }

  /**
   * Get file changes from git
   *
   * @returns List of modified files
   */
  getModifiedFiles(): string[] {
    try {
      const output = execSync('git diff --name-only HEAD', {
        cwd: this.projectPath,
        encoding: 'utf-8'
      });

      return output.trim().split('\n').filter(Boolean);

    } catch (error) {
      console.error(`[ArtifactCollector] Failed to get modified files: ${error}`);
      return [];
    }
  }

  /**
   * Get commit statistics
   *
   * @returns Commit statistics (lines added/removed, files changed)
   */
  getCommitStatistics(): any {
    try {
      const output = execSync('git diff --stat HEAD', {
        cwd: this.projectPath,
        encoding: 'utf-8'
      });

      // Parse output like: "5 files changed, 120 insertions(+), 45 deletions(-)"
      const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

      if (match) {
        return {
          filesChanged: parseInt(match[1], 10),
          linesAdded: match[2] ? parseInt(match[2], 10) : 0,
          linesRemoved: match[3] ? parseInt(match[3], 10) : 0
        };
      }

      return {
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0
      };

    } catch (error) {
      console.error(`[ArtifactCollector] Failed to get commit statistics: ${error}`);
      return {
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0
      };
    }
  }
}
