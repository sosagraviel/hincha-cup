/**
 * Agent Generation Module
 *
 * Generates stack-specific agents from templates by substituting variables
 * with detected stack information and project-specific commands.
 *
 * Features:
 * - Generates agents for planning, implementation, testing, review, verification, documentation
 * - visual-verifier agent for Phase 6 (Visual Verification)
 * - doc-updater agent for Phase 7 (Documentation Update)
 * - Support for verification and documentation agent categories
 * - Runtime variable substitution for ticket-specific agents
 *
 * @author AI Framework Team
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  resolveAgentSkills,
  getPrimaryLanguage,
  getAllLanguages,
} = require('./skill-registry');

/**
 * Main entry point for agent generation
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @param {Object} skillSelection - Selected skills from skill-selection.js
 * @param {string} projectPath - Absolute path to project root
 * @param {string} templatesPath - Path to agent templates directory
 * @returns {Promise<Object>} Generated agents with metadata
 */
async function generateAgents(stackProfile, skillSelection, projectPath, templatesPath) {
  const generation = {
    planning: [],
    implementation: [],
    testing: [],
    review: [],
    verification: [],
    documentation: [],
    total: 0
  };

  // Validate that stack detection properly included all significant languages
  const languagesFromProfile = getAllLanguages(stackProfile);
  const languagesFromFileCounts = Object.keys(stackProfile.file_counts || {})
    .filter(lang => stackProfile.file_counts[lang] >= 10);

  const missingLanguages = languagesFromFileCounts.filter(
    lang => !languagesFromProfile.includes(lang)
  );

  if (missingLanguages.length > 0) {
    console.error(`❌ ERROR: Languages with significant code missing from stack profile: ${missingLanguages.join(', ')}`);
    console.error(`  This indicates a bug in stack detection. Languages must be detected during stack`);
    console.error(`  detection phase, NOT auto-added during agent generation, to ensure skills are copied.`);
    console.error(`  File counts: ${missingLanguages.map(l => `${l}(${stackProfile.file_counts[l]} files)`).join(', ')}`);
    throw new Error(`Stack profile missing languages: ${missingLanguages.join(', ')}. Run stack detection again.`);
  }

  try {
    // 1. Generate planner agent (with architecture-level skills for ALL languages)
    const plannerSkills = resolveAgentSkills('planner', stackProfile);
    const plannerAgent = await generatePlannerAgent(templatesPath, plannerSkills);
    if (plannerAgent) {
      generation.planning.push(plannerAgent);
    }

    // 2. Generate implementer agents - ONE PER DETECTED LANGUAGE
    const languages = getAllLanguages(stackProfile);
    for (const language of languages) {
      // Extract language-specific commands
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);

      const implementerSkills = resolveAgentSkills(`implementer-${language}`, stackProfile);
      const implementerAgent = await generateImplementerAgent(
        templatesPath,
        stackProfile,
        implementerSkills,
        commands,
        language
      );
      if (implementerAgent) {
        generation.implementation.push(implementerAgent);
      }
    }

    // 3. Generate tester agents - ONE SET PER DETECTED LANGUAGE
    for (const language of languages) {
      // Extract language-specific commands
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);

      const testerAgents = await generateTesterAgents(
        templatesPath,
        stackProfile,
        commands,
        language
      );
      generation.testing.push(...testerAgents);
    }

    // 4. Generate security reviewer agent (primary language)
    const primaryLanguage = getPrimaryLanguage(stackProfile);
    if (primaryLanguage) {
      const securitySkills = resolveAgentSkills(`security-reviewer-${primaryLanguage}`, stackProfile);
      const securityAgent = await generateSecurityReviewerAgent(
        templatesPath,
        stackProfile,
        securitySkills,
        primaryLanguage
      );
      if (securityAgent) {
        generation.review.push(securityAgent);
      }
    }

    // 6. Generate visual verifier agent (for frontend projects with visual verification)
    if (stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0) {
      const visualVerifierSkills = resolveAgentSkills('visual-verifier', stackProfile);
      const visualVerifierAgent = await generateVisualVerifierAgent(
        templatesPath,
        visualVerifierSkills,
        stackProfile
      );
      if (visualVerifierAgent) {
        generation.verification.push(visualVerifierAgent);
      }
    }

    // 7. Generate doc updater agent (for all projects)
    const docUpdaterSkills = resolveAgentSkills('doc-updater', stackProfile);
    const docUpdaterAgent = await generateDocUpdaterAgent(
      templatesPath,
      docUpdaterSkills,
      stackProfile
    );
    if (docUpdaterAgent) {
      generation.documentation.push(docUpdaterAgent);
    }

    // Calculate total
    generation.total =
      generation.planning.length +
      generation.implementation.length +
      generation.testing.length +
      generation.review.length +
      generation.verification.length +
      generation.documentation.length;

    return generation;
  } catch (error) {
    console.error('Agent generation error:', error.message);
    throw new Error(`Failed to generate agents: ${error.message}`);
  }
}

/**
 * Extract commands from project configuration files for a specific language
 * @param {string} projectPath - Path to the project
 * @param {object} stackProfile - Stack detection profile
 * @param {string} language - Language to extract commands for (typescript, javascript, python, etc.)
 */
