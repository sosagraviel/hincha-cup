/**
 * Agent Generation Module
 *
 * Generates stack-specific agents from templates by substituting variables
 * with detected stack information and project-specific commands.
 *
 * @version 1.0.0
 * @author AI Framework Team
 */

const fs = require('fs');
const path = require('path');

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
    total: 0
  };

  try {
    // 1. Extract commands from project
    const commands = await extractCommands(projectPath, stackProfile);

    // 2. Prepare skills list for agents
    const allSkills = [
      ...skillSelection.always_copied,
      ...skillSelection.language_specific,
      ...skillSelection.frontend,
      ...skillSelection.backend,
      ...skillSelection.cloud,
      ...skillSelection.infrastructure,
      ...skillSelection.integrations
    ].map(s => s.name);

    // 3. Generate planner agent (no variables, language-agnostic)
    const plannerAgent = await generatePlannerAgent(templatesPath);
    if (plannerAgent) {
      generation.planning.push(plannerAgent);
    }

    // 4. Generate implementer agent for detected language
    if (stackProfile.primary_language) {
      const implementerAgent = await generateImplementerAgent(
        templatesPath,
        stackProfile,
        allSkills,
        commands
      );
      if (implementerAgent) {
        generation.implementation.push(implementerAgent);
      }
    }

    // 5. Generate tester agents
    const testerAgents = await generateTesterAgents(
      templatesPath,
      stackProfile,
      allSkills,
      commands
    );
    generation.testing.push(...testerAgents);

    // 6. Generate security reviewer agent
    const securityAgent = await generateSecurityReviewerAgent(
      templatesPath,
      stackProfile,
      allSkills
    );
    if (securityAgent) {
      generation.review.push(securityAgent);
    }

    // Calculate total
    generation.total =
      generation.planning.length +
      generation.implementation.length +
      generation.testing.length +
      generation.review.length;

    return generation;
  } catch (error) {
    console.error('Agent generation error:', error.message);
    throw new Error(`Failed to generate agents: ${error.message}`);
  }
}

/**
 * Extract commands from project configuration files
 */
