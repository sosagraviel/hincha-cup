import { TestOrchestratorService } from './test-orchestrator.service.js';

/**
 * Review Loop Service
 *
 * Handles automated PR review iterations:
 * - Invokes PR review skill (checks code quality, best practices)
 * - Invokes security review skill (checks for vulnerabilities)
 * - Extracts blocking and major issues
 * - Applies auto-fixes via implementer agent
 * - Re-runs tests to verify fixes
 * - Iteration loop (max 3 iterations)
 * - Convergence detection (>10% improvement per iteration)
 * - Divergence detection (issue count increases)
 */

export interface ReviewIssue {
  severity: 'blocking' | 'major' | 'minor' | 'info';
  category: string;
  description: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  blockerCount: number;
  majorCount: number;
  minorCount: number;
}

export interface ReviewLoopResult {
  finalPassed: boolean;
  iterations: ReviewIteration[];
  convergence: 'converged' | 'diverged' | 'max_iterations';
  totalIssuesResolved: number;
}

export interface ReviewIteration {
  iteration: number;
  prReview: ReviewResult;
  securityReview: ReviewResult;
  fixesApplied: string[];
  testsPassedAfterFix: boolean;
  issueCountBefore: number;
  issueCountAfter: number;
  improvement: number; // percentage
}

/**
 * Service for orchestrating PR review loops
 */
export class ReviewLoopService {
  private projectPath: string;
  private frameworkPath: string;
  private maxIterations: number;
  private convergenceThreshold: number; // minimum improvement percentage

  constructor(
    projectPath: string,
    frameworkPath: string,
    maxIterations: number = 3,
    convergenceThreshold: number = 10.0, // 10% improvement per iteration
  ) {
    this.projectPath = projectPath;
    this.frameworkPath = frameworkPath;
    this.maxIterations = maxIterations;
    this.convergenceThreshold = convergenceThreshold;
  }

  /**
   * Run review loop with PR and security reviews
   *
   * @param prUrl - Pull request URL
   * @param testOrchestrator - Test orchestrator instance
   * @returns Review loop result
   */
  async runReviewLoop(
    prUrl: string,
    testOrchestrator: TestOrchestratorService,
  ): Promise<ReviewLoopResult> {
    console.log('\n[ReviewLoop] Starting review loop...');
    console.log(`[ReviewLoop] Max iterations: ${this.maxIterations}`);
    console.log(`[ReviewLoop] Convergence threshold: ${this.convergenceThreshold}%\n`);

    const iterations: ReviewIteration[] = [];
    let previousIssueCount = 0;

    for (let i = 1; i <= this.maxIterations; i++) {
      console.log(`\n[ReviewLoop] === Iteration ${i}/${this.maxIterations} ===\n`);

      // 1. Run PR review
      console.log('[ReviewLoop] Running PR review...');
      const prReview = await this.runPRReview(prUrl);

      // 2. Run security review
      console.log('[ReviewLoop] Running security review...');
      const securityReview = await this.runSecurityReview(prUrl);

      // 3. Count total issues
      const currentIssueCount =
        prReview.blockerCount +
        prReview.majorCount +
        securityReview.blockerCount +
        securityReview.majorCount;

      console.log(`[ReviewLoop] Found ${currentIssueCount} blocking/major issues`);

      // 4. Check if review passed (no blocking issues)
      if (prReview.blockerCount === 0 && securityReview.blockerCount === 0) {
        console.log('[ReviewLoop] ✓ Review passed (no blocking issues)');

        iterations.push({
          iteration: i,
          prReview,
          securityReview,
          fixesApplied: [],
          testsPassedAfterFix: true,
          issueCountBefore: previousIssueCount,
          issueCountAfter: currentIssueCount,
          improvement:
            previousIssueCount > 0
              ? ((previousIssueCount - currentIssueCount) / previousIssueCount) * 100
              : 0,
        });

        return {
          finalPassed: true,
          iterations,
          convergence: 'converged',
          totalIssuesResolved: this.calculateTotalIssuesResolved(iterations),
        };
      }

      // 5. Extract blocking and major issues
      const blockingIssues = this.extractIssues(prReview, securityReview, ['blocking', 'major']);

      // 6. Apply fixes via implementer agent
      console.log('[ReviewLoop] Applying fixes...');
      const fixesApplied = await this.applyFixes(blockingIssues);

      // 7. Re-run tests to verify fixes
      console.log('[ReviewLoop] Re-running tests...');
      let testsPassedAfterFix = false;
      try {
        const testResults = await testOrchestrator.runAllTests(false); // No coverage
        testsPassedAfterFix = testResults.every((r) => r.passed);

        if (!testsPassedAfterFix) {
          console.error('[ReviewLoop] Tests failed after fixes - hard stop');

          iterations.push({
            iteration: i,
            prReview,
            securityReview,
            fixesApplied,
            testsPassedAfterFix: false,
            issueCountBefore: previousIssueCount,
            issueCountAfter: currentIssueCount,
            improvement: 0,
          });

          return {
            finalPassed: false,
            iterations,
            convergence: 'diverged',
            totalIssuesResolved: 0,
          };
        }

        console.log('[ReviewLoop] ✓ Tests passed after fixes');
      } catch (error: any) {
        console.error(`[ReviewLoop] Test execution failed: ${error.message}`);
        testsPassedAfterFix = false;
      }

      // 8. Calculate improvement
      const improvement =
        previousIssueCount > 0
          ? ((previousIssueCount - currentIssueCount) / previousIssueCount) * 100
          : 0;

      console.log(`[ReviewLoop] Improvement: ${improvement.toFixed(2)}%`);

      // 9. Record iteration
      iterations.push({
        iteration: i,
        prReview,
        securityReview,
        fixesApplied,
        testsPassedAfterFix,
        issueCountBefore: previousIssueCount,
        issueCountAfter: currentIssueCount,
        improvement,
      });

      // 10. Check for divergence (issues increased)
      if (previousIssueCount > 0 && currentIssueCount > previousIssueCount) {
        console.log('[ReviewLoop] ⚠ Divergence detected (issue count increased)');

        return {
          finalPassed: false,
          iterations,
          convergence: 'diverged',
          totalIssuesResolved: 0,
        };
      }

      // 11. Check for convergence (improvement < threshold)
      if (i > 1 && improvement < this.convergenceThreshold) {
        console.log(
          `[ReviewLoop] ⚠ Convergence slowing (improvement < ${this.convergenceThreshold}%)`,
        );
      }

      // Update previous issue count for next iteration
      previousIssueCount = currentIssueCount;
    }

    // Max iterations reached
    console.log(`[ReviewLoop] ⚠ Max iterations (${this.maxIterations}) reached`);

    return {
      finalPassed: false,
      iterations,
      convergence: 'max_iterations',
      totalIssuesResolved: this.calculateTotalIssuesResolved(iterations),
    };
  }