async function extractCommandsForLanguage(projectPath, stackProfile, language) {
  const commands = {
    lint_command: null,
    format_command: null,
    type_check_command: null,
    unit_test_command: null,
    integration_test_command: null,
    e2e_test_command: null,
    coverage_command: null,
    build_command: null,
    test_framework: null,
    e2e_framework: null
  };

  if (language === 'typescript' || language === 'javascript') {
    const packageJson = await readPackageJson(projectPath);

    if (packageJson?.scripts) {
      const scripts = packageJson.scripts;
      const packageManager = stackProfile.package_manager || 'npm';

      // Map common script names to commands
      commands.lint_command = findScript(scripts, ['lint:check', 'lint'])
        ? `${packageManager} run ${findScript(scripts, ['lint:check', 'lint'])}`
        : 'npx eslint .';

      commands.format_command = findScript(scripts, ['format', 'prettier'])
        ? `${packageManager} run ${findScript(scripts, ['format', 'prettier'])}`
        : 'npx prettier --write .';

      commands.type_check_command = findScript(scripts, ['type:check', 'typecheck', 'tsc'])
        ? `${packageManager} run ${findScript(scripts, ['type:check', 'typecheck', 'tsc'])}`
        : 'npx tsc --noEmit';

      commands.unit_test_command = findScript(scripts, ['test:unit', 'test'])
        ? `${packageManager} run ${findScript(scripts, ['test:unit', 'test'])}`
        : 'npx jest';

      commands.integration_test_command = findScript(scripts, ['test:integration', 'test:int'])
        ? `${packageManager} run ${findScript(scripts, ['test:integration', 'test:int'])}`
        : null;

      commands.e2e_test_command = findScript(scripts, ['test:e2e', 'test:playwright', 'test:cypress'])
        ? `${packageManager} run ${findScript(scripts, ['test:e2e', 'test:playwright', 'test:cypress'])}`
        : 'npx playwright test';

      commands.coverage_command = findScript(scripts, ['test:coverage', 'coverage'])
        ? `${packageManager} run ${findScript(scripts, ['test:coverage', 'coverage'])}`
        : `${commands.unit_test_command} -- --coverage`;

      commands.build_command = findScript(scripts, ['build', 'compile'])
        ? `${packageManager} run ${findScript(scripts, ['build', 'compile'])}`
        : 'npx tsc';
    }

    // Detect test framework
    if (stackProfile.testing) {
      const unitTest = stackProfile.testing.find(t => t.type === 'unit');
      const e2eTest = stackProfile.testing.find(t => t.type === 'e2e');

      commands.test_framework = unitTest?.name || 'jest';
      commands.e2e_framework = e2eTest?.name || null;
    }
  }

  if (language === 'python') {
    // Python command defaults
    commands.lint_command = 'ruff check .';
    commands.format_command = 'black .';
    commands.type_check_command = 'mypy .';
    commands.unit_test_command = 'pytest tests/';
    commands.coverage_command = 'pytest --cov=src tests/';
    commands.test_framework = 'pytest';

    // Check for Django
    if (stackProfile.backend?.framework === 'django') {
      commands.unit_test_command = 'python manage.py test';
      commands.coverage_command = 'coverage run manage.py test && coverage report';
      commands.build_command = 'python manage.py collectstatic --noinput';
    } else {
      commands.build_command = 'python -m build';
    }
  }

  // Add more languages here as needed (Go, Rust, Ruby, etc.)

  return commands;
}

/**
 * Find a script name from a list of candidates
 */
function findScript(scripts, candidates) {
  for (const candidate of candidates) {
    if (scripts[candidate]) {
      return candidate;
    }
  }
  return null;
}

/**
 * Validate that all template variables have been substituted
 * @param {string} content - Generated content to validate
 * @param {string} templateName - Name of the template for error messages
 * @throws {Error} If unsubstituted variables are found
 */
function validateTemplateSubstitution(content, templateName) {
  // Remove code blocks before validation to avoid false positives from code examples
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const remainingVariables = contentWithoutCodeBlocks.match(/\{\{([^}]+)\}\}/g);

  if (remainingVariables && remainingVariables.length > 0) {
    const varList = remainingVariables.map(v => v.replace(/[{}]/g, '')).join(', ');
    throw new Error(
      `Template validation failed for ${templateName}:\n` +
      `Unsubstituted variables found: ${varList}\n\n` +
      `This usually means:\n` +
      `1. Typo in template variable name\n` +
      `2. Missing variable in substitution map\n` +
      `3. New variable added to template but not to generation logic`
    );
  }

  return true;
}

/**
 * Generate planner agent with architecture-level skills
 */
async function generatePlannerAgent(templatesPath, skills) {
  const templatePath = path.join(templatesPath, 'planner.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Planner template not found');
    return null;
  }

  // Substitute skills using the standard formatter
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));

  // Validate template substitution
  validateTemplateSubstitution(content, 'planner.template.md');

  return {
    name: 'planner',
    filename: 'planner.md',
    content,
    model: 'opus',
    description: 'Create detailed implementation plans with full architecture awareness'
  };
}

/**
 * Generate implementer agent for a specific language
 */
async function generateImplementerAgent(templatesPath, stackProfile, skills, commands, language) {
  // Try language-specific template first
  let templatePath = path.join(templatesPath, language, 'implementer.template.md');
  let content = await readFile(templatePath);

  // Fallback to shared template if language-specific not found
  if (!content) {
    console.warn(`Language-specific implementer template not found for ${language}, using shared template`);
    templatePath = path.join(templatesPath, 'shared', 'implementer.template.md');
    content = await readFile(templatePath);

    // If shared also doesn't exist, try old universal template for backward compatibility
    if (!content) {
      templatePath = path.join(templatesPath, 'implementer.template.md');
      content = await readFile(templatePath);
    }
  }

  if (!content) {
    console.warn('Implementer template not found');
    return null;
  }

  // Get framework patterns for injection
  const frameworkPatterns = await getFrameworkPatterns(templatesPath, stackProfile, language);

  // Perform variable substitution
  content = content.replace(/\{\{stack\}\}/g, language);
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));
  content = content.replace(/\{\{lint_command\}\}/g, commands.lint_command || getDefaultLintCommand(language));
  content = content.replace(/\{\{format_command\}\}/g, commands.format_command || getDefaultFormatCommand(language));
  content = content.replace(/\{\{type_check_command\}\}/g, commands.type_check_command || getDefaultTypecheckCommand(language));
  content = content.replace(/\{\{unit_test_command\}\}/g, commands.unit_test_command || getDefaultTestCommand(language));
  content = content.replace(/\{\{build_command\}\}/g, commands.build_command || getDefaultBuildCommand(language));

  // Legacy aliases for backward compatibility
  content = content.replace(/\{\{typecheck_command\}\}/g, commands.type_check_command || getDefaultTypecheckCommand(language));
  content = content.replace(/\{\{test_command\}\}/g, commands.unit_test_command || getDefaultTestCommand(language));

  content = content.replace(/\{\{skills_documentation\}\}/g, generateSkillsDocumentation(skills));

  // Inject framework-specific patterns
  content = content.replace(/\{\{framework_patterns\}\}/g, frameworkPatterns);

  // Legacy stack patterns (kept for backward compatibility with old templates)
  const stackPatterns = getStackSpecificPatterns(stackProfile, language);
  content = content.replace(/\{\{stack_specific_patterns\}\}/g, stackPatterns);

  // Validate template substitution
  validateTemplateSubstitution(content, `${language}/implementer.template.md`);

  return {
    name: `implementer-${language}`,
    filename: `implementer-${language}.md`,
    content,
    model: 'sonnet',
    description: `Implement ${language} code following team conventions`
  };
}

/**
 * Generate tester agents (unit + integration + e2e)
 */
