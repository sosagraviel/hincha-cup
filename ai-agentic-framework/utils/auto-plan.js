#!/usr/bin/env node

/**
 * Autonomous Planning Mode
 *
 * Auto-generates implementation plans from ticket context without requiring user approval
 * when confidence is high enough (≥ 80%).
 *
 * Analyzes:
 * - Ticket requirements and acceptance criteria
 * - Project tech stack and architecture
 * - Affected systems (frontend/backend/database)
 * - Risk level (from select-strategy.js)
 *
 * Generates:
 * - File changes list (create/modify/delete)
 * - Implementation steps (ordered)
 * - Test strategy (unit/integration/E2E)
 * - Success criteria
 * - Confidence score (0-100)
 *
 * Usage:
 *   node auto-plan.js --ticket JIRA-123 --context ./ticket-context.json
 *
 *   # Or programmatically:
 *   const { generatePlan } = require('./auto-plan');
 *   const plan = await generatePlan({ ticketKey: 'JIRA-123', contextPath: './ticket-context.json' });
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Confidence thresholds
const CONFIDENCE_THRESHOLD = {
  AUTO_APPROVE: 80, // >= 80% confidence → no user approval needed
  NEEDS_REVIEW: 60, // 60-79% confidence → plan generated but needs review
  MANUAL: 0 // < 60% confidence → manual planning recommended
};

// Confidence scoring weights
const CONFIDENCE_WEIGHTS = {
  CLEAR_REQUIREMENTS: 40, // Requirements well-defined
  KNOWN_TECH_STACK: 30, // Tech stack familiar
  NO_BREAKING_CHANGES: 20, // No breaking changes
  LOW_RISK: 10 // Low/medium risk level
};

/**
 * Generate implementation plan automatically
 *
 * @param {Object} options - Planning options
 * @param {string} options.ticketKey - Jira ticket key
 * @param {string} options.contextPath - Path to ticket context JSON
 * @param {string} options.projectPath - Project root path
 * @returns {Promise<Object>} Generated plan with confidence score
 */
async function generatePlan(options = {}) {
  const {
    ticketKey,
    contextPath,
    projectPath = process.cwd()
  } = options;

  console.log(`\n🤖 Generating autonomous implementation plan for ${ticketKey}...`);

  // Load ticket context
  const context = await loadTicketContext(contextPath);

  // Load project patterns
  const projectPatterns = await analyzeProjectPatterns(projectPath);

  // Load risk assessment if available
  const riskAssessment = await loadRiskAssessment(ticketKey, projectPath);

  // Parse requirements
  const requirements = extractRequirements(context);

  // Detect affected systems
  const affectedSystems = detectAffectedSystems(context, projectPatterns);

  // Generate file changes
  const fileChanges = generateFileChanges(context, projectPatterns, affectedSystems);

  // Generate implementation steps
  const implementationSteps = generateImplementationSteps(context, fileChanges, affectedSystems);

  // Generate test strategy
  const testStrategy = generateTestStrategy(context, affectedSystems, riskAssessment);

  // Generate success criteria
  const successCriteria = generateSuccessCriteria(requirements);

  // Calculate confidence score
  const confidenceScore = calculateConfidence({
    context,
    requirements,
    projectPatterns,
    riskAssessment,
    affectedSystems
  });

  // Determine approval needed
  const approvalNeeded = confidenceScore < CONFIDENCE_THRESHOLD.AUTO_APPROVE;
  const recommendManual = confidenceScore < CONFIDENCE_THRESHOLD.NEEDS_REVIEW;

  // Create plan object
  const plan = {
    ticketKey,
    timestamp: new Date().toISOString(),
    confidence: {
      score: confidenceScore,
      level: getConfidenceLevel(confidenceScore),
      approvalNeeded,
      recommendManual
    },
    requirements,
    affectedSystems,
    fileChanges,
    implementationSteps,
    testStrategy,
    successCriteria,
    riskLevel: riskAssessment?.riskLevel || 'UNKNOWN'
  };

  // Save plan
  await savePlan(plan, ticketKey, projectPath);

  // Display summary
  displayPlanSummary(plan);

  return plan;
}

