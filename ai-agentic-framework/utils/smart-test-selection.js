#!/usr/bin/env node

/**
 * Smart Test Selection
 *
 * Analyzes git diff to determine which tests actually need to run based on:
 * - Files changed in the current branch
 * - Dependency graph (which files import the changed files)
 * - Test coverage mapping
 *
 * Prioritizes tests into three categories:
 * 1. **Critical** (always run): Tests for changed files, integration tests
 * 2. **Related** (run if time): Tests for files that import changed files
 * 3. **Unrelated** (skip): Tests for completely unrelated files
 *
 * This dramatically reduces test execution time while maintaining confidence.
 *
 * Usage:
 *   node smart-test-selection.js --base origin/main --head HEAD --ticket JIRA-123
 *
 *   # Or programmatically:
 *   const { selectTests } = require('./smart-test-selection');
 *   const selection = await selectTests({ baseCommit: 'origin/main', headCommit: 'HEAD' });
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test priority levels
const TEST_PRIORITY = {
  CRITICAL: 'critical', // Must run
  RELATED: 'related', // Run if time permits
  UNRELATED: 'unrelated' // Skip
};

/**
 * Select tests based on changed files
 *
 * @param {Object} options - Selection options
 * @param {string} options.baseCommit - Base commit (e.g., 'origin/main')
 * @param {string} options.headCommit - Head commit (e.g., 'HEAD')
 * @param {string} options.ticketKey - Jira ticket key (optional, for logging)
 * @param {string} options.projectPath - Project root path
 * @returns {Promise<Object>} Test selection report
 */
async function selectTests(options = {}) {
  const {
    baseCommit = 'origin/main',
    headCommit = 'HEAD',
    ticketKey = null,
    projectPath = process.cwd()
  } = options;

  console.log(`\n🔍 Analyzing changed files to select tests...`);
  console.log(`   Base: ${baseCommit}`);
  console.log(`   Head: ${headCommit}`);

  // Get changed files
  const changedFiles = await getChangedFiles(baseCommit, headCommit, projectPath);
  console.log(`\n📝 Changed files: ${changedFiles.length}`);

  if (changedFiles.length === 0) {
    console.log('⚠️  No files changed, no tests to run');
    return {
      changedFiles: [],
      testSelection: {
        critical: [],
        related: [],
        unrelated: []
      },
      summary: {
        total: 0,
        critical: 0,
        related: 0,
        unrelated: 0,
        estimatedTimeReduction: 0
      }
    };
  }

  // Categorize changed files
  const categorizedFiles = categorizeChangedFiles(changedFiles, projectPath);

  // Find all test files
  const allTestFiles = await findAllTestFiles(projectPath);
  console.log(`📋 Total test files: ${allTestFiles.length}`);

  // Build dependency graph
  console.log(`\n🔗 Building dependency graph...`);
  const dependencyGraph = await buildDependencyGraph(changedFiles, allTestFiles, projectPath);

  // Select and prioritize tests
  const testSelection = prioritizeTests(
    changedFiles,
    allTestFiles,
    dependencyGraph,
    categorizedFiles,
    projectPath
  );

  // Calculate summary
  const summary = calculateSummary(testSelection, allTestFiles);

  // Create selection report
  const report = {
    baseCommit,
    headCommit,
    timestamp: new Date().toISOString(),
    changedFiles: categorizedFiles,
    testSelection,
    summary
  };

  // Save report
  if (ticketKey) {
    await saveSelectionReport(report, ticketKey, projectPath);
  }

  // Display summary
  displaySelectionSummary(report);

  return report;
}

/**
 * Get changed files between two commits
 */
