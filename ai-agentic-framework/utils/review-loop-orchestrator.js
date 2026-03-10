#!/usr/bin/env node

/**
 * Review Loop Orchestrator
 *
 * Orchestrates the automated review-fix-test loop (Phase 9 of implement-ticket).
 * Manages iterations of PR reviews, applies fixes, re-runs tests, and tracks
 * convergence towards passing all review criteria.
 *
 * Key Features:
 * - Reads review results from pr-reviewer and security-review
 * - Spawns implementer agent with fix instructions
 * - Re-runs affected tests after fixes
 * - Tracks iteration progress (max 3 iterations)
 * - Detects convergence or divergence
 * - Stops when all blocking issues resolved or max iterations reached
 *
 * @module review-loop-orchestrator
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Review loop configuration
 */
const CONFIG = {
  maxIterations: 3,
  minImprovementThreshold: 0.1, // 10% improvement required between iterations
  autoFixCategories: ['blocking', 'major'], // Only auto-fix blocking and major issues
  testRetryAttempts: 2
};

/**
 * Main ReviewLoopOrchestrator class
 */
class ReviewLoopOrchestrator {
  constructor(projectRoot, jiraKey) {
    this.projectRoot = projectRoot;
    this.jiraKey = jiraKey;
    this.artifactsDir = path.join(projectRoot, '.claude', 'artifacts', jiraKey);
    this.reviewDir = path.join(this.artifactsDir, 'pr', 'review');
    this.currentIteration = 0;
    this.iterationHistory = [];
  }

