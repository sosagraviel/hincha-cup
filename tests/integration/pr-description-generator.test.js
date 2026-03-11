#!/usr/bin/env node

/**
 * Integration Tests - pr-description-generator.js
 *
 * Tests the PR description generation utility that creates comprehensive
 * GitHub Pull Request descriptions from Phase 0-7 artifacts.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test fixture paths
const TEMP_TEST_DIR = path.join(__dirname, 'tmp', 'pr-description-generator-test');

/**
 * Test Suite Configuration
 */
const TEST_CASES = [
  {
    name: 'Complete Artifacts - All Phases',
    artifacts: {
      context: true,
      plan: true,
      implementationLog: true,
      testResults: true,
      visualReport: true,
      securityResults: true,
      decisions: true,
      screenshots: 5,
      videos: 2
    },
    expectedSections: [
      'Summary',
      'Visual Changes',
      'Test Results',
      'Security',
      'Implementation Details',
      'Files Changed',
      'Autonomous Decisions',
      'Artifacts'
    ],
    description: 'Complete artifacts should generate full PR description'
  },
  {
    name: 'Minimal Artifacts - Basic Implementation',
    artifacts: {
      context: true,
      plan: true,
      implementationLog: true,
      testResults: false,
      visualReport: false,
      securityResults: false,
      decisions: false,
      screenshots: 0,
      videos: 0
    },
    expectedSections: [
      'Summary',
      'Implementation Details',
      'Files Changed'
    ],
    description: 'Minimal artifacts should generate basic PR description'
  },
  {
    name: 'With Test Failures',
    artifacts: {
      context: true,
      plan: true,
      implementationLog: true,
      testResults: {
        overall: { status: 'failed' },
        unit: { passed: 8, total: 10, coverage: 85 },
        integration: { passed: 2, total: 5 },
        e2e: { passed: 0, total: 3 }
      },
      visualReport: false,
      securityResults: false,
      decisions: false,
      screenshots: 0,
      videos: 0
    },
    expectedSections: [
      'Test Results'
    ],
    expectedContent: {
      testStatus: '❌',
      testSummary: 'failed'
    },
    description: 'Failed tests should show failure indicators'
  },
  {
    name: 'With Security Issues',
    artifacts: {
      context: true,
      plan: true,
      implementationLog: true,
      testResults: { overall: { status: 'passed' } },
      visualReport: false,
      securityResults: {
        overallStatus: 'FAIL',
        findings: {
          blocking: [
            {
              id: 'SEC-001',
              issue: 'SQL injection vulnerability',
              file: 'src/user.repository.ts',
              line: 45
            }
          ]
        },
        metrics: {
          blockingCount: 1,
          majorCount: 2,
          minorCount: 3
        }
      },
      decisions: false,
      screenshots: 0,
      videos: 0
    },
    expectedSections: [
      'Security'
    ],
    expectedContent: {
      securityStatus: 'blocking security issues found',
      blockingCount: 1
    },
    description: 'Security issues should be prominently displayed'
  },
  {
    name: 'With Visual Changes',
    artifacts: {
      context: true,
      plan: true,
      implementationLog: true,
      testResults: { overall: { status: 'passed' } },
      visualReport: {
        overallStatus: 'fail',
        overallScore: 92.5,
        diffs: [
          { page: 'Homepage', viewport: 'desktop', diffPercentage: 5.2 },
          { page: 'Login', viewport: 'mobile', diffPercentage: 2.8 }
        ]
      },
      securityResults: { overallStatus: 'PASS' },
      decisions: false,
      screenshots: 12,
      videos: 0
    },
    expectedSections: [
      'Visual Changes'
    ],
    expectedContent: {
      visualScore: '92.5%',
      visualChanges: 'detected'
    },
    description: 'Visual changes should include diff report'
  }
];

/**
 * Setup test environment
 */
function setupTestEnvironment() {
  console.log('🔧 Setting up test environment...');

  // Create temp directory
  if (fs.existsSync(TEMP_TEST_DIR)) {
    fs.rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_TEST_DIR, { recursive: true });

  console.log('✅ Test environment ready');
  return TEMP_TEST_DIR;
}

