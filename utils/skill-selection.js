/**
 * Skill Selection Module
 *
 * Automatically selects which skills to copy from ai-agentic-framework to a project's
 * .claude/skills/ directory based on stack detection results.
 *
 * @version 1.0.0
 * @author AI Framework Team
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ConfigUpdater } = require('./config-updater');

// Always-copied skills (foundational, copied to every project)
const ALWAYS_COPIED_SKILLS = [
  // Foundation (010)
  { name: 'start-task', category: '010-foundation' },
  { name: 'update-project-context', category: '010-foundation' },

  // Workflow (020)
  { name: 'analyze-requirements', category: '020-development-workflow' },
  { name: 'architect-agent', category: '020-development-workflow' },
  { name: 'code-implementation', category: '020-development-workflow' },
  { name: 'create-sdd-ticket', category: '020-development-workflow' },
  { name: 'implement-ticket', category: '020-development-workflow' },
  { name: 'mastering-git-cli', category: '020-development-workflow' },

  // Quality (030)
  { name: 'code-quality-check', category: '030-quality-assurance' },
  { name: 'create-pr', category: '030-quality-assurance' },
  { name: 'pr-reviewer', category: '030-quality-assurance' },
  { name: 'security-review', category: '030-quality-assurance' },

  // Integrations (040)
  { name: 'fetch-ticket-context', category: '040-integrations' },
  { name: 'jira', category: '040-integrations' },
  { name: 'mastering-confluence-agent-skill', category: '040-integrations' },
  { name: 'mastering-github-agent-skill', category: '040-integrations' },
  { name: 'notion-document-manager', category: '040-integrations' },

  // Documentation (060)
  { name: 'design-doc-mermaid', category: '060-documentation' }
];

/**
 * Main entry point for skill selection
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @param {string} aiStorePath - Path to ai-agentic-framework directory
 * @returns {Promise<Object>} Selected skills with metadata
 */
async function selectSkills(stackProfile, aiStorePath) {
  const selection = {
    always_copied: [],
    language_specific: [],
    frontend: [],
    backend: [],
    cloud: [],
    infrastructure: [],
    integrations: [],
    missing: [],
    total: 0
  };

  try {
    // 1. Start with always-copied skills
    for (const skill of ALWAYS_COPIED_SKILLS) {
      const skillPath = path.join(
        aiStorePath,
        'skills',
        skill.category,
        skill.name
      );
      const exists = await directoryExists(skillPath);

      if (exists) {
        selection.always_copied.push({
          name: skill.name,
          category: skill.category,
          source_path: skillPath,
          reason: 'Always copied (foundational)'
        });
      } else {
        selection.missing.push({
          name: skill.name,
          category: skill.category,
          reason: 'Skill not found in ai-agentic-framework'
        });
      }
    }

    // 2. Select language-specific skills (support both array and legacy format)
    const languages =
      stackProfile.languages ||
      (stackProfile.primary_language
        ? [{ name: stackProfile.primary_language }]
        : []);
    for (const lang of languages) {
      const langName = typeof lang === 'string' ? lang : lang.name;
      const langSkills = await selectLanguageSkills(
        langName,
        stackProfile,
        aiStorePath
      );
      selection.language_specific.push(...langSkills.found);
      selection.missing.push(...langSkills.missing);
    }

    // 3. Select frontend framework skills (support both array and legacy format)
    const frontendFrameworks =
      stackProfile.frontend_frameworks ||
      (stackProfile.frontend?.framework ? [stackProfile.frontend] : []);
    for (const framework of frontendFrameworks) {
      const frameworkName =
        typeof framework === 'string'
          ? framework
          : framework.name || framework.framework;
      const frontendSkills = await selectFrontendSkills(
        frameworkName,
        aiStorePath
      );
      selection.frontend.push(...frontendSkills.found);
      selection.missing.push(...frontendSkills.missing);
    }

    // 4. Select backend framework skills (support both array and legacy format)
    const backendFrameworks =
      stackProfile.backend_frameworks ||
      (stackProfile.backend?.framework ? [stackProfile.backend] : []);
    for (const framework of backendFrameworks) {
      const frameworkName =
        typeof framework === 'string'
          ? framework
          : framework.name || framework.framework;
      const backendSkills = await selectBackendSkills(
        frameworkName,
        aiStorePath
      );
      selection.backend.push(...backendSkills.found);
      selection.missing.push(...backendSkills.missing);
    }

    // 5. Select cloud platform skills
    if (stackProfile.cloud?.length > 0) {
      const cloudSkills = await selectCloudSkills(
        stackProfile.cloud,
        aiStorePath
      );
      selection.cloud.push(...cloudSkills.found);
      selection.missing.push(...cloudSkills.missing);
    }

    // 6. Select infrastructure skills
    if (stackProfile.containers?.length > 0) {
      const infraSkills = await selectInfrastructureSkills(
        stackProfile.containers,
        aiStorePath
      );
      selection.infrastructure.push(...infraSkills.found);
      selection.missing.push(...infraSkills.missing);
    }

    // 7. Select integration skills
    const integrationSkills = await selectIntegrationSkills(
      stackProfile,
      aiStorePath
    );
    selection.integrations.push(...integrationSkills.found);
    selection.missing.push(...integrationSkills.missing);

    // Calculate total
    selection.total =
      selection.always_copied.length +
      selection.language_specific.length +
      selection.frontend.length +
      selection.backend.length +
      selection.cloud.length +
      selection.infrastructure.length +
      selection.integrations.length;

    return selection;
  } catch (error) {
    console.error('Skill selection error:', error.message);
    throw new Error(`Failed to select skills: ${error.message}`);
  }
}

