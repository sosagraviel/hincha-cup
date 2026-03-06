#!/usr/bin/env node

/**
 * Autonomous Decision Framework
 *
 * Makes implementation decisions without user input by evaluating options based on:
 * - Project patterns (detected from codebase)
 * - Tech stack best practices
 * - Risk assessment
 * - Ticket requirements alignment
 *
 * All decisions are logged with rationale for transparency and review.
 *
 * Usage:
 *   node autonomous-decision.js --type library_selection --context '{"purpose":"OAuth","options":["passport","next-auth"]}'
 *   node autonomous-decision.js --type architecture_pattern --ticket JIRA-123
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Decision types supported
const DECISION_TYPES = {
  LIBRARY_SELECTION: 'library_selection',
  ARCHITECTURE_PATTERN: 'architecture_pattern',
  DATABASE_SCHEMA: 'database_schema',
  API_DESIGN: 'api_design',
  STATE_MANAGEMENT: 'state_management',
  TEST_STRATEGY: 'test_strategy',
  ERROR_HANDLING: 'error_handling',
  AUTHENTICATION: 'authentication',
  FILE_STRUCTURE: 'file_structure',
  DEPLOYMENT: 'deployment'
};

// Risk levels
const RISK_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * Main decision-making function
 *
 * @param {Object} params - Decision parameters
 * @param {string} params.type - Decision type (from DECISION_TYPES)
 * @param {Object} params.context - Decision context (purpose, requirements, constraints)
 * @param {Array<string>} params.options - Available options to choose from
 * @param {string} params.projectPath - Path to project root
 * @param {string} params.ticketKey - Jira ticket key (optional)
 * @returns {Promise<Object>} Decision result
 */
async function makeDecision(params) {
  const {
    type,
    context = {},
    options = [],
    projectPath = process.cwd(),
    ticketKey = null
  } = params;

  console.log(`Making autonomous decision: ${type}`);
  console.log(`Options: ${options.join(', ')}`);

  // Step 1: Analyze project patterns
  const projectPatterns = await analyzeProjectPatterns(projectPath);
  console.log(`Detected tech stack: ${projectPatterns.stack.join(', ')}`);

  // Step 2: Load best practices for detected stack
  const bestPractices = loadBestPractices(projectPatterns.stack, type);

  // Step 3: Evaluate each option
  const evaluatedOptions = await Promise.all(
    options.map(option => evaluateOption(option, {
      type,
      context,
      projectPatterns,
      bestPractices,
      projectPath
    }))
  );

  // Step 4: Select best option
  const selectedOption = selectBestOption(evaluatedOptions);

  // Step 5: Assess risk level
  const riskLevel = assessRiskLevel(selectedOption, context, projectPatterns);

  // Step 6: Generate decision rationale
  const rationale = generateRationale(selectedOption, evaluatedOptions, bestPractices);

  // Step 7: Create decision record
  const decision = {
    timestamp: new Date().toISOString(),
    type,
    question: context.question || `Select ${type.replace(/_/g, ' ')}`,
    optionsConsidered: options,
    selectedOption: selectedOption.name,
    rationale,
    riskLevel,
    confidence: selectedOption.score,
    validationCriteria: generateValidationCriteria(selectedOption, context),
    metadata: {
      projectStack: projectPatterns.stack,
      ticketKey,
      context
    }
  };

  // Step 8: Log decision
  if (ticketKey) {
    await logDecision(decision, ticketKey, projectPath);
  }

  return decision;
}

/**
 * Analyze project patterns to understand tech stack and existing conventions
 */
