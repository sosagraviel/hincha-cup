#!/usr/bin/env node

/**
 * Risk-Based Implementation Strategy Selector
 *
 * Assesses ticket risk level and selects appropriate implementation strategy:
 * - Low Risk (0-30): Direct implementation (no planning needed)
 * - Medium Risk (31-70): Plan-first approach (auto-generate plan)
 * - High Risk (71-100): Architect mode (detailed plan + post-grading)
 *
 * Risk Assessment based on:
 * - Impact: Breaking changes, security, compliance, database migrations
 * - Complexity: Lines of code, files affected, dependencies
 * - Uncertainty: Ambiguous requirements, new tech, edge cases
 *
 * Usage:
 *   node select-strategy.js --ticket JIRA-123
 *   node select-strategy.js --context /tmp/context_JIRA-123.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Strategy definitions
const STRATEGIES = {
  DIRECT: {
    name: 'direct',
    label: 'Direct Implementation',
    description: 'Implement directly without planning phase',
    riskRange: [0, 30],
    planningRequired: false,
    gradingRequired: false,
    reviewLevel: 'standard'
  },
  PLAN_FIRST: {
    name: 'plan_first',
    label: 'Plan-First Approach',
    description: 'Auto-generate implementation plan, then proceed',
    riskRange: [31, 70],
    planningRequired: true,
    gradingRequired: false,
    reviewLevel: 'detailed'
  },
  ARCHITECT: {
    name: 'architect',
    label: 'Architect Mode',
    description: 'Detailed plan + post-implementation quality grading',
    riskRange: [71, 100],
    planningRequired: true,
    gradingRequired: true,
    reviewLevel: 'comprehensive'
  }
};

/**
 * Select implementation strategy based on ticket risk
 *
 * @param {Object} options - Selection options
 * @param {string} options.ticketKey - Jira ticket key
 * @param {string} options.contextPath - Path to ticket context file
 * @param {string} options.projectPath - Project root path
 * @returns {Promise<Object>} Strategy selection result
 */
async function selectStrategy(options) {
  const {
    ticketKey,
    contextPath = `/tmp/context_${ticketKey}.md`,
    projectPath = process.cwd()
  } = options;

  console.log('🎯 Assessing ticket risk and selecting implementation strategy...');

  // Load ticket context
  const context = await loadTicketContext(contextPath);

  // Assess risk across three dimensions
  const impactScore = assessImpact(context);
  const complexityScore = assessComplexity(context, projectPath);
  const uncertaintyScore = assessUncertainty(context);

  // Calculate overall risk score (weighted average)
  const riskScore = Math.round(
    (impactScore * 0.4) + (complexityScore * 0.3) + (uncertaintyScore * 0.3)
  );

  // Select strategy based on risk score
  const strategy = selectStrategyByRisk(riskScore);

  // Generate detailed assessment
  const assessment = {
    timestamp: new Date().toISOString(),
    ticketKey,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    strategy: strategy.name,
    strategyLabel: strategy.label,
    breakdown: {
      impact: {
        score: impactScore,
        factors: getImpactFactors(context)
      },
      complexity: {
        score: complexityScore,
        factors: getComplexityFactors(context, projectPath)
      },
      uncertainty: {
        score: uncertaintyScore,
        factors: getUncertaintyFactors(context)
      }
    },
    recommendations: generateRecommendations(strategy, riskScore, context)
  };

  // Save assessment
  await saveAssessment(assessment, ticketKey, projectPath);

  return assessment;
}

/**
 * Load ticket context from markdown file
 */
async function loadTicketContext(contextPath) {
  try {
    const content = fs.readFileSync(contextPath, 'utf8');

    const context = {
      summary: extractSection(content, 'Summary'),
      description: extractSection(content, 'Description'),
      acceptanceCriteria: extractSection(content, 'Acceptance Criteria'),
      technicalRequirements: extractSection(content, 'Technical Requirements'),
      labels: extractLabels(content),
      type: extractType(content),
      priority: extractPriority(content)
    };

    return context;
  } catch (error) {
    console.error('❌ Could not load ticket context:', error.message);
    return {
      summary: '',
      description: '',
      acceptanceCriteria: '',
      technicalRequirements: '',
      labels: [],
      type: 'task',
      priority: 'medium'
    };
  }
}

/**
 * Extract section from markdown
 */