/**
 * Select language-specific skills
 */
async function selectLanguageSkills(language, stackProfile, aiStorePath) {
  const found = [];
  const missing = [];

  if (language === 'typescript' || language === 'javascript') {
    // TypeScript mastery skill
    const tsSkillPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'mastering-typescript'
    );
    if (await directoryExists(tsSkillPath)) {
      found.push({
        name: 'mastering-typescript',
        category: '050-language-frameworks',
        source_path: tsSkillPath,
        reason: 'TypeScript/JavaScript detected'
      });
    } else {
      missing.push({
        name: 'mastering-typescript',
        category: '050-language-frameworks',
        reason: 'TypeScript detected but skill not found'
      });
    }

    // Jest coverage automation (if Jest detected)
    if (stackProfile.testing?.some(t => t.name === 'jest')) {
      const jestSkillPath = path.join(
        aiStorePath,
        'skills',
        '030-quality-assurance',
        'jest-coverage-automation'
      );
      if (await directoryExists(jestSkillPath)) {
        found.push({
          name: 'jest-coverage-automation',
          category: '030-quality-assurance',
          source_path: jestSkillPath,
          reason: 'Jest testing framework detected'
        });
      } else {
        missing.push({
          name: 'jest-coverage-automation',
          category: '030-quality-assurance',
          reason: 'Jest detected but skill not found'
        });
      }
    }

    // PR reviewer skill (optional but useful)
    const prReviewerPath = path.join(
      aiStorePath,
      'skills',
      '030-quality-assurance',
      'pr-reviewer'
    );
    if (await directoryExists(prReviewerPath)) {
      found.push({
        name: 'pr-reviewer',
        category: '030-quality-assurance',
        source_path: prReviewerPath,
        reason: 'PR review automation'
      });
    }
  }

  if (language === 'python') {
    // Python mastery skill
    const pySkillPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'mastering-python-skill'
    );
    if (await directoryExists(pySkillPath)) {
      found.push({
        name: 'mastering-python-skill',
        category: '050-language-frameworks',
        source_path: pySkillPath,
        reason: 'Python detected'
      });
    } else {
      missing.push({
        name: 'mastering-python-skill',
        category: '050-language-frameworks',
        reason: 'Python detected but skill not found'
      });
    }

    // Check for specialized Python frameworks
    // LangGraph
    const langgraphPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'mastering-langgraph-agent-skill'
    );
    if (await directoryExists(langgraphPath)) {
      // Would need to check dependencies - simplified for now
      found.push({
        name: 'mastering-langgraph-agent-skill',
        category: '050-language-frameworks',
        source_path: langgraphPath,
        reason: 'Python with potential LangGraph usage'
      });
    }

    // PyTorch
    const pytorchPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'mastering-pytorch-rl-nlp-agentic-skill'
    );
    if (await directoryExists(pytorchPath)) {
      found.push({
        name: 'mastering-pytorch-rl-nlp-agentic-skill',
        category: '050-language-frameworks',
        source_path: pytorchPath,
        reason: 'Python with potential PyTorch usage'
      });
    }
  }

  return { found, missing };
}