async function analyzeProjectPatterns(projectPath) {
  const patterns = {
    stack: [],
    frameworks: [],
    patterns: {},
    conventions: {}
  };

  // Detect package.json dependencies
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {}
    };

    // Detect backend framework
    if (allDeps['@nestjs/core']) patterns.stack.push('NestJS');
    else if (allDeps['express']) patterns.stack.push('Express');
    else if (allDeps['fastify']) patterns.stack.push('Fastify');
    else if (allDeps['next']) patterns.stack.push('Next.js');

    // Detect frontend framework
    if (allDeps['react']) patterns.stack.push('React');
    else if (allDeps['vue']) patterns.stack.push('Vue');
    else if (allDeps['@angular/core']) patterns.stack.push('Angular');

    // Detect ORM/Database
    if (allDeps['typeorm']) patterns.stack.push('TypeORM');
    else if (allDeps['prisma']) patterns.stack.push('Prisma');
    else if (allDeps['sequelize']) patterns.stack.push('Sequelize');

    // Detect testing framework
    if (allDeps['jest']) patterns.stack.push('Jest');
    else if (allDeps['vitest']) patterns.stack.push('Vitest');
    if (allDeps['@playwright/test']) patterns.stack.push('Playwright');
    else if (allDeps['cypress']) patterns.stack.push('Cypress');

    // Detect state management
    if (allDeps['redux']) patterns.frameworks.push('Redux');
    else if (allDeps['zustand']) patterns.frameworks.push('Zustand');
    else if (allDeps['@tanstack/react-query']) patterns.frameworks.push('TanStack Query');

    // Detect authentication
    if (allDeps['passport']) patterns.frameworks.push('Passport');
    else if (allDeps['next-auth']) patterns.frameworks.push('NextAuth');
    else if (allDeps['@auth0/auth0-react']) patterns.frameworks.push('Auth0');
  }

  // Detect Python tech stack
  const requirementsTxtPath = path.join(projectPath, 'requirements.txt');
  const pyprojectTomlPath = path.join(projectPath, 'pyproject.toml');

  if (fs.existsSync(requirementsTxtPath) || fs.existsSync(pyprojectTomlPath)) {
    patterns.stack.push('Python');

    let requirements = '';
    if (fs.existsSync(requirementsTxtPath)) {
      requirements = fs.readFileSync(requirementsTxtPath, 'utf8');
    }

    if (requirements.includes('django')) patterns.stack.push('Django');
    else if (requirements.includes('fastapi')) patterns.stack.push('FastAPI');
    else if (requirements.includes('flask')) patterns.stack.push('Flask');

    if (requirements.includes('pytest')) patterns.stack.push('pytest');
    if (requirements.includes('sqlalchemy')) patterns.stack.push('SQLAlchemy');
  }

  // Detect project conventions by analyzing existing code
  patterns.conventions = await detectConventions(projectPath, patterns.stack);

  return patterns;
}

/**
 * Detect code conventions from existing codebase
 */
