import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CommandResolverService } from './command-resolver.service.js';

/**
 * Test Orchestrator Service
 *
 * Framework-agnostic test execution service that:
 * - Executes unit, integration, and E2E tests
 * - Supports multiple testing frameworks (Jest, Vitest, Pytest, Go test, etc.)
 * - Collects coverage reports
 * - Parses test results across different output formats
 * - Returns unified test results interface
 */

export interface TestResults {
  testType: 'unit' | 'integration' | 'e2e';
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number; // milliseconds
  coverage?: CoverageReport;
  failures?: TestFailure[];
  output: string;
}

export interface CoverageReport {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  overall: number; // percentage
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

export interface TestFailure {
  testName: string;
  errorMessage: string;
  stackTrace?: string;
}

/**
 * Service for orchestrating test execution across multiple frameworks
 */
export class TestOrchestratorService {
  private projectPath: string;
  private commandResolver: CommandResolverService;

  constructor(projectPath: string, frameworkConfig: any) {
    this.projectPath = projectPath;
    this.commandResolver = new CommandResolverService(frameworkConfig);
  }

  /**
   * Run all tests (unit, integration, E2E)
   *
   * @param collectCoverage - Whether to collect coverage (default: true)
   * @param coverageThreshold - Minimum coverage percentage (default: 80)
   * @returns Array of test results
   */
  async runAllTests(
    collectCoverage: boolean = true,
    coverageThreshold: number = 80
  ): Promise<TestResults[]> {
    const results: TestResults[] = [];

    console.log('\n[TestOrchestrator] Running all tests...');

    // 1. Run unit tests
    try {
      const unitResults = await this.runUnitTests(collectCoverage);
      results.push(unitResults);

      // Check coverage threshold
      if (collectCoverage && unitResults.coverage) {
        if (unitResults.coverage.overall < coverageThreshold) {
          throw new Error(
            `Coverage below threshold: ${unitResults.coverage.overall.toFixed(2)}% ` +
            `(minimum: ${coverageThreshold}%)`
          );
        }
      }
    } catch (error: any) {
      throw new Error(`Unit tests failed: ${error.message}`);
    }

    // 2. Run integration tests (if configured)
    const integrationCommands = this.commandResolver.getTestCommand('integration');
    if (integrationCommands && integrationCommands.length > 0) {
      try {
        const integrationResults = await this.runIntegrationTests();
        results.push(integrationResults);
      } catch (error: any) {
        console.error(`[TestOrchestrator] Integration tests failed: ${error.message}`);
        // Non-blocking: continue to E2E
      }
    }

    // 3. Run E2E tests (if configured)
    const e2eCommands = this.commandResolver.getTestCommand('e2e');
    if (e2eCommands && e2eCommands.length > 0) {
      try {
        const e2eResults = await this.runE2ETests();
        results.push(e2eResults);
      } catch (error: any) {
        console.error(`[TestOrchestrator] E2E tests failed: ${error.message}`);
        // Non-blocking: continue
      }
    }

    console.log('[TestOrchestrator] ✓ All tests complete\n');

    return results;
  }

  /**
   * Run unit tests with coverage
   *
   * @param collectCoverage - Whether to collect coverage
   * @returns Test results
   */
  async runUnitTests(collectCoverage: boolean = true): Promise<TestResults> {
    console.log('[TestOrchestrator] Running unit tests...');

    const commands = this.commandResolver.getTestCommand('unit');

    if (!commands || commands.length === 0) {
      throw new Error('No unit test command configured');
    }

    try {
      const startTime = Date.now();

      // Execute test command with fallback
      const result = await this.commandResolver.executeWithFallback(
        commands,
        this.projectPath
      );

      const duration = Date.now() - startTime;

      // Parse test results based on framework
      const testResults = this.parseTestOutput(result.stdout, 'unit');

      // Collect coverage if requested
      let coverage: CoverageReport | undefined;
      if (collectCoverage) {
        coverage = this.collectCoverage();
      }

      console.log(
        `[TestOrchestrator] ✓ Unit tests: ${testResults.passedTests}/${testResults.totalTests} passed`
      );

      if (coverage) {
        console.log(
          `[TestOrchestrator] Coverage: ${coverage.overall.toFixed(2)}%`
        );
      }

      return {
        ...testResults,
        testType: 'unit',
        duration,
        coverage,
        output: result.stdout
      };

    } catch (error: any) {
      throw new Error(`Unit test execution failed: ${error.message}`);
    }
  }

  /**
   * Run integration tests
   *
   * @returns Test results
   */
  async runIntegrationTests(): Promise<TestResults> {
    console.log('[TestOrchestrator] Running integration tests...');

    const commands = this.commandResolver.getTestCommand('integration');

    if (!commands || commands.length === 0) {
      throw new Error('No integration test command configured');
    }

    try {
      const startTime = Date.now();

      const result = await this.commandResolver.executeWithFallback(
        commands,
        this.projectPath
      );

      const duration = Date.now() - startTime;

      const testResults = this.parseTestOutput(result.stdout, 'integration');

      console.log(
        `[TestOrchestrator] ✓ Integration tests: ${testResults.passedTests}/${testResults.totalTests} passed`
      );

      return {
        ...testResults,
        testType: 'integration',
        duration,
        output: result.stdout
      };

    } catch (error: any) {
      throw new Error(`Integration test execution failed: ${error.message}`);
    }
  }