/**
 * Select frontend framework skills
 */
async function selectFrontendSkills(framework, aiStorePath) {
  const found = [];
  const missing = [];

  if (framework === 'react' || framework === 'nextjs') {
    // React frontend skill
    const reactPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'react-frontend'
    );
    if (await directoryExists(reactPath)) {
      found.push({
        name: 'react-frontend',
        category: '050-language-frameworks',
        source_path: reactPath,
        reason: `${framework} detected`
      });
    } else {
      missing.push({
        name: 'react-frontend',
        category: '050-language-frameworks',
        reason: `${framework} detected but skill not found`
      });
    }

    // Atomic design React
    const atomicPath = path.join(
      aiStorePath,
      'skills',
      '050-language-frameworks',
      'atomic-design-react'
    );
    if (await directoryExists(atomicPath)) {
      found.push({
        name: 'atomic-design-react',
        category: '050-language-frameworks',
        source_path: atomicPath,
        reason: 'React component architecture'
      });
    } else {
      missing.push({
        name: 'atomic-design-react',
        category: '050-language-frameworks',
        reason: 'React detected but atomic-design skill not found'
      });
    }

    // Next.js specific patterns (future)
    if (framework === 'nextjs') {
      missing.push({
        name: 'nextjs-patterns',
        category: '050-language-frameworks',
        reason: 'Next.js detected but skill not created yet'
      });
    }
  }

  if (framework === 'vue') {
    missing.push({
      name: 'vue-frontend',
      category: '050-language-frameworks',
      reason: 'Vue detected but skill not created yet'
    });
  }

  if (framework === 'angular') {
    missing.push({
      name: 'angular-patterns',
      category: '050-language-frameworks',
      reason: 'Angular detected but skill not created yet'
    });
  }

  return { found, missing };
}

/**
 * Select backend framework skills
 */
async function selectBackendSkills(framework, aiStorePath) {
  const found = [];
  const missing = [];

  // Most backend framework skills don't exist yet
  if (framework === 'nestjs') {
    missing.push({
      name: 'nestjs-patterns',
      category: '050-language-frameworks',
      reason: 'NestJS detected but skill not created yet'
    });
  }

  if (framework === 'fastapi') {
    missing.push({
      name: 'fastapi-patterns',
      category: '050-language-frameworks',
      reason: 'FastAPI detected but skill not created yet'
    });
  }

  if (framework === 'django') {
    missing.push({
      name: 'django-patterns',
      category: '050-language-frameworks',
      reason: 'Django detected but skill not created yet'
    });
  }

  if (framework === 'flask') {
    missing.push({
      name: 'flask-patterns',
      category: '050-language-frameworks',
      reason: 'Flask detected but skill not created yet'
    });
  }

  return { found, missing };
}

/**
 * Select cloud platform skills
 */
