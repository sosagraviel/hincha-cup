const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findTemplate, createAgent } = require('./template-renderer');
const { extractCommandsForLanguage, getDefault } = require('./command-extractor');
const { resolveSkills } = require('../core/skill-resolver');

function getAllLanguages(stackProfile) {
  if (!stackProfile.languages) return [];
  return stackProfile.languages.map((l) => (typeof l === 'object' ? l.name : l));
}

async function generatePlannerAgent(templatesPath, skills) {
  const template = await findTemplate(templatesPath, 'planner');
  if (!template) return null;

  return createAgent(
    template,
    { skills },
    {
      name: 'planner',
      filename: 'planner.md',
      model: 'opus',
      description: 'Create detailed implementation plans with full architecture awareness'
    }
  );
}

async function generateImplementerAgent(
  templatesPath,
  stackProfile,
  skills,
  commands,
  language
) {
  const template = await findTemplate(templatesPath, 'implementer', language);
  if (!template) return null;

  return createAgent(
    template,
    {
      stack: language,
      skills,
      lint_command: commands.lint_command || getDefault(language, 'lint'),
      format_command: commands.format_command || getDefault(language, 'format'),
      type_check_command: commands.type_check_command || getDefault(language, 'typecheck'),
      unit_test_command: commands.unit_test_command || getDefault(language, 'test'),
      build_command: commands.build_command || getDefault(language, 'build'),
      typecheck_command: commands.type_check_command || getDefault(language, 'typecheck'),
      test_command: commands.unit_test_command || getDefault(language, 'test')
    },
    {
      name: `implementer-${language}`,
      filename: `implementer-${language}.md`,
      model: 'sonnet',
      description: `Implement ${language} code following team conventions`
    }
  );
}

async function generateVisualVerifierAgent(templatesPath, skills, stackProfile) {
  const template = await findTemplate(templatesPath, 'visual-verifier');
  if (!template) return null;

  return createAgent(
    template,
    {},
    {
      name: 'visual-verifier',
      filename: 'visual-verifier.md',
      model: 'opus',
      description: 'Visual verification and UI diff analysis'
    }
  );
}

async function generateAgents(stackProfile, projectPath, templatesPath, frameworkPath) {
  const generation = {
    planning: [],
    implementation: [],
    testing: [],
    review: [],
    verification: [],
    documentation: [],
    total: 0
  };

  const languagesFromProfile = getAllLanguages(stackProfile);
  const languagesFromFileCounts = Object.keys(stackProfile.file_counts || {}).filter(
    (lang) => stackProfile.file_counts[lang] >= 10
  );

  const missingLanguages = languagesFromFileCounts.filter(
    (lang) => !languagesFromProfile.includes(lang)
  );

  if (missingLanguages.length > 0) {
    console.error(
      `❌ ERROR: Languages with significant code missing from stack profile: ${missingLanguages.join(', ')}`
    );
    throw new Error(
      `Stack profile missing languages: ${missingLanguages.join(', ')}. Run stack detection again.`
    );
  }

  try {
    const plannerSkills = resolveSkills(stackProfile, frameworkPath).filter((s) =>
      s.category.includes('foundation')
    );
    const plannerAgent = await generatePlannerAgent(templatesPath, plannerSkills);
    if (plannerAgent) {
      generation.planning.push(plannerAgent);
    }

    const languages = getAllLanguages(stackProfile);
    for (const language of languages) {
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);

      const implementerSkills = resolveSkills(stackProfile, frameworkPath).filter(
        (s) => s.reason?.includes(language) || s.category.includes('foundation')
      );
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

    const frontendFrameworks = stackProfile.frameworks?.frontend || [];
    if (frontendFrameworks.length > 0) {
      const visualVerifierSkills = resolveSkills(stackProfile, frameworkPath).filter((s) =>
        s.name.includes('visual')
      );
      const visualVerifierAgent = await generateVisualVerifierAgent(
        templatesPath,
        visualVerifierSkills,
        stackProfile
      );
      if (visualVerifierAgent) {
        generation.verification.push(visualVerifierAgent);
      }
    }

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

async function writeAgents(generation, projectPath) {
  const destDir = path.join(projectPath, '.claude', 'agents');

  await fs.promises.mkdir(destDir, { recursive: true });

  const written = [];
  const errors = [];

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

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getTemplateFilename(agentName) {
  if (agentName === 'planner') {
    return 'planner.template.md';
  } else if (agentName.startsWith('implementer-')) {
    return 'implementer.template.md';
  } else if (agentName === 'visual-verifier') {
    return 'visual-verifier.template.md';
  }

  throw new Error(`Unknown agent type: ${agentName}`);
}

function getCategoryForAgent(agentName, generation) {
  if (generation.planning.find((a) => a.name === agentName)) return 'planning';
  if (generation.implementation.find((a) => a.name === agentName)) return 'implementation';
  if (generation.testing.find((a) => a.name === agentName)) return 'testing';
  if (generation.review.find((a) => a.name === agentName)) return 'review';
  if (generation.verification.find((a) => a.name === agentName)) return 'verification';
  if (generation.documentation.find((a) => a.name === agentName)) return 'documentation';
  return 'unknown';
}

function getTemplatePathForAgent(agentName, templatesPath, frameworkPath) {
  const filename = getTemplateFilename(agentName);
  return path.join(templatesPath, filename);
}

async function generateAgentsWithTracking(
  stackProfile,
  projectPath,
  templatesPath,
  frameworkPath
) {
  const generation = await generateAgents(stackProfile, projectPath, templatesPath, frameworkPath);

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

async function regenerateSingleAgent(agentName, projectPath, frameworkPath) {
  const { ConfigUpdater } = require('../config/config-updater.js');
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
      const skills = resolveSkills(stackProfile, frameworkPath).filter((s) =>
        s.category.includes('foundation')
      );
      agent = await generatePlannerAgent(templatesPath, skills);
    } else if (category === 'implementation') {
      const skills = resolveSkills(stackProfile, frameworkPath).filter(
        (s) => s.reason?.includes(language) || s.category.includes('foundation')
      );
      const commands = await extractCommandsForLanguage(projectPath, stackProfile, language);
      agent = await generateImplementerAgent(templatesPath, stackProfile, skills, commands, language);
    } else if (category === 'verification') {
      const skills = resolveSkills(stackProfile, frameworkPath).filter((s) =>
        s.name.includes('visual')
      );
      agent = await generateVisualVerifierAgent(templatesPath, skills, stackProfile);
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

async function addSingleAgent(agentName, projectPath, frameworkPath) {
  return regenerateSingleAgent(agentName, projectPath, frameworkPath);
}

module.exports = {
  generateAgents,
  writeAgents,
  generateAgentsWithTracking,
  regenerateSingleAgent,
  addSingleAgent,
  hashFile,
  extractCommandsForLanguage
};