/**
 * Create artifact files for test case
 */
function createArtifacts(projectDir, jiraKey, artifacts) {
  const artifactsDir = path.join(projectDir, '.claude', 'artifacts', jiraKey);

  // Context
  if (artifacts.context) {
    const contextDir = path.join(artifactsDir, 'context');
    fs.mkdirSync(contextDir, { recursive: true });
    fs.writeFileSync(
      path.join(contextDir, 'full-context.md'),
      `# PROJ-123: Add user authentication\n\nImplement JWT-based authentication for the application.`
    );
  }

  // Plan
  if (artifacts.plan) {
    const plansDir = path.join(artifactsDir, 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(
      path.join(plansDir, 'implementation-plan.md'),
      `# Implementation Plan\n\n## Summary\n\nAdding JWT authentication with refresh tokens and role-based access control.\n\n## Steps\n1. Create auth module\n2. Implement JWT strategy\n3. Add guards and decorators`
    );
  }

  // Implementation Log
  if (artifacts.implementationLog) {
    const implDir = path.join(artifactsDir, 'implementations');
    fs.mkdirSync(implDir, { recursive: true });
    fs.writeFileSync(
      path.join(implDir, 'implementation-log.md'),
      `# Implementation Log\n\nCreated: \`src/auth/auth.module.ts\`\nUpdated: \`src/app.module.ts\`\nCreated: \`src/auth/guards/jwt.guard.ts\``
    );
  }

  // Test Results
  if (artifacts.testResults) {
    const testsDir = path.join(artifactsDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    const testResults = typeof artifacts.testResults === 'object'
      ? artifacts.testResults
      : {
          overall: { status: 'passed' },
          unit: { passed: 10, total: 10, coverage: 95 },
          integration: { passed: 5, total: 5 },
          e2e: { passed: 3, total: 3 }
        };

    fs.writeFileSync(
      path.join(testsDir, 'test-results.json'),
      JSON.stringify(testResults, null, 2)
    );
  }

  // Visual Report
  if (artifacts.visualReport) {
    const screenshotsDir = path.join(artifactsDir, 'screenshots', 'diffs');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const visualReport = typeof artifacts.visualReport === 'object'
      ? artifacts.visualReport
      : {
          overallStatus: 'pass',
          overallScore: 100,
          diffs: []
        };

    fs.writeFileSync(
      path.join(screenshotsDir, 'visual-diff-report.json'),
      JSON.stringify(visualReport, null, 2)
    );
  }

  // Security Results
  if (artifacts.securityResults) {
    const securityDir = path.join(artifactsDir, 'security');
    fs.mkdirSync(securityDir, { recursive: true });

    const securityResults = typeof artifacts.securityResults === 'object'
      ? artifacts.securityResults
      : {
          overallStatus: 'PASS',
          findings: { blocking: [], major: [], minor: [] },
          metrics: { blockingCount: 0, majorCount: 0, minorCount: 0 }
        };

    fs.writeFileSync(
      path.join(securityDir, 'security-results.json'),
      JSON.stringify(securityResults, null, 2)
    );
  }

  // Decisions
  if (artifacts.decisions) {
    const decisionsDir = path.join(artifactsDir, 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(decisionsDir, `${jiraKey}.md`),
      `## Decision: Use JWT over sessions\n\nChose JWT for stateless authentication and better scalability.\n\n## Decision: Implement refresh tokens\n\nAdded refresh token rotation for enhanced security.`
    );
  }

  // Screenshots
  if (artifacts.screenshots > 0) {
    const screenshotsDir = path.join(artifactsDir, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });
    for (let i = 0; i < artifacts.screenshots; i++) {
      fs.writeFileSync(path.join(screenshotsDir, `screenshot-${i}.png`), 'mock-image-data');
    }
  }

  // Videos
  if (artifacts.videos > 0) {
    const videosDir = path.join(artifactsDir, 'videos');
    fs.mkdirSync(videosDir, { recursive: true });
    for (let i = 0; i < artifacts.videos; i++) {
      fs.writeFileSync(path.join(videosDir, `recording-${i}.webm`), 'mock-video-data');
    }
  }
}

/**
 * Run pr-description-generator
 */
function runPRDescriptionGenerator(projectDir, jiraKey) {
  const utilPath = path.join(__dirname, '..', '..', 'utils', 'pr-description-generator.js');

  try {
    execSync(
      `node "${utilPath}" "${projectDir}" "${jiraKey}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' }
    );

    // Read generated PR description
    const outputPath = path.join(projectDir, '.claude', 'artifacts', jiraKey, 'pr-description.md');
    if (fs.existsSync(outputPath)) {
      return fs.readFileSync(outputPath, 'utf8');
    }

    return null;
  } catch (error) {
    console.error('❌ Error running pr-description-generator:', error.message);
    return null;
  }
}

/**
 * Validate test result
 */
function validateTestResult(testCase, description) {
  const errors = [];

  if (!description) {
    errors.push('No description generated');
    return errors;
  }

  // Check expected sections
  for (const section of testCase.expectedSections) {
    const regex = new RegExp(`###.*${section}`, 'i');
    if (!regex.test(description)) {
      errors.push(`Expected section "${section}" not found in description`);
    }
  }

  // Check expected content
  if (testCase.expectedContent) {
    for (const [key, value] of Object.entries(testCase.expectedContent)) {
      if (!description.includes(value)) {
        errors.push(`Expected content "${key}: ${value}" not found in description`);
      }
    }
  }

  // Check footer
  if (!description.includes('Generated with [Claude Code]')) {
    errors.push('Missing Claude Code footer');
  }

  if (!description.includes('Co-Authored-By: Claude Sonnet 4.5')) {
    errors.push('Missing Co-Authored-By footer');
  }

  return errors;
}

/**
 * Run single test case
 */
function runTestCase(testCase, testDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test: ${testCase.name}`);
  console.log(`   ${testCase.description}`);
  console.log(`${'='.repeat(60)}`);

  const jiraKey = 'PROJ-123';
  const projectDir = path.join(testDir, `test-${testCase.name.replace(/\s+/g, '-')}`);

  // Create artifacts
  createArtifacts(projectDir, jiraKey, testCase.artifacts);

  // Run generator
  const description = runPRDescriptionGenerator(projectDir, jiraKey);

  // Validate
  const errors = validateTestResult(testCase, description);

  if (errors.length === 0) {
    console.log('✅ PASSED');
    return { passed: true, errors: [] };
  } else {
    console.log('❌ FAILED');
    errors.forEach(err => console.log(`   - ${err}`));
    return { passed: false, errors };
  }
}

/**
 * Cleanup test environment
 */
function cleanup() {
  console.log('\n🧹 Cleaning up test environment...');
  if (fs.existsSync(TEMP_TEST_DIR)) {
    fs.rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  }
  console.log('✅ Cleanup complete');
}

/**
 * Main test runner
 */
function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Integration Tests: pr-description-generator.js            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let testDir;
  const results = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    errors: []
  };

  try {
    // Setup
    testDir = setupTestEnvironment();

    // Run all test cases
    for (const testCase of TEST_CASES) {
      const result = runTestCase(testCase, testDir);

      if (result.passed) {
        results.passed++;
      } else {
        results.failed++;
        results.errors.push({
          test: testCase.name,
          errors: result.errors
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    console.error(error.stack);
    results.failed++;
  } finally {
    // Cleanup
    if (testDir) {
      cleanup();
    }
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`Total Tests:  ${results.total}`);
  console.log(`Passed:       ${results.passed} ✅`);
  console.log(`Failed:       ${results.failed} ❌`);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.errors.forEach(({ test, errors }) => {
      console.log(`\n  ${test}:`);
      errors.forEach(err => console.log(`    - ${err}`));
    });
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests, TEST_CASES };