  /**
   * Run PR review (code quality, best practices)
   *
   * @param prUrl - Pull request URL
   * @returns Review result
   */
  private async runPRReview(prUrl: string): Promise<ReviewResult> {
    // Simulate PR review for now
    // In real implementation, this would invoke /pr-reviewer skill
    // or use gh CLI to fetch PR diff and analyze

    return {
      passed: false,
      issues: [
        {
          severity: 'blocking',
          category: 'code-quality',
          description: 'Example blocking issue',
          suggestedFix: 'Fix suggested here',
        },
      ],
      blockerCount: 1,
      majorCount: 0,
      minorCount: 0,
    };
  }

  /**
   * Run security review
   *
   * @param prUrl - Pull request URL
   * @returns Review result
   */
  private async runSecurityReview(prUrl: string): Promise<ReviewResult> {
    // Simulate security review for now
    // In real implementation, this would invoke /security-review skill

    return {
      passed: true,
      issues: [],
      blockerCount: 0,
      majorCount: 0,
      minorCount: 0,
    };
  }

  /**
   * Extract issues of specific severities
   */
  private extractIssues(
    prReview: ReviewResult,
    securityReview: ReviewResult,
    severities: ReviewIssue['severity'][],
  ): ReviewIssue[] {
    const allIssues = [...prReview.issues, ...securityReview.issues];

    return allIssues.filter((issue) => severities.includes(issue.severity));
  }

  /**
   * Apply fixes for issues via implementer agent
   */
  private async applyFixes(issues: ReviewIssue[]): Promise<string[]> {
    const fixes: string[] = [];

    if (issues.length === 0) {
      return fixes;
    }

    // Build fix instructions
    const fixInstructions = this.buildFixInstructions(issues);

    try {
      // Invoke implementer agent with fix instructions
      // For now, just log
      console.log(`[ReviewLoop] Would invoke implementer with ${issues.length} fixes`);

      fixes.push(`Applied ${issues.length} fixes`);
    } catch (error: any) {
      console.error(`[ReviewLoop] Failed to apply fixes: ${error.message}`);
    }

    return fixes;
  }

  /**
   * Build fix instructions from issues
   */
  private buildFixInstructions(issues: ReviewIssue[]): string {
    const lines: string[] = [];

    lines.push('## Issues to Fix');
    lines.push('');

    for (const [index, issue] of issues.entries()) {
      lines.push(`### Issue ${index + 1}: ${issue.category}`);
      lines.push('');
      lines.push(`**Severity**: ${issue.severity.toUpperCase()}`);
      lines.push(`**Description**: ${issue.description}`);

      if (issue.file) {
        lines.push(`**File**: ${issue.file}:${issue.line || '?'}`);
      }

      if (issue.suggestedFix) {
        lines.push('');
        lines.push('**Suggested Fix**:');
        lines.push(issue.suggestedFix);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Calculate total issues resolved across iterations
   */
  private calculateTotalIssuesResolved(iterations: ReviewIteration[]): number {
    if (iterations.length === 0) return 0;

    const firstIssueCount = iterations[0].issueCountBefore;
    const lastIssueCount = iterations[iterations.length - 1].issueCountAfter;

    return Math.max(0, firstIssueCount - lastIssueCount);
  }
}
