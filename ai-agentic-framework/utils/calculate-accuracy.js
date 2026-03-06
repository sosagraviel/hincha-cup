#!/usr/bin/env node

/**
 * Accuracy Percentage Calculator
 *
 * Calculates implementation accuracy by comparing acceptance criteria from the ticket
 * with test results and implementation artifacts.
 *
 * Accuracy = (Fulfilled Requirements / Total Requirements) * 100
 *
 * Usage:
 *   node utils/calculate-accuracy.js --ticket JIRA-KEY
 *   node utils/calculate-accuracy.js --ticket JIRA-KEY --test-results test-results.json
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Calculate implementation accuracy
 * @param {string} jiraKey - Jira ticket key
 * @param {Object} options - Calculation options
 * @returns {Promise<Object>} Accuracy report
 */
async function calculateAccuracy(jiraKey, options = {}) {
  console.log('🎯 Accuracy Calculator');
  console.log('====================\n');

  const report = {
    jiraKey,
    totalRequirements: 0,
    fulfilledRequirements: 0,
    partiallyFulfilled: 0,
    unfulfilled: 0,
    accuracyPercentage: 0,
    breakdown: {
      acceptanceCriteria: { total: 0, fulfilled: 0 },
      technicalRequirements: { total: 0, fulfilled: 0 },
      testCoverage: { total: 0, fulfilled: 0 },
      documentation: { total: 0, fulfilled: 0 }
    },
    details: [],
    success: false,
    error: null
  };

  try {
    // Step 1: Load ticket context
    console.log(`📄 Loading ticket context: ${jiraKey}`);
    const ticketContext = await loadTicketContext(jiraKey);

    if (!ticketContext) {
      throw new Error(`Ticket context not found for ${jiraKey}`);
    }

    // Step 2: Extract requirements from ticket
    console.log('🔍 Extracting requirements...');
    const requirements = extractRequirements(ticketContext);

    report.totalRequirements = requirements.length;
    console.log(`   Found ${requirements.length} requirements`);
    console.log('');

    // Step 3: Load test results
    const testResults = await loadTestResults(options.testResultsPath);

    // Step 4: Load implementation artifacts
    const artifacts = await loadImplementationArtifacts(jiraKey);

    // Step 5: Check each requirement
    console.log('✅ Checking requirement fulfillment...');
    for (const requirement of requirements) {
      const fulfillment = checkRequirementFulfillment(requirement, testResults, artifacts);

      report.details.push({
        id: requirement.id,
        type: requirement.type,
        description: requirement.description,
        status: fulfillment.status,
        evidence: fulfillment.evidence,
        confidence: fulfillment.confidence
      });

      // Update counters
      if (fulfillment.status === 'fulfilled') {
        report.fulfilledRequirements++;
        report.breakdown[requirement.type].fulfilled++;
      } else if (fulfillment.status === 'partial') {
        report.partiallyFulfilled++;
      } else {
        report.unfulfilled++;
      }

      report.breakdown[requirement.type].total++;

      // Log result
      const statusIcon = fulfillment.status === 'fulfilled' ? '✓' :
                        fulfillment.status === 'partial' ? '◐' : '✗';
      console.log(`   ${statusIcon} [${requirement.type}] ${requirement.description.slice(0, 60)}...`);
    }

    console.log('');

    // Step 6: Calculate accuracy percentage
    // Formula: (Fulfilled + 0.5 * Partial) / Total * 100
    const weightedFulfilled = report.fulfilledRequirements + (report.partiallyFulfilled * 0.5);
    report.accuracyPercentage = report.totalRequirements > 0
      ? Math.round((weightedFulfilled / report.totalRequirements) * 100)
      : 0;

    report.success = true;

    // Step 7: Display summary
    console.log('📊 Accuracy Summary');
    console.log('==================');
    console.log(`Total Requirements: ${report.totalRequirements}`);
    console.log(`Fulfilled: ${report.fulfilledRequirements} (${Math.round(report.fulfilledRequirements / report.totalRequirements * 100)}%)`);
    if (report.partiallyFulfilled > 0) {
      console.log(`Partially Fulfilled: ${report.partiallyFulfilled} (${Math.round(report.partiallyFulfilled / report.totalRequirements * 100)}%)`);
    }
    if (report.unfulfilled > 0) {
      console.log(`Unfulfilled: ${report.unfulfilled} (${Math.round(report.unfulfilled / report.totalRequirements * 100)}%)`);
    }
    console.log('');
    console.log(`🎯 ACCURACY: ${report.accuracyPercentage}%`);
    console.log('');

    // Breakdown by type
    console.log('Breakdown by Type:');
    Object.entries(report.breakdown).forEach(([type, stats]) => {
      if (stats.total > 0) {
        const pct = Math.round((stats.fulfilled / stats.total) * 100);
        console.log(`  ${type}: ${stats.fulfilled}/${stats.total} (${pct}%)`);
      }
    });
    console.log('');

    return report;
  } catch (error) {
    report.error = error.message;
    console.error(`\n❌ Accuracy calculation failed: ${error.message}\n`);
    throw error;
  }
}