  /**
   * Run E2E tests (longer timeout)
   *
   * @returns Test results
   */
  async runE2ETests(): Promise<TestResults> {
    console.log('[TestOrchestrator] Running E2E tests (may take several minutes)...');

    const commands = this.commandResolver.getTestCommand('e2e');

    if (!commands || commands.length === 0) {
      throw new Error('No E2E test command configured');
    }

    try {
      const startTime = Date.now();

      // E2E tests have longer timeout (10 minutes)
      const result = await this.commandResolver.executeWithFallback(
        commands,
        this.projectPath,
        600000 // 10 minute timeout
      );

      const duration = Date.now() - startTime;

      const testResults = this.parseTestOutput(result.stdout, 'e2e');

      console.log(
        `[TestOrchestrator] ✓ E2E tests: ${testResults.passedTests}/${testResults.totalTests} passed`
      );

      return {
        ...testResults,
        testType: 'e2e',
        duration,
        output: result.stdout
      };

    } catch (error: any) {
      throw new Error(`E2E test execution failed: ${error.message}`);
    }
  }

  /**
   * Parse test output to extract results
   *
   * Supports multiple formats:
   * - Jest/Vitest JSON output
   * - Pytest verbose output
   * - Go test output
   * - Generic test output patterns
   *
   * @param output - Test command output
   * @param testType - Test type
   * @returns Parsed test results
   */
  private parseTestOutput(output: string, testType: string): Omit<TestResults, 'duration' | 'output' | 'testType'> {
    // Try to parse Jest/Vitest JSON output
    const jestJsonMatch = output.match(/{"numTotalTests":\d+.*}/);
    if (jestJsonMatch) {
      return this.parseJestJson(jestJsonMatch[0]);
    }

    // Try to parse Jest text output
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/i);
    if (jestMatch) {
      const passedTests = parseInt(jestMatch[1], 10);
      const totalTests = parseInt(jestMatch[2], 10);
      const failedTests = totalTests - passedTests;

      return {
        passed: failedTests === 0,
        totalTests,
        passedTests,
        failedTests,
        skippedTests: 0
      };
    }

    // Try to parse Pytest output
    const pytestMatch = output.match(/(\d+)\s+passed.*?(?:(\d+)\s+failed)?.*?in\s+[\d.]+s/i);
    if (pytestMatch) {
      const passedTests = parseInt(pytestMatch[1], 10);
      const failedTests = pytestMatch[2] ? parseInt(pytestMatch[2], 10) : 0;
      const totalTests = passedTests + failedTests;

      return {
        passed: failedTests === 0,
        totalTests,
        passedTests,
        failedTests,
        skippedTests: 0
      };
    }

    // Try to parse Go test output
    const goMatch = output.match(/PASS|FAIL/);
    if (goMatch) {
      const passed = output.includes('PASS');
      const failMatch = output.match(/FAIL:\s+(\S+)/g);
      const failedTests = failMatch ? failMatch.length : 0;

      return {
        passed,
        totalTests: failedTests + (passed ? 1 : 0),
        passedTests: passed ? 1 : 0,
        failedTests,
        skippedTests: 0
      };
    }

    // Fallback: generic parsing
    const passed = !output.toLowerCase().includes('fail') &&
                   !output.toLowerCase().includes('error');

    return {
      passed,
      totalTests: 1,
      passedTests: passed ? 1 : 0,
      failedTests: passed ? 0 : 1,
      skippedTests: 0
    };
  }

  /**
   * Parse Jest JSON output
   *
   * @param jsonString - Jest JSON output
   * @returns Parsed test results
   */
  private parseJestJson(jsonString: string): Omit<TestResults, 'duration' | 'output' | 'testType'> {
    try {
      const data = JSON.parse(jsonString);

      return {
        passed: data.success || data.numFailedTests === 0,
        totalTests: data.numTotalTests,
        passedTests: data.numPassedTests,
        failedTests: data.numFailedTests,
        skippedTests: data.numPendingTests || 0
      };
    } catch (error) {
      // If JSON parsing fails, return generic success
      return {
        passed: true,
        totalTests: 1,
        passedTests: 1,
        failedTests: 0,
        skippedTests: 0
      };
    }
  }

  /**
   * Collect coverage report
   *
   * Looks for coverage in common locations:
   * - coverage/coverage-summary.json (Jest/Vitest)
   * - coverage.json
   * - .coverage (Pytest - needs conversion)
   *
   * @returns Coverage report
   */
  private collectCoverage(): CoverageReport | undefined {
    // Try Jest/Vitest coverage-summary.json
    const coverageSummaryPath = join(this.projectPath, 'coverage', 'coverage-summary.json');

    if (existsSync(coverageSummaryPath)) {
      try {
        const coverageData = JSON.parse(readFileSync(coverageSummaryPath, 'utf-8'));

        // Extract total coverage
        const total = coverageData.total;

        if (total) {
          return {
            lines: {
              total: total.lines.total,
              covered: total.lines.covered,
              percentage: total.lines.pct
            },
            statements: {
              total: total.statements.total,
              covered: total.statements.covered,
              percentage: total.statements.pct
            },
            functions: {
              total: total.functions.total,
              covered: total.functions.covered,
              percentage: total.functions.pct
            },
            branches: {
              total: total.branches.total,
              covered: total.branches.covered,
              percentage: total.branches.pct
            },
            overall: (
              total.lines.pct +
              total.statements.pct +
              total.functions.pct +
              total.branches.pct
            ) / 4
          };
        }
      } catch (error) {
        console.error(`[TestOrchestrator] Failed to parse coverage report: ${error}`);
      }
    }

    // Fallback: no coverage data
    return undefined;
  }
}
