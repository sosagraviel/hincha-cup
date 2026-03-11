#!/usr/bin/env node

/**
 * Integration Tests - agent-generation.js V2
 *
 * Tests the V2 agent generation utility that now includes visual-verifier
 * and doc-updater agents for the enhanced 10-phase workflow.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test fixture paths
const TEMP_TEST_DIR = path.join(__dirname, 'tmp', 'agent-generation-v2-test');

/**
 * Test Suite Configuration
 */
const TEST_CASES = [
  {
    name: 'Full-Stack Project - All Agents',
    stackProfile: {
      primary_language: 'typescript',
      backend_frameworks: [{ name: 'nestjs', version: '10.0.0' }],
      frontend_frameworks: [{ name: 'react', version: '18.0.0' }],
      package_manager: 'pnpm'
    },
    expectedAgents: {
      planning: ['planner'],
      implementation: ['implementer-typescript'],
      testing: ['tester-unit-typescript', 'tester-e2e-typescript'],
      review: ['security-reviewer-typescript'],
      verification: ['visual-verifier'],
      documentation: ['doc-updater']
    },
    expectedTotal: 7,
    description: 'Full-stack project should generate all agent types including new V2 agents'
  },
  {
    name: 'Backend-Only Project - No Visual Verifier',
    stackProfile: {
      primary_language: 'python',
      backend_frameworks: [{ name: 'fastapi', version: '0.100.0' }],
      frontend_frameworks: [],
      package_manager: 'pip'
    },
    expectedAgents: {
      planning: ['planner'],
      implementation: ['implementer-python'],
      testing: ['tester-unit-python'],
      review: ['security-reviewer-python'],
      verification: [],  // No visual verifier for backend-only
      documentation: ['doc-updater']
    },
    expectedTotal: 5,
    description: 'Backend-only project should skip visual-verifier agent'
  },
  {
    name: 'Frontend-Only Project - All Frontend Agents',
    stackProfile: {
      primary_language: 'typescript',
      backend_frameworks: [],
      frontend_frameworks: [{ name: 'vue', version: '3.0.0' }],
      package_manager: 'npm'
    },
    expectedAgents: {
      planning: ['planner'],
      implementation: ['implementer-typescript'],
      testing: ['tester-unit-typescript', 'tester-e2e-typescript'],
      review: ['security-reviewer-typescript'],
      verification: ['visual-verifier'],
      documentation: ['doc-updater']
    },
    expectedTotal: 7,
    description: 'Frontend-only project should include visual-verifier agent'
  },
  {
    name: 'Multi-Language Project - Multiple Implementers',
    stackProfile: {
      primary_language: 'typescript',
      backend_frameworks: [{ name: 'nestjs', version: '10.0.0' }],
      frontend_frameworks: [{ name: 'react', version: '18.0.0' }],
      additional_languages: ['python'],  // Scripts or utilities
      package_manager: 'pnpm'
    },
    expectedAgents: {
      planning: ['planner'],
      implementation: ['implementer-typescript', 'implementer-python'],
      testing: ['tester-unit-typescript', 'tester-e2e-typescript'],
      review: ['security-reviewer-typescript'],
      verification: ['visual-verifier'],
      documentation: ['doc-updater']
    },
    expectedTotal: 8,
    description: 'Multi-language project should generate implementers for each language'
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
 * Create stack profile and skill selection files
 */
function createTestInputs(testDir, testCase) {
  const stackProfilePath = path.join(testDir, 'stack-profile.json');
  const skillSelectionPath = path.join(testDir, 'skill-selection.json');

  fs.writeFileSync(stackProfilePath, JSON.stringify(testCase.stackProfile, null, 2));

  // Mock skill selection (empty for simplicity)
  fs.writeFileSync(skillSelectionPath, JSON.stringify({ skills: [] }, null, 2));

  return { stackProfilePath, skillSelectionPath };
}

/**
 * Create mock project structure
 */
function createMockProject(projectDir, stackProfile) {
  fs.mkdirSync(projectDir, { recursive: true });

  // Create .claude/agents directory
  const agentsDir = path.join(projectDir, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // Create package.json for TypeScript projects
  if (stackProfile.primary_language === 'typescript') {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        scripts: {
          'lint:check': 'eslint .',
          'test:unit': 'jest',
          'test:e2e': 'playwright test',
          'build': 'tsc'
        }
      }, null, 2)
    );
  }

  // Create pyproject.toml for Python projects
  if (stackProfile.primary_language === 'python') {
    fs.writeFileSync(
      path.join(projectDir, 'pyproject.toml'),
      '[tool.poetry]\nname = "test-project"\nversion = "1.0.0"'
    );
  }
}

/**
 * Run agent-generation.js
 */