/**
 * Load ticket context from JSON file
 */
async function loadTicketContext(contextPath) {
  if (!contextPath || !fs.existsSync(contextPath)) {
    throw new Error(`Ticket context not found: ${contextPath}`);
  }

  return JSON.parse(fs.readFileSync(contextPath, 'utf8'));
}

/**
 * Analyze project patterns (stack, architecture, conventions)
 */
async function analyzeProjectPatterns(projectPath) {
  const patterns = {
    stack: {},
    architecture: {},
    conventions: {}
  };

  // Detect package manager
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    patterns.packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    patterns.packageManager = 'yarn';
  } else {
    patterns.packageManager = 'npm';
  }

  // Read package.json
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    patterns.stack = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };
  }

  // Detect monorepo
  patterns.isMonorepo = fs.existsSync(path.join(projectPath, 'pnpm-workspace.yaml')) ||
                        fs.existsSync(path.join(projectPath, 'lerna.json'));

  // Detect architecture patterns
  const backendPath = path.join(projectPath, 'services', 'backend', 'src', 'modules');
  const frontendPath = path.join(projectPath, 'services', 'web-frontend', 'src', 'features');

  patterns.architecture.hasBackend = fs.existsSync(backendPath);
  patterns.architecture.hasFrontend = fs.existsSync(frontendPath);
  patterns.architecture.hasModulesPattern = fs.existsSync(backendPath);
  patterns.architecture.hasFeaturesPattern = fs.existsSync(frontendPath);

  // Detect database
  if (patterns.stack['typeorm']) {
    patterns.database = 'TypeORM';
  } else if (patterns.stack['prisma']) {
    patterns.database = 'Prisma';
  } else if (patterns.stack['sequelize']) {
    patterns.database = 'Sequelize';
  }

  return patterns;
}

/**
 * Load risk assessment if available
 */
async function loadRiskAssessment(ticketKey, projectPath) {
  const assessmentPath = path.join(
    projectPath,
    '.claude',
    'risk-assessments',
    `${ticketKey}-assessment.json`
  );

  if (fs.existsSync(assessmentPath)) {
    return JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
  }

  return null;
}

/**
 * Extract requirements from ticket context
 */
function extractRequirements(context) {
  const requirements = [];

  // From description
  if (context.description) {
    // Extract bullet points
    const bulletPoints = context.description.match(/[-*]\s+(.+)/g);
    if (bulletPoints) {
      bulletPoints.forEach(bullet => {
        requirements.push({
          type: 'functional',
          description: bullet.replace(/^[-*]\s+/, ''),
          source: 'description'
        });
      });
    }
  }

  // From acceptance criteria
  if (context.acceptanceCriteria) {
    const criteria = Array.isArray(context.acceptanceCriteria)
      ? context.acceptanceCriteria
      : [context.acceptanceCriteria];

    criteria.forEach(criterion => {
      requirements.push({
        type: 'acceptance',
        description: criterion,
        source: 'acceptanceCriteria'
      });
    });
  }

  // From technical requirements
  if (context.technicalRequirements) {
    const techReqs = Array.isArray(context.technicalRequirements)
      ? context.technicalRequirements
      : [context.technicalRequirements];

    techReqs.forEach(req => {
      requirements.push({
        type: 'technical',
        description: req,
        source: 'technicalRequirements'
      });
    });
  }

  return requirements;
}

/**
 * Detect affected systems from ticket context
 */
function detectAffectedSystems(context, projectPatterns) {
  const allText = JSON.stringify(context).toLowerCase();
  const systems = {
    frontend: false,
    backend: false,
    database: false,
    authentication: false,
    api: false,
    websocket: false,
    deployment: false
  };

  // Frontend indicators
  if (/frontend|ui|component|page|react|vue|angular/.test(allText)) {
    systems.frontend = true;
  }

  // Backend indicators
  if (/backend|api|service|controller|module|nestjs|express/.test(allText)) {
    systems.backend = true;
  }

  // Database indicators
  if (/database|schema|migration|table|column|entity|model|typeorm|prisma/.test(allText)) {
    systems.database = true;
  }

  // Authentication indicators
  if (/auth|login|oauth|jwt|token|keycloak|permission|role/.test(allText)) {
    systems.authentication = true;
  }

  // API indicators
  if (/endpoint|route|rest|graphql|api/.test(allText)) {
    systems.api = true;
  }

  // WebSocket indicators
  if (/websocket|socket\.io|real-time|live|streaming/.test(allText)) {
    systems.websocket = true;
  }

  // Deployment indicators
  if (/deploy|docker|kubernetes|ci\/cd|workflow|pipeline/.test(allText)) {
    systems.deployment = true;
  }

  return systems;
}

