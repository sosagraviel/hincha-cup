#!/usr/bin/env node

/**
 * Ticket Validator
 *
 * Validates canonical tickets for completeness and INVEST criteria.
 * Identifies gaps that need to be filled.
 *
 * @module ticket-validator
 */

/**
 * Validate canonical ticket for completeness
 *
 * @param {Object} ticket - Canonical ticket object
 * @returns {Object} Validation result with gaps, warnings, and INVEST scores
 */
function validateTicket(ticket) {
  const gaps = [];
  const warnings = [];

  // Required fields validation
  validateRequiredFields(ticket, gaps);

  // Content validation
  validateContent(ticket, gaps, warnings);

  // INVEST validation
  const investResult = validateInvest(ticket);

  // Calculate completeness score
  const completenessScore = calculateCompletenessScore(ticket, gaps);

  return {
    isComplete: gaps.length === 0,
    gaps,
    warnings,
    invest: investResult,
    completenessScore,
    summary: generateValidationSummary(gaps, warnings, investResult, completenessScore)
  };
}

/**
 * Validate required fields
 */
function validateRequiredFields(ticket, gaps) {
  // User Story
  if (!ticket.userStory?.role) {
    gaps.push({
      field: 'userStory.role',
      category: 'user_story',
      message: 'User role not specified',
      priority: 'high',
      example: 'admin, project manager, end user'
    });
  }

  if (!ticket.userStory?.goal) {
    gaps.push({
      field: 'userStory.goal',
      category: 'user_story',
      message: 'User goal not specified',
      priority: 'high',
      example: 'export user reports, reset password, view dashboard'
    });
  }

  if (!ticket.userStory?.benefit) {
    gaps.push({
      field: 'userStory.benefit',
      category: 'user_story',
      message: 'Business value not specified',
      priority: 'high',
      example: 'improve compliance, reduce support tickets, increase productivity'
    });
  }

  // Stakeholders
  if (!ticket.stakeholders || ticket.stakeholders.length === 0) {
    gaps.push({
      field: 'stakeholders',
      category: 'stakeholders',
      message: 'No stakeholders identified',
      priority: 'high',
      example: 'Product Owner: Jane Doe, Tech Lead: John Smith'
    });
  }

  // Success Criteria
  if (!ticket.successCriteria || ticket.successCriteria.length === 0) {
    gaps.push({
      field: 'successCriteria',
      category: 'success_criteria',
      message: 'No success criteria defined',
      priority: 'high',
      example: 'Users can export reports in under 5 seconds, 100% of exports complete successfully'
    });
  }

  // Acceptance Criteria (BDD scenarios)
  if (!ticket.acceptanceCriteria || ticket.acceptanceCriteria.length < 3) {
    gaps.push({
      field: 'acceptanceCriteria',
      category: 'acceptance_criteria',
      message: `Need at least 3 BDD scenarios (currently: ${ticket.acceptanceCriteria?.length || 0})`,
      priority: 'high',
      example: 'Happy path scenario, edge case scenario, error scenario'
    });
  }

  // Technical Context
  if (!ticket.technicalContext?.proposedChanges || ticket.technicalContext.proposedChanges.length === 0) {
    gaps.push({
      field: 'technicalContext.proposedChanges',
      category: 'technical_context',
      message: 'No proposed changes specified',
      priority: 'high',
      example: 'Add new API endpoint, modify database schema, create new React component'
    });
  }

  // Definition of Done - Testing
  if (!ticket.definitionOfDone?.testing || ticket.definitionOfDone.testing.length === 0) {
    gaps.push({
      field: 'definitionOfDone.testing',
      category: 'definition_of_done',
      message: 'No testing requirements specified',
      priority: 'medium',
      example: 'Unit test coverage >= 80%, E2E tests for all scenarios'
    });
  }
}

/**
 * Validate content quality
 */
function validateContent(ticket, gaps, warnings) {
  // Check for placeholder text
  const placeholders = ['[NEEDS_CLARIFICATION]', '[TBD]', '[TODO]', '[PLACEHOLDER]'];
  const content = JSON.stringify(ticket);

  placeholders.forEach(placeholder => {
    if (content.includes(placeholder)) {
      warnings.push({
        type: 'placeholder',
        message: `Found placeholder text: ${placeholder}`,
        severity: 'medium'
      });
    }
  });

  // Check BDD scenario quality
  if (ticket.acceptanceCriteria) {
    ticket.acceptanceCriteria.forEach((scenario, i) => {
      if (!scenario.given || !scenario.when || !scenario.then) {
        gaps.push({
          field: `acceptanceCriteria[${i}]`,
          category: 'acceptance_criteria',
          message: `Scenario ${i + 1} incomplete (missing Given/When/Then)`,
          priority: 'high'
        });
      }

      // Check for vague language
      const vague = ['some', 'various', 'multiple', 'several'];
      const scenarioText = `${scenario.given} ${scenario.when} ${scenario.then}`.toLowerCase();

      vague.forEach(word => {
        if (scenarioText.includes(word)) {
          warnings.push({
            type: 'vague_scenario',
            message: `Scenario ${i + 1} uses vague language: "${word}". Use concrete examples.`,
            severity: 'low'
          });
        }
      });
    });
  }

  // Check out of scope
  if (!ticket.outOfScope || ticket.outOfScope.length === 0) {
    warnings.push({
      type: 'missing_scope_boundary',
      message: 'Out of scope section empty. Consider clarifying boundaries.',
      severity: 'low'
    });
  }

  // Check metrics
  if (!ticket.metrics) {
    warnings.push({
      type: 'missing_metrics',
      message: 'No metrics specified for measuring success',
      severity: 'medium'
    });
  }
}

