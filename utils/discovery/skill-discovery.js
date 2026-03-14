/**
 * Skill Discovery - Simplified
 *
 * Detects missing skills based on detected stack.
 * Used by sync script to auto-add new framework skills.
 */

const { ConfigUpdater } = require('../config/config-updater');
const { resolveSkills } = require('../core/skill-resolver');

/**
 * Discover skills that are missing from the project
 *
 * @param {string} projectPath - Project root path
 * @param {string} frameworkPath - Framework root path
 * @returns {Promise<Object>} Missing skills info
 */
async function discoverMissingSkills(projectPath, frameworkPath) {
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  const stackProfile = config.stack_profile;
  const currentSkills = config.resource_state?.skills || {};
  const ignoredSkills = config.ignored_skills || [];

  // Resolve skills that should exist for this stack
  const shouldHaveSkills = resolveSkills(stackProfile, frameworkPath);

  // Find missing skills
  const missingSkills = [];

  for (const skill of shouldHaveSkills) {
    const skillKey = getSkillKey(skill.path, frameworkPath);

    // Check if already installed
    if (currentSkills[skillKey]) {
      continue;
    }

    // Check if ignored (support both formats)
    if (ignoredSkills.includes(skill.name) || ignoredSkills.includes(skillKey)) {
      continue;
    }

    missingSkills.push({
      name: skill.name,
      key: skillKey,
      path: skill.path,
      reason: skill.reason
    });
  }

  return {
    missingSkills,
    currentSkills,
    ignoredSkills,
    totalShouldHave: shouldHaveSkills.length
  };
}

/**
 * Get skill key from path (e.g., "skills/050-language-frameworks/react-frontend" -> "050-language-frameworks/react-frontend")
 */
function getSkillKey(skillPath, frameworkPath) {
  const relativePath = skillPath.replace(frameworkPath + '/', '');
  return relativePath.replace('skills/', '');
}

/**
 * Get agents affected by new skills
 * Simple heuristic: if implementer agent, it's affected by any skill change
 */
function getAffectedAgents(newSkills, stackProfile, currentAgents) {
  const affected = [];

  // Always regenerate implementer agents when skills change
  for (const agentName of Object.keys(currentAgents)) {
    if (agentName.startsWith('implementer-')) {
      affected.push(agentName);
    }
  }

  return affected;
}

module.exports = {
  discoverMissingSkills,
  getAffectedAgents
};