/**
 * Generate file changes list
 */
function generateFileChanges(context, projectPatterns, affectedSystems) {
  const changes = {
    create: [],
    modify: [],
    delete: []
  };

  const featureName = extractFeatureName(context);

  // Backend files
  if (affectedSystems.backend && projectPatterns.architecture.hasBackend) {
    const modulePath = `services/backend/src/modules/${featureName}`;

    changes.create.push({
      path: `${modulePath}/${featureName}.module.ts`,
      type: 'backend_module',
      description: `Main module definition for ${featureName}`
    });

    changes.create.push({
      path: `${modulePath}/service/${featureName}.service.ts`,
      type: 'backend_service',
      description: 'Business logic layer'
    });

    if (affectedSystems.api) {
      changes.create.push({
        path: `${modulePath}/presentation/${featureName}.controller.ts`,
        type: 'backend_controller',
        description: 'API endpoints'
      });

      changes.create.push({
        path: `${modulePath}/presentation/dto/create-${featureName}.dto.ts`,
        type: 'backend_dto',
        description: 'DTO for creation'
      });
    }

    if (affectedSystems.database) {
      changes.create.push({
        path: `${modulePath}/database/models/${featureName}.model.ts`,
        type: 'backend_entity',
        description: 'Database entity'
      });

      changes.create.push({
        path: `${modulePath}/repository/${featureName}.repository.ts`,
        type: 'backend_repository',
        description: 'Data access layer'
      });

      changes.create.push({
        path: `services/backend/src/migrations/${Date.now()}-create-${featureName}.ts`,
        type: 'migration',
        description: `Create ${featureName} table`
      });
    }
  }

  // Frontend files
  if (affectedSystems.frontend && projectPatterns.architecture.hasFrontend) {
    const featureNameCapitalized = capitalize(featureName);

    changes.create.push({
      path: `services/web-frontend/src/features/${featureName}/${featureNameCapitalized}Page.tsx`,
      type: 'frontend_page',
      description: `Main page component for ${featureName}`
    });

    changes.create.push({
      path: `services/web-frontend/src/features/${featureName}/${featureNameCapitalized}Card.tsx`,
      type: 'frontend_component',
      description: 'Card component'
    });

    if (affectedSystems.api) {
      changes.create.push({
        path: `services/web-frontend/src/api/${featureName}.ts`,
        type: 'frontend_api',
        description: 'API client functions'
      });

      changes.create.push({
        path: `services/web-frontend/src/hooks/queries/${featureName}Queries.ts`,
        type: 'frontend_hook',
        description: 'TanStack Query hooks'
      });
    }
  }

  // Shared DTOs
  if (affectedSystems.backend && affectedSystems.frontend) {
    changes.create.push({
      path: `packages/shared/src/dtos/${featureName}/create-${featureName}.dto.ts`,
      type: 'shared_dto',
      description: 'Shared DTO between frontend and backend'
    });
  }

  // Documentation updates
  changes.modify.push({
    path: '.claude/CLAUDE.md',
    type: 'documentation',
    description: 'Update architecture and API documentation'
  });

  return changes;
}

/**
 * Generate ordered implementation steps
 */