/**
 * Load ticket context from file
 */
async function loadTicketContext(jiraKey) {
  const possiblePaths = [
    `/tmp/context_${jiraKey}.md`,
    `/tmp/jira_ticket_${jiraKey}.md`,
    `.claude/context/${jiraKey}.md`,
    `.claude/plans/${jiraKey}-plan.md`
  ];

  for (const filepath of possiblePaths) {
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf-8');
    }
  }

  return null;
}

/**
 * Extract requirements from ticket context
 */
function extractRequirements(ticketContext) {
  const requirements = [];
  let idCounter = 1;

  // Extract acceptance criteria
  const acRegex = /(?:^|\n)(?:##\s*Acceptance Criteria|Acceptance Criteria:?)([\s\S]*?)(?=\n##|\n---|\Z)/i;
  const acMatch = ticketContext.match(acRegex);

  if (acMatch) {
    const acText = acMatch[1];
    const criteriaLines = acText.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./);
    });

    criteriaLines.forEach(line => {
      const description = line.replace(/^[-*\d.)\s]+/, '').trim();
      if (description.length > 10) {
        requirements.push({
          id: `AC-${idCounter++}`,
          type: 'acceptanceCriteria',
          description,
          priority: 'high'
        });
      }
    });
  }

  // Extract technical requirements
  const techRegex = /(?:^|\n)(?:##\s*Technical Requirements?|Technical Requirements?:?)([\s\S]*?)(?=\n##|\n---|\Z)/i;
  const techMatch = ticketContext.match(techRegex);

  if (techMatch) {
    const techText = techMatch[1];
    const techLines = techText.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./);
    });

    techLines.forEach(line => {
      const description = line.replace(/^[-*\d.)\s]+/, '').trim();
      if (description.length > 10) {
        requirements.push({
          id: `TR-${idCounter++}`,
          type: 'technicalRequirements',
          description,
          priority: 'medium'
        });
      }
    });
  }

  // Add implicit requirements
  requirements.push({
    id: 'COV-1',
    type: 'testCoverage',
    description: 'Unit test coverage ≥80%',
    priority: 'high'
  });

  requirements.push({
    id: 'COV-2',
    type: 'testCoverage',
    description: 'Integration test coverage 100%',
    priority: 'high'
  });

  if (ticketContext.match(/frontend|ui|component|react|vue|angular/i)) {
    requirements.push({
      id: 'COV-3',
      type: 'testCoverage',
      description: 'E2E test coverage 100% for critical flows',
      priority: 'high'
    });
  }

  // Documentation requirement
  if (ticketContext.match(/api|endpoint|service|function/i)) {
    requirements.push({
      id: 'DOC-1',
      type: 'documentation',
      description: 'API documentation updated',
      priority: 'medium'
    });
  }

  return requirements;
}

/**
 * Load test results from various sources
 */
async function loadTestResults(testResultsPath) {
  const results = {
    unit: null,
    integration: null,
    e2e: null
  };

  // Try to load test results from various locations
  const paths = testResultsPath ? [testResultsPath] : [
    'test-results/unit-results.json',
    'test-results/integration-results.json',
    'test-results/e2e-results.json',
    'coverage/coverage-summary.json',
    '.claude/artifacts/*/test-results.json'
  ];

  paths.forEach(pattern => {
    if (pattern.includes('*')) {
      // Glob pattern - not implemented in simple version
      return;
    }

    if (fs.existsSync(pattern)) {
      try {
        const content = JSON.parse(fs.readFileSync(pattern, 'utf-8'));

        if (pattern.includes('unit')) {
          results.unit = content;
        } else if (pattern.includes('integration')) {
          results.integration = content;
        } else if (pattern.includes('e2e')) {
          results.e2e = content;
        } else if (pattern.includes('coverage')) {
          results.coverage = content;
        }
      } catch (error) {
        // Ignore parse errors
      }
    }
  });

  return results;
}

/**
 * Load implementation artifacts
 */