async function selectCloudSkills(cloudPlatforms, aiStorePath) {
  const found = [];
  const missing = [];

  for (const platform of cloudPlatforms) {
    if (platform.name === 'firebase') {
      const firebasePath = path.join(
        aiStorePath,
        'skills',
        '080-cloud-platforms',
        'using-firebase'
      );
      if (await directoryExists(firebasePath)) {
        found.push({
          name: 'using-firebase',
          category: '080-cloud-platforms',
          source_path: firebasePath,
          reason: 'Firebase detected'
        });
      } else {
        missing.push({
          name: 'using-firebase',
          category: '080-cloud-platforms',
          reason: 'Firebase detected but skill not found'
        });
      }
    }

    if (platform.name === 'aws' || platform.name === 'aws-cdk') {
      const awsCliPath = path.join(
        aiStorePath,
        'skills',
        '080-cloud-platforms',
        'mastering-aws-cli'
      );
      if (await directoryExists(awsCliPath)) {
        found.push({
          name: 'mastering-aws-cli',
          category: '080-cloud-platforms',
          source_path: awsCliPath,
          reason: 'AWS detected'
        });
      }

      if (platform.name === 'aws-cdk') {
        const cdkPath = path.join(
          aiStorePath,
          'skills',
          '080-cloud-platforms',
          'mastering-aws-cdk'
        );
        if (await directoryExists(cdkPath)) {
          found.push({
            name: 'mastering-aws-cdk',
            category: '080-cloud-platforms',
            source_path: cdkPath,
            reason: 'AWS CDK detected'
          });
        }
      }
    }

    if (platform.name === 'gcp') {
      const gcpPath = path.join(
        aiStorePath,
        'skills',
        '080-cloud-platforms',
        'mastering-gcloud-commands'
      );
      if (await directoryExists(gcpPath)) {
        found.push({
          name: 'mastering-gcloud-commands',
          category: '080-cloud-platforms',
          source_path: gcpPath,
          reason: 'GCP detected'
        });
      }
    }
  }

  return { found, missing };
}

/**
 * Select infrastructure skills
 */
async function selectInfrastructureSkills(containers, aiStorePath) {
  const found = [];
  const missing = [];

  if (
    containers.some(c => c.name === 'docker' || c.name === 'docker-compose')
  ) {
    const dockerPath = path.join(
      aiStorePath,
      'skills',
      '070-infrastructure',
      'developing-with-docker'
    );
    if (await directoryExists(dockerPath)) {
      found.push({
        name: 'developing-with-docker',
        category: '070-infrastructure',
        source_path: dockerPath,
        reason: 'Docker detected'
      });
    } else {
      missing.push({
        name: 'developing-with-docker',
        category: '070-infrastructure',
        reason: 'Docker detected but skill not found'
      });
    }
  }

  return { found, missing };
}

/**
 * Select integration skills
 */
async function selectIntegrationSkills(stackProfile, aiStorePath) {
  const found = [];
  const missing = [];

  // GitHub (usually already in always-copied, but check)
  const githubPath = path.join(
    aiStorePath,
    'skills',
    '040-integrations',
    'mastering-github-agent-skill'
  );
  if (await directoryExists(githubPath)) {
    found.push({
      name: 'mastering-github-agent-skill',
      category: '040-integrations',
      source_path: githubPath,
      reason: 'GitHub integration'
    });
  }

  // Fetch ticket context (usually with Jira)
  const ticketContextPath = path.join(
    aiStorePath,
    'skills',
    '040-integrations',
    'fetch-ticket-context'
  );
  if (await directoryExists(ticketContextPath)) {
    found.push({
      name: 'fetch-ticket-context',
      category: '040-integrations',
      source_path: ticketContextPath,
      reason: 'Jira ticket context fetching'
    });
  }

  // Confluence (optional, check project context)
  const confluencePath = path.join(
    aiStorePath,
    'skills',
    '040-integrations',
    'mastering-confluence-agent-skill'
  );
  if (await directoryExists(confluencePath)) {
    found.push({
      name: 'mastering-confluence-agent-skill',
      category: '040-integrations',
      source_path: confluencePath,
      reason: 'Confluence documentation'
    });
  }

  // Notion (optional)
  const notionPath = path.join(
    aiStorePath,
    'skills',
    '040-integrations',
    'notion-document-manager'
  );
  if (await directoryExists(notionPath)) {
    found.push({
      name: 'notion-document-manager',
      category: '040-integrations',
      source_path: notionPath,
      reason: 'Notion documentation'
    });
  }

  return { found, missing };
}