function generateImplementationSteps(context, fileChanges, affectedSystems) {
  const steps = [];

  // Step 1: Database (if needed)
  if (affectedSystems.database) {
    steps.push({
      order: 1,
      phase: 'database',
      title: 'Create database schema',
      tasks: [
        'Create entity model',
        'Create repository',
        'Write migration',
        'Run migration locally'
      ],
      files: fileChanges.create.filter(f => ['backend_entity', 'backend_repository', 'migration'].includes(f.type))
    });
  }

  // Step 2: Backend service layer
  if (affectedSystems.backend) {
    steps.push({
      order: steps.length + 1,
      phase: 'backend_service',
      title: 'Implement backend service layer',
      tasks: [
        'Create service with business logic',
        'Add validation',
        'Handle errors',
        'Write unit tests'
      ],
      files: fileChanges.create.filter(f => f.type === 'backend_service')
    });
  }

  // Step 3: API endpoints
  if (affectedSystems.api) {
    steps.push({
      order: steps.length + 1,
      phase: 'backend_api',
      title: 'Create API endpoints',
      tasks: [
        'Create controller',
        'Define DTOs',
        'Add validation',
        'Add guards/middleware',
        'Write integration tests'
      ],
      files: fileChanges.create.filter(f => ['backend_controller', 'backend_dto'].includes(f.type))
    });
  }

  // Step 4: Module registration
  if (affectedSystems.backend) {
    steps.push({
      order: steps.length + 1,
      phase: 'backend_module',
      title: 'Register module',
      tasks: [
        'Create module definition',
        'Import dependencies',
        'Export services',
        'Register in app module'
      ],
      files: fileChanges.create.filter(f => f.type === 'backend_module')
    });
  }

  // Step 5: Frontend API client
  if (affectedSystems.frontend && affectedSystems.api) {
    steps.push({
      order: steps.length + 1,
      phase: 'frontend_api',
      title: 'Create frontend API client',
      tasks: [
        'Create API functions',
        'Create TanStack Query hooks',
        'Add error handling',
        'Add loading states'
      ],
      files: fileChanges.create.filter(f => ['frontend_api', 'frontend_hook'].includes(f.type))
    });
  }

  // Step 6: Frontend UI
  if (affectedSystems.frontend) {
    steps.push({
      order: steps.length + 1,
      phase: 'frontend_ui',
      title: 'Build frontend UI',
      tasks: [
        'Create page component',
        'Create card/list components',
        'Add forms with validation',
        'Add error/loading states',
        'Style with Tailwind CSS'
      ],
      files: fileChanges.create.filter(f => ['frontend_page', 'frontend_component'].includes(f.type))
    });
  }

  // Step 7: E2E tests
  steps.push({
    order: steps.length + 1,
    phase: 'e2e_tests',
    title: 'Write E2E tests',
    tasks: [
      'Test happy path',
      'Test validation errors',
      'Test edge cases',
      'Capture videos/screenshots'
    ],
    files: []
  });

  // Step 8: Documentation
  steps.push({
    order: steps.length + 1,
    phase: 'documentation',
    title: 'Update documentation',
    tasks: [
      'Update CLAUDE.md with new endpoints',
      'Update architecture diagrams',
      'Document environment variables',
      'Update API documentation'
    ],
    files: fileChanges.modify.filter(f => f.type === 'documentation')
  });

  return steps;
}

/**
 * Generate test strategy
 */
function generateTestStrategy(context, affectedSystems, riskAssessment) {
  const strategy = {
    unit: {
      required: true,
      coverage: 80,
      focus: []
    },
    integration: {
      required: false,
      coverage: 100,
      focus: []
    },
    e2e: {
      required: false,
      coverage: 100,
      focus: []
    }
  };

  // Unit tests always required
  if (affectedSystems.backend) {
    strategy.unit.focus.push('Service layer business logic');
    strategy.unit.focus.push('Validation logic');
  }

  if (affectedSystems.frontend) {
    strategy.unit.focus.push('Component rendering');
    strategy.unit.focus.push('Hook behavior');
  }

  // Integration tests for API
  if (affectedSystems.api || affectedSystems.database) {
    strategy.integration.required = true;
    strategy.integration.focus.push('API endpoints');
    if (affectedSystems.database) {
      strategy.integration.focus.push('Database operations');
    }
    if (affectedSystems.authentication) {
      strategy.integration.focus.push('Authentication flow');
    }
  }

  // E2E tests for frontend
  if (affectedSystems.frontend) {
    strategy.e2e.required = true;
    strategy.e2e.focus.push('User flow end-to-end');
    strategy.e2e.focus.push('Form validation');
    strategy.e2e.focus.push('Error handling');
  }

  // High risk requires comprehensive testing
  if (riskAssessment && riskAssessment.riskLevel === 'HIGH') {
    strategy.integration.required = true;
    strategy.e2e.required = true;
    strategy.unit.coverage = 90;
  }

  return strategy;
}

