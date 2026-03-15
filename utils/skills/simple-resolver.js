/**
 * Simplified Skill Resolver
 *
 * Matches detected stack against skill triggers.
 * No complex logic, just simple array matching.
 */

const fs = require('fs');
const path = require('path');

let cachedConfig = null;

/**
 * Load skills.config.json
 */
function loadConfig(frameworkPath) {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(frameworkPath, 'utils', 'skills.config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Skills config not found: ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(content);
    return cachedConfig;
  } catch (error) {
    throw new Error(`Failed to load skills config: ${error.message}`);
  }
}

/**
 * Resolve skills for a detected stack
 *
 * @param {string[]} detectedStack - Array of detected technologies
 * @param {string} frameworkPath - Path to framework root
 * @returns {Object[]} Array of skills to copy
 */
function resolveSkills(detectedStack, frameworkPath) {
  const config = loadConfig(frameworkPath);
  const selectedSkills = [];

  for (const skill of config.skills) {
    // Skip generated skills (e.g., project-context) - they're created during initialization
    if (skill.generated) {
      continue;
    }

    // Always copy skills
    if (skill.always) {
      selectedSkills.push({
        name: skill.name,
        path: path.join(frameworkPath, skill.path),
        reason: 'Always copied',
        description: skill.description,
        compatible_languages: skill.compatible_languages || []
      });
      continue;
    }

    // Triggered skills - check if any trigger matches detected stack
    if (skill.triggers && skill.triggers.length > 0) {
      const matched = skill.triggers.some(trigger => detectedStack.includes(trigger));

      if (matched) {
        const matchedTriggers = skill.triggers.filter(t => detectedStack.includes(t));
        selectedSkills.push({
          name: skill.name,
          path: path.join(frameworkPath, skill.path),
          reason: `Triggered by: ${matchedTriggers.join(', ')}`,
          description: skill.description,
          compatible_languages: skill.compatible_languages || []
        });
      }
    }
  }

  return selectedSkills;
}

/**
 * Clear cache (for testing)
 */
function clearCache() {
  cachedConfig = null;
}

module.exports = {
  resolveSkills,
  loadConfig,
  clearCache
};
