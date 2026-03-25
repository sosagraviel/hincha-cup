/**
 * Accuracy Calculator Service
 *
 * Calculates implementation accuracy by comparing acceptance criteria from the ticket
 * with test results and implementation artifacts.
 * Migrated from utils/artifacts/calculate-accuracy.js
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

export interface Requirement {
  id: string;
  type: 'acceptanceCriteria' | 'technicalRequirements' | 'testCoverage' | 'documentation';
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RequirementFulfillment {
  status: 'fulfilled' | 'partial' | 'unfulfilled';
  evidence: string[];
  confidence: number; // 0-100
}

export interface RequirementDetail extends Requirement {
  status: 'fulfilled' | 'partial' | 'unfulfilled';
  evidence: string[];
  confidence: number;
}

export interface AccuracyReport {
  jiraKey: string;
  totalRequirements: number;
  fulfilledRequirements: number;
  partiallyFulfilled: number;
  unfulfilled: number;
  accuracyPercentage: number;
  breakdown: {
    acceptanceCriteria: { total: number; fulfilled: number };
    technicalRequirements: { total: number; fulfilled: number };
    testCoverage: { total: number; fulfilled: number };
    documentation: { total: number; fulfilled: number };
  };
  details: RequirementDetail[];
  success: boolean;
  error: string | null;
}

export interface TestResults {
  unit: any;
  integration: any;
  e2e: any;
  coverage?: any;
}

export interface ImplementationArtifacts {
  files: string[];
  commits: string[];
  documentation: string[];
}

/**
 * Load ticket context from file
 */
async function loadTicketContext(jiraKey: string): Promise<string | null> {
  const possiblePaths = [
    `/tmp/context_${jiraKey}.md`,
    `/tmp/jira_ticket_${jiraKey}.md`,
    `.claude/context/${jiraKey}.md`,
    `.claude/plans/${jiraKey}-plan.md`,
  ];

  for (const filepath of possiblePaths) {
    if (existsSync(filepath)) {
      return await readFile(filepath, 'utf-8');
    }
  }

  return null;
}

/**
 * Extract requirements from ticket context
 */
export function extractRequirements(ticketContext: string): Requirement[] {
  const requirements: Requirement[] = [];
  let idCounter = 1;

  // Extract acceptance criteria
  const acRegex = /(?:^|\n)(?:##\s*Acceptance Criteria|Acceptance Criteria:?)([\s\S]*?)(?=\n##|\n---|\Z)/i;
  const acMatch = ticketContext.match(acRegex);

  if (acMatch) {
    const acText = acMatch[1];
    const criteriaLines = acText.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./);
    });

    criteriaLines.forEach((line) => {
      const description = line.replace(/^[-*\d.)\s]+/, '').trim();
      if (description.length > 10) {
        requirements.push({
          id: `AC-${idCounter++}`,
          type: 'acceptanceCriteria',
          description,
          priority: 'high',
        });
      }
    });
  }

  // Extract technical requirements
  const techRegex = /(?:^|\n)(?:##\s*Technical Requirements?|Technical Requirements?:?)([\s\S]*?)(?=\n##|\n---|\Z)/i;
  const techMatch = ticketContext.match(techRegex);

  if (techMatch) {
    const techText = techMatch[1];
    const techLines = techText.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./);
    });

    techLines.forEach((line) => {
      const description = line.replace(/^[-*\d.)\s]+/, '').trim();
      if (description.length > 10) {
        requirements.push({
          id: `TR-${idCounter++}`,
          type: 'technicalRequirements',
          description,
          priority: 'medium',
        });
      }
    });
  }

  // Add implicit requirements
  requirements.push({
    id: 'COV-1',
    type: 'testCoverage',
    description: 'Unit test coverage ≥80%',
    priority: 'high',
  });

  requirements.push({
    id: 'COV-2',
    type: 'testCoverage',
    description: 'Integration test coverage 100%',
    priority: 'high',
  });

  if (ticketContext.match(/frontend|ui|component|react|vue|angular/i)) {
    requirements.push({
      id: 'COV-3',
      type: 'testCoverage',
      description: 'E2E test coverage 100% for critical flows',
      priority: 'high',
    });
  }

  // Documentation requirement
  if (ticketContext.match(/api|endpoint|service|function/i)) {
    requirements.push({
      id: 'DOC-1',
      type: 'documentation',
      description: 'API documentation updated',
      priority: 'medium',
    });
  }

  return requirements;
}

/**
 * Load test results from various sources
 */