async function loadImplementationArtifacts(jiraKey) {
  const artifacts = {
    files: [],
    commits: [],
    documentation: []
  };

  // Get list of changed files from git
  try {
    const { execSync } = require('child_process');
    const diff = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' });
    artifacts.files = diff.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Ignore git errors
  }

  // Check for documentation files
  const docPatterns = ['README.md', 'docs/', 'CHANGELOG.md', 'API.md'];
  docPatterns.forEach(pattern => {
    if (artifacts.files.some(f => f.includes(pattern))) {
      artifacts.documentation.push(pattern);
    }
  });

  return artifacts;
}

/**
 * Check if a requirement is fulfilled
 */
function checkRequirementFulfillment(requirement, testResults, artifacts) {
  const fulfillment = {
    status: 'unfulfilled', // 'fulfilled', 'partial', 'unfulfilled'
    evidence: [],
    confidence: 0 // 0-100
  };

  switch (requirement.type) {
    case 'acceptanceCriteria':
      return checkAcceptanceCriteria(requirement, testResults, artifacts);

    case 'technicalRequirements':
      return checkTechnicalRequirement(requirement, testResults, artifacts);

    case 'testCoverage':
      return checkTestCoverage(requirement, testResults);

    case 'documentation':
      return checkDocumentation(requirement, artifacts);

    default:
      return fulfillment;
  }
}

/**
 * Check acceptance criteria fulfillment
 */
function checkAcceptanceCriteria(requirement, testResults, artifacts) {
  const fulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0
  };

  // Strategy 1: Check for matching test names
  const allTests = [
    ...(testResults.unit?.tests || []),
    ...(testResults.integration?.tests || []),
    ...(testResults.e2e?.tests || [])
  ];

  const keywords = requirement.description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const matchingTests = allTests.filter(test => {
    const testName = (test.name || test.title || '').toLowerCase();
    return keywords.some(keyword => testName.includes(keyword));
  });

  if (matchingTests.length > 0) {
    const allPassed = matchingTests.every(t => t.status === 'passed' || t.state === 'passed');

    if (allPassed) {
      fulfillment.status = 'fulfilled';
      fulfillment.confidence = 90;
      fulfillment.evidence.push(`${matchingTests.length} test(s) passed`);
    } else {
      fulfillment.status = 'partial';
      fulfillment.confidence = 40;
      fulfillment.evidence.push('Tests exist but some failed');
    }
  } else {
    // Strategy 2: Check if related files were modified
    const relatedFiles = artifacts.files.filter(file => {
      const filename = file.toLowerCase();
      return keywords.some(keyword => filename.includes(keyword));
    });

    if (relatedFiles.length > 0) {
      fulfillment.status = 'partial';
      fulfillment.confidence = 30;
      fulfillment.evidence.push(`${relatedFiles.length} related file(s) modified`);
    }
  }

  return fulfillment;
}

/**
 * Check technical requirement fulfillment
 */
function checkTechnicalRequirement(requirement, testResults, artifacts) {
  const fulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0
  };

  const desc = requirement.description.toLowerCase();

  // Check for technology/framework mentions
  const techPatterns = {
    'typescript': /\.tsx?$/,
    'react': /react|jsx/i,
    'api': /api|endpoint|route|controller/i,
    'database': /database|migration|schema|model|entity/i,
    'authentication': /auth|login|session|token/i,
    'validation': /validat|schema|dto/i
  };

  for (const [tech, pattern] of Object.entries(techPatterns)) {
    if (desc.includes(tech)) {
      const relatedFiles = artifacts.files.filter(file =>
        pattern.test(file.toLowerCase())
      );

      if (relatedFiles.length > 0) {
        fulfillment.status = 'fulfilled';
        fulfillment.confidence = 70;
        fulfillment.evidence.push(`${relatedFiles.length} ${tech}-related file(s) added/modified`);
        break;
      }
    }
  }

  return fulfillment;
}

/**
 * Check test coverage requirements
 */