function runAgentGeneration(testDir, projectDir, stackProfilePath, skillSelectionPath) {
  const utilPath = path.join(__dirname, '..', '..', 'utils', 'agent-generation.js');
  const templatesPath = path.join(__dirname, '..', '..', 'agents', 'templates');

  try {
    const result = execSync(
      `node "${utilPath}" "${stackProfilePath}" "${skillSelectionPath}" "${projectDir}" "${templatesPath}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse JSON output
    return JSON.parse(result);
  } catch (error) {
    console.error('❌ Error running agent-generation:', error.message);
    if (error.stdout) {
      console.error('stdout:', error.stdout);
    }
    if (error.stderr) {
      console.error('stderr:', error.stderr);
    }
    return null;
  }
}

/**
 * Validate generated agents
 */
function validateGeneratedAgents(testCase, result, projectDir) {
  const errors = [];

  if (!result) {
    errors.push('No result returned from agent-generation');
    return errors;
  }

  // Check total count
  if (result.total !== testCase.expectedTotal) {
    errors.push(
      `Total agent count mismatch: expected ${testCase.expectedTotal}, got ${result.total}`
    );
  }

  // Check each category
  const categories = ['planning', 'implementation', 'testing', 'review', 'verification', 'documentation'];

  for (const category of categories) {
    const expected = testCase.expectedAgents[category] || [];
    const actual = result[category] || [];

    if (actual.length !== expected.length) {
      errors.push(
        `${category} count mismatch: expected ${expected.length}, got ${actual.length}`
      );
    }

    // Check agent names
    for (const expectedName of expected) {
      const found = actual.some(agent => agent.name === expectedName);
      if (!found) {
        errors.push(`Expected ${category} agent "${expectedName}" not found`);
      }
    }
  }

  // Verify files were written
  const agentsDir = path.join(projectDir, '.claude', 'agents');
  const expectedFiles = [
    ...testCase.expectedAgents.planning,
    ...testCase.expectedAgents.implementation,
    ...testCase.expectedAgents.testing,
    ...testCase.expectedAgents.review,
    ...testCase.expectedAgents.verification,
    ...testCase.expectedAgents.documentation
  ].map(name => `${name}.md`);

  for (const filename of expectedFiles) {
    const filePath = path.join(agentsDir, filename);
    if (!fs.existsSync(filePath)) {
      errors.push(`Expected agent file not written: ${filename}`);
    } else {
      // Validate file content has frontmatter
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.startsWith('---')) {
        errors.push(`Agent file missing frontmatter: ${filename}`);
      }

      // Check for required fields in frontmatter
      if (!content.includes('name:') || !content.includes('model:') || !content.includes('description:')) {
        errors.push(`Agent file missing required frontmatter fields: ${filename}`);
      }
    }
  }

  // V2-specific validation: Check visual-verifier has runtime variables
  if (testCase.expectedAgents.verification.includes('visual-verifier')) {
    const visualVerifierPath = path.join(agentsDir, 'visual-verifier.md');
    if (fs.existsSync(visualVerifierPath)) {
      const content = fs.readFileSync(visualVerifierPath, 'utf8');

      // Should contain runtime variables (not substituted)
      const runtimeVars = ['{{JIRA_KEY}}', '{{PROJECT_ROOT}}', '{{CHANGED_FILES}}'];
      for (const varName of runtimeVars) {
        if (!content.includes(varName)) {
          errors.push(`visual-verifier.md missing runtime variable: ${varName}`);
        }
      }
    }
  }

  // V2-specific validation: Check doc-updater has runtime variables
  if (testCase.expectedAgents.documentation.includes('doc-updater')) {
    const docUpdaterPath = path.join(agentsDir, 'doc-updater.md');
    if (fs.existsSync(docUpdaterPath)) {
      const content = fs.readFileSync(docUpdaterPath, 'utf8');

      // Should contain runtime variables (not substituted)
      const runtimeVars = ['{{JIRA_KEY}}', '{{PROJECT_ROOT}}', '{{CHANGED_FILES}}', '{{IMPLEMENTATION_SUMMARY}}'];
      for (const varName of runtimeVars) {
        if (!content.includes(varName)) {
          errors.push(`doc-updater.md missing runtime variable: ${varName}`);
        }
      }
    }
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

  const caseDir = path.join(testDir, testCase.name.replace(/\s+/g, '-'));
  const projectDir = path.join(caseDir, 'project');

  // Create test inputs
  const { stackProfilePath, skillSelectionPath } = createTestInputs(caseDir, testCase);

  // Create mock project
  createMockProject(projectDir, testCase.stackProfile);

  // Run agent generation
  const result = runAgentGeneration(caseDir, projectDir, stackProfilePath, skillSelectionPath);

  // Validate
  const errors = validateGeneratedAgents(testCase, result, projectDir);

  if (errors.length === 0) {
    console.log('✅ PASSED');
    console.log(`   Generated ${result.total} agents across ${Object.keys(testCase.expectedAgents).length} categories`);
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
  console.log('║  Integration Tests: agent-generation.js V2                 ║');
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