async function generateTesterAgents(templatesPath, stackProfile, commands, language) {
  const agents = [];

  // Resolve tester-specific skills
  const unitSkills = resolveAgentSkills(`tester-unit-${language}`, stackProfile);

  // Try language-specific unit tester template first
  let unitTemplatePath = path.join(templatesPath, language, 'tester-unit.template.md');
  let unitContent = await readFile(unitTemplatePath);

  // Fallback to shared template if language-specific not found
  if (!unitContent) {
    console.warn(`Language-specific tester-unit template not found for ${language}, using shared template`);
    unitTemplatePath = path.join(templatesPath, 'shared', 'tester-unit.template.md');
    unitContent = await readFile(unitTemplatePath);

    // If shared also doesn't exist, try old universal template for backward compatibility
    if (!unitContent) {
      unitTemplatePath = path.join(templatesPath, 'tester-unit.template.md');
      unitContent = await readFile(unitTemplatePath);
    }
  }

  if (unitContent) {
    // Get framework patterns for injection
    const frameworkPatterns = await getFrameworkPatterns(templatesPath, stackProfile, language);

    // Perform variable substitution
    unitContent = unitContent.replace(/\{\{stack\}\}/g, language);
    unitContent = unitContent.replace(/\{\{skills\}\}/g, formatSkillsList(unitSkills));
    unitContent = unitContent.replace(/\{\{test_command\}\}/g, commands.unit_test_command || getDefaultTestCommand(language));
    unitContent = unitContent.replace(/\{\{e2e_command\}\}/g, commands.e2e_test_command || getDefaultE2ECommand(language));

    unitContent = unitContent.replace(/\{\{skills_documentation\}\}/g, generateSkillsDocumentation(unitSkills));

    // Inject framework-specific patterns
    unitContent = unitContent.replace(/\{\{framework_patterns\}\}/g, frameworkPatterns);

    // Legacy test patterns (kept for backward compatibility with old templates)
    const testPatterns = getStackTestPatterns(stackProfile, language);
    unitContent = unitContent.replace(/\{\{stack_test_patterns\}\}/g, testPatterns);

    // Legacy variables (kept for backward compatibility)
    unitContent = unitContent.replace(/\{\{test_framework\}\}/g, commands.test_framework || getDefaultTestFramework(language));
    unitContent = unitContent.replace(/\{\{unit_test_command\}\}/g, commands.unit_test_command || getDefaultTestCommand(language));
    unitContent = unitContent.replace(/\{\{integration_test_command\}\}/g, commands.integration_test_command || getDefaultTestCommand(language));
    unitContent = unitContent.replace(/\{\{coverage_command\}\}/g, commands.coverage_command || getDefaultCoverageCommand(language));
    unitContent = unitContent.replace(/\{\{test_file_command\}\}/g, `${commands.unit_test_command || getDefaultTestCommand(language)} <test-file>`);
    unitContent = unitContent.replace(/\{\{test_watch_command\}\}/g, `${commands.unit_test_command || getDefaultTestCommand(language)} --watch`);
    unitContent = unitContent.replace(/\{\{test_integration_command\}\}/g, commands.integration_test_command || getDefaultTestCommand(language));

    // File extension and integration test framework
    const fileExtension = (language === 'typescript' || language === 'javascript') ? 'typescript' : language;
    unitContent = unitContent.replace(/\{\{file_extension\}\}/g, fileExtension);
    unitContent = unitContent.replace(/\{\{integration_test_framework\}\}/g, commands.test_framework || getDefaultTestFramework(language));
    unitContent = unitContent.replace(/\{\{coverage_view_command\}\}/g, getDefaultCoverageViewCommand(language));

    // Test file patterns
    if (language === 'typescript' || language === 'javascript') {
      unitContent = unitContent.replace(/\{\{test_file_pattern\}\}/g, '*.spec.ts or *.test.ts');
      unitContent = unitContent.replace(/\{\{mock_library\}\}/g, 'vitest.fn(), vitest.mock()');
      unitContent = unitContent.replace(/\{\{assertion_style\}\}/g, 'expect(value).toBe(expected)');
    } else if (language === 'python') {
      unitContent = unitContent.replace(/\{\{test_file_pattern\}\}/g, 'test_*.py or *_test.py');
      unitContent = unitContent.replace(/\{\{mock_library\}\}/g, 'pytest-mock, unittest.mock');
      unitContent = unitContent.replace(/\{\{assertion_style\}\}/g, 'assert value == expected');
    }

    const examples = getExamplePlaceholders(language, stackProfile);
    Object.entries(examples).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      unitContent = unitContent.replace(regex, value);
    });

    // Validate template substitution
    validateTemplateSubstitution(unitContent, 'tester-unit.template.md');

    agents.push({
      name: `tester-unit-${language}`,
      filename: `tester-unit-${language}.md`,
      content: unitContent,
      model: 'sonnet',
      description: `Write unit + integration tests with ${commands.test_framework}`
    });
  }

  // E2E tester (only for frontend projects)
  if (stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0 && commands.e2e_framework) {
    const e2eSkills = resolveAgentSkills(`tester-e2e-${language}`, stackProfile);
    const e2eTemplatePath = path.join(templatesPath, 'tester-e2e.template.md');
    let e2eContent = await readFile(e2eTemplatePath);

    if (e2eContent) {
      // Perform variable substitution
      e2eContent = e2eContent.replace(/\{\{stack\}\}/g, language);
      e2eContent = e2eContent.replace(/\{\{skills\}\}/g, formatSkillsList(e2eSkills));
      e2eContent = e2eContent.replace(/\{\{e2e_framework\}\}/g, commands.e2e_framework);
      e2eContent = e2eContent.replace(/\{\{e2e_command\}\}/g, commands.e2e_test_command || 'npx playwright test');
      e2eContent = e2eContent.replace(/\{\{e2e_test_pattern\}\}/g, '*.spec.ts or *.e2e.ts');
      e2eContent = e2eContent.replace(/\{\{e2e_ui_mode\}\}/g, `${stackProfile.package_manager || 'npx'} playwright test --ui`);

      e2eContent = e2eContent.replace(/\{\{skills_documentation\}\}/g, generateSkillsDocumentation(e2eSkills));

      const e2ePatterns = getStackE2EPatterns(stackProfile, language);
      e2eContent = e2eContent.replace(/\{\{stack_e2e_patterns\}\}/g, e2ePatterns);

      // Validate template substitution
      validateTemplateSubstitution(e2eContent, 'tester-e2e.template.md');

      agents.push({
        name: `tester-e2e-${language}`,
        filename: `tester-e2e-${language}.md`,
        content: e2eContent,
        model: 'sonnet',
        description: `Write E2E tests with ${commands.e2e_framework}`
      });
    }
  }

  return agents;
}

/**
 * Generate security reviewer agent for specific language
 */