function checkTestCoverage(requirement, testResults) {
  const fulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0
  };

  const desc = requirement.description.toLowerCase();

  if (desc.includes('unit') && desc.includes('80%')) {
    const coverage = testResults.coverage?.total?.lines?.pct || 0;

    if (coverage >= 80) {
      fulfillment.status = 'fulfilled';
      fulfillment.confidence = 100;
      fulfillment.evidence.push(`Unit coverage: ${coverage.toFixed(1)}%`);
    } else if (coverage >= 60) {
      fulfillment.status = 'partial';
      fulfillment.confidence = 50;
      fulfillment.evidence.push(`Unit coverage: ${coverage.toFixed(1)}% (target: 80%)`);
    }
  }

  if (desc.includes('integration') && desc.includes('100%')) {
    const integrationTests = testResults.integration?.tests || [];
    const passed = integrationTests.filter(t => t.status === 'passed').length;
    const total = integrationTests.length;

    if (total > 0 && passed === total) {
      fulfillment.status = 'fulfilled';
      fulfillment.confidence = 100;
      fulfillment.evidence.push(`Integration: ${passed}/${total} tests passed`);
    } else if (total > 0) {
      fulfillment.status = 'partial';
      fulfillment.confidence = 60;
      fulfillment.evidence.push(`Integration: ${passed}/${total} tests passed`);
    }
  }

  if (desc.includes('e2e') && desc.includes('100%')) {
    const e2eTests = testResults.e2e?.tests || [];
    const passed = e2eTests.filter(t => t.status === 'passed').length;
    const total = e2eTests.length;

    if (total > 0 && passed === total) {
      fulfillment.status = 'fulfilled';
      fulfillment.confidence = 100;
      fulfillment.evidence.push(`E2E: ${passed}/${total} tests passed`);
    } else if (total > 0) {
      fulfillment.status = 'partial';
      fulfillment.confidence = 60;
      fulfillment.evidence.push(`E2E: ${passed}/${total} tests passed`);
    }
  }

  return fulfillment;
}

/**
 * Check documentation requirements
 */
function checkDocumentation(requirement, artifacts) {
  const fulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0
  };

  const desc = requirement.description.toLowerCase();

  if (desc.includes('api') && desc.includes('documentation')) {
    const apiDocs = artifacts.documentation.filter(doc =>
      doc.toLowerCase().includes('api') ||
      doc.toLowerCase().includes('readme')
    );

    if (apiDocs.length > 0) {
      fulfillment.status = 'fulfilled';
      fulfillment.confidence = 80;
      fulfillment.evidence.push('API documentation updated');
    }
  }

  return fulfillment;
}

/**
 * Generate accuracy report markdown
 */
function generateAccuracyReport(report) {
  let markdown = `# Accuracy Report: ${report.jiraKey}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `- **Total Requirements**: ${report.totalRequirements}\n`;
  markdown += `- **Fulfilled**: ${report.fulfilledRequirements}\n`;
  markdown += `- **Partially Fulfilled**: ${report.partiallyFulfilled}\n`;
  markdown += `- **Unfulfilled**: ${report.unfulfilled}\n`;
  markdown += `- **Accuracy**: ${report.accuracyPercentage}%\n\n`;

  markdown += `## Breakdown by Type\n\n`;
  Object.entries(report.breakdown).forEach(([type, stats]) => {
    if (stats.total > 0) {
      const pct = Math.round((stats.fulfilled / stats.total) * 100);
      markdown += `- **${type}**: ${stats.fulfilled}/${stats.total} (${pct}%)\n`;
    }
  });

  markdown += `\n## Detailed Results\n\n`;
  report.details.forEach(detail => {
    const icon = detail.status === 'fulfilled' ? '✅' :
                 detail.status === 'partial' ? '⚠️' : '❌';
    markdown += `### ${icon} ${detail.id}: ${detail.description}\n\n`;
    markdown += `- **Status**: ${detail.status}\n`;
    markdown += `- **Confidence**: ${detail.confidence}%\n`;

    if (detail.evidence.length > 0) {
      markdown += `- **Evidence**:\n`;
      detail.evidence.forEach(evidence => {
        markdown += `  - ${evidence}\n`;
      });
    }

    markdown += `\n`;
  });

  return markdown;
}

/**
 * CLI execution
 */
async function main() {
  const args = process.argv.slice(2);

  let jiraKey = null;
  let testResultsPath = null;
  let outputPath = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticket' && args[i + 1]) {
      jiraKey = args[i + 1];
      i++;
    } else if (args[i] === '--test-results' && args[i + 1]) {
      testResultsPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  if (!jiraKey) {
    console.error('Error: --ticket JIRA-KEY is required\n');
    console.error('Usage: node calculate-accuracy.js --ticket JIRA-KEY [--test-results path] [--output path]');
    process.exit(1);
  }

  try {
    const report = await calculateAccuracy(jiraKey, { testResultsPath });

    // Save report to file if output path specified
    if (outputPath) {
      const markdown = generateAccuracyReport(report);
      fs.writeFileSync(outputPath, markdown, 'utf-8');
      console.log(`📄 Report saved: ${outputPath}\n`);
    }

    // Save JSON report
    const jsonPath = `.claude/artifacts/${jiraKey}/accuracy-report.json`;
    const dir = path.dirname(jsonPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`📄 JSON report saved: ${jsonPath}\n`);

    process.exit(report.accuracyPercentage >= 80 ? 0 : 1);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  calculateAccuracy,
  extractRequirements,
  checkRequirementFulfillment,
  generateAccuracyReport
};