/**
 * Generate success criteria
 */
function generateSuccessCriteria(requirements) {
  const criteria = [];

  // From requirements
  requirements.forEach((req, index) => {
    if (req.type === 'acceptance') {
      criteria.push({
        id: `AC-${index + 1}`,
        description: req.description,
        type: 'acceptance_criteria',
        verified: false
      });
    }
  });

  // Standard technical criteria
  criteria.push({
    id: 'TECH-1',
    description: 'All tests pass (unit + integration + E2E)',
    type: 'technical',
    verified: false
  });

  criteria.push({
    id: 'TECH-2',
    description: 'Code follows project conventions',
    type: 'technical',
    verified: false
  });

  criteria.push({
    id: 'TECH-3',
    description: 'No ESLint errors or warnings',
    type: 'technical',
    verified: false
  });

  criteria.push({
    id: 'TECH-4',
    description: 'Documentation updated',
    type: 'technical',
    verified: false
  });

  return criteria;
}

/**
 * Calculate confidence score (0-100)
 */
function calculateConfidence(params) {
  const { context, requirements, projectPatterns, riskAssessment, affectedSystems } = params;

  let score = 0;

  // 1. Clear Requirements (40 points)
  const allText = JSON.stringify(context).toLowerCase();
  const ambiguousTerms = ['tbd', 'unclear', 'investigate', 'maybe', 'possibly', 'unknown'];
  const hasAmbiguity = ambiguousTerms.some(term => allText.includes(term));

  if (!hasAmbiguity && requirements.length >= 3) {
    score += CONFIDENCE_WEIGHTS.CLEAR_REQUIREMENTS;
  } else if (!hasAmbiguity && requirements.length > 0) {
    score += CONFIDENCE_WEIGHTS.CLEAR_REQUIREMENTS * 0.7;
  } else if (requirements.length > 0) {
    score += CONFIDENCE_WEIGHTS.CLEAR_REQUIREMENTS * 0.4;
  }

  // 2. Known Tech Stack (30 points)
  const systemsDetected = Object.values(affectedSystems).filter(Boolean).length;
  const patternsKnown = projectPatterns.architecture.hasBackend || projectPatterns.architecture.hasFrontend;

  if (patternsKnown && systemsDetected >= 2) {
    score += CONFIDENCE_WEIGHTS.KNOWN_TECH_STACK;
  } else if (patternsKnown || systemsDetected >= 1) {
    score += CONFIDENCE_WEIGHTS.KNOWN_TECH_STACK * 0.6;
  }

  // 3. No Breaking Changes (20 points)
  const hasBreakingChange = /breaking|backward|incompatible|migration/.test(allText);

  if (!hasBreakingChange) {
    score += CONFIDENCE_WEIGHTS.NO_BREAKING_CHANGES;
  }

  // 4. Low Risk (10 points)
  if (riskAssessment) {
    if (riskAssessment.riskLevel === 'LOW') {
      score += CONFIDENCE_WEIGHTS.LOW_RISK;
    } else if (riskAssessment.riskLevel === 'MEDIUM') {
      score += CONFIDENCE_WEIGHTS.LOW_RISK * 0.5;
    }
  } else {
    // Default to medium risk
    score += CONFIDENCE_WEIGHTS.LOW_RISK * 0.5;
  }

  return Math.round(score);
}

/**
 * Get confidence level label
 */