/**
 * Copy selected skills to project .claude/skills/ directory
 * IMPORTANT: Preserves full category path (e.g., 010-foundation/initialize-project)
 */
async function copySkills(selection, projectPath) {
  const copied = [];
  const errors = [];

  // Combine all selected skills
  const allSkills = [
    ...selection.always_copied,
    ...selection.language_specific,
    ...selection.frontend,
    ...selection.backend,
    ...selection.cloud,
    ...selection.infrastructure,
    ...selection.integrations
  ];

  const destBase = path.join(projectPath, '.claude', 'skills');

  // Ensure destination directory exists
  await fs.promises.mkdir(destBase, { recursive: true });

  for (const skill of allSkills) {
    try {
      // FIXED: Preserve category path - copy to .claude/skills/category/skill-name
      const destPath = path.join(destBase, skill.category, skill.name);

      // Check if skill already exists
      if (await directoryExists(destPath)) {
        // Compare versions (simplified - would need to read frontmatter)
        console.error(
          `Skill ${skill.category}/${skill.name} already exists, skipping...`
        );
        continue;
      }

      // Ensure category directory exists
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

      // Copy skill directory
      await copyDirectory(skill.source_path, destPath);

      // Make scripts executable if they exist
      const scriptsPath = path.join(destPath, 'scripts');
      if (await directoryExists(scriptsPath)) {
        const scripts = await fs.promises.readdir(scriptsPath);
        for (const script of scripts) {
          const scriptPath = path.join(scriptsPath, script);
          await fs.promises.chmod(scriptPath, 0o755);
        }
      }

      copied.push({
        name: skill.name,
        category: skill.category,
        dest_path: destPath,
        reason: skill.reason
      });
    } catch (error) {
      errors.push({
        name: skill.name,
        category: skill.category,
        error: error.message
      });
    }
  }

  return { copied, errors };
}

/**
 * Generate skill index file
 */
async function generateSkillIndex(selection, projectPath, projectName) {
  let indexMd = '# Installed Skills\n\n';
  indexMd += `**Project**: ${projectName}\n`;
  indexMd += `**Last Updated**: ${new Date().toISOString()}\n\n`;
  indexMd += '---\n\n';

  const sections = [
    {
      title: 'Foundation',
      skills: selection.always_copied.filter(
        s => s.category === '010-foundation'
      )
    },
    {
      title: 'Workflow',
      skills: selection.always_copied.filter(
        s => s.category === '020-development-workflow'
      )
    },
    {
      title: 'Quality Assurance',
      skills: selection.always_copied
        .filter(s => s.category === '030-quality-assurance')
        .concat(
          selection.language_specific.filter(
            s => s.category === '030-quality-assurance'
          )
        )
    },
    {
      title: 'Integrations',
      skills: selection.always_copied
        .filter(s => s.category === '040-integrations')
        .concat(selection.integrations)
    },
    {
      title: 'Language Frameworks',
      skills: selection.language_specific
        .filter(s => s.category === '050-language-frameworks')
        .concat(selection.frontend, selection.backend)
    },
    { title: 'Infrastructure', skills: selection.infrastructure },
    { title: 'Cloud Platforms', skills: selection.cloud }
  ];

  for (const section of sections) {
    if (section.skills.length > 0) {
      indexMd += `## ${section.title} (${section.skills.length} skills)\n\n`;
      for (const skill of section.skills) {
        indexMd += `- \`/${skill.name}\` - ${skill.reason}\n`;
      }
      indexMd += '\n';
    }
  }

  indexMd += '---\n\n';
  indexMd += `**Total Skills**: ${selection.total}\n\n`;
  indexMd += 'To use a skill, type: `/skill-name` in Claude Code\n';
  indexMd += 'To list all skills: `ls .claude/skills/`\n';

  return indexMd;
}