async function generateSecurityReviewerAgent(templatesPath, stackProfile, skills, language) {
  const templatePath = path.join(templatesPath, 'security-reviewer.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Security reviewer template not found');
    return null;
  }

  // Perform variable substitution
  content = content.replace(/\{\{stack\}\}/g, language);
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));

  // Validate template substitution
  validateTemplateSubstitution(content, 'security-reviewer.template.md');

  return {
    name: `security-reviewer-${language}`,
    filename: `security-reviewer-${language}.md`,
    content,
    model: 'sonnet',
    description: 'Security review and OWASP scanning'
  };
}

/**
 * Generate visual verifier agent for frontend projects
 */
async function generateVisualVerifierAgent(templatesPath, skills, stackProfile) {
  const templatePath = path.join(templatesPath, 'visual-verifier.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Visual verifier template not found');
    return null;
  }

  // Note: JIRA_KEY, PROJECT_ROOT, and CHANGED_FILES are runtime variables
  // that will be substituted when the agent is actually invoked during Phase 6
  // We don't substitute them here as they're ticket-specific

  // Substitute skills
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));

  // Add frontend framework context
  const frontend = stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0
    ? stackProfile.frontend_frameworks[0].name
    : 'react';

  content = content.replace(/\{\{frontend_framework\}\}/g, frontend);

  // Validate template substitution (allow runtime variables to remain)
  // We only validate that static variables like skills have been substituted
  const contentWithoutRuntimeVars = content
    .replace(/\{\{JIRA_KEY\}\}/g, 'RUNTIME_VAR')
    .replace(/\{\{PROJECT_ROOT\}\}/g, 'RUNTIME_VAR')
    .replace(/\{\{CHANGED_FILES\}\}/g, 'RUNTIME_VAR');

  validateTemplateSubstitution(contentWithoutRuntimeVars, 'visual-verifier.template.md');

  return {
    name: 'visual-verifier',
    filename: 'visual-verifier.md',
    content,
    model: 'opus',
    description: 'Visual verification and UI diff analysis'
  };
}

/**
 * Generate doc updater agent for documentation maintenance
 */
async function generateDocUpdaterAgent(templatesPath, skills, stackProfile) {
  const templatePath = path.join(templatesPath, 'doc-updater.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Doc updater template not found');
    return null;
  }

  // Note: JIRA_KEY, PROJECT_ROOT, CHANGED_FILES, and IMPLEMENTATION_SUMMARY
  // are runtime variables that will be substituted when the agent is invoked
  // during Phase 7. We don't substitute them here as they're ticket-specific.

  // Substitute skills
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));

  // Add project type context
  const hasBackend = stackProfile.backend_frameworks && stackProfile.backend_frameworks.length > 0;
  const hasFrontend = stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0;

  let projectType = 'full-stack';
  if (hasBackend && !hasFrontend) {
    projectType = 'backend';
  } else if (hasFrontend && !hasBackend) {
    projectType = 'frontend';
  }

  content = content.replace(/\{\{project_type\}\}/g, projectType);

  // Validate template substitution (allow runtime variables to remain)
  const contentWithoutRuntimeVars = content
    .replace(/\{\{JIRA_KEY\}\}/g, 'RUNTIME_VAR')
    .replace(/\{\{PROJECT_ROOT\}\}/g, 'RUNTIME_VAR')
    .replace(/\{\{CHANGED_FILES\}\}/g, 'RUNTIME_VAR')
    .replace(/\{\{IMPLEMENTATION_SUMMARY\}\}/g, 'RUNTIME_VAR');

  validateTemplateSubstitution(contentWithoutRuntimeVars, 'doc-updater.template.md');

  return {
    name: 'doc-updater',
    filename: 'doc-updater.md',
    content,
    model: 'opus',
    description: 'Documentation maintenance for CLAUDE.md and project-context'
  };
}

/**
 * Format skills list as YAML array for agent frontmatter
 */
function formatSkillsList(skills) {
  if (skills.length === 0) {
    return '[]';
  }

  // Format as YAML array with proper indentation
  return '\n  - ' + skills.join('\n  - ');
}

/**
 * Inject NestJS-specific patterns into implementer agent
 */