function getConfidenceLevel(score) {
  if (score >= CONFIDENCE_THRESHOLD.AUTO_APPROVE) {
    return 'HIGH';
  } else if (score >= CONFIDENCE_THRESHOLD.NEEDS_REVIEW) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Extract feature name from context
 */
function extractFeatureName(context) {
  // Try to extract from ticket key
  if (context.key) {
    return context.key.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  // Try to extract from summary
  if (context.summary) {
    return context.summary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
  }

  return 'feature';
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Save plan to file
 */
async function savePlan(plan, ticketKey, projectPath) {
  const plansDir = path.join(projectPath, '.claude', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });

  // Save JSON
  const jsonPath = path.join(plansDir, `${ticketKey}-plan.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(plan, null, 2));

  // Save Markdown
  const mdPath = path.join(plansDir, `${ticketKey}-plan.md`);
  const markdown = generatePlanMarkdown(plan);
  fs.writeFileSync(mdPath, markdown);

  console.log(`\n📝 Plan saved to:`);
  console.log(`   ${jsonPath}`);
  console.log(`   ${mdPath}`);
}

/**
 * Generate plan markdown
 */
function generatePlanMarkdown(plan) {
  let md = `# Implementation Plan - ${plan.ticketKey}\n\n`;
  md += `**Generated**: ${new Date(plan.timestamp).toLocaleString()}\n`;
  md += `**Risk Level**: ${plan.riskLevel}\n\n`;

  // Confidence
  md += `## Confidence Assessment\n\n`;
  md += `**Score**: ${plan.confidence.score}/100 (${plan.confidence.level})\n\n`;

  if (plan.confidence.approvalNeeded) {
    md += `⚠️ **User Review Required**: Confidence below ${CONFIDENCE_THRESHOLD.AUTO_APPROVE}%\n\n`;
  } else {
    md += `✅ **Auto-Approved**: Confidence ≥ ${CONFIDENCE_THRESHOLD.AUTO_APPROVE}%\n\n`;
  }

  if (plan.confidence.recommendManual) {
    md += `⚠️ **Manual Planning Recommended**: Confidence below ${CONFIDENCE_THRESHOLD.NEEDS_REVIEW}%\n\n`;
  }

  // Requirements
  md += `## Requirements (${plan.requirements.length})\n\n`;
  plan.requirements.forEach((req, index) => {
    md += `${index + 1}. **[${req.type}]** ${req.description}\n`;
  });
  md += '\n';

  // Affected Systems
  md += `## Affected Systems\n\n`;
  Object.entries(plan.affectedSystems).forEach(([system, affected]) => {
    md += `- ${affected ? '✅' : '⬜'} ${capitalize(system)}\n`;
  });
  md += '\n';

  // File Changes
  md += `## File Changes\n\n`;

  if (plan.fileChanges.create.length > 0) {
    md += `### Create (${plan.fileChanges.create.length})\n\n`;
    plan.fileChanges.create.forEach(file => {
      md += `- \`${file.path}\`\n`;
      md += `  - ${file.description}\n`;
    });
    md += '\n';
  }

  if (plan.fileChanges.modify.length > 0) {
    md += `### Modify (${plan.fileChanges.modify.length})\n\n`;
    plan.fileChanges.modify.forEach(file => {
      md += `- \`${file.path}\`\n`;
      md += `  - ${file.description}\n`;
    });
    md += '\n';
  }

  if (plan.fileChanges.delete.length > 0) {
    md += `### Delete (${plan.fileChanges.delete.length})\n\n`;
    plan.fileChanges.delete.forEach(file => {
      md += `- \`${file.path}\`\n`;
      md += `  - ${file.description}\n`;
    });
    md += '\n';
  }

  // Implementation Steps
  md += `## Implementation Steps\n\n`;
  plan.implementationSteps.forEach(step => {
    md += `### Step ${step.order}: ${step.title}\n\n`;
    md += `**Phase**: ${step.phase}\n\n`;
    md += `**Tasks**:\n`;
    step.tasks.forEach(task => {
      md += `- [ ] ${task}\n`;
    });
    md += '\n';
  });

  // Test Strategy
  md += `## Test Strategy\n\n`;

  md += `### Unit Tests\n`;
  md += `- **Required**: ${plan.testStrategy.unit.required ? 'Yes' : 'No'}\n`;
  md += `- **Coverage Target**: ${plan.testStrategy.unit.coverage}%\n`;
  if (plan.testStrategy.unit.focus.length > 0) {
    md += `- **Focus Areas**:\n`;
    plan.testStrategy.unit.focus.forEach(area => {
      md += `  - ${area}\n`;
    });
  }
  md += '\n';

  md += `### Integration Tests\n`;
  md += `- **Required**: ${plan.testStrategy.integration.required ? 'Yes' : 'No'}\n`;
  md += `- **Coverage Target**: ${plan.testStrategy.integration.coverage}%\n`;
  if (plan.testStrategy.integration.focus.length > 0) {
    md += `- **Focus Areas**:\n`;
    plan.testStrategy.integration.focus.forEach(area => {
      md += `  - ${area}\n`;
    });
  }
  md += '\n';

  md += `### E2E Tests\n`;
  md += `- **Required**: ${plan.testStrategy.e2e.required ? 'Yes' : 'No'}\n`;
  md += `- **Coverage Target**: ${plan.testStrategy.e2e.coverage}%\n`;
  if (plan.testStrategy.e2e.focus.length > 0) {
    md += `- **Focus Areas**:\n`;
    plan.testStrategy.e2e.focus.forEach(area => {
      md += `  - ${area}\n`;
    });
  }
  md += '\n';

  // Success Criteria
  md += `## Success Criteria\n\n`;
  plan.successCriteria.forEach(criterion => {
    md += `- [ ] **[${criterion.id}]** ${criterion.description}\n`;
  });
  md += '\n';

  return md;
}

/**
 * Display plan summary
 */
function displayPlanSummary(plan) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`AUTONOMOUS IMPLEMENTATION PLAN - ${plan.ticketKey}`);
  console.log('='.repeat(80));

  console.log(`\nConfidence: ${plan.confidence.score}/100 (${plan.confidence.level})`);

  if (plan.confidence.approvalNeeded) {
    console.log(`⚠️  User approval required (confidence < ${CONFIDENCE_THRESHOLD.AUTO_APPROVE}%)`);
  } else {
    console.log(`✅ Auto-approved (confidence ≥ ${CONFIDENCE_THRESHOLD.AUTO_APPROVE}%)`);
  }

  console.log(`\nAffected Systems:`);
  Object.entries(plan.affectedSystems).forEach(([system, affected]) => {
    if (affected) {
      console.log(`  ✅ ${capitalize(system)}`);
    }
  });

  console.log(`\nFile Changes:`);
  console.log(`  Create: ${plan.fileChanges.create.length}`);
  console.log(`  Modify: ${plan.fileChanges.modify.length}`);
  console.log(`  Delete: ${plan.fileChanges.delete.length}`);

  console.log(`\nImplementation Steps: ${plan.implementationSteps.length}`);

  console.log(`\nTest Strategy:`);
  console.log(`  Unit: ${plan.testStrategy.unit.required ? 'Required' : 'Optional'} (${plan.testStrategy.unit.coverage}% coverage)`);
  console.log(`  Integration: ${plan.testStrategy.integration.required ? 'Required' : 'Optional'} (${plan.testStrategy.integration.coverage}% coverage)`);
  console.log(`  E2E: ${plan.testStrategy.e2e.required ? 'Required' : 'Optional'} (${plan.testStrategy.e2e.coverage}% coverage)`);

  console.log(`\nSuccess Criteria: ${plan.successCriteria.length}`);

  console.log(`\n${'='.repeat(80)}\n`);
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
    } else if (key === 'project') {
      options.projectPath = value;
    }
  }

  if (!options.ticketKey || !options.contextPath) {
    console.error('Usage: node auto-plan.js --ticket JIRA-123 --context ./ticket-context.json [--project /path/to/project]');
    process.exit(1);
  }

  generatePlan(options)
    .then(plan => {
      console.log('\n✅ Plan generated successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error generating plan:', error);
      process.exit(1);
    });
}

// Export
module.exports = {
  generatePlan,
  calculateConfidence,
  CONFIDENCE_THRESHOLD
};