/**
 * Generate missing skills report
 */
async function generateMissingSkillsReport(selection) {
  if (selection.missing.length === 0) {
    return null;
  }

  let reportMd = '# Missing Skills for This Project\n\n';
  reportMd +=
    "The following skills were recommended based on stack detection but don't exist yet:\n\n";

  const categoryGroups = {};
  for (const skill of selection.missing) {
    if (!categoryGroups[skill.category]) {
      categoryGroups[skill.category] = [];
    }
    categoryGroups[skill.category].push(skill);
  }

  for (const [category, skills] of Object.entries(categoryGroups)) {
    reportMd += `## ${category}\n\n`;
    for (const skill of skills) {
      reportMd += `- \`${skill.name}\` - ${skill.reason}\n`;
    }
    reportMd += '\n';
  }

  reportMd += '## How to Request Skills\n\n';
  reportMd +=
    'Create an issue or contact AI team leads to prioritize skill creation.\n';

  return reportMd;
}

// ============================================================================
// File System Utilities
// ============================================================================

async function directoryExists(dirPath) {
  try {
    const stats = await fs.promises.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function copyDirectory(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Copy skills with tracking metadata for sync
 */
async function copySkillsWithTracking(selection, projectPath, frameworkPath) {
  const copied = [];
  const errors = [];
  const skillsTracking = {};

  const allSkills = [
    ...selection.always_copied,
    ...selection.language_specific,
    ...selection.frontend,
    ...selection.backend,
    ...selection.cloud,
    ...selection.infrastructure,
    ...selection.integrations
  ];

  const destBase = path.join(projectPath, '.claude', 'skills');
  await fs.promises.mkdir(destBase, { recursive: true });

  for (const skill of allSkills) {
    try {
      const destPath = path.join(destBase, skill.category, skill.name);

      if (await directoryExists(destPath)) {
        console.error(
          `Skill ${skill.category}/${skill.name} already exists, skipping...`
        );
        continue;
      }

      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await copyDirectory(skill.source_path, destPath);

      const scriptsPath = path.join(destPath, 'scripts');
      if (await directoryExists(scriptsPath)) {
        const scripts = await fs.promises.readdir(scriptsPath);
        for (const script of scripts) {
          const scriptPath = path.join(scriptsPath, script);
          await fs.promises.chmod(scriptPath, 0o755);
        }
      }

      const sourceHash = hashDirectory(skill.source_path);
      const fileHash = hashDirectory(destPath);

      const skillKey = `${skill.category}/${skill.name}`;
      skillsTracking[skillKey] = {
        source_path: path.relative(frameworkPath, skill.source_path),
        copied_timestamp: new Date().toISOString(),
        source_hash: sourceHash,
        file_hash: fileHash,
        managed_by_framework: true,
        user_modified: false,
        dependencies: [],
        last_sync: new Date().toISOString()
      };

      copied.push({
        name: skill.name,
        category: skill.category,
        dest_path: destPath,
        reason: skill.reason
      });
    } catch (error) {
      errors.push({
        name: skill.name,
        category: skill.category,
        error: error.message
      });
    }
  }

  return { copied, errors, skillsTracking };
}

/**
 * Update a single skill (for sync operations)
 */
async function updateSingleSkill(skillName, projectPath, frameworkPath) {
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  const skillInfo = config.resource_state.skills[skillName];
  if (!skillInfo) {
    throw new Error(`Skill ${skillName} not found in configuration`);
  }

  if (!skillInfo.managed_by_framework) {
    console.log(`Skipping ${skillName} (user-managed)`);
    return { updated: false, reason: 'user-managed' };
  }

  const sourcePath = path.join(frameworkPath, skillInfo.source_path);
  const destPath = path.join(projectPath, '.claude', 'skills', skillName);

  if (!await directoryExists(sourcePath)) {
    throw new Error(`Source skill not found: ${sourcePath}`);
  }

  await fs.promises.rm(destPath, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await copyDirectory(sourcePath, destPath);

  const newSourceHash = hashDirectory(sourcePath);
  const newFileHash = hashDirectory(destPath);

  await configUpdater.updateResourceState('skills', skillName, {
    source_hash: newSourceHash,
    file_hash: newFileHash,
    user_modified: false
  });

  return { updated: true, newHash: newFileHash };
}

/**
 * Add a single new skill (for sync operations when stack changes)
 */
async function addSingleSkill(skillName, projectPath, frameworkPath) {
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  if (config.resource_state.skills[skillName]) {
    console.log(`Skill ${skillName} already exists`);
    return { added: false, reason: 'already-exists' };
  }

  const skillsPath = path.join(frameworkPath, 'skills');
  let sourcePath = null;
  let category = null;

  const categories = await fs.promises.readdir(skillsPath);
  for (const cat of categories) {
    const catPath = path.join(skillsPath, cat);
    if (!(await directoryExists(catPath))) continue;

    const skillPath = path.join(catPath, skillName);
    if (await directoryExists(skillPath)) {
      sourcePath = skillPath;
      category = cat;
      break;
    }
  }

  if (!sourcePath) {
    throw new Error(`Skill ${skillName} not found in framework`);
  }

  const destPath = path.join(projectPath, '.claude', 'skills', category, skillName);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await copyDirectory(sourcePath, destPath);

  const sourceHash = hashDirectory(sourcePath);
  const fileHash = hashDirectory(destPath);

  const skillKey = `${category}/${skillName}`;
  await configUpdater.updateResourceState('skills', skillKey, {
    source_path: path.relative(frameworkPath, sourcePath),
    copied_timestamp: new Date().toISOString(),
    source_hash: sourceHash,
    file_hash: fileHash,
    managed_by_framework: true,
    user_modified: false,
    dependencies: []
  });

  return { added: true, path: destPath };
}

/**
 * Hash a directory's contents
 */
function hashDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const files = getAllFilesRecursive(dirPath).sort();
  const combinedContent = files.map(file => fs.readFileSync(file, 'utf-8')).join('');

  return crypto.createHash('sha256').update(combinedContent).digest('hex');
}

/**
 * Get all files in directory recursively
 */
function getAllFilesRecursive(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFilesRecursive(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

module.exports = {
  selectSkills,
  copySkills,
  copySkillsWithTracking,
  updateSingleSkill,
  addSingleSkill,
  generateSkillIndex,
  generateMissingSkillsReport,
  ALWAYS_COPIED_SKILLS
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  // Accept proper command-line arguments from phase5 script
  // Usage: node skill-selection.js <stack-profile.json> <ai-framework-path> <project-path>
  const stackProfilePath = process.argv[2];
  const aiStorePath = process.argv[3] || path.join(__dirname, '..');
  const projectPath = process.argv[4] || process.cwd();

  if (!stackProfilePath) {
    console.error(
      'Usage: node skill-selection.js <stack-profile.json> <ai-framework-path> <project-path>'
    );
    process.exit(1);
  }

  // Read stack profile from JSON file
  const stackProfile = JSON.parse(fs.readFileSync(stackProfilePath, 'utf8'));

  // Select skills based on stack
  selectSkills(stackProfile, aiStorePath)
    .then(async selection => {
      // FIXED: Copy skills to project (this was missing!)
      const copyResult = await copySkills(selection, projectPath);

      // Output results as JSON for phase5 script to parse
      // Include full skill arrays for index generation
      const result = {
        total: selection.total,
        always_copied: selection.always_copied,
        language_specific: selection.language_specific,
        frontend: selection.frontend,
        backend: selection.backend,
        cloud: selection.cloud,
        infrastructure: selection.infrastructure,
        integrations: selection.integrations,
        missing: selection.missing,
        copied: copyResult.copied,
        errors: copyResult.errors
      };

      console.log(JSON.stringify(result));
    })
    .catch(error => {
      console.error('Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
