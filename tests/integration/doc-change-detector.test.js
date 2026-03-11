#!/usr/bin/env node

/**
 * Integration Tests - doc-change-detector.js
 *
 * Tests the documentation change detection utility that determines when
 * CLAUDE.md or project-context needs updates based on code changes.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test fixture paths
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'doc-change-detector');
const TEMP_TEST_DIR = path.join(__dirname, 'tmp', 'doc-change-detector-test');

/**
 * Test Suite Configuration
 */
const TEST_CASES = [
  {
    name: 'Tech Stack Changes - package.json modified',
    changedFiles: ['package.json'],
    expectedClaudeMdUpdate: true,
    expectedProjectContextUpdate: false,
    expectedSections: ['techStack', 'commands'],
    description: 'Adding new dependency should trigger CLAUDE.md update'
  },
  {
    name: 'Architecture Changes - docker-compose.yml modified',
    changedFiles: ['docker-compose.yml'],
    expectedClaudeMdUpdate: true,
    expectedProjectContextUpdate: false,
    expectedSections: ['architecture', 'services'],
    description: 'Adding new service should trigger CLAUDE.md update'
  },
  {
    name: 'Middleware Changes - auth.middleware.ts added',
    changedFiles: ['src/middleware/auth.middleware.ts'],
    expectedClaudeMdUpdate: false,
    expectedProjectContextUpdate: true,
    expectedSections: ['requestLifecycle', 'authentication'],
    description: 'New middleware should trigger project-context update'
  },
  {
    name: 'Guard Changes - org-member.guard.ts modified',
    changedFiles: ['src/guards/org-member.guard.ts'],
    expectedClaudeMdUpdate: false,
    expectedProjectContextUpdate: true,
    expectedSections: ['requestLifecycle', 'authentication'],
    description: 'Modified guard should trigger project-context update'
  },
  {
    name: 'Real-time Changes - events.gateway.ts added',
    changedFiles: ['src/events/events.gateway.ts'],
    expectedClaudeMdUpdate: false,
    expectedProjectContextUpdate: true,
    expectedSections: ['realTime'],
    description: 'New gateway should trigger project-context update'
  },
  {
    name: 'Regular Feature - ticket.service.ts modified',
    changedFiles: ['src/modules/ticket/service/ticket.service.ts'],
    expectedClaudeMdUpdate: false,
    expectedProjectContextUpdate: false,
    expectedSections: [],
    description: 'Regular service change should NOT trigger any updates'
  },
  {
    name: 'Multiple Changes - Mixed',
    changedFiles: [
      'package.json',
      'src/middleware/logging.middleware.ts',
      'src/modules/user/service/user.service.ts'
    ],
    expectedClaudeMdUpdate: true,
    expectedProjectContextUpdate: true,
    expectedSections: ['techStack', 'requestLifecycle'],
    description: 'Multiple significant changes should trigger both updates'
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

  // Create mock project structure
  const projectDir = path.join(TEMP_TEST_DIR, 'test-project');
  fs.mkdirSync(projectDir, { recursive: true });

  // Create .claude directory
  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create mock CLAUDE.md
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');
  fs.writeFileSync(claudeMdPath, `# Test Project

## Tech Stack
- Node.js 20
- TypeScript 5
- NestJS 10

## Commands
- \`npm run dev\` - Start development server
- \`npm test\` - Run tests
`);

  // Create mock project-context/SKILL.md
  const projectContextDir = path.join(claudeDir, 'skills', 'project-context');
  fs.mkdirSync(projectContextDir, { recursive: true });
  const projectContextPath = path.join(projectContextDir, 'SKILL.md');
  fs.writeFileSync(projectContextPath, `# Project Context

## Request Lifecycle
1. Middleware
2. Guards
3. Controllers

## Authentication
- JWT-based authentication
`);

  // Create artifacts directory
  const artifactsDir = path.join(claudeDir, 'artifacts', 'TEST-123');
  fs.mkdirSync(artifactsDir, { recursive: true });

  // Initialize git repo
  try {
    execSync('git init', { cwd: projectDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: projectDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: projectDir, stdio: 'ignore' });
    execSync('git add -A', { cwd: projectDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: projectDir, stdio: 'ignore' });
  } catch (error) {
    console.warn('⚠️  Git initialization warning:', error.message);
  }

  console.log('✅ Test environment ready');
  return projectDir;
}

/**
 * Create changed files for test case
 */
function createChangedFiles(projectDir, changedFiles) {
  for (const file of changedFiles) {
    const filePath = path.join(projectDir, file);
    const fileDir = path.dirname(filePath);

    // Create directory if needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    // Create or modify file
    const content = `// Modified file: ${file}\n// Timestamp: ${new Date().toISOString()}\n`;
    fs.writeFileSync(filePath, content);
  }

  // Commit changes
  try {
    execSync('git add -A', { cwd: projectDir, stdio: 'ignore' });
    execSync('git commit -m "Test changes"', { cwd: projectDir, stdio: 'ignore' });
  } catch (error) {
    console.warn('⚠️  Git commit warning:', error.message);
  }
}

/**
 * Run doc-change-detector
 */
function runDocChangeDetector(projectDir, jiraKey) {
  const utilPath = path.join(__dirname, '..', '..', 'utils', 'doc-change-detector.js');

  try {
    const result = execSync(
      `node "${utilPath}" "${projectDir}" "${jiraKey}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse JSON output
    const outputPath = path.join(projectDir, '.claude', 'artifacts', jiraKey, 'doc-update-analysis.json');
    if (fs.existsSync(outputPath)) {
      return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    }

    return null;
  } catch (error) {
    console.error('❌ Error running doc-change-detector:', error.message);
    return null;
  }
}

/**
 * Validate test result
 */
function validateTestResult(testCase, result) {
  const errors = [];

  if (!result) {
    errors.push('No result returned from doc-change-detector');
    return errors;
  }

  // Check CLAUDE.md update needed
  if (result.claudeMd.updateNeeded !== testCase.expectedClaudeMdUpdate) {
    errors.push(
      `CLAUDE.md update mismatch: expected ${testCase.expectedClaudeMdUpdate}, got ${result.claudeMd.updateNeeded}`
    );
  }

  // Check project-context update needed
  if (result.projectContext.updateNeeded !== testCase.expectedProjectContextUpdate) {
    errors.push(
      `project-context update mismatch: expected ${testCase.expectedProjectContextUpdate}, got ${result.projectContext.updateNeeded}`
    );
  }

  // Check sections
  if (testCase.expectedSections.length > 0) {
    const allSections = [
      ...(result.claudeMd.sections || []),
      ...(result.projectContext.sections || [])
    ];

    for (const expectedSection of testCase.expectedSections) {
      if (!allSections.includes(expectedSection)) {
        errors.push(`Expected section "${expectedSection}" not found in results`);
      }
    }
  }

  // Check changed files recorded
  if (!result.changedFiles || result.changedFiles.length === 0) {
    errors.push('No changed files recorded in result');
  }

  return errors;
}

/**
 * Run single test case
 */
function runTestCase(testCase, projectDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test: ${testCase.name}`);
  console.log(`   ${testCase.description}`);
  console.log(`${'='.repeat(60)}`);

  // Create changed files
  createChangedFiles(projectDir, testCase.changedFiles);

  // Run detector
  const result = runDocChangeDetector(projectDir, 'TEST-123');

  // Validate
  const errors = validateTestResult(testCase, result);

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
  console.log('║  Integration Tests: doc-change-detector.js                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let projectDir;
  const results = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    errors: []
  };

  try {
    // Setup
    projectDir = setupTestEnvironment();

    // Run all test cases
    for (const testCase of TEST_CASES) {
      const result = runTestCase(testCase, projectDir);

      if (result.passed) {
        results.passed++;
      } else {
        results.failed++;
        results.errors.push({
          test: testCase.name,
          errors: result.errors
        });
      }

      // Reset git state for next test
      try {
        execSync('git reset --hard HEAD~1', { cwd: projectDir, stdio: 'ignore' });
      } catch (error) {
        // Ignore reset errors
      }
    }

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    console.error(error.stack);
    results.failed++;
  } finally {
    // Cleanup
    if (projectDir) {
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