function injectNestJSPatterns(content) {
  const nestjsSection = `

## NestJS-Specific Patterns

### Module Structure
\`\`\`typescript
@Module({
  imports: [TypeOrmModule.forFeature([Entity])],
  providers: [Service],
  controllers: [Controller],
  exports: [Service]
})
export class FeatureModule {}
\`\`\`

### Dependency Injection
- Use constructor injection for services
- Declare providers in module
- Use @Injectable() decorator

### Guards and Interceptors
- Implement AuthGuard for authentication
- Use ValidationPipe for request validation
- Stack guards for role-based access
`;

  // Insert before the last section (usually "Error Handling")
  return content.replace(/## Error Handling/i, nestjsSection + '\n## Error Handling');
}

/**
 * Inject FastAPI-specific patterns into implementer agent
 */
function injectFastAPIPatterns(content) {
  const fastapiSection = `

## FastAPI-Specific Patterns

### Route Definitions
\`\`\`python
@router.get("/items/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: int,
    db: Session = Depends(get_db)
) -> ItemResponse:
    ...
\`\`\`

### Dependency Injection
- Use Depends() for database sessions
- Create reusable dependencies
- Use async/await for I/O operations

### Request Validation
- Use Pydantic models for request/response
- Automatic validation and serialization
`;

  return content.replace(/## Error Handling/i, fastapiSection + '\n## Error Handling');
}

/**
 * Inject Django-specific patterns into implementer agent
 */
function injectDjangoPatterns(content) {
  const djangoSection = `

## Django-Specific Patterns

### Views and URLs
\`\`\`python
# views.py
from django.views import View

class ItemView(View):
    def get(self, request, item_id):
        ...

# urls.py
urlpatterns = [
    path('items/<int:item_id>/', ItemView.as_view()),
]
\`\`\`

### Models and Migrations
- Use Django ORM for database operations
- Create migrations: python manage.py makemigrations
- Apply migrations: python manage.py migrate

### Admin Interface
- Register models in admin.py
- Customize admin interface with ModelAdmin
`;

  return content.replace(/## Error Handling/i, djangoSection + '\n## Error Handling');
}

/**
 * Write generated agents to .claude/agents/ directory
 */
async function writeAgents(generation, projectPath) {
  const destDir = path.join(projectPath, '.claude', 'agents');

  // Ensure directory exists
  await fs.promises.mkdir(destDir, { recursive: true });

  const written = [];
  const errors = [];

  // Combine all agents
  const allAgents = [
    ...generation.planning,
    ...generation.implementation,
    ...generation.testing,
    ...generation.review,
    ...generation.verification,
    ...generation.documentation
  ];

  for (const agent of allAgents) {
    try {
      const destPath = path.join(destDir, agent.filename);
      await fs.promises.writeFile(destPath, agent.content, 'utf8');

      written.push({
        name: agent.name,
        path: destPath,
        model: agent.model
      });
    } catch (error) {
      errors.push({
        name: agent.name,
        error: error.message
      });
    }
  }

  return { written, errors };
}

/**
 * Generate agent index file
 */
async function generateAgentIndex(generation, projectPath, projectName) {
  let indexMd = '# Installed Agents\n\n';
  indexMd += `**Project**: ${projectName}\n`;
  indexMd += `**Last Updated**: ${new Date().toISOString()}\n\n`;
  indexMd += '---\n\n';

  if (generation.planning.length > 0) {
    indexMd += `## Planning Agents (${generation.planning.length})\n\n`;
    for (const agent of generation.planning) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  if (generation.implementation.length > 0) {
    indexMd += `## Implementation Agents (${generation.implementation.length})\n\n`;
    for (const agent of generation.implementation) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  if (generation.testing.length > 0) {
    indexMd += `## Testing Agents (${generation.testing.length})\n\n`;
    for (const agent of generation.testing) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  if (generation.review.length > 0) {
    indexMd += `## Review Agents (${generation.review.length})\n\n`;
    for (const agent of generation.review) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  if (generation.verification.length > 0) {
    indexMd += `## Verification Agents (${generation.verification.length})\n\n`;
    for (const agent of generation.verification) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  if (generation.documentation.length > 0) {
    indexMd += `## Documentation Agents (${generation.documentation.length})\n\n`;
    for (const agent of generation.documentation) {
      indexMd += `- \`${agent.name}\` (model: ${agent.model}) - ${agent.description}\n`;
    }
    indexMd += '\n';
  }

  indexMd += '---\n\n';
  indexMd += `**Total Agents**: ${generation.total}\n\n`;
  indexMd += 'To run an agent: `claude-code agents run <agent-name>`\n';
  indexMd += 'To list agents: `ls .claude/agents/`\n';

  return indexMd;
}

// ============================================================================
// Helper Functions for Template Variable Substitution
// ============================================================================

/**
 * Generate skills documentation section for agent templates
 */
function generateSkillsDocumentation(skills) {
  if (!skills || skills.length === 0) {
    return 'No skills preloaded.';
  }

  let doc = 'The following skills are preloaded and available:\n\n';
  skills.forEach(skill => {
    doc += `- **${skill}**: Provides patterns and conventions for this area\n`;
  });

  return doc;
}

/**
 * Get stack-specific patterns for implementer agent
 */
function getStackSpecificPatterns(stackProfile, language) {
  const backend = stackProfile.backend_frameworks && stackProfile.backend_frameworks.length > 0 ? stackProfile.backend_frameworks[0].name : null;
  const frontend = stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0 ? stackProfile.frontend_frameworks[0].name : null;

  let patterns = '';

  // TypeScript/JavaScript patterns
  if (language === 'typescript' || language === 'javascript') {
    patterns += '\n### TypeScript Best Practices\n\n';
    patterns += '- Use explicit return types on exported functions\n';
    patterns += '- Prefer interfaces over type aliases for object shapes\n';
    patterns += '- Use const assertions for readonly data\n';
    patterns += '- Avoid `any` - use `unknown` if type is truly unknown\n';
    patterns += '- Use optional chaining (`?.`) and nullish coalescing (`??`)\n';
  }

  // Python patterns
  if (language === 'python') {
    patterns += '\n### Python Best Practices\n\n';
    patterns += '- Use type hints on all function parameters and returns\n';
    patterns += '- Follow PEP 8 style guide (enforced by Black)\n';
    patterns += '- Use dataclasses or Pydantic models for structured data\n';
    patterns += '- Prefer f-strings for string formatting\n';
    patterns += '- Use context managers (`with`) for resource management\n';
  }

  // Backend framework patterns
  if (backend) {
    patterns += `\n### ${backend.toUpperCase()} Patterns\n\n`;
    if (backend === 'nestjs') {
      patterns += '- Use dependency injection via constructor\n';
      patterns += '- Organize code in modules (feature-based slicing)\n';
      patterns += '- Use DTOs for request/response validation\n';
      patterns += '- Apply guards for authentication/authorization\n';
    } else if (backend === 'fastapi') {
      patterns += '- Use Pydantic models for request/response schemas\n';
      patterns += '- Leverage dependency injection with Depends()\n';
      patterns += '- Use async/await for all I/O operations\n';
      patterns += '- Apply middleware for cross-cutting concerns\n';
    } else if (backend === 'django') {
      patterns += '- Follow Django app structure (models, views, urls, admin)\n';
      patterns += '- Use Django ORM for database operations\n';
      patterns += '- Create migrations after model changes\n';
      patterns += '- Use class-based views for complex logic\n';
    }
  }

  // Frontend framework patterns
  if (frontend) {
    patterns += `\n### ${frontend.toUpperCase()} Patterns\n\n`;
    if (frontend === 'react') {
      patterns += '- Use functional components with hooks\n';
      patterns += '- Extract custom hooks for reusable logic\n';
      patterns += '- Memoize expensive computations with useMemo\n';
      patterns += '- Use useCallback for stable function references\n';
      patterns += '- Prefer composition over prop drilling\n';
    } else if (frontend === 'vue') {
      patterns += '- Use Composition API (setup, ref, computed, watch)\n';
      patterns += '- Extract composables for reusable logic\n';
      patterns += '- Use provide/inject for dependency injection\n';
      patterns += '- Leverage Vue reactivity system\n';
    }
  }

  return patterns || 'Follow general best practices for your stack.';
}

/**
 * Get stack-specific test patterns for tester agent
 */
function getStackTestPatterns(stackProfile, language) {
  const backend = stackProfile.backend_frameworks && stackProfile.backend_frameworks.length > 0 ? stackProfile.backend_frameworks[0].name : null;

  let patterns = '';

  // TypeScript/JavaScript test patterns
  if (language === 'typescript' || language === 'javascript') {
    patterns += '\n### Jest/Vitest Patterns\n\n';
    patterns += '```typescript\n';
    patterns += "describe('Feature', () => {\n";
    patterns += "  beforeEach(() => {\n";
    patterns += '    // Setup before each test\n';
    patterns += '  });\n\n';
    patterns += "  it('should handle success case', () => {\n";
    patterns += '    const result = functionUnderTest();\n';
    patterns += '    expect(result).toBe(expected);\n';
    patterns += '  });\n\n';
    patterns += "  it('should handle error case', () => {\n";
    patterns += '    expect(() => functionUnderTest()).toThrow();\n';
    patterns += '  });\n';
    patterns += '});\n';
    patterns += '```\n';
  }

  // Python test patterns
  if (language === 'python') {
    patterns += '\n### Pytest Patterns\n\n';
    patterns += '```python\n';
    patterns += 'class TestFeature:\n';
    patterns += '    def setup_method(self):\n';
    patterns += '        # Setup before each test\n';
    patterns += '        pass\n\n';
    patterns += '    def test_success_case(self):\n';
    patterns += '        result = function_under_test()\n';
    patterns += '        assert result == expected\n\n';
    patterns += '    def test_error_case(self):\n';
    patterns += '        with pytest.raises(ValueError):\n';
    patterns += '            function_under_test()\n';
    patterns += '```\n';
  }

  // Backend-specific test patterns
  if (backend === 'nestjs') {
    patterns += '\n### NestJS Integration Test Pattern\n\n';
    patterns += '```typescript\n';
    patterns += "describe('POST /api/resource', () => {\n";
    patterns += "  it('should create resource', () => {\n";
    patterns += '    return request(app.getHttpServer())\n';
    patterns += "      .post('/api/resource')\n";
    patterns += '      .send({ name: "Test" })\n';
    patterns += '      .expect(201)\n';
    patterns += '      .expect((res) => {\n';
    patterns += "        expect(res.body).toHaveProperty('id');\n";
    patterns += '      });\n';
    patterns += '  });\n';
    patterns += '});\n';
    patterns += '```\n';
  } else if (backend === 'fastapi') {
    patterns += '\n### FastAPI Test Pattern\n\n';
    patterns += '```python\n';
    patterns += 'def test_create_resource(client):\n';
    patterns += '    response = client.post(\n';
    patterns += '        "/api/resource",\n';
    patterns += '        json={"name": "Test"}\n';
    patterns += '    )\n';
    patterns += '    assert response.status_code == 201\n';
    patterns += '    assert "id" in response.json()\n';
    patterns += '```\n';
  }

  return patterns || 'Follow standard testing patterns for your stack.';
}

/**
 * Get stack-specific E2E patterns for e2e tester agent
 */
function getStackE2EPatterns(stackProfile, language) {
  const frontend = stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0 ? stackProfile.frontend_frameworks[0].name : null;

  let patterns = '';

  if (frontend === 'react') {
    patterns += '\n### React E2E Patterns\n\n';
    patterns += '- Use data-testid attributes for component identification\n';
    patterns += '- Test user interactions (clicks, form fills, navigation)\n';
    patterns += '- Verify React Router navigation\n';
    patterns += '- Test state persistence across page reloads\n';
    patterns += '- Mock API endpoints with MSW or Playwright routes\n';
  } else if (frontend === 'vue') {
    patterns += '\n### Vue E2E Patterns\n\n';
    patterns += '- Use data-cy or data-test attributes\n';
    patterns += '- Test Vue Router navigation\n';
    patterns += '- Verify Vuex/Pinia state changes\n';
    patterns += '- Test component events and emit handlers\n';
  } else if (frontend === 'angular') {
    patterns += '\n### Angular E2E Patterns\n\n';
    patterns += '- Use Angular test attributes ([data-test])\n';
    patterns += '- Test routing and guards\n';
    patterns += '- Verify services and dependency injection\n';
    patterns += '- Test reactive forms validation\n';
  }

  patterns += '\n### General E2E Best Practices\n\n';
  patterns += '- Test user flows, not implementation details\n';
  patterns += '- Use semantic selectors (roles, labels, text)\n';
  patterns += '- Wait for network idle before assertions\n';
  patterns += '- Test across multiple viewports (mobile, tablet, desktop)\n';
  patterns += '- Mock external dependencies (APIs, third-party services)\n';

  return patterns || 'Follow standard E2E testing patterns for your stack.';
}

/**
 * Get example placeholders for test templates
 */
function getExamplePlaceholders(language, stackProfile) {
  const isTypeScript = language === 'typescript' || language === 'javascript';
  const isPython = language === 'python';

  if (isTypeScript) {
    return {
      example_class: 'UserService',
      example_method: 'createUser',
      happy_path_behavior: 'create a new user with valid data',
      example_input: '{ name: "John", email: "john@example.com" }',
      example_call: 'userService.createUser(input)',
      example_assertion: 'toHaveProperty("id")',
      error_case: 'email is invalid',
      example_invalid_input: '{ name: "John", email: "invalid" }',
      expected_error: 'ValidationError',
      endpoint: 'POST /api/users',
      expected: '201 Created',
      condition: 'valid data provided',
      example_payload: '{ name: "John", email: "john@example.com" }',
      http_method: 'post',
      endpoint_path: '/api/users',
      expected_status: '201',
      expected_shape: '{ id: expect.any(String), name: "John" }',
      validation_error: 'email is missing',
      invalid_payload: '{ name: "John" }',
      error_message: 'email'
    };
  } else if (isPython) {
    return {
      example_class: 'UserService',
      example_method: 'create_user',
      happy_path_behavior: 'create a new user with valid data',
      example_input: 'UserCreateInput(name="John", email="john@example.com")',
      example_call: 'user_service.create_user(input)',
      example_assertion: 'toHaveProperty("id")',
      error_case: 'email is invalid',
      example_invalid_input: 'UserCreateInput(name="John", email="invalid")',
      expected_error: 'ValidationError',
      endpoint: 'POST /api/users',
      expected: '201 Created',
      condition: 'valid data provided',
      example_payload: '{"name": "John", "email": "john@example.com"}',
      http_method: 'post',
      endpoint_path: '/api/users',
      expected_status: '201',
      expected_shape: '{"id": str, "name": "John"}',
      validation_error: 'email is missing',
      invalid_payload: '{"name": "John"}',
      error_message: 'email'
    };
  }

  return {};
}

// ============================================================================
// File System Utilities
// ============================================================================

async function readFile(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readPackageJson(projectPath) {
  const content = await readFile(path.join(projectPath, 'package.json'));
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============================================================================
// Tracking Methods (for Framework Sync)
// ============================================================================

/**
 * Generate agents with tracking metadata for framework-config.json
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @param {Object} skillSelection - Selected skills from skill-selection.js
 * @param {string} projectPath - Absolute path to project root
 * @param {string} templatesPath - Path to agent templates directory
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { generation, agentsTracking }
 */
async function generateAgentsWithTracking(stackProfile, skillSelection, projectPath, templatesPath, frameworkPath) {
  const generation = await generateAgents(stackProfile, skillSelection, projectPath, templatesPath);

  const agentsTracking = {};
  const timestamp = new Date().toISOString();

  const allAgents = [
    ...generation.planning,
    ...generation.implementation,
    ...generation.testing,
    ...generation.review,
    ...generation.verification,
    ...generation.documentation
  ];

  for (const agent of allAgents) {
    const templatePath = getTemplatePathForAgent(agent.name, templatesPath, frameworkPath);
    const templateHash = hashFile(templatePath);

    const agentPath = path.join(projectPath, '.claude', 'agents', agent.filename);

    agentsTracking[agent.name] = {
      template_path: path.relative(frameworkPath, templatePath),
      generated_timestamp: timestamp,
      template_hash: templateHash,
      file_hash: null,
      managed_by_framework: true,
      user_modified: false,
      language: agent.name.includes('-') ? agent.name.split('-')[1] : null,
      category: getCategoryForAgent(agent.name, generation),
      last_sync: timestamp
    };
  }

  const writeResult = await writeAgents(generation, projectPath);

  for (const written of writeResult.written) {
    if (agentsTracking[written.name]) {
      agentsTracking[written.name].file_hash = hashFile(written.path);
    }
  }

  return {
    generation,
    agentsTracking,
    writeResult
  };
}

/**
 * Regenerate a single agent (used by sync script when template changes)
 * @param {string} agentName - Name of agent to regenerate
 * @param {string} projectPath - Absolute path to project root
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { success, agent, tracking }
 */
async function regenerateSingleAgent(agentName, projectPath, frameworkPath) {
  const { ConfigUpdater } = require('./config-updater.js');
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);

  try {
    const config = await configUpdater.readConfig();
    const agentInfo = config.resource_state.agents[agentName];

    if (!agentInfo) {
      throw new Error(`Agent ${agentName} not found in config`);
    }

    if (!agentInfo.managed_by_framework) {
      console.log(`Skipping ${agentName} - user-managed agent`);
      return { success: false, skipped: true, reason: 'user-managed' };
    }

    const stackProfile = config.stack_profile;
    const templatesPath = path.join(frameworkPath, 'agents', 'templates');

    const language = agentInfo.language;
    const category = agentInfo.category;

    let agent = null;

    if (category === 'planning') {
      const skills = await resolveAgentSkills('planner', stackProfile);
      agent = await generatePlannerAgent(templatesPath, skills);
    } else if (category === 'implementation') {
      const skills = await resolveAgentSkills(agentName, stackProfile);
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);
      agent = await generateImplementerAgent(templatesPath, stackProfile, skills, commands, language);
    } else if (category === 'testing') {
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);
      const agents = await generateTesterAgents(templatesPath, stackProfile, commands, language);
      agent = agents.find(a => a.name === agentName);
    } else if (category === 'review') {
      const skills = await resolveAgentSkills(agentName, stackProfile);
      agent = await generateSecurityReviewerAgent(templatesPath, stackProfile, skills, language);
    } else if (category === 'verification') {
      const skills = await resolveAgentSkills('visual-verifier', stackProfile);
      agent = await generateVisualVerifierAgent(templatesPath, skills, stackProfile);
    } else if (category === 'documentation') {
      const skills = await resolveAgentSkills('doc-updater', stackProfile);
      agent = await generateDocUpdaterAgent(templatesPath, skills, stackProfile);
    }

    if (!agent) {
      throw new Error(`Failed to regenerate agent ${agentName}`);
    }

    const agentPath = path.join(projectPath, '.claude', 'agents', agent.filename);
    await fs.promises.writeFile(agentPath, agent.content, 'utf8');

    const templatePath = path.join(templatesPath, getTemplateFilename(agentName));
    const tracking = {
      template_path: path.relative(frameworkPath, templatePath),
      generated_timestamp: new Date().toISOString(),
      template_hash: hashFile(templatePath),
      file_hash: hashFile(agentPath),
      managed_by_framework: true,
      user_modified: false,
      language: language,
      category: category,
      last_sync: new Date().toISOString()
    };

    await configUpdater.updateResourceState('agents', agentName, tracking);

    return {
      success: true,
      agent,
      tracking
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Add a new agent (used by sync script when stack changes)
 * @param {string} agentName - Name of agent to add
 * @param {string} projectPath - Absolute path to project root
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { success, agent, tracking }
 */
async function addSingleAgent(agentName, projectPath, frameworkPath) {
  return regenerateSingleAgent(agentName, projectPath, frameworkPath);
}

/**
 * Hash a file for change detection
 * @param {string} filePath - Path to file
 * @returns {string} SHA-256 hash
 */
function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get template path for agent
 * @param {string} agentName - Name of agent
 * @param {string} templatesPath - Path to templates directory
 * @param {string} frameworkPath - Path to framework root
 * @returns {string} Template path
 */
function getTemplatePathForAgent(agentName, templatesPath, frameworkPath) {
  const filename = getTemplateFilename(agentName);
  return path.join(templatesPath, filename);
}

/**
 * Get template filename for agent
 * @param {string} agentName - Name of agent
 * @returns {string} Template filename
 */
function getTemplateFilename(agentName) {
  if (agentName === 'planner') {
    return 'planner.template.md';
  } else if (agentName.startsWith('implementer-')) {
    return 'implementer.template.md';
  } else if (agentName.startsWith('tester-unit-')) {
    return 'tester-unit.template.md';
  } else if (agentName.startsWith('tester-e2e-')) {
    return 'tester-e2e.template.md';
  } else if (agentName.startsWith('security-reviewer-')) {
    return 'security-reviewer.template.md';
  } else if (agentName === 'visual-verifier') {
    return 'visual-verifier.template.md';
  } else if (agentName === 'doc-updater') {
    return 'doc-updater.template.md';
  }

  throw new Error(`Unknown agent type: ${agentName}`);
}

/**
 * Get category for agent
 * @param {string} agentName - Name of agent
 * @param {Object} generation - Generation result
 * @returns {string} Category
 */
function getCategoryForAgent(agentName, generation) {
  if (generation.planning.find(a => a.name === agentName)) return 'planning';
  if (generation.implementation.find(a => a.name === agentName)) return 'implementation';
  if (generation.testing.find(a => a.name === agentName)) return 'testing';
  if (generation.review.find(a => a.name === agentName)) return 'review';
  if (generation.verification.find(a => a.name === agentName)) return 'verification';
  if (generation.documentation.find(a => a.name === agentName)) return 'documentation';
  return 'unknown';
}

// ============================================================================
// Language-Specific Template Support Functions
// ============================================================================

/**
 * Get framework patterns for injection into templates
 * @param {string} templatesPath - Path to templates directory
 * @param {Object} stackProfile - Stack profile
 * @param {string} language - Programming language
 * @returns {Promise<string>} Framework patterns content
 */
async function getFrameworkPatterns(templatesPath, stackProfile, language) {
  let patterns = '';

  // Backend framework patterns
  if (stackProfile.backend_frameworks && stackProfile.backend_frameworks.length > 0) {
    const framework = stackProfile.backend_frameworks[0].name.toLowerCase();
    const frameworkPath = path.join(templatesPath, 'base', 'framework-patterns', `${framework}.md`);
    const frameworkContent = await readFile(frameworkPath);
    if (frameworkContent) {
      patterns += frameworkContent;
    }
  }

  // Frontend framework patterns
  if (stackProfile.frontend_frameworks && stackProfile.frontend_frameworks.length > 0) {
    const framework = stackProfile.frontend_frameworks[0].name.toLowerCase();
    const frameworkPath = path.join(templatesPath, 'base', 'framework-patterns', `${framework}.md`);
    const frameworkContent = await readFile(frameworkPath);
    if (frameworkContent) {
      patterns += '\n\n' + frameworkContent;
    }
  }

  return patterns;
}

/**
 * Get default lint command for language
 * @param {string} language - Programming language
 * @returns {string} Default lint command
 */
function getDefaultLintCommand(language) {
  const defaults = {
    'typescript': 'npx eslint . --ext .ts,.tsx',
    'javascript': 'npx eslint . --ext .js,.jsx',
    'python': 'ruff check .',
    'go': 'golangci-lint run',
    'rust': 'cargo clippy'
  };
  return defaults[language] || 'echo "No lint command configured"';
}

/**
 * Get default format command for language
 * @param {string} language - Programming language
 * @returns {string} Default format command
 */
function getDefaultFormatCommand(language) {
  const defaults = {
    'typescript': 'npx prettier --write .',
    'javascript': 'npx prettier --write .',
    'python': 'ruff format .',
    'go': 'go fmt ./...',
    'rust': 'cargo fmt'
  };
  return defaults[language] || 'echo "No format command configured"';
}

/**
 * Get default typecheck command for language
 * @param {string} language - Programming language
 * @returns {string} Default typecheck command
 */
function getDefaultTypecheckCommand(language) {
  const defaults = {
    'typescript': 'npx tsc --noEmit',
    'javascript': 'echo "No type checking for JavaScript"',
    'python': 'mypy .',
    'go': 'go vet ./...',
    'rust': 'cargo check'
  };
  return defaults[language] || 'echo "No type check command configured"';
}

/**
 * Get default test command for language
 * @param {string} language - Programming language
 * @returns {string} Default test command
 */
function getDefaultTestCommand(language) {
  const defaults = {
    'typescript': 'npm test',
    'javascript': 'npm test',
    'python': 'pytest tests/',
    'go': 'go test ./...',
    'rust': 'cargo test'
  };
  return defaults[language] || 'echo "No test command configured"';
}

/**
 * Get default build command for language
 * @param {string} language - Programming language
 * @returns {string} Default build command
 */
function getDefaultBuildCommand(language) {
  const defaults = {
    'typescript': 'npm run build',
    'javascript': 'npm run build',
    'python': 'echo "Python does not require build"',
    'go': 'go build ./...',
    'rust': 'cargo build'
  };
  return defaults[language] || 'echo "No build command configured"';
}

/**
 * Get default test framework for language
 * @param {string} language - Programming language
 * @returns {string} Default test framework
 */
function getDefaultTestFramework(language) {
  const defaults = {
    'typescript': 'vitest',
    'javascript': 'vitest',
    'python': 'pytest',
    'go': 'testing',
    'rust': 'cargo test'
  };
  return defaults[language] || 'unknown';
}

/**
 * Get default E2E test command for language
 * @param {string} language - Programming language
 * @returns {string} Default E2E test command
 */
function getDefaultE2ECommand(language) {
  const defaults = {
    'typescript': 'npx playwright test',
    'javascript': 'npx playwright test',
    'python': 'pytest tests/e2e/',
    'go': 'go test ./e2e/...',
    'rust': 'cargo test --test e2e'
  };
  return defaults[language] || 'echo "No E2E command configured"';
}

/**
 * Get default coverage command for language
 * @param {string} language - Programming language
 * @returns {string} Default coverage command
 */
function getDefaultCoverageCommand(language) {
  const defaults = {
    'typescript': 'npm test -- --coverage',
    'javascript': 'npm test -- --coverage',
    'python': 'pytest --cov=src --cov-report=html',
    'go': 'go test -cover ./...',
    'rust': 'cargo tarpaulin'
  };
  return defaults[language] || 'echo "No coverage command configured"';
}

/**
 * Get default coverage view command for language
 * @param {string} language - Programming language
 * @returns {string} Default coverage view command
 */
function getDefaultCoverageViewCommand(language) {
  const defaults = {
    'typescript': 'open coverage/index.html',
    'javascript': 'open coverage/index.html',
    'python': 'open htmlcov/index.html',
    'go': 'go tool cover -html=coverage.out',
    'rust': 'open tarpaulin-report.html'
  };
  return defaults[language] || 'echo "Open coverage report"';
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  generateAgents,
  extractCommandsForLanguage,
  writeAgents,
  generateAgentIndex,
  validateTemplateSubstitution,
  generateAgentsWithTracking,
  regenerateSingleAgent,
  addSingleAgent,
  hashFile
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  // Accept proper command-line arguments from phase5 script
  // Usage: node agent-generation.js <stack-profile.json> <skill-selection.json> <project-path> <templates-path>
  const stackProfilePath = process.argv[2];
  const skillSelectionPath = process.argv[3];
  const projectPath = process.argv[4] || process.cwd();
  const templatesPath = process.argv[5] || path.join(__dirname, '..', 'agents', 'templates');

  if (!stackProfilePath || !skillSelectionPath) {
    console.error('Usage: node agent-generation.js <stack-profile.json> <skill-selection.json> <project-path> <templates-path>');
    process.exit(1);
  }

  // Read stack profile and skill selection from JSON files
  const stackProfile = JSON.parse(fs.readFileSync(stackProfilePath, 'utf8'));
  const skillSelection = JSON.parse(fs.readFileSync(skillSelectionPath, 'utf8'));

  // Generate agents
  generateAgents(stackProfile, skillSelection, projectPath, templatesPath)
    .then(async (generation) => {
      // FIXED: Write agents to disk (this was missing!)
      const writeResult = await writeAgents(generation, projectPath);

      // Output results as JSON for phase5 script to parse
      // Include full agent arrays for index generation
      const result = {
        total: generation.total,
        planning: generation.planning,
        implementation: generation.implementation,
        testing: generation.testing,
        review: generation.review,
        verification: generation.verification,
        documentation: generation.documentation,
        written: writeResult.written,
        errors: writeResult.errors
      };

      console.log(JSON.stringify(result));
    })
    .catch(error => {
      console.error('Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