async function getChangedFiles(baseCommit, headCommit, projectPath) {
  try {
    const output = execSync(`git diff --name-only ${baseCommit}...${headCommit}`, {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    return output.split('\n').filter(Boolean);
  } catch (error) {
    console.error('❌ Error getting changed files:', error.message);
    return [];
  }
}

/**
 * Categorize changed files by type
 */
function categorizeChangedFiles(changedFiles, projectPath) {
  return changedFiles.map(filePath => {
    const category = {
      path: filePath,
      type: 'other',
      isTest: false,
      isBackend: false,
      isFrontend: false,
      isShared: false,
      isConfig: false
    };

    // Test files
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
      category.isTest = true;
      category.type = 'test';
    }
    // E2E tests
    else if (/e2e|playwright/.test(filePath) && /\.(ts|js)$/.test(filePath)) {
      category.isTest = true;
      category.type = 'e2e_test';
    }
    // Backend source
    else if (filePath.startsWith('services/backend/')) {
      category.isBackend = true;
      category.type = 'backend_source';
    }
    // Frontend source
    else if (filePath.startsWith('services/web-frontend/')) {
      category.isFrontend = true;
      category.type = 'frontend_source';
    }
    // Shared package
    else if (filePath.startsWith('packages/shared/')) {
      category.isShared = true;
      category.type = 'shared_source';
    }
    // Config files
    else if (/\.(json|yaml|yml|env|md)$/.test(filePath)) {
      category.isConfig = true;
      category.type = 'config';
    }

    return category;
  });
}

/**
 * Find all test files in the project
 */
async function findAllTestFiles(projectPath) {
  const testFiles = [];

  try {
    // Backend unit tests
    const backendUnitTests = execSync(
      'find services/backend -type f \\( -name "*.spec.ts" -o -name "*.test.ts" \\) 2>/dev/null || true',
      { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    testFiles.push(...backendUnitTests.split('\n').filter(Boolean));

    // Backend integration tests
    const backendIntegrationTests = execSync(
      'find services/backend -type f -path "*/integration/*.spec.ts" 2>/dev/null || true',
      { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    testFiles.push(...backendIntegrationTests.split('\n').filter(Boolean));

    // Frontend unit tests
    const frontendUnitTests = execSync(
      'find services/web-frontend -type f \\( -name "*.spec.tsx" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.test.ts" \\) 2>/dev/null || true',
      { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    testFiles.push(...frontendUnitTests.split('\n').filter(Boolean));

    // E2E tests
    const e2eTests = execSync(
      'find services/web-frontend/tests -type f -name "*.spec.ts" 2>/dev/null || true',
      { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    testFiles.push(...e2eTests.split('\n').filter(Boolean));
  } catch (error) {
    console.error('⚠️  Warning: Error finding test files:', error.message);
  }

  return [...new Set(testFiles)].filter(Boolean);
}

/**
 * Build dependency graph
 */
async function buildDependencyGraph(changedFiles, testFiles, projectPath) {
  const graph = {
    // Map of source file -> test files that directly test it
    sourceToTests: {},
    // Map of source file -> files that import it
    sourceToImporters: {},
    // Map of test file -> source files it tests
    testToSources: {}
  };

  // For each changed source file, find:
  // 1. Test files that directly test it
  // 2. Files that import it
  for (const changedFile of changedFiles) {
    if (changedFile.endsWith('.test.ts') || changedFile.endsWith('.spec.ts')) {
      continue; // Skip test files
    }

    // Find matching test file
    const testFile = findMatchingTestFile(changedFile, testFiles);
    if (testFile) {
      graph.sourceToTests[changedFile] = [testFile];
      if (!graph.testToSources[testFile]) {
        graph.testToSources[testFile] = [];
      }
      graph.testToSources[testFile].push(changedFile);
    }

    // Find files that import this changed file
    const importers = await findImporters(changedFile, projectPath);
    graph.sourceToImporters[changedFile] = importers;
  }

  return graph;
}

/**
 * Find matching test file for a source file
 */
function findMatchingTestFile(sourceFile, testFiles) {
  // Remove extension and path prefix
  const sourceName = path.basename(sourceFile, path.extname(sourceFile));

  // Common test naming patterns:
  // - same-name.spec.ts
  // - same-name.test.ts
  // - same-name.integration.spec.ts

  const possibleTestNames = [
    `${sourceName}.spec.ts`,
    `${sourceName}.test.ts`,
    `${sourceName}.spec.tsx`,
    `${sourceName}.test.tsx`,
    `${sourceName}.integration.spec.ts`
  ];

  for (const testFile of testFiles) {
    const testBaseName = path.basename(testFile);
    if (possibleTestNames.includes(testBaseName)) {
      return testFile;
    }
  }

  return null;
}

/**
 * Find files that import a given source file
 */
async function findImporters(sourceFile, projectPath) {
  const importers = [];

  try {
    // Extract module name from file path
    const moduleName = sourceFile
      .replace(/^services\/(backend|web-frontend)\/src\//, '')
      .replace(/\.(ts|tsx|js|jsx)$/, '');

    // Search for imports
    // This is a simplified version - production would use AST parsing
    const grepPattern = `import.*from.*['"].*${path.basename(sourceFile, path.extname(sourceFile))}`;

    const output = execSync(
      `grep -r "${grepPattern}" services/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null || true`,
      { cwd: projectPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const matches = output.split('\n').filter(Boolean);
    matches.forEach(match => {
      const filePath = match.split(':')[0];
      if (filePath && filePath !== sourceFile) {
        importers.push(filePath);
      }
    });
  } catch (error) {
    // Ignore errors
  }

  return [...new Set(importers)];
}

/**
 * Prioritize tests into critical, related, and unrelated
 */
function prioritizeTests(changedFiles, allTestFiles, dependencyGraph, categorizedFiles, projectPath) {
  const selection = {
    critical: [],
    related: [],
    unrelated: []
  };

  // Extract file paths from categorized files
  const changedFilePaths = changedFiles.map(f => typeof f === 'string' ? f : f.path);

  // Categorize each test file
  for (const testFile of allTestFiles) {
    const priority = determineTestPriority(
      testFile,
      changedFilePaths,
      dependencyGraph,
      categorizedFiles,
      projectPath
    );

    const testInfo = {
      path: testFile,
      type: categorizeTestFile(testFile),
      reason: priority.reason
    };

    if (priority.level === TEST_PRIORITY.CRITICAL) {
      selection.critical.push(testInfo);
    } else if (priority.level === TEST_PRIORITY.RELATED) {
      selection.related.push(testInfo);
    } else {
      selection.unrelated.push(testInfo);
    }
  }

  return selection;
}

/**
 * Determine test priority
 */
function determineTestPriority(testFile, changedFiles, dependencyGraph, categorizedFiles, projectPath) {
  // CRITICAL: Test file itself was changed
  if (changedFiles.includes(testFile)) {
    return {
      level: TEST_PRIORITY.CRITICAL,
      reason: 'Test file was modified'
    };
  }

  // CRITICAL: Test directly tests a changed file
  const testedSources = dependencyGraph.testToSources[testFile] || [];
  for (const source of testedSources) {
    if (changedFiles.includes(source)) {
      return {
        level: TEST_PRIORITY.CRITICAL,
        reason: `Tests changed file: ${path.basename(source)}`
      };
    }
  }

  // CRITICAL: Integration test and backend files changed
  if (testFile.includes('integration/') || testFile.includes('integration.spec')) {
    const hasBackendChanges = categorizedFiles.some(f => f.isBackend);
    if (hasBackendChanges) {
      return {
        level: TEST_PRIORITY.CRITICAL,
        reason: 'Integration test (backend changed)'
      };
    }
  }

  // CRITICAL: E2E test and frontend files changed
  if (testFile.includes('e2e/') || testFile.includes('tests/')) {
    const hasFrontendChanges = categorizedFiles.some(f => f.isFrontend);
    if (hasFrontendChanges) {
      return {
        level: TEST_PRIORITY.CRITICAL,
        reason: 'E2E test (frontend changed)'
      };
    }
  }

  // RELATED: Tests a file that imports a changed file
  for (const changedFile of changedFiles) {
    const importers = dependencyGraph.sourceToImporters[changedFile] || [];

    for (const importer of importers) {
      const importerTestFile = findMatchingTestFile(importer, [testFile]);
      if (importerTestFile === testFile) {
        return {
          level: TEST_PRIORITY.RELATED,
          reason: `Tests file that imports ${path.basename(changedFile)}`
        };
      }
    }
  }

  // RELATED: Shared package changed (affects all)
  const hasSharedChanges = categorizedFiles.some(f => f.isShared);
  if (hasSharedChanges && (testFile.includes('backend') || testFile.includes('frontend'))) {
    return {
      level: TEST_PRIORITY.RELATED,
      reason: 'Shared package changed'
    };
  }

  // UNRELATED: No connection to changed files
  return {
    level: TEST_PRIORITY.UNRELATED,
    reason: 'No direct or indirect connection to changes'
  };
}

/**
 * Categorize test file type
 */
function categorizeTestFile(testFile) {
  if (testFile.includes('integration/') || testFile.includes('integration.spec')) {
    return 'integration';
  } else if (testFile.includes('e2e/') || testFile.includes('tests/')) {
    return 'e2e';
  } else if (testFile.includes('backend/')) {
    return 'backend_unit';
  } else if (testFile.includes('frontend/')) {
    return 'frontend_unit';
  }
  return 'unit';
}

/**
 * Calculate summary statistics
 */
function calculateSummary(testSelection, allTestFiles) {
  const total = allTestFiles.length;
  const critical = testSelection.critical.length;
  const related = testSelection.related.length;
  const unrelated = testSelection.unrelated.length;

  // Estimate time reduction (assuming unrelated tests are 40% of total time)
  const testsToRun = critical + related;
  const testsSkipped = unrelated;
  const estimatedTimeReduction = Math.round((testsSkipped / total) * 100);

  return {
    total,
    critical,
    related,
    unrelated,
    testsToRun,
    testsSkipped,
    estimatedTimeReduction
  };
}

/**
 * Save selection report
 */
async function saveSelectionReport(report, ticketKey, projectPath) {
  const reportsDir = path.join(projectPath, '.claude', 'test-selection');
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `${ticketKey}-test-selection.json`);
  const mdPath = path.join(reportsDir, `${ticketKey}-test-selection.md`);

  // Save JSON
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Save Markdown
  const markdown = generateSelectionMarkdown(report);
  fs.writeFileSync(mdPath, markdown);

  console.log(`\n📝 Test selection report saved to:`);
  console.log(`   ${jsonPath}`);
  console.log(`   ${mdPath}`);
}

/**
 * Generate selection markdown
 */
function generateSelectionMarkdown(report) {
  let md = `# Test Selection Report\n\n`;
  md += `**Generated**: ${new Date(report.timestamp).toLocaleString()}\n`;
  md += `**Base Commit**: ${report.baseCommit}\n`;
  md += `**Head Commit**: ${report.headCommit}\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `| Category | Count | Percentage |\n`;
  md += `|----------|-------|------------|\n`;
  md += `| **Critical** (must run) | ${report.summary.critical} | ${Math.round((report.summary.critical / report.summary.total) * 100)}% |\n`;
  md += `| **Related** (recommended) | ${report.summary.related} | ${Math.round((report.summary.related / report.summary.total) * 100)}% |\n`;
  md += `| **Unrelated** (skip) | ${report.summary.unrelated} | ${Math.round((report.summary.unrelated / report.summary.total) * 100)}% |\n`;
  md += `| **Total** | ${report.summary.total} | 100% |\n\n`;

  md += `**Tests to Run**: ${report.summary.testsToRun} (${Math.round((report.summary.testsToRun / report.summary.total) * 100)}%)\n`;
  md += `**Estimated Time Reduction**: ${report.summary.estimatedTimeReduction}%\n\n`;

  // Changed Files
  md += `## Changed Files (${report.changedFiles.length})\n\n`;
  const filesByType = {};
  report.changedFiles.forEach(file => {
    if (!filesByType[file.type]) {
      filesByType[file.type] = [];
    }
    filesByType[file.type].push(file.path);
  });

  Object.entries(filesByType).forEach(([type, files]) => {
    md += `### ${type} (${files.length})\n\n`;
    files.forEach(file => {
      md += `- \`${file}\`\n`;
    });
    md += '\n';
  });

  // Critical Tests
  if (report.testSelection.critical.length > 0) {
    md += `## Critical Tests (${report.testSelection.critical.length})\n\n`;
    md += `These tests **MUST** run.\n\n`;
    report.testSelection.critical.forEach(test => {
      md += `- \`${test.path}\`\n`;
      md += `  - **Type**: ${test.type}\n`;
      md += `  - **Reason**: ${test.reason}\n`;
    });
    md += '\n';
  }

  // Related Tests
  if (report.testSelection.related.length > 0) {
    md += `## Related Tests (${report.testSelection.related.length})\n\n`;
    md += `These tests are **recommended** to run.\n\n`;
    report.testSelection.related.forEach(test => {
      md += `- \`${test.path}\`\n`;
      md += `  - **Type**: ${test.type}\n`;
      md += `  - **Reason**: ${test.reason}\n`;
    });
    md += '\n';
  }

  // Unrelated Tests (collapsible)
  if (report.testSelection.unrelated.length > 0) {
    md += `## Unrelated Tests (${report.testSelection.unrelated.length})\n\n`;
    md += `These tests can be **skipped** to save time.\n\n`;
    md += `<details>\n<summary>View all ${report.testSelection.unrelated.length} unrelated tests</summary>\n\n`;
    report.testSelection.unrelated.forEach(test => {
      md += `- \`${test.path}\`\n`;
    });
    md += `\n</details>\n\n`;
  }

  return md;
}

/**
 * Display selection summary
 */
function displaySelectionSummary(report) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('SMART TEST SELECTION SUMMARY');
  console.log('='.repeat(80));

  console.log(`\nChanged Files: ${report.changedFiles.length}`);

  console.log(`\nTest Prioritization:`);
  console.log(`  🔴 Critical (must run):     ${report.summary.critical} (${Math.round((report.summary.critical / report.summary.total) * 100)}%)`);
  console.log(`  🟡 Related (recommended):   ${report.summary.related} (${Math.round((report.summary.related / report.summary.total) * 100)}%)`);
  console.log(`  ⚪ Unrelated (skip):        ${report.summary.unrelated} (${Math.round((report.summary.unrelated / report.summary.total) * 100)}%)`);

  console.log(`\nOptimization:`);
  console.log(`  Tests to run:   ${report.summary.testsToRun}/${report.summary.total}`);
  console.log(`  Tests skipped:  ${report.summary.testsSkipped}/${report.summary.total}`);
  console.log(`  Time reduction: ~${report.summary.estimatedTimeReduction}%`);

  console.log(`\n${'='.repeat(80)}\n`);
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'base') {
      options.baseCommit = value;
    } else if (key === 'head') {
      options.headCommit = value;
    } else if (key === 'ticket') {
      options.ticketKey = value;
    } else if (key === 'project') {
      options.projectPath = value;
    }
  }

  if (!options.baseCommit || !options.headCommit) {
    console.error('Usage: node smart-test-selection.js --base origin/main --head HEAD [--ticket JIRA-123] [--project /path/to/project]');
    process.exit(1);
  }

  selectTests(options)
    .then(selection => {
      console.log('\n✅ Test selection complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error selecting tests:', error);
      process.exit(1);
    });
}

// Export
module.exports = {
  selectTests,
  TEST_PRIORITY
};