async function loadTestResults(testResultsPath?: string): Promise<TestResults> {
  const results: TestResults = {
    unit: null,
    integration: null,
    e2e: null,
  };

  // Try to load test results from various locations
  const paths = testResultsPath
    ? [testResultsPath]
    : [
        'test-results/unit-results.json',
        'test-results/integration-results.json',
        'test-results/e2e-results.json',
        'coverage/coverage-summary.json',
      ];

  for (const pattern of paths) {
    if (pattern.includes('*')) {
      continue; // Skip glob patterns for now
    }

    if (existsSync(pattern)) {
      try {
        const content = JSON.parse(await readFile(pattern, 'utf-8'));

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
  }

  return results;
}

/**
 * Load implementation artifacts
 */
async function loadImplementationArtifacts(jiraKey: string): Promise<ImplementationArtifacts> {
  const artifacts: ImplementationArtifacts = {
    files: [],
    commits: [],
    documentation: [],
  };

  // Get list of changed files from git
  try {
    const diff = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' });
    artifacts.files = diff.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Ignore git errors
  }

  // Check for documentation files
  const docPatterns = ['README.md', 'docs/', 'CHANGELOG.md', 'API.md'];
  docPatterns.forEach((pattern) => {
    if (artifacts.files.some((f) => f.includes(pattern))) {
      artifacts.documentation.push(pattern);
    }
  });

  return artifacts;
}

/**
 * Check acceptance criteria fulfillment
 */
function checkAcceptanceCriteria(
  requirement: Requirement,
  testResults: TestResults,
  artifacts: ImplementationArtifacts
): RequirementFulfillment {
  const fulfillment: RequirementFulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0,
  };

  // Strategy 1: Check for matching test names
  const allTests = [
    ...(testResults.unit?.tests || []),
    ...(testResults.integration?.tests || []),
    ...(testResults.e2e?.tests || []),
  ];

  const keywords = requirement.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const matchingTests = allTests.filter((test: any) => {
    const testName = (test.name || test.title || '').toLowerCase();
    return keywords.some((keyword) => testName.includes(keyword));
  });

  if (matchingTests.length > 0) {
    const allPassed = matchingTests.every((t: any) => t.status === 'passed' || t.state === 'passed');

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
    const relatedFiles = artifacts.files.filter((file) => {
      const filename = file.toLowerCase();
      return keywords.some((keyword) => filename.includes(keyword));
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
function checkTechnicalRequirement(
  requirement: Requirement,
  testResults: TestResults,
  artifacts: ImplementationArtifacts
): RequirementFulfillment {
  const fulfillment: RequirementFulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0,
  };

  const desc = requirement.description.toLowerCase();

  // Check for technology/framework mentions
  const techPatterns: Record<string, RegExp> = {
    typescript: /\.tsx?$/,
    react: /react|jsx/i,
    api: /api|endpoint|route|controller/i,
    database: /database|migration|schema|model|entity/i,
    authentication: /auth|login|session|token/i,
    validation: /validat|schema|dto/i,
  };

  for (const [tech, pattern] of Object.entries(techPatterns)) {
    if (desc.includes(tech)) {
      const relatedFiles = artifacts.files.filter((file) => pattern.test(file.toLowerCase()));

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
function checkTestCoverage(requirement: Requirement, testResults: TestResults): RequirementFulfillment {
  const fulfillment: RequirementFulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0,
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
    const passed = integrationTests.filter((t: any) => t.status === 'passed').length;
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
    const passed = e2eTests.filter((t: any) => t.status === 'passed').length;
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
function checkDocumentation(
  requirement: Requirement,
  artifacts: ImplementationArtifacts
): RequirementFulfillment {
  const fulfillment: RequirementFulfillment = {
    status: 'unfulfilled',
    evidence: [],
    confidence: 0,
  };

  const desc = requirement.description.toLowerCase();

  if (desc.includes('api') && desc.includes('documentation')) {
    const apiDocs = artifacts.documentation.filter(
      (doc) => doc.toLowerCase().includes('api') || doc.toLowerCase().includes('readme')
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
 * Check if a requirement is fulfilled
 */
export function checkRequirementFulfillment(
  requirement: Requirement,
  testResults: TestResults,
  artifacts: ImplementationArtifacts
): RequirementFulfillment {
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
      return {
        status: 'unfulfilled',
        evidence: [],
        confidence: 0,
      };
  }
}

/**
 * Generate accuracy report markdown
 */
export function generateAccuracyReport(report: AccuracyReport): string {
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
  report.details.forEach((detail) => {
    const icon = detail.status === 'fulfilled' ? '✅' : detail.status === 'partial' ? '⚠️' : '❌';
    markdown += `### ${icon} ${detail.id}: ${detail.description}\n\n`;
    markdown += `- **Status**: ${detail.status}\n`;
    markdown += `- **Confidence**: ${detail.confidence}%\n`;

    if (detail.evidence.length > 0) {
      markdown += `- **Evidence**:\n`;
      detail.evidence.forEach((evidence) => {
        markdown += `  - ${evidence}\n`;
      });
    }

    markdown += `\n`;
  });

  return markdown;
}

/**
 * Calculate implementation accuracy
 */
export async function calculateAccuracy(
  jiraKey: string,
  options: { testResultsPath?: string } = {}
): Promise<AccuracyReport> {
  const report: AccuracyReport = {
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
      documentation: { total: 0, fulfilled: 0 },
    },
    details: [],
    success: false,
    error: null,
  };

  try {
    // Step 1: Load ticket context
    const ticketContext = await loadTicketContext(jiraKey);

    if (!ticketContext) {
      throw new Error(`Ticket context not found for ${jiraKey}`);
    }

    // Step 2: Extract requirements from ticket
    const requirements = extractRequirements(ticketContext);
    report.totalRequirements = requirements.length;

    // Step 3: Load test results
    const testResults = await loadTestResults(options.testResultsPath);

    // Step 4: Load implementation artifacts
    const artifacts = await loadImplementationArtifacts(jiraKey);

    // Step 5: Check each requirement
    for (const requirement of requirements) {
      const fulfillment = checkRequirementFulfillment(requirement, testResults, artifacts);

      report.details.push({
        ...requirement,
        status: fulfillment.status,
        evidence: fulfillment.evidence,
        confidence: fulfillment.confidence,
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
    }

    // Step 6: Calculate accuracy percentage
    // Formula: (Fulfilled + 0.5 * Partial) / Total * 100
    const weightedFulfilled = report.fulfilledRequirements + report.partiallyFulfilled * 0.5;
    report.accuracyPercentage =
      report.totalRequirements > 0
        ? Math.round((weightedFulfilled / report.totalRequirements) * 100)
        : 0;

    report.success = true;

    return report;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