async function extractCommands(projectPath, stackProfile) {
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

  if (stackProfile.primary_language === 'typescript' || stackProfile.primary_language === 'javascript') {
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

  if (stackProfile.primary_language === 'python') {
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
  const remainingVariables = content.match(/\{\{([^}]+)\}\}/g);

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
 * Generate planner agent (no variables, copy as-is)
 */
async function generatePlannerAgent(templatesPath) {
  const templatePath = path.join(templatesPath, 'planner.template.md');
  const content = await readFile(templatePath);

  if (!content) {
    console.warn('Planner template not found');
    return null;
  }

  // Validate template substitution
  validateTemplateSubstitution(content, 'planner.template.md');

  return {
    name: 'planner',
    filename: 'planner.md',
    content,
    model: 'opus',
    description: 'Create detailed implementation plans'
  };
}

/**
 * Generate implementer agent for detected language
 */
async function generateImplementerAgent(templatesPath, stackProfile, skills, commands) {
  const templatePath = path.join(templatesPath, 'implementer.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Implementer template not found');
    return null;
  }

  const language = stackProfile.primary_language;

  // Perform variable substitution
  content = content.replace(/\{\{stack\}\}/g, language);
  content = content.replace(/\{\{skills\}\}/g, formatSkillsList(skills));
  content = content.replace(/\{\{lint_command\}\}/g, commands.lint_command || 'echo "No lint command"');
  content = content.replace(/\{\{format_command\}\}/g, commands.format_command || 'echo "No format command"');
  content = content.replace(/\{\{type_check_command\}\}/g, commands.type_check_command || 'echo "No type check"');
  content = content.replace(/\{\{unit_test_command\}\}/g, commands.unit_test_command || 'echo "No test command"');
  content = content.replace(/\{\{build_command\}\}/g, commands.build_command || 'echo "No build command"');

  // Inject framework-specific patterns
  if (stackProfile.backend?.framework === 'nestjs') {
    content = injectNestJSPatterns(content);
  } else if (stackProfile.backend?.framework === 'fastapi') {
    content = injectFastAPIPatterns(content);
  } else if (stackProfile.backend?.framework === 'django') {
    content = injectDjangoPatterns(content);
  }

  // Validate template substitution
  validateTemplateSubstitution(content, 'implementer.template.md');

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
async function generateTesterAgents(templatesPath, stackProfile, skills, commands) {
  const agents = [];

  // Unit + Integration tester
  const unitTemplatePath = path.join(templatesPath, 'tester-unit.template.md');
  let unitContent = await readFile(unitTemplatePath);

  if (unitContent) {
    const language = stackProfile.primary_language;

    // Perform variable substitution
    unitContent = unitContent.replace(/\{\{stack\}\}/g, language);
    unitContent = unitContent.replace(/\{\{skills\}\}/g, formatSkillsList(skills));
    unitContent = unitContent.replace(/\{\{test_framework\}\}/g, commands.test_framework || 'jest');
    unitContent = unitContent.replace(/\{\{unit_test_command\}\}/g, commands.unit_test_command || 'npm test');
    unitContent = unitContent.replace(/\{\{integration_test_command\}\}/g, commands.integration_test_command || commands.unit_test_command);
    unitContent = unitContent.replace(/\{\{coverage_command\}\}/g, commands.coverage_command || 'npm test -- --coverage');

    // Test file patterns
    if (language === 'typescript' || language === 'javascript') {
      unitContent = unitContent.replace(/\{\{test_file_pattern\}\}/g, '*.spec.ts or *.test.ts');
      unitContent = unitContent.replace(/\{\{mock_library\}\}/g, 'jest.fn(), jest.mock()');
      unitContent = unitContent.replace(/\{\{assertion_style\}\}/g, 'expect(value).toBe(expected)');
    } else if (language === 'python') {
      unitContent = unitContent.replace(/\{\{test_file_pattern\}\}/g, 'test_*.py or *_test.py');
      unitContent = unitContent.replace(/\{\{mock_library\}\}/g, 'pytest-mock, unittest.mock');
      unitContent = unitContent.replace(/\{\{assertion_style\}\}/g, 'assert value == expected');
    }

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
  if (stackProfile.frontend?.framework && commands.e2e_framework) {
    const e2eTemplatePath = path.join(templatesPath, 'tester-e2e.template.md');
    let e2eContent = await readFile(e2eTemplatePath);

    if (e2eContent) {
      const language = stackProfile.primary_language;

      // Perform variable substitution
      e2eContent = e2eContent.replace(/\{\{stack\}\}/g, language);
      e2eContent = e2eContent.replace(/\{\{skills\}\}/g, formatSkillsList(skills));
      e2eContent = e2eContent.replace(/\{\{e2e_framework\}\}/g, commands.e2e_framework);
      e2eContent = e2eContent.replace(/\{\{e2e_command\}\}/g, commands.e2e_test_command || 'npx playwright test');
      e2eContent = e2eContent.replace(/\{\{e2e_test_pattern\}\}/g, '*.spec.ts or *.e2e.ts');
      e2eContent = e2eContent.replace(/\{\{e2e_ui_mode\}\}/g, `${stackProfile.package_manager || 'npx'} playwright test --ui`);

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
 * Generate security reviewer agent
 */
async function generateSecurityReviewerAgent(templatesPath, stackProfile, skills) {
  const templatePath = path.join(templatesPath, 'security-reviewer.template.md');
  let content = await readFile(templatePath);

  if (!content) {
    console.warn('Security reviewer template not found');
    return null;
  }

  const language = stackProfile.primary_language;

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
    ...generation.review
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

  indexMd += '---\n\n';
  indexMd += `**Total Agents**: ${generation.total}\n\n`;
  indexMd += 'To run an agent: `claude-code agents run <agent-name>`\n';
  indexMd += 'To list agents: `ls .claude/agents/`\n';

  return indexMd;
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
// Exports
// ============================================================================

module.exports = {
  generateAgents,
  extractCommands,
  writeAgents,
  generateAgentIndex,
  validateTemplateSubstitution
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  const projectPath = process.argv[2] || process.cwd();
  const templatesPath = process.argv[3] || path.join(__dirname, '..', 'agents', 'templates');

  const mockStackProfile = {
    primary_language: 'typescript',
    backend: { framework: 'nestjs' },
    frontend: { framework: 'react' },
    testing: [{ name: 'jest', type: 'unit' }, { name: 'playwright', type: 'e2e' }],
    package_manager: 'pnpm'
  };

  const mockSkillSelection = {
    always_copied: [{ name: 'project-context' }],
    language_specific: [{ name: 'mastering-typescript' }],
    frontend: [{ name: 'react-frontend' }],
    backend: [],
    cloud: [],
    infrastructure: [],
    integrations: []
  };

  console.log(`Generating agents for: ${projectPath}\n`);

  generateAgents(mockStackProfile, mockSkillSelection, projectPath, templatesPath)
    .then(generation => {
      console.log('Agent Generation Results:\n');
      console.log(`Planning: ${generation.planning.length}`);
      console.log(`Implementation: ${generation.implementation.length}`);
      console.log(`Testing: ${generation.testing.length}`);
      console.log(`Review: ${generation.review.length}`);
      console.log(`Total: ${generation.total}\n`);

      generation.planning.forEach(a => console.log(`  - ${a.name} (${a.model})`));
      generation.implementation.forEach(a => console.log(`  - ${a.name} (${a.model})`));
      generation.testing.forEach(a => console.log(`  - ${a.name} (${a.model})`));
      generation.review.forEach(a => console.log(`  - ${a.name} (${a.model})`));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