async function detectConventions(projectPath, stack) {
  const conventions = {
    architecturePattern: null,
    namingConvention: null,
    fileStructure: null,
    errorHandlingPattern: null
  };

  try {
    // Detect architecture pattern (for backend)
    if (stack.includes('NestJS') || stack.includes('Express')) {
      // Check if repository pattern is used
      const result = execSync(
        `find ${projectPath} -type f -name "*repository.ts" -o -name "*repository.js" | head -1`,
        { encoding: 'utf8' }
      ).trim();

      if (result) {
        conventions.architecturePattern = 'Repository Pattern';
      } else {
        conventions.architecturePattern = 'Service Pattern';
      }
    }

    // Detect naming convention for React components
    if (stack.includes('React')) {
      const result = execSync(
        `find ${projectPath}/src -type f -name "*.tsx" -o -name "*.jsx" | head -5`,
        { encoding: 'utf8' }
      ).trim();

      const files = result.split('\n').filter(Boolean);
      const pascalCaseCount = files.filter(f => /[A-Z][a-z]+/.test(path.basename(f))).length;
      const kebabCaseCount = files.filter(f => /-/.test(path.basename(f))).length;

      if (pascalCaseCount > kebabCaseCount) {
        conventions.namingConvention = 'PascalCase';
      } else {
        conventions.namingConvention = 'kebab-case';
      }
    }

    // Detect error handling pattern
    const errorFiles = execSync(
      `grep -r "class.*Error extends" ${projectPath}/src --include="*.ts" --include="*.js" | head -1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (errorFiles) {
      conventions.errorHandlingPattern = 'Custom Error Classes';
    } else {
      conventions.errorHandlingPattern = 'Standard Error Objects';
    }
  } catch (error) {
    // Ignore errors from grep/find (no matches)
  }

  return conventions;
}

/**
 * Load best practices for given tech stack and decision type
 */
function loadBestPractices(stack, decisionType) {
  const practices = {
    criteria: [],
    recommendations: {},
    antiPatterns: []
  };

  // Library Selection Best Practices
  if (decisionType === DECISION_TYPES.LIBRARY_SELECTION) {
    practices.criteria = [
      'Active maintenance (recent commits)',
      'Large community (GitHub stars, npm downloads)',
      'Good documentation',
      'TypeScript support',
      'Compatible with current dependencies',
      'Battle-tested (production usage)',
      'Security track record'
    ];

    // Stack-specific recommendations
    if (stack.includes('NestJS')) {
      practices.recommendations.oauth = ['@nestjs/passport', 'passport'];
      practices.recommendations.validation = ['class-validator', 'joi'];
      practices.recommendations.caching = ['@nestjs/cache-manager', 'cache-manager'];
    }

    if (stack.includes('React')) {
      practices.recommendations.stateManagement = ['@tanstack/react-query', 'zustand', 'redux'];
      practices.recommendations.forms = ['react-hook-form', 'formik'];
      practices.recommendations.routing = ['@tanstack/react-router', 'react-router'];
    }
  }

  // Architecture Pattern Best Practices
  if (decisionType === DECISION_TYPES.ARCHITECTURE_PATTERN) {
    practices.criteria = [
      'Separation of concerns',
      'Testability',
      'Maintainability',
      'Scalability',
      'Team familiarity'
    ];

    if (stack.includes('NestJS')) {
      practices.recommendations.backend = ['Repository Pattern', 'Service Layer', 'CQRS'];
    }

    if (stack.includes('React')) {
      practices.recommendations.frontend = ['Atomic Design', 'Feature-based', 'Domain-driven'];
    }
  }

  // Database Schema Best Practices
  if (decisionType === DECISION_TYPES.DATABASE_SCHEMA) {
    practices.criteria = [
      'Data integrity',
      'Performance',
      'Backward compatibility',
      'Migration safety'
    ];

    if (stack.includes('TypeORM')) {
      practices.recommendations.migrations = ['Always use migrations', 'Never use sync in production'];
      practices.antiPatterns = ['synchronize: true in production', 'Direct schema manipulation'];
    }
  }

  return practices;
}

/**
 * Evaluate a single option based on multiple criteria
 */
async function evaluateOption(option, evaluationContext) {
  const { type, context, projectPatterns, bestPractices, projectPath } = evaluationContext;

  const evaluation = {
    name: option,
    score: 0,
    criteria: {},
    pros: [],
    cons: [],
    compatibilityIssues: []
  };

  // Score based on best practices alignment
  if (bestPractices.recommendations[context.purpose]) {
    const recommended = bestPractices.recommendations[context.purpose];
    if (recommended.includes(option)) {
      evaluation.score += 30;
      evaluation.pros.push('Recommended for this tech stack');
    }
  }

  // Check if already used in project (prefer consistency)
  const isAlreadyUsed = await checkIfLibraryUsed(option, projectPath);
  if (isAlreadyUsed) {
    evaluation.score += 25;
    evaluation.pros.push('Already used in project (consistency)');
  }

  // Check npm popularity and maintenance (for library selection)
  if (type === DECISION_TYPES.LIBRARY_SELECTION) {
    try {
      const npmInfo = await getNpmInfo(option);

      // Weekly downloads
      if (npmInfo.downloads > 1000000) {
        evaluation.score += 20;
        evaluation.pros.push(`Very popular (${(npmInfo.downloads / 1000000).toFixed(1)}M weekly downloads)`);
      } else if (npmInfo.downloads > 100000) {
        evaluation.score += 15;
        evaluation.pros.push(`Popular (${(npmInfo.downloads / 1000).toFixed(0)}K weekly downloads)`);
      } else if (npmInfo.downloads < 10000) {
        evaluation.cons.push('Low download count (< 10K weekly)');
      }

      // Last publish date (maintenance)
      const daysSinceUpdate = (Date.now() - new Date(npmInfo.lastPublish)) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 90) {
        evaluation.score += 15;
        evaluation.pros.push('Recently updated (< 3 months)');
      } else if (daysSinceUpdate > 365) {
        evaluation.score -= 10;
        evaluation.cons.push('Not recently updated (> 1 year)');
      }

      // TypeScript support
      if (npmInfo.hasTypes) {
        evaluation.score += 10;
        evaluation.pros.push('TypeScript support included');
      } else {
        evaluation.cons.push('No built-in TypeScript support');
      }

      evaluation.criteria.popularity = npmInfo.downloads;
      evaluation.criteria.maintenance = daysSinceUpdate;
      evaluation.criteria.typeScript = npmInfo.hasTypes;
    } catch (error) {
      console.warn(`Could not fetch npm info for ${option}:`, error.message);
    }
  }

  // Check compatibility with existing dependencies
  const compatibility = await checkCompatibility(option, projectPath, type);
  if (compatibility.compatible) {
    evaluation.score += 15;
    evaluation.pros.push('Compatible with existing dependencies');
  } else {
    evaluation.score -= 20;
    evaluation.cons.push('Potential compatibility issues');
    evaluation.compatibilityIssues = compatibility.issues;
  }

  // Normalize score to 0-100
  evaluation.score = Math.max(0, Math.min(100, evaluation.score));

  return evaluation;
}

/**
 * Check if a library is already used in the project
 */
async function checkIfLibraryUsed(libraryName, projectPath) {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return false;

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {}
    };

    return libraryName in allDeps;
  } catch (error) {
    return false;
  }
}

/**
 * Get npm package information
 */
async function getNpmInfo(packageName) {
  try {
    const result = execSync(`npm view ${packageName} --json`, { encoding: 'utf8' });
    const info = JSON.parse(result);

    // Get weekly downloads
    const downloadsResult = execSync(
      `npm view ${packageName} dist.tarball | xargs -I {} curl -s https://api.npmjs.org/downloads/point/last-week/${packageName}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    let downloads = 0;
    try {
      const downloadsData = JSON.parse(downloadsResult);
      downloads = downloadsData.downloads || 0;
    } catch (e) {
      // Fallback: estimate from package.json data
      downloads = 100000; // Default assumption for listed packages
    }

    return {
      downloads,
      lastPublish: info.time?.modified || info.time?.created,
      hasTypes: 'types' in (info || {}) || fs.existsSync(path.join(process.cwd(), 'node_modules', packageName, 'index.d.ts'))
    };
  } catch (error) {
    // Return defaults if npm view fails
    return {
      downloads: 50000,
      lastPublish: new Date().toISOString(),
      hasTypes: false
    };
  }
}

/**
 * Check compatibility with existing dependencies
 */
async function checkCompatibility(option, projectPath, decisionType) {
  const compatibility = {
    compatible: true,
    issues: []
  };

  // For library selection, check peer dependencies
  if (decisionType === DECISION_TYPES.LIBRARY_SELECTION) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return compatibility;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check if this library conflicts with existing ones
      // (simplified check - in production, would use npm peer dependency resolution)
      const existingDeps = Object.keys({
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      });

      // Check for known conflicts
      const conflicts = {
        'next-auth': ['passport'], // next-auth and passport serve similar purposes
        'zustand': ['redux'], // State management conflict
        'vitest': ['jest'] // Testing framework conflict
      };

      if (conflicts[option]) {
        const conflictingDeps = conflicts[option].filter(dep => existingDeps.includes(dep));
        if (conflictingDeps.length > 0) {
          compatibility.compatible = false;
          compatibility.issues.push(`May conflict with existing: ${conflictingDeps.join(', ')}`);
        }
      }
    } catch (error) {
      // Assume compatible if check fails
    }
  }

  return compatibility;
}

