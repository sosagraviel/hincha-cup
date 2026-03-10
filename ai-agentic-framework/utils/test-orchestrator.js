/**
 * Test Orchestrator Utility
 *
 * Stack-agnostic test execution orchestrator.
 * Executes unit, integration, and E2E tests across different frameworks and languages.
 *
 * Usage:
 *   const orchestrator = new TestOrchestrator('/path/to/project');
 *   const results = await orchestrator.runAll();
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { TestFrameworkDetector } = require('./test-framework-detection');
const fs = require('fs').promises;
const { existsSync } = require('fs');

const execAsync = promisify(exec);

class TestOrchestrator {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      timeout: options.timeout || 600000, // 10 minutes default
      collectCoverage: options.collectCoverage !== false,
      onlyNew: options.onlyNew || false, // Only run tests marked with @new
      ...options
    };
    this.detector = new TestFrameworkDetector(projectRoot);
    this.results = {
      unit: [],
      integration: [],
      e2e: []
    };
  }

  /**
   * Run all detected tests
   * @returns {Promise<Object>} Test results
   */
  async runAll() {
    console.log('[TestOrchestrator] Detecting test frameworks...');
    const frameworks = await this.detector.detectAll();

    console.log('[TestOrchestrator] Running unit tests...');
    this.results.unit = await this.runUnitTests(frameworks.unit);

    console.log('[TestOrchestrator] Running integration tests...');
    this.results.integration = await this.runIntegrationTests(frameworks.integration);

    console.log('[TestOrchestrator] Running E2E tests...');
    this.results.e2e = await this.runE2ETests(frameworks.e2e);

    return this.results;
  }

  /**
   * Run unit tests
   * @param {Array} frameworks - Detected unit test frameworks
   * @returns {Promise<Array>} Unit test results
   */
  async runUnitTests(frameworks) {
    if (frameworks.length === 0) {
      console.log('[TestOrchestrator] No unit test frameworks detected');
      return [];
    }

    const results = [];

    for (const framework of frameworks) {
      console.log(`[TestOrchestrator] Running ${framework.name} (${framework.language})...`);

      try {
        const result = await this.executeTest(framework, 'unit');
        results.push(result);
      } catch (error) {
        console.error(`[TestOrchestrator] Error running ${framework.name}:`, error.message);
        results.push({
          framework: framework.name,
          language: framework.language,
          type: 'unit',
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Run integration tests
   * @param {Array} frameworks - Detected integration test frameworks
   * @returns {Promise<Array>} Integration test results
   */
  async runIntegrationTests(frameworks) {
    if (frameworks.length === 0) {
      console.log('[TestOrchestrator] No integration test frameworks detected');
      return [];
    }

    const results = [];

    for (const framework of frameworks) {
      console.log(`[TestOrchestrator] Running ${framework.name} integration tests...`);

      try {
        const result = await this.executeTest(framework, 'integration');
        results.push(result);
      } catch (error) {
        console.error(`[TestOrchestrator] Error running ${framework.name}:`, error.message);
        results.push({
          framework: framework.name,
          language: framework.language,
          type: 'integration',
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Run E2E tests
   * @param {Array} frameworks - Detected E2E test frameworks
   * @returns {Promise<Array>} E2E test results
   */
  async runE2ETests(frameworks) {
    if (frameworks.length === 0) {
      console.log('[TestOrchestrator] No E2E test frameworks detected');
      return [];
    }

    const results = [];

    for (const framework of frameworks) {
      console.log(`[TestOrchestrator] Running ${framework.name} E2E tests...`);

      try {
        const result = await this.executeTest(framework, 'e2e');
        results.push(result);
      } catch (error) {
        console.error(`[TestOrchestrator] Error running ${framework.name}:`, error.message);
        results.push({
          framework: framework.name,
          language: framework.language,
          type: 'e2e',
          status: 'error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Execute test command for a framework
   * @param {Object} framework - Framework configuration
   * @param {string} type - Test type (unit, integration, e2e)
   * @returns {Promise<Object>} Test result
   */
  async executeTest(framework, type) {
    const startTime = Date.now();

    // Build command
    let command = this.options.collectCoverage && framework.coverageCommand
      ? framework.coverageCommand
      : framework.runCommand;

    // For Jest/Vitest, add filter for @new tests if onlyNew is true
    if (this.options.onlyNew && ['jest', 'vitest'].includes(framework.name)) {
      command += ' --testNamePattern="@new"';
    }

    console.log(`[TestOrchestrator] Executing: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
        timeout: this.options.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const duration = Date.now() - startTime;

      // Parse output based on framework
      const parsed = this.parseTestOutput(framework.name, stdout, stderr);

      return {
        framework: framework.name,
        language: framework.language,
        type,
        status: parsed.failed === 0 ? 'passed' : 'failed',
        duration,
        total: parsed.total,
        passed: parsed.passed,
        failed: parsed.failed,
        skipped: parsed.skipped,
        coverage: parsed.coverage,
        stdout,
        stderr
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Test failure returns non-zero exit code
      const parsed = this.parseTestOutput(framework.name, error.stdout || '', error.stderr || '');

      return {
        framework: framework.name,
        language: framework.language,
        type,
        status: 'failed',
        duration,
        total: parsed.total,
        passed: parsed.passed,
        failed: parsed.failed,
        skipped: parsed.skipped,
        coverage: parsed.coverage,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        error: error.message
      };
    }
  }

  /**
   * Parse test output based on framework
   * @param {string} frameworkName - Name of test framework
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @returns {Object} Parsed test results
   */
  parseTestOutput(frameworkName, stdout, stderr) {
    const output = stdout + stderr;

    switch (frameworkName) {
      case 'jest':
      case 'vitest':
        return this.parseJestVitestOutput(output);
      case 'pytest':
        return this.parsePytestOutput(output);
      case 'go-test':
        return this.parseGoTestOutput(output);
      case 'junit':
        return this.parseJUnitOutput(output);
      case 'cargo-test':
        return this.parseCargoTestOutput(output);
      case 'rspec':
        return this.parseRSpecOutput(output);
      case 'playwright':
        return this.parsePlaywrightOutput(output);
      case 'cypress':
        return this.parseCypressOutput(output);
      default:
        return this.parseGenericOutput(output);
    }
  }

  /**
   * Parse Jest/Vitest output
   */
  parseJestVitestOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse test counts
    const testsMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (testsMatch) {
      result.failed = parseInt(testsMatch[1]);
      result.passed = parseInt(testsMatch[2]);
      result.total = parseInt(testsMatch[3]);
    } else {
      const passedMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (passedMatch) {
        result.passed = parseInt(passedMatch[1]);
        result.total = parseInt(passedMatch[2]);
      }
    }

    // Parse coverage
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|/);
    if (coverageMatch) {
      result.coverage = parseFloat(coverageMatch[1]);
    }

    return result;
  }

  /**
   * Parse Pytest output
   */
  parsePytestOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse test counts: "5 passed, 2 failed, 1 skipped"
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);

    if (passedMatch) result.passed = parseInt(passedMatch[1]);
    if (failedMatch) result.failed = parseInt(failedMatch[1]);
    if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);

    result.total = result.passed + result.failed + result.skipped;

    // Parse coverage
    const coverageMatch = output.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);
    if (coverageMatch) {
      result.coverage = parseInt(coverageMatch[1]);
    }

    return result;
  }

  /**
   * Parse Go test output
   */
  parseGoTestOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Count PASS and FAIL lines
    const passMatches = output.match(/^PASS/gm);
    const failMatches = output.match(/^FAIL/gm);

    result.passed = passMatches ? passMatches.length : 0;
    result.failed = failMatches ? failMatches.length : 0;
    result.total = result.passed + result.failed;

    // Parse coverage
    const coverageMatch = output.match(/coverage:\s+([\d.]+)%/);
    if (coverageMatch) {
      result.coverage = parseFloat(coverageMatch[1]);
    }

    return result;
  }

  /**
   * Parse JUnit output
   */
  parseJUnitOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse Maven/Gradle output
    const testsMatch = output.match(/Tests run:\s+(\d+),\s+Failures:\s+(\d+),\s+Errors:\s+(\d+),\s+Skipped:\s+(\d+)/);
    if (testsMatch) {
      result.total = parseInt(testsMatch[1]);
      result.failed = parseInt(testsMatch[2]) + parseInt(testsMatch[3]);
      result.skipped = parseInt(testsMatch[4]);
      result.passed = result.total - result.failed - result.skipped;
    }

    return result;
  }

  /**
   * Parse Cargo test output
   */
  parseCargoTestOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse "test result: ok. 5 passed; 0 failed; 0 ignored"
    const resultMatch = output.match(/test result:.*?(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/);
    if (resultMatch) {
      result.passed = parseInt(resultMatch[1]);
      result.failed = parseInt(resultMatch[2]);
      result.skipped = parseInt(resultMatch[3]);
      result.total = result.passed + result.failed + result.skipped;
    }

    return result;
  }

  /**
   * Parse RSpec output
   */
  parseRSpecOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse "5 examples, 2 failures, 1 pending"
    const examplesMatch = output.match(/(\d+)\s+examples?/);
    const failuresMatch = output.match(/(\d+)\s+failures?/);
    const pendingMatch = output.match(/(\d+)\s+pending/);

    if (examplesMatch) result.total = parseInt(examplesMatch[1]);
    if (failuresMatch) result.failed = parseInt(failuresMatch[1]);
    if (pendingMatch) result.skipped = parseInt(pendingMatch[1]);

    result.passed = result.total - result.failed - result.skipped;

    return result;
  }

  /**
   * Parse Playwright output
   */
  parsePlaywrightOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse "5 passed (10s)"
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);

    if (passedMatch) result.passed = parseInt(passedMatch[1]);
    if (failedMatch) result.failed = parseInt(failedMatch[1]);
    if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);

    result.total = result.passed + result.failed + result.skipped;

    return result;
  }

  /**
   * Parse Cypress output
   */
  parseCypressOutput(output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // Parse "Passing: 5  Failing: 2  Pending: 1"
    const passingMatch = output.match(/Passing:\s+(\d+)/);
    const failingMatch = output.match(/Failing:\s+(\d+)/);
    const pendingMatch = output.match(/Pending:\s+(\d+)/);

    if (passingMatch) result.passed = parseInt(passingMatch[1]);
    if (failingMatch) result.failed = parseInt(failingMatch[1]);
    if (pendingMatch) result.skipped = parseInt(pendingMatch[1]);

    result.total = result.passed + result.failed + result.skipped;

    return result;
  }

  /**
   * Parse generic test output
   */
  parseGenericOutput(output) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };
  }

  /**
   * Get summary of all test results
   * @returns {Object} Summary
   */
  getSummary() {
    const summary = {
      unit: this.summarizeResults(this.results.unit),
      integration: this.summarizeResults(this.results.integration),
      e2e: this.summarizeResults(this.results.e2e)
    };

    summary.overall = {
      total: summary.unit.total + summary.integration.total + summary.e2e.total,
      passed: summary.unit.passed + summary.integration.passed + summary.e2e.passed,
      failed: summary.unit.failed + summary.integration.failed + summary.e2e.failed,
      skipped: summary.unit.skipped + summary.integration.skipped + summary.e2e.skipped,
      status: summary.unit.status === 'passed' && summary.integration.status === 'passed' && summary.e2e.status === 'passed'
        ? 'passed'
        : 'failed'
    };

    return summary;
  }

  /**
   * Summarize results for a test type
   * @param {Array} results - Test results
   * @returns {Object} Summary
   */
  summarizeResults(results) {
    const summary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      frameworks: results.length,
      status: results.every(r => r.status === 'passed') ? 'passed' : 'failed'
    };

    for (const result of results) {
      summary.total += result.total || 0;
      summary.passed += result.passed || 0;
      summary.failed += result.failed || 0;
      summary.skipped += result.skipped || 0;
    }

    return summary;
  }
}

module.exports = { TestOrchestrator };