function extractSection(content, sectionName) {
  const regex = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Extract labels from context
 */
function extractLabels(content) {
  const labelMatch = content.match(/Labels:\s*(.+)/);
  return labelMatch ? labelMatch[1].split(',').map(l => l.trim().toLowerCase()) : [];
}

/**
 * Extract issue type
 */
function extractType(content) {
  const typeMatch = content.match(/Type:\s*(\w+)/i);
  return typeMatch ? typeMatch[1].toLowerCase() : 'task';
}

/**
 * Extract priority
 */
function extractPriority(content) {
  const priorityMatch = content.match(/Priority:\s*(\w+)/i);
  return priorityMatch ? priorityMatch[1].toLowerCase() : 'medium';
}

/**
 * Assess impact score (0-100)
 */
function assessImpact(context) {
  let score = 0;

  const { summary, description, labels, type, technicalRequirements } = context;
  const allText = `${summary} ${description} ${technicalRequirements}`.toLowerCase();

  // Breaking changes (+40)
  if (/breaking change|backward incompatible|major version/i.test(allText)) {
    score += 40;
  }

  // Security-related (+35)
  if (/security|authentication|authorization|vulnerability|exploit|xss|sql injection|csrf/i.test(allText) ||
      labels.includes('security')) {
    score += 35;
  }

  // Database migrations (+25)
  if (/database migration|schema change|alter table|drop column|drop table/i.test(allText)) {
    score += 25;
  }

  // Compliance/regulatory (+30)
  if (/compliance|gdpr|hipaa|pci-dss|regulatory|audit|legal/i.test(allText)) {
    score += 30;
  }

  // Production data changes (+25)
  if (/production data|data migration|backfill|seed data/i.test(allText)) {
    score += 25;
  }

  // API contract changes (+20)
  if (/api change|endpoint change|contract change|public api/i.test(allText)) {
    score += 20;
  }

  // Infrastructure changes (+15)
  if (/infrastructure|deployment|docker|kubernetes|ci\/cd|pipeline/i.test(allText)) {
    score += 15;
  }

  // Hotfix/urgent (+10)
  if (type === 'hotfix' || labels.includes('urgent') || labels.includes('critical')) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Get impact factors for reporting
 */
function getImpactFactors(context) {
  const factors = [];
  const allText = `${context.summary} ${context.description} ${context.technicalRequirements}`.toLowerCase();

  if (/breaking change/i.test(allText)) factors.push('Breaking changes');
  if (/security/i.test(allText)) factors.push('Security implications');
  if (/database migration/i.test(allText)) factors.push('Database migrations');
  if (/compliance/i.test(allText)) factors.push('Compliance requirements');
  if (/production data/i.test(allText)) factors.push('Production data changes');
  if (/api change/i.test(allText)) factors.push('API contract changes');
  if (/infrastructure/i.test(allText)) factors.push('Infrastructure changes');

  return factors.length > 0 ? factors : ['Standard impact'];
}

/**
 * Assess complexity score (0-100)
 */
function assessComplexity(context, projectPath) {
  let score = 0;

  const { description, technicalRequirements, acceptanceCriteria } = context;
  const allText = `${description} ${technicalRequirements} ${acceptanceCriteria}`;

  // Estimate lines of code from description
  const wordCount = allText.split(/\s+/).length;
  if (wordCount > 500) score += 30;
  else if (wordCount > 200) score += 20;
  else if (wordCount > 100) score += 10;

  // Multiple systems/services (+25)
  if (/frontend.*backend|multiple services|microservices|cross-service/i.test(allText)) {
    score += 25;
  }

  // New dependencies (+15)
  if (/new library|new package|npm install|pip install|add dependency/i.test(allText)) {
    score += 15;
  }

  // Multiple acceptance criteria (+10 per criterion, max 30)
  const criteriaCount = (acceptanceCriteria.match(/^[-*]\s/gm) || []).length;
  score += Math.min(30, criteriaCount * 5);

  // Complex algorithms (+20)
  if (/algorithm|optimization|performance|caching|rate limiting/i.test(allText)) {
    score += 20;
  }

  // Third-party integrations (+15)
  if (/third.?party|external api|integration|webhook|oauth/i.test(allText)) {
    score += 15;
  }

  // Real-time features (+15)
  if (/websocket|real.?time|streaming|sse|server.?sent events/i.test(allText)) {
    score += 15;
  }

  return Math.min(100, score);
}

/**
 * Get complexity factors for reporting
 */
function getComplexityFactors(context, projectPath) {
  const factors = [];
  const allText = `${context.description} ${context.technicalRequirements} ${context.acceptanceCriteria}`;

  const wordCount = allText.split(/\s+/).length;
  if (wordCount > 200) factors.push(`Large scope (${wordCount} words)`);

  if (/frontend.*backend/i.test(allText)) factors.push('Multiple systems');
  if (/new library/i.test(allText)) factors.push('New dependencies');

  const criteriaCount = (context.acceptanceCriteria.match(/^[-*]\s/gm) || []).length;
  if (criteriaCount > 5) factors.push(`Multiple criteria (${criteriaCount})`);

  if (/algorithm/i.test(allText)) factors.push('Complex algorithms');
  if (/third.?party/i.test(allText)) factors.push('Third-party integrations');
  if (/real.?time/i.test(allText)) factors.push('Real-time features');

  return factors.length > 0 ? factors : ['Standard complexity'];
}

/**
 * Assess uncertainty score (0-100)
 */
function assessUncertainty(context) {
  let score = 0;

  const { description, technicalRequirements, acceptanceCriteria } = context;
  const allText = `${description} ${technicalRequirements} ${acceptanceCriteria}`;

  // Ambiguous requirements (+30)
  if (/tbd|to be determined|unclear|not sure|investigate|explore|research/i.test(allText)) {
    score += 30;
  }

  // New technology/unfamiliar stack (+25)
  if (/new technology|first time|never used|poc|proof of concept|experiment/i.test(allText)) {
    score += 25;
  }

  // Vague acceptance criteria (+20)
  if (acceptanceCriteria.length < 50 || /improve|enhance|optimize|better/i.test(acceptanceCriteria)) {
    score += 20;
  }

  // Edge cases mentioned (+15)
  if (/edge case|corner case|special case|exception|rare scenario/i.test(allText)) {
    score += 15;
  }

  // Multiple possible approaches (+15)
  if (/multiple approaches|several options|different ways|alternative solutions/i.test(allText)) {
    score += 15;
  }

  // Unknown dependencies (+10)
  if (/depends on|blocked by|waiting for|requires clarification/i.test(allText)) {
    score += 10;
  }

  // Performance requirements without metrics (+10)
  if (/fast|performant|efficient|optimized/i.test(allText) && !/\d+ms|\d+s|latency/i.test(allText)) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Get uncertainty factors for reporting
 */
function getUncertaintyFactors(context) {
  const factors = [];
  const allText = `${context.description} ${context.technicalRequirements} ${context.acceptanceCriteria}`;

  if (/tbd|unclear/i.test(allText)) factors.push('Ambiguous requirements');
  if (/new technology/i.test(allText)) factors.push('Unfamiliar technology');
  if (context.acceptanceCriteria.length < 50) factors.push('Vague acceptance criteria');
  if (/edge case/i.test(allText)) factors.push('Edge cases mentioned');
  if (/multiple approaches/i.test(allText)) factors.push('Multiple possible approaches');
  if (/depends on/i.test(allText)) factors.push('Unknown dependencies');
  if (/fast|performant/i.test(allText) && !/\d+ms/i.test(allText)) factors.push('Unclear performance requirements');

  return factors.length > 0 ? factors : ['Requirements clear'];
}

/**
 * Select strategy based on risk score
 */
function selectStrategyByRisk(riskScore) {
  if (riskScore <= STRATEGIES.DIRECT.riskRange[1]) {
    return STRATEGIES.DIRECT;
  } else if (riskScore <= STRATEGIES.PLAN_FIRST.riskRange[1]) {
    return STRATEGIES.PLAN_FIRST;
  } else {
    return STRATEGIES.ARCHITECT;
  }
}

/**
 * Get risk level label
 */
function getRiskLevel(riskScore) {
  if (riskScore <= 30) return 'low';
  if (riskScore <= 70) return 'medium';
  return 'high';
}

/**
 * Generate recommendations based on strategy
 */
function generateRecommendations(strategy, riskScore, context) {
  const recommendations = [];

  if (strategy.name === 'direct') {
    recommendations.push('Proceed with direct implementation');
    recommendations.push('Standard test coverage required (unit + integration)');
    recommendations.push('Code review recommended before merge');
  } else if (strategy.name === 'plan_first') {
    recommendations.push('Generate implementation plan automatically');
    recommendations.push('Comprehensive test coverage required (unit + integration + E2E)');
    recommendations.push('Detailed code review required');
    recommendations.push('Consider documenting architectural decisions');
  } else {
    recommendations.push('Use architect mode with detailed planning');
    recommendations.push('Post-implementation quality grading required (≥80/100 to pass)');
    recommendations.push('Complete test coverage mandatory (unit + integration + E2E)');
    recommendations.push('Comprehensive code review required');
    recommendations.push('Document all architectural decisions and assumptions');
    recommendations.push('Security review recommended if applicable');
  }

  // Add risk-specific recommendations
  if (riskScore > 70) {
    recommendations.push('⚠️  Consider breaking into smaller tickets if possible');
    recommendations.push('⚠️  Review with senior engineer before starting');
  }

  return recommendations;
}

/**
 * Save assessment to file
 */
async function saveAssessment(assessment, ticketKey, projectPath) {
  const assessmentsDir = path.join(projectPath, '.claude', 'risk-assessments');
  fs.mkdirSync(assessmentsDir, { recursive: true });

  const assessmentPath = path.join(assessmentsDir, `${ticketKey}-assessment.md`);

  const riskEmoji = {
    low: '✓',
    medium: 'ℹ️',
    high: '⚠️'
  }[assessment.riskLevel];

  const markdown = `# Risk Assessment - ${ticketKey}

**Generated**: ${assessment.timestamp}
**Risk Score**: ${assessment.riskScore}/100 ${riskEmoji}
**Risk Level**: ${assessment.riskLevel.toUpperCase()}
**Selected Strategy**: ${assessment.strategyLabel}

---

## Risk Breakdown

### Impact (${assessment.breakdown.impact.score}/100)
${assessment.breakdown.impact.factors.map(f => `- ${f}`).join('\n')}

### Complexity (${assessment.breakdown.complexity.score}/100)
${assessment.breakdown.complexity.factors.map(f => `- ${f}`).join('\n')}

### Uncertainty (${assessment.breakdown.uncertainty.score}/100)
${assessment.breakdown.uncertainty.factors.map(f => `- ${f}`).join('\n')}

---

## Implementation Strategy: ${assessment.strategyLabel}

**Planning Required**: ${STRATEGIES[assessment.strategy.toUpperCase()].planningRequired ? 'Yes' : 'No'}
**Grading Required**: ${STRATEGIES[assessment.strategy.toUpperCase()].gradingRequired ? 'Yes' : 'No'}
**Review Level**: ${STRATEGIES[assessment.strategy.toUpperCase()].reviewLevel}

---

## Recommendations

${assessment.recommendations.map(r => `- ${r}`).join('\n')}

---

## Strategy Decision

Based on the risk score of ${assessment.riskScore}/100, the **${assessment.strategyLabel}** strategy was selected.

${assessment.strategy === 'direct' ?
  'This ticket is low-risk and can be implemented directly without a planning phase.' :
  assessment.strategy === 'plan_first' ?
  'This ticket requires planning before implementation. An implementation plan will be auto-generated.' :
  'This ticket is high-risk and requires architect mode with detailed planning and post-implementation grading.'
}
`;

  fs.writeFileSync(assessmentPath, markdown);

  // Also save JSON for programmatic access
  const jsonPath = path.join(assessmentsDir, `${ticketKey}-assessment.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(assessment, null, 2));

  console.log(`📝 Risk assessment saved to: ${assessmentPath}`);
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'ticket') {
      options.ticketKey = value;
    } else if (key === 'context') {
      options.contextPath = value;
    }
  }

  if (!options.ticketKey) {
    console.error('Usage: node select-strategy.js --ticket JIRA-123 [--context /tmp/context_JIRA-123.md]');
    process.exit(1);
  }

  selectStrategy(options)
    .then(assessment => {
      console.log('\n' + '='.repeat(60));
      console.log('Risk Assessment & Strategy Selection');
      console.log('='.repeat(60));
      console.log(`Risk Score: ${assessment.riskScore}/100`);
      console.log(`Risk Level: ${assessment.riskLevel.toUpperCase()}`);
      console.log(`Selected Strategy: ${assessment.strategyLabel}`);
      console.log('\nBreakdown:');
      console.log(`  - Impact: ${assessment.breakdown.impact.score}/100`);
      console.log(`  - Complexity: ${assessment.breakdown.complexity.score}/100`);
      console.log(`  - Uncertainty: ${assessment.breakdown.uncertainty.score}/100`);

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error selecting strategy:', error);
      process.exit(1);
    });
}

module.exports = {
  selectStrategy,
  STRATEGIES,
  assessImpact,
  assessComplexity,
  assessUncertainty
};