  /**
   * Start review loop orchestration
   *
   * @returns {Promise<OrchestrationResult>}
   */
  async orchestrate() {
    try {
      console.log('🔄 Starting Review Loop Orchestration...');
      console.log(`   JIRA Key: ${this.jiraKey}`);
      console.log(`   Max Iterations: ${CONFIG.maxIterations}`);
      console.log('');

      // Load initial review results
      const reviewResults = await this.loadReviewResults();

      if (!reviewResults) {
        throw new Error('No review results found. Run pr-reviewer first.');
      }

      // Check if review loop needed
      if (!this.isReviewLoopNeeded(reviewResults)) {
        console.log('✅ No blocking issues found. Review loop not needed.');
        return this.createSuccessResult(reviewResults);
      }

      // Start iteration loop
      let currentResults = reviewResults;

      while (this.shouldContinueLoop(currentResults)) {
        this.currentIteration++;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 Iteration ${this.currentIteration}/${CONFIG.maxIterations}`);
        console.log(`${'='.repeat(60)}\n`);

        // Run iteration
        const iterationResult = await this.runIteration(currentResults);

        // Track iteration
        this.iterationHistory.push(iterationResult);

        // Check convergence
        if (iterationResult.allIssuesResolved) {
          console.log('\n✅ All blocking issues resolved!');
          return this.createSuccessResult(iterationResult.reviewResults);
        }

        // Check divergence
        if (this.isDiverging()) {
          console.log('\n⚠️  Review loop diverging. Stopping automated fixes.');
          return this.createDivergenceResult();
        }

        // Update current results for next iteration
        currentResults = iterationResult.reviewResults;
      }

      // Max iterations reached
      console.log('\n⚠️  Max iterations reached. Manual review required.');
      return this.createMaxIterationsResult(currentResults);

    } catch (error) {
      console.error('❌ Review loop orchestration failed:', error.message);
      throw error;
    }
  }

  /**
   * Load review results from artifacts
   *
   * @returns {Promise<Object|null>}
   */
  async loadReviewResults() {
    const reviewResultsPath = path.join(this.reviewDir, 'review-results.json');

    if (!fs.existsSync(reviewResultsPath)) {
      console.log('⚠️  No review results found');
      return null;
    }

    const reviewResults = JSON.parse(fs.readFileSync(reviewResultsPath, 'utf8'));

    console.log('📊 Review Results Summary:');
    console.log(`   Blocking: ${reviewResults.metrics?.blockingCount || 0}`);
    console.log(`   Major: ${reviewResults.metrics?.majorCount || 0}`);
    console.log(`   Minor: ${reviewResults.metrics?.minorCount || 0}`);
    console.log('');

    return reviewResults;
  }

  /**
   * Check if review loop is needed
   *
   * @param {Object} reviewResults - Review results
   * @returns {boolean}
   */
  isReviewLoopNeeded(reviewResults) {
    const blockingCount = reviewResults.metrics?.blockingCount || 0;
    return blockingCount > 0;
  }

  /**
   * Check if loop should continue
   *
   * @param {Object} reviewResults - Current review results
   * @returns {boolean}
   */
  shouldContinueLoop(reviewResults) {
    // Check max iterations
    if (this.currentIteration >= CONFIG.maxIterations) {
      console.log(`⚠️  Max iterations (${CONFIG.maxIterations}) reached.`);
      return false;
    }

    // Check if blocking issues remain
    const blockingCount = reviewResults.metrics?.blockingCount || 0;

    if (blockingCount === 0) {
      console.log('✅ No blocking issues remain.');
      return false;
    }

    console.log(`🔄 ${blockingCount} blocking issues remain. Continuing...`);
    return true;
  }

  /**
   * Run single iteration of review loop
   *
   * @param {Object} reviewResults - Current review results
   * @returns {Promise<IterationResult>}
   */
  async runIteration(reviewResults) {
    const iterationStart = Date.now();

    const iteration = {
      number: this.currentIteration,
      timestamp: new Date().toISOString(),
      reviewResults: {
        blockingCount: reviewResults.metrics?.blockingCount || 0,
        majorCount: reviewResults.metrics?.majorCount || 0,
        minorCount: reviewResults.metrics?.minorCount || 0
      },
      fixesApplied: [],
      testsRun: false,
      testsPassed: false,
      allIssuesResolved: false,
      duration: 0
    };

    try {
      // Step 1: Extract fixable issues
      console.log('📋 Step 1: Extracting fixable issues...');
      const fixableIssues = this.extractFixableIssues(reviewResults);
      console.log(`   Found ${fixableIssues.length} fixable issues`);

      if (fixableIssues.length === 0) {
        console.log('   No fixable issues. Manual intervention needed.');
        iteration.allIssuesResolved = false;
        return iteration;
      }

      // Step 2: Apply fixes via implementer agent
      console.log('\n🔧 Step 2: Applying fixes...');
      const fixResults = await this.applyFixes(fixableIssues);
      iteration.fixesApplied = fixResults;
      console.log(`   Applied ${fixResults.filter(f => f.status === 'applied').length} fixes`);

      // Step 3: Run affected tests
      console.log('\n🧪 Step 3: Running affected tests...');
      const testResults = await this.runAffectedTests(fixableIssues);
      iteration.testsRun = true;
      iteration.testsPassed = testResults.overall.status === 'passed';
      console.log(`   Tests: ${testResults.overall.status}`);

      // Step 4: Re-run PR reviewer
      console.log('\n🔍 Step 4: Re-running PR review...');
      const newReviewResults = await this.rerunPRReview();
      iteration.reviewResults = newReviewResults;

      // Check if all issues resolved
      const remainingBlocking = newReviewResults.metrics?.blockingCount || 0;
      iteration.allIssuesResolved = (remainingBlocking === 0 && iteration.testsPassed);

      console.log(`   Remaining blocking issues: ${remainingBlocking}`);

    } catch (error) {
      console.error(`   ❌ Iteration ${this.currentIteration} failed:`, error.message);
      iteration.error = error.message;
    }

    iteration.duration = Date.now() - iterationStart;

    // Save iteration result
    await this.saveIteration(iteration);

    return iteration;
  }

  /**
   * Extract fixable issues from review results
   *
   * @param {Object} reviewResults - Review results
   * @returns {Array<Object>}
   */
  extractFixableIssues(reviewResults) {
    const fixableIssues = [];

    if (!reviewResults.findings) {
      return fixableIssues;
    }

    // Only extract issues with fix instructions
    const checkFindings = (findings) => {
      if (!findings) return;

      findings.forEach(finding => {
        if (finding.fixInstructions && finding.fixInstructions.action) {
          // Only auto-fix blocking and major issues
          if (CONFIG.autoFixCategories.includes(finding.severity)) {
            fixableIssues.push(finding);
          }
        }
      });
    };

    checkFindings(reviewResults.findings.blocking);
    checkFindings(reviewResults.findings.major);

    return fixableIssues;
  }

  /**
   * Apply fixes via implementer agent
   *
   * @param {Array<Object>} issues - Issues to fix
   * @returns {Promise<Array<Object>>}
   */
  async applyFixes(issues) {
    const fixResults = [];

    for (const issue of issues) {
      try {
        console.log(`   Fixing: ${issue.id} - ${issue.issue}`);

        const fix = issue.fixInstructions;

        // Apply fix based on action type
        switch (fix.action) {
          case 'replace':
            await this.applyReplaceFix(fix);
            fixResults.push({
              findingId: issue.id,
              file: fix.file,
              line: fix.line,
              status: 'applied',
              action: 'replace'
            });
            break;

          case 'add':
            await this.applyAddFix(fix);
            fixResults.push({
              findingId: issue.id,
              file: fix.file,
              insertAfterLine: fix.insertAfterLine,
              status: 'applied',
              action: 'add'
            });
            break;

          case 'delete':
            await this.applyDeleteFix(fix);
            fixResults.push({
              findingId: issue.id,
              file: fix.file,
              line: fix.line,
              status: 'applied',
              action: 'delete'
            });
            break;

          case 'refactor':
            console.log(`      Skipping refactor (requires manual review)`);
            fixResults.push({
              findingId: issue.id,
              file: fix.file,
              status: 'skipped',
              reason: 'Refactor requires manual review'
            });
            break;

          default:
            console.log(`      Unknown action: ${fix.action}`);
            fixResults.push({
              findingId: issue.id,
              status: 'failed',
              reason: `Unknown action: ${fix.action}`
            });
        }

      } catch (error) {
        console.error(`      ❌ Failed to apply fix:`, error.message);
        fixResults.push({
          findingId: issue.id,
          status: 'failed',
          error: error.message
        });
      }
    }

    return fixResults;
  }

  /**
   * Apply replace fix
   *
   * @param {Object} fix - Fix instruction
   */
  async applyReplaceFix(fix) {
    const filePath = path.join(this.projectRoot, fix.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${fix.file}`);
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace old code with new code
    if (fix.oldCode && fix.newCode) {
      content = content.replace(fix.oldCode, fix.newCode);
    } else {
      // Line-based replacement
      const lines = content.split('\n');
      if (fix.line && fix.line <= lines.length) {
        lines[fix.line - 1] = fix.newCode;
        content = lines.join('\n');
      }
    }

    fs.writeFileSync(filePath, content);
    console.log(`      ✅ Replaced code in ${fix.file}:${fix.line}`);
  }

  /**
   * Apply add fix
   *
   * @param {Object} fix - Fix instruction
   */
  async applyAddFix(fix) {
    const filePath = path.join(this.projectRoot, fix.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${fix.file}`);
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Insert new code after specified line
    if (fix.insertAfterLine && fix.insertAfterLine <= lines.length) {
      lines.splice(fix.insertAfterLine, 0, fix.newCode);
      content = lines.join('\n');
    } else {
      // Append to end of file
      content += '\n' + fix.newCode;
    }

    fs.writeFileSync(filePath, content);
    console.log(`      ✅ Added code to ${fix.file} after line ${fix.insertAfterLine || 'EOF'}`);
  }

  /**
   * Apply delete fix
   *
   * @param {Object} fix - Fix instruction
   */
  async applyDeleteFix(fix) {
    const filePath = path.join(this.projectRoot, fix.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${fix.file}`);
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // Delete specific code or line
    if (fix.oldCode) {
      content = content.replace(fix.oldCode, '');
    } else if (fix.line) {
      const lines = content.split('\n');
      lines.splice(fix.line - 1, 1);
      content = lines.join('\n');
    }

    fs.writeFileSync(filePath, content);
    console.log(`      ✅ Deleted code from ${fix.file}:${fix.line}`);
  }

  /**
   * Run affected tests
   *
   * @param {Array<Object>} issues - Fixed issues
   * @returns {Promise<Object>}
   */
  async runAffectedTests(issues) {
    try {
      // Get list of affected files
      const affectedFiles = [...new Set(issues.map(i => i.file))];
      console.log(`   Testing ${affectedFiles.length} affected files...`);

      // Use test-orchestrator to run tests
      const testOrchestratorPath = path.join(__dirname, 'test-orchestrator.js');

      const result = execSync(
        `node "${testOrchestratorPath}" "${this.projectRoot}" "${this.jiraKey}"`,
        {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 300000 // 5 minutes
        }
      );

      // Read test results
      const testResultsPath = path.join(this.artifactsDir, 'tests', 'test-results.json');

      if (fs.existsSync(testResultsPath)) {
        return JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
      }

      // Fallback: parse from output
      return {
        overall: { status: result.includes('✅') ? 'passed' : 'failed' },
        unit: { passed: 0, total: 0 },
        integration: { passed: 0, total: 0 },
        e2e: { passed: 0, total: 0 }
      };

    } catch (error) {
      console.error('   ❌ Test execution failed:', error.message);
      return {
        overall: { status: 'failed' },
        error: error.message
      };
    }
  }

  /**
   * Re-run PR review
   *
   * @returns {Promise<Object>}
   */
  async rerunPRReview() {
    try {
      // Re-run pr-reviewer skill
      console.log('   Running pr-reviewer...');

      // Read PR URL
      const prUrlPath = path.join(this.artifactsDir, 'pr', 'pr-url.txt');
      const prUrl = fs.readFileSync(prUrlPath, 'utf8').trim();

      // Execute pr-reviewer
      execSync(
        `claude-code /pr-reviewer --pr-url "${prUrl}" --jira-key "${this.jiraKey}" --mode automated`,
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          stdio: 'inherit'
        }
      );

      // Read updated review results
      const reviewResultsPath = path.join(this.reviewDir, 'review-results.json');
      return JSON.parse(fs.readFileSync(reviewResultsPath, 'utf8'));

    } catch (error) {
      console.error('   ❌ PR review failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if review loop is diverging
   *
   * @returns {boolean}
   */
  isDiverging() {
    if (this.iterationHistory.length < 2) {
      return false;
    }

    const lastIteration = this.iterationHistory[this.iterationHistory.length - 1];
    const previousIteration = this.iterationHistory[this.iterationHistory.length - 2];

    // Check if issue count increased
    const currentBlocking = lastIteration.reviewResults.blockingCount;
    const previousBlocking = previousIteration.reviewResults.blockingCount;

    if (currentBlocking > previousBlocking) {
      console.log('   ⚠️  Issue count increased (diverging)');
      return true;
    }

    // Check if improvement is below threshold
    const improvement = (previousBlocking - currentBlocking) / previousBlocking;

    if (improvement < CONFIG.minImprovementThreshold) {
      console.log(`   ⚠️  Improvement below threshold (${(improvement * 100).toFixed(1)}% < ${CONFIG.minImprovementThreshold * 100}%)`);
      return true;
    }

    return false;
  }

  /**
   * Save iteration result
   *
   * @param {Object} iteration - Iteration result
   */
  async saveIteration(iteration) {
    const iterationPath = path.join(this.reviewDir, `iteration-${iteration.number}.json`);

    fs.mkdirSync(path.dirname(iterationPath), { recursive: true });
    fs.writeFileSync(iterationPath, JSON.stringify(iteration, null, 2));

    console.log(`\n   💾 Iteration ${iteration.number} saved: ${iterationPath}`);
  }

  /**
   * Create success result
   *
   * @param {Object} reviewResults - Final review results
   * @returns {Object}
   */
  createSuccessResult(reviewResults) {
    return {
      status: 'success',
      iterations: this.iterationHistory.length,
      finalReviewResults: reviewResults,
      message: 'All blocking issues resolved'
    };
  }

  /**
   * Create divergence result
   *
   * @returns {Object}
   */
  createDivergenceResult() {
    return {
      status: 'diverged',
      iterations: this.iterationHistory.length,
      message: 'Review loop diverging. Manual review required.',
      history: this.iterationHistory
    };
  }

  /**
   * Create max iterations result
   *
   * @param {Object} reviewResults - Current review results
   * @returns {Object}
   */
  createMaxIterationsResult(reviewResults) {
    return {
      status: 'max_iterations',
      iterations: this.iterationHistory.length,
      finalReviewResults: reviewResults,
      message: `Max iterations (${CONFIG.maxIterations}) reached. Manual review required.`,
      history: this.iterationHistory
    };
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: review-loop-orchestrator.js <project-root> <jira-key>');
    console.error('');
    console.error('Example:');
    console.error('  review-loop-orchestrator.js /path/to/project PROJ-123');
    process.exit(1);
  }

  const [projectRoot, jiraKey] = args;

  const orchestrator = new ReviewLoopOrchestrator(projectRoot, jiraKey);
  const result = await orchestrator.orchestrate();

  console.log('\n' + '='.repeat(60));
  console.log('📊 Review Loop Orchestration Complete');
  console.log('='.repeat(60));
  console.log(`Status: ${result.status}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Message: ${result.message}`);
  console.log('='.repeat(60) + '\n');

  // Exit code based on status
  const exitCode = result.status === 'success' ? 0 : 1;
  process.exit(exitCode);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  ReviewLoopOrchestrator,
  CONFIG
};
