/**
 * Agent-Skill Validator
 *
 * Detects when agents are missing skills that should be linked.
 * Used by sync to catch cases where skills exist but agents aren't updated.
 */

const { resolveSkills } = require('../core/skill-resolver');
const path = require('path');
const fs = require('fs');

/**
 * Get all languages from stack profile
 */
function getAllLanguages(stackProfile) {
  if (!stackProfile.languages) return [];
  return stackProfile.languages.map((l) => (typeof l === 'object' ? l.name : l));
}

/**
 * Filter skills that planner should have (languages + frameworks)
 */
function filterSkillsForPlanner(skills, stackProfile) {
  const allLanguages = getAllLanguages(stackProfile).map(l => l.toLowerCase());

  return skills.filter(s => {
    const isLanguageSkill = allLanguages.some(lang =>
      s.reason?.toLowerCase().includes(lang)
    );

    const isFrameworkSkill = s.reason?.toLowerCase().includes('triggered by:') && !isLanguageSkill;

    return isLanguageSkill || isFrameworkSkill;
  });
}

/**
 * Extract skills from agent frontmatter
 */
function extractSkillsFromAgent(agentPath) {
  if (!fs.existsSync(agentPath)) {
    return [];
  }

  const content = fs.readFileSync(agentPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return [];
  }

  const frontmatter = frontmatterMatch[1];
  const skillsMatch = frontmatter.match(/skills:\s*\n((?:\s+-\s+.+\n?)*)/);

  if (!skillsMatch) {
    return [];
  }

  const skillsList = skillsMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-'))
    .map(line => line.substring(1).trim());

  return skillsList;
}

/**
 * Check if planner needs regeneration due to missing skills
 */
function plannerNeedsRegeneration(projectPath, frameworkPath, stackProfile) {
  const plannerPath = path.join(projectPath, '.claude/agents/planner.md');

  if (!fs.existsSync(plannerPath)) {
    return { needsRegen: false, reason: 'planner not found' };
  }

  // Get skills planner should have
  const allSkills = resolveSkills(stackProfile, frameworkPath);
  const shouldHaveSkills = filterSkillsForPlanner(allSkills, stackProfile);
  const shouldHaveSkillNames = shouldHaveSkills.map(s => s.name);

  // Add project-context (always included)
  shouldHaveSkillNames.push('project-context');

  // Get skills planner actually has
  const currentSkills = extractSkillsFromAgent(plannerPath);

  // Find missing skills
  const missingSkills = shouldHaveSkillNames.filter(skill => !currentSkills.includes(skill));

  if (missingSkills.length > 0) {
    return {
      needsRegen: true,
      reason: 'missing skills',
      missingSkills,
      shouldHave: shouldHaveSkillNames,
      currentlyHas: currentSkills
    };
  }

  return { needsRegen: false, reason: 'all skills linked' };
}

/**
 * Check if implementer needs regeneration due to missing skills
 */
function implementerNeedsRegeneration(agentName, projectPath, frameworkPath, stackProfile) {
  const agentPath = path.join(projectPath, '.claude/agents', `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    return { needsRegen: false, reason: 'agent not found' };
  }

  // Extract language from agent name (e.g., "implementer-typescript" -> "typescript")
  const language = agentName.replace('implementer-', '');
  const allLanguages = getAllLanguages(stackProfile).map(l => l.toLowerCase());
  const langLower = language.toLowerCase();

  // Get skills implementer should have
  const allSkills = resolveSkills(stackProfile, frameworkPath);
  const shouldHaveSkills = allSkills.filter(s => {
    const isLanguageSkill = allLanguages.some(lang =>
      s.reason?.toLowerCase().includes(lang)
    );

    if (isLanguageSkill) {
      return s.reason?.toLowerCase().includes(langLower);
    }

    const isFrameworkSkill = s.reason?.toLowerCase().includes('triggered by:') && !isLanguageSkill;

    if (isFrameworkSkill) {
      if (s.compatible_languages && s.compatible_languages.length > 0) {
        return s.compatible_languages.some(compatLang =>
          compatLang.toLowerCase() === langLower
        );
      }
      return true;
    }

    return false;
  });

  const shouldHaveSkillNames = shouldHaveSkills.map(s => s.name);
  shouldHaveSkillNames.push('project-context');

  // Get skills implementer actually has
  const currentSkills = extractSkillsFromAgent(agentPath);

  // Find missing skills
  const missingSkills = shouldHaveSkillNames.filter(skill => !currentSkills.includes(skill));

  if (missingSkills.length > 0) {
    return {
      needsRegen: true,
      reason: 'missing skills',
      missingSkills,
      shouldHave: shouldHaveSkillNames,
      currentlyHas: currentSkills
    };
  }

  return { needsRegen: false, reason: 'all skills linked' };
}

/**
 * Validate all agents and return those that need regeneration
 */
function validateAgentSkills(projectPath, frameworkPath, stackProfile, currentAgents) {
  const needsRegeneration = [];

  // Check planner
  if (currentAgents['planner']) {
    const plannerCheck = plannerNeedsRegeneration(projectPath, frameworkPath, stackProfile);
    if (plannerCheck.needsRegen) {
      needsRegeneration.push({
        agent: 'planner',
        ...plannerCheck
      });
    }
  }

  // Check implementers
  for (const agentName of Object.keys(currentAgents)) {
    if (agentName.startsWith('implementer-')) {
      const implementerCheck = implementerNeedsRegeneration(agentName, projectPath, frameworkPath, stackProfile);
      if (implementerCheck.needsRegen) {
        needsRegeneration.push({
          agent: agentName,
          ...implementerCheck
        });
      }
    }
  }

  return needsRegeneration;
}

module.exports = {
  validateAgentSkills,
  plannerNeedsRegeneration,
  implementerNeedsRegeneration
};
