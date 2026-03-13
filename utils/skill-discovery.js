/**
 * Skill Discovery Module
 *
 * Detects missing skills based on stack profile and skill registry.
 * Used by sync script to auto-add new framework skills.
 *
 * @version 1.0.0
 * @author AI Framework Team
 */

const fs = require('fs');
const path = require('path');
const { ConfigUpdater } = require('./config-updater');
const { selectSkills } = require('./skill-selection');
const { AGENT_SKILL_MAPPING } = require('./skill-registry');

/**
 * Get all skills that should exist for a given stack profile.
 * Uses selectSkills from skill-selection.js (existing logic).
 *
 * @param {Object} stackProfile - Stack profile from framework-config.json
 * @param {string} frameworkPath - Absolute path to framework root
 * @returns {Promise<Object>} Object with skill keys (category/name) as keys
 */
async function getShouldHaveSkills(stackProfile, frameworkPath) {
  // Use existing selectSkills logic - it already does comprehensive skill selection
  const selection = await selectSkills(stackProfile, frameworkPath);

  // Flatten all skills into a single object
  const allSkills = {};

  const skillArrays = [
    selection.always_copied,
    selection.language_specific,
    selection.frontend,
    selection.backend,
    selection.cloud,
    selection.infrastructure,
    selection.integrations
  ];

  for (const skillArray of skillArrays) {
    for (const skill of skillArray) {
      const skillKey = `${skill.category}/${skill.name}`;
      allSkills[skillKey] = {
        name: skill.name,
        category: skill.category,
        source_path: skill.source_path,
        reason: skill.reason
      };
    }
  }

  return allSkills;
}

/**
 * Discover skills that are missing from the project.
 * Compares should-have vs currently-have, respecting ignored_skills.
 *
 * @param {string} projectPath - Absolute path to project root
 * @param {string} frameworkPath - Absolute path to framework root
 * @returns {Promise<Object>} { missingSkills: Array, currentSkills: Object, ignoredSkills: Array }
 */
async function discoverMissingSkills(projectPath, frameworkPath) {
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);
  const config = await configUpdater.readConfig();

  const stackProfile = config.stack_profile;
  const currentSkills = config.resource_state.skills || {};
  const ignoredSkills = config.ignored_skills || [];

  // Get skills that should exist
  const shouldHaveSkills = await getShouldHaveSkills(stackProfile, frameworkPath);

  // Find missing skills (not in current, not in ignored)
  const missingSkills = [];

  for (const [skillKey, skillInfo] of Object.entries(shouldHaveSkills)) {
    // Check if already installed
    if (currentSkills[skillKey]) {
      continue;
    }

    // Check if explicitly ignored (support both "skill-name" and "category/skill-name" formats)
    if (ignoredSkills.includes(skillKey) || ignoredSkills.includes(skillInfo.name)) {
      continue;
    }

    missingSkills.push({
      key: skillKey,
      ...skillInfo
    });
  }

  return {
    missingSkills,
    currentSkills,
    ignoredSkills,
    totalShouldHave: Object.keys(shouldHaveSkills).length
  };
}

/**
 * Determine which agents need regeneration after adding new skills.
 * Uses AGENT_SKILL_MAPPING to find affected agents.
 *
 * @param {Array} newSkills - Array of newly added skill objects with 'name' property
 * @param {Object} stackProfile - Stack profile from config
 * @param {Object} currentAgents - Current agents from resource_state
 * @returns {Array} Array of agent names that need regeneration
 */
function getAffectedAgents(newSkills, stackProfile, currentAgents) {
  const affectedAgents = new Set();
  const newSkillNames = new Set(newSkills.map(s => s.name));

  // For each agent type, check if any new skill would be included
  for (const [agentType, mapping] of Object.entries(AGENT_SKILL_MAPPING)) {
    // Get all variants of this agent (e.g., implementer-typescript, implementer-python)
    const matchingAgents = Object.keys(currentAgents).filter(name => {
      if (agentType === 'planner') return name === 'planner';
      return name.startsWith(`${agentType}-`) || name === agentType;
    });

    for (const agentName of matchingAgents) {
      // Parse language from agent name
      const language = agentName.includes('-')
        ? agentName.split('-').slice(1).join('-')
        : null;

      // Get skills this agent would have
      const agentSkills = mapping.getSkills(stackProfile, language);

      // Check if any new skill is in this agent's skill list
      for (const skillName of agentSkills) {
        if (newSkillNames.has(skillName)) {
          affectedAgents.add(agentName);
          break;
        }
      }
    }
  }

  return Array.from(affectedAgents);
}

module.exports = {
  getShouldHaveSkills,
  discoverMissingSkills,
  getAffectedAgents
};