/**
 * Validate INVEST criteria
 */
function validateInvest(ticket) {
  return {
    independent: checkIndependent(ticket),
    negotiable: checkNegotiable(ticket),
    valuable: checkValuable(ticket),
    estimable: checkEstimable(ticket),
    small: checkSmall(ticket),
    testable: checkTestable(ticket)
  };
}

/**
 * Independent: Can be implemented without waiting for other tickets
 */
function checkIndependent(ticket) {
  const blocking = ticket.dependencies?.blocking || [];

  return {
    passed: blocking.length === 0,
    score: blocking.length === 0 ? 100 : Math.max(0, 100 - blocking.length * 20),
    message: blocking.length === 0
      ? 'No blocking dependencies'
      : `Has ${blocking.length} blocking dependencies: ${blocking.join(', ')}`,
    recommendation: blocking.length > 0
      ? 'Consider implementing blocking tickets first or removing dependencies'
      : null
  };
}

/**
 * Negotiable: Implementation approach is flexible
 */
function checkNegotiable(ticket) {
  const hasArchitectureDecisions = ticket.technicalContext?.architectureDecisions?.length > 0;
  const hasConstraints = ticket.technicalContext?.constraints?.length > 0;

  // If no architecture decisions specified, it's negotiable
  const score = hasArchitectureDecisions ? 70 : 100;

  return {
    passed: true,
    score,
    message: hasArchitectureDecisions
      ? 'Some architecture decisions pre-determined, but approach still flexible'
      : 'Implementation approach is flexible',
    recommendation: null
  };
}

/**
 * Valuable: Delivers user/business value
 */
function checkValuable(ticket) {
  const hasBenefit = !!ticket.userStory?.benefit;
  const hasSuccessCriteria = ticket.successCriteria?.length > 0;
  const hasMetrics = !!ticket.metrics;

  const score = (hasBenefit ? 40 : 0) + (hasSuccessCriteria ? 40 : 0) + (hasMetrics ? 20 : 0);

  return {
    passed: score >= 60,
    score,
    message: score >= 80
      ? 'Clear business value with measurable outcomes'
      : score >= 60
      ? 'Business value defined, could use more metrics'
      : 'Business value not clearly articulated',
    recommendation: score < 60
      ? 'Add clear business benefit and success metrics'
      : null
  };
}

/**
 * Estimable: Enough detail to estimate effort
 */
function checkEstimable(ticket) {
  const hasProposedChanges = ticket.technicalContext?.proposedChanges?.length > 0;
  const hasAcceptanceCriteria = ticket.acceptanceCriteria?.length >= 3;
  const hasEdgeCases = ticket.edgeCases?.length > 0;
  const hasTechnicalContext = hasProposedChanges;

  const score = (hasProposedChanges ? 40 : 0) +
                (hasAcceptanceCriteria ? 30 : 0) +
                (hasEdgeCases ? 15 : 0) +
                (hasTechnicalContext ? 15 : 0);

  return {
    passed: score >= 60,
    score,
    message: score >= 80
      ? 'Sufficient detail for accurate estimation'
      : score >= 60
      ? 'Basic details present, some unknowns may exist'
      : 'Insufficient detail for estimation',
    recommendation: score < 60
      ? 'Add technical context, acceptance criteria, and edge cases'
      : null
  };
}

/**
 * Small: Can be completed in 1-5 days
 */
function checkSmall(ticket) {
  // Estimate size based on complexity indicators
  const scenarioCount = ticket.acceptanceCriteria?.length || 0;
  const proposedChangesCount = ticket.technicalContext?.proposedChanges?.length || 0;
  const integrationPoints = ticket.technicalContext?.integrationPoints?.length || 0;

  const complexityScore = scenarioCount + (proposedChangesCount * 2) + (integrationPoints * 3);

  // Thresholds (empirical, adjust based on team velocity)
  const isSmall = complexityScore <= 20;
  const isMedium = complexityScore <= 40;

  const estimatedDays = Math.ceil(complexityScore / 5);

  return {
    passed: estimatedDays <= 5,
    score: isSmall ? 100 : isMedium ? 70 : Math.max(0, 100 - (estimatedDays - 5) * 10),
    message: estimatedDays <= 3
      ? `Small ticket (estimated: ${estimatedDays} days)`
      : estimatedDays <= 5
      ? `Medium ticket (estimated: ${estimatedDays} days)`
      : `Large ticket (estimated: ${estimatedDays}+ days) - consider splitting`,
    recommendation: estimatedDays > 5
      ? generateSplitRecommendation(ticket, estimatedDays)
      : null,
    estimatedDays
  };
}

