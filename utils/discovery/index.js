/**
 * Discovery Module
 * Skill discovery for sync operations
 */

const { discoverMissingSkills, getAffectedAgents } = require('./skill-discovery.js');

module.exports = {
  discoverMissingSkills,
  getAffectedAgents,
  // Backward compatibility
  discoverSkills: discoverMissingSkills
};