/**
 * Select the best option from evaluated options
 */
function selectBestOption(evaluatedOptions) {
  // Sort by score descending
  const sorted = evaluatedOptions.sort((a, b) => b.score - a.score);

  // Return highest scoring option
  return sorted[0];
}

/**
 * Assess risk level of selected decision
 */
function assessRiskLevel(selectedOption, context, projectPatterns) {
  let riskScore = 0;

  // Low confidence = higher risk
  if (selectedOption.score < 50) riskScore += 40;
  else if (selectedOption.score < 70) riskScore += 20;

  // Compatibility issues = higher risk
  if (selectedOption.compatibilityIssues.length > 0) riskScore += 30;

  // New library (not already used) = medium risk
  if (!selectedOption.pros.includes('Already used in project (consistency)')) {
    riskScore += 15;
  }

  // Security-related decisions = higher risk
  if (context.purpose?.toLowerCase().includes('auth') ||
      context.purpose?.toLowerCase().includes('security')) {
    riskScore += 20;
  }

  // Determine risk level
  if (riskScore >= 60) return RISK_LEVELS.HIGH;
  if (riskScore >= 30) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.LOW;
}

/**
 * Generate rationale for decision
 */
function generateRationale(selectedOption, allOptions, bestPractices) {
  const rationale = [];

  // Why this option was chosen
  rationale.push(`**Selected ${selectedOption.name}** (confidence: ${selectedOption.score}%)`);
  rationale.push('');
  rationale.push('**Reasons:**');
  selectedOption.pros.forEach(pro => rationale.push(`- ✅ ${pro}`));

  if (selectedOption.cons.length > 0) {
    rationale.push('');
    rationale.push('**Considerations:**');
    selectedOption.cons.forEach(con => rationale.push(`- ⚠️ ${con}`));
  }

  // Why other options were not chosen
  const otherOptions = allOptions.filter(opt => opt.name !== selectedOption.name);
  if (otherOptions.length > 0) {
    rationale.push('');
    rationale.push('**Other options considered:**');
    otherOptions.forEach(opt => {
      rationale.push(`- **${opt.name}** (score: ${opt.score}%) - ${opt.cons[0] || 'Lower overall score'}`);
    });
  }

  return rationale.join('\n');
}