/**
 * Testable: Acceptance criteria are verifiable
 */
function checkTestable(ticket) {
  const scenarios = ticket.acceptanceCriteria || [];
  const hasBddScenarios = scenarios.length >= 3;
  const hasDefinitionOfDone = ticket.definitionOfDone?.testing?.length > 0;

  const allScenariosComplete = scenarios.every(s => s.given && s.when && s.then);

  const score = (hasBddScenarios ? 50 : 0) +
                (hasDefinitionOfDone ? 30 : 0) +
                (allScenariosComplete ? 20 : 0);

  return {
    passed: score >= 70,
    score,
    message: score >= 80
      ? 'All acceptance criteria are verifiable with automated tests'
      : score >= 70
      ? 'Acceptance criteria testable, some details could be clearer'
      : 'Acceptance criteria not sufficiently testable',
    recommendation: score < 70
      ? 'Add concrete BDD scenarios with Given-When-Then format'
      : null
  };
}

/**
 * Generate split recommendation for large tickets
 */
function generateSplitRecommendation(ticket, estimatedDays) {
  const scenarios = ticket.acceptanceCriteria || [];

  if (scenarios.length >= 6) {
    const split1 = scenarios.slice(0, Math.ceil(scenarios.length / 2));
    const split2 = scenarios.slice(Math.ceil(scenarios.length / 2));

    return `Consider splitting into 2 tickets:\n` +
           `  - Ticket 1: ${split1.map(s => s.scenario).join(', ')} (~${Math.ceil(estimatedDays / 2)} days)\n` +
           `  - Ticket 2: ${split2.map(s => s.scenario).join(', ')} (~${Math.floor(estimatedDays / 2)} days)`;
  }

  return 'Consider splitting by functional areas or user flows';
}

/**
 * Calculate overall completeness score
 */
function calculateCompletenessScore(ticket, gaps) {
  const totalFields = 10; // Key required fields
  const missingFields = gaps.filter(g => g.priority === 'high').length;

  return Math.max(0, Math.round((totalFields - missingFields) / totalFields * 100));
}

/**
 * Generate validation summary
 */
function generateValidationSummary(gaps, warnings, investResult, completenessScore) {
  const investScores = Object.values(investResult).map(r => r.score);
  const avgInvestScore = Math.round(investScores.reduce((a, b) => a + b, 0) / investScores.length);

  const passedInvest = Object.values(investResult).filter(r => r.passed).length;
  const totalInvest = Object.values(investResult).length;

  return {
    completenessScore,
    investScore: avgInvestScore,
    investPassed: `${passedInvest}/${totalInvest}`,
    criticalGaps: gaps.filter(g => g.priority === 'high').length,
    totalGaps: gaps.length,
    warnings: warnings.length,
    readyForImplementation: gaps.length === 0 && passedInvest >= 5
  };
}

/**
 * Get gaps by category
 */
function getGapsByCategory(gaps) {
  const byCategory = {};

  gaps.forEach(gap => {
    if (!byCategory[gap.category]) {
      byCategory[gap.category] = [];
    }
    byCategory[gap.category].push(gap);
  });

  return byCategory;
}

module.exports = {
  validateTicket,
  getGapsByCategory
};

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const canonicalPath = process.argv[2];

  if (!canonicalPath) {
    console.error('Usage: node ticket-validator.js <canonical-json-path>');
    process.exit(1);
  }

  try {
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));
    const validation = validateTicket(canonical);

    console.log('\n=== TICKET VALIDATION REPORT ===\n');
    console.log(`Completeness: ${validation.completenessScore}%`);
    console.log(`INVEST Score: ${validation.summary.investScore}% (${validation.summary.investPassed} passed)`);
    console.log(`Gaps: ${validation.summary.criticalGaps} critical, ${validation.gaps.length} total`);
    console.log(`Warnings: ${validation.warnings.length}`);
    console.log(`Ready for Implementation: ${validation.summary.readyForImplementation ? '✅ Yes' : '❌ No'}`);

    if (validation.gaps.length > 0) {
      console.log('\n=== GAPS TO FILL ===\n');
      const byCategory = getGapsByCategory(validation.gaps);

      Object.entries(byCategory).forEach(([category, categoryGaps]) => {
        console.log(`\n${category.toUpperCase().replace(/_/g, ' ')}:`);
        categoryGaps.forEach(gap => {
          console.log(`  ❌ ${gap.message}`);
          if (gap.example) {
            console.log(`     Example: ${gap.example}`);
          }
        });
      });
    }

    if (validation.warnings.length > 0) {
      console.log('\n=== WARNINGS ===\n');
      validation.warnings.forEach(warning => {
        console.log(`  ⚠️  ${warning.message}`);
      });
    }

    console.log('\n=== INVEST CRITERIA ===\n');
    Object.entries(validation.invest).forEach(([criterion, result]) => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${criterion.toUpperCase()} (${result.score}%): ${result.message}`);
      if (result.recommendation) {
        console.log(`   💡 ${result.recommendation}`);
      }
    });

    process.exit(validation.summary.readyForImplementation ? 0 : 1);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