/**
 * Generate validation criteria for reviewers
 */
function generateValidationCriteria(selectedOption, context) {
  const criteria = [];

  criteria.push(`- [ ] Verify ${selectedOption.name} is appropriate for ${context.purpose || 'this use case'}`);

  if (selectedOption.compatibilityIssues.length > 0) {
    criteria.push('- [ ] Review compatibility issues and ensure they are acceptable');
  }

  if (selectedOption.cons.length > 0) {
    criteria.push('- [ ] Acknowledge trade-offs and confirm they are acceptable');
  }

  criteria.push('- [ ] Confirm no security vulnerabilities in selected library');
  criteria.push('- [ ] Verify implementation follows best practices');

  return criteria;
}

/**
 * Log decision to decision log file
 */
async function logDecision(decision, ticketKey, projectPath) {
  const decisionsDir = path.join(projectPath, '.claude', 'decisions');
  fs.mkdirSync(decisionsDir, { recursive: true });

  const decisionLogPath = path.join(decisionsDir, `${ticketKey}.md`);

  // Create decision entry
  const riskEmoji = {
    [RISK_LEVELS.HIGH]: '⚠️',
    [RISK_LEVELS.MEDIUM]: 'ℹ️',
    [RISK_LEVELS.LOW]: '✓'
  }[decision.riskLevel];

  const entry = `
### ${decision.riskLevel === RISK_LEVELS.HIGH ? 'High-Risk' : decision.riskLevel === RISK_LEVELS.MEDIUM ? 'Medium-Risk' : 'Low-Risk'} Decision: ${decision.question} ${riskEmoji}

**Decision**: ${decision.selectedOption}
**Confidence**: ${decision.confidence}%
**Timestamp**: ${decision.timestamp}

${decision.rationale}

**Validation Criteria**:
${decision.validationCriteria.join('\n')}

---
`;

  // Append to decision log
  if (fs.existsSync(decisionLogPath)) {
    const existing = fs.readFileSync(decisionLogPath, 'utf8');
    fs.writeFileSync(decisionLogPath, existing + entry);
  } else {
    const header = `# Implementation Decisions - ${ticketKey}\n\nAll autonomous decisions made during implementation are logged below for transparency and review.\n\n`;
    fs.writeFileSync(decisionLogPath, header + entry);
  }

  console.log(`✅ Decision logged to ${decisionLogPath}`);
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'context') {
      params[key] = JSON.parse(value);
    } else if (key === 'options') {
      params[key] = value.split(',');
    } else if (key === 'ticket') {
      params.ticketKey = value; // Map --ticket to ticketKey
    } else {
      params[key] = value;
    }
  }

  makeDecision(params)
    .then(decision => {
      console.log('\n✅ Decision Made:');
      console.log(`   Selected: ${decision.selectedOption}`);
      console.log(`   Confidence: ${decision.confidence}%`);
      console.log(`   Risk Level: ${decision.riskLevel}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error making decision:', error);
      process.exit(1);
    });
}

module.exports = {
  makeDecision,
  DECISION_TYPES,
  RISK_LEVELS
};
