/**
 * Skills Module
 * Skill management and resolution
 */

const { resolveSkills, loadConfig } = require('./simple-resolver');
const { updateSingleSkill, addSingleSkill, hashDirectory, copyDirectory } = require('./skill-manager');

module.exports = {
  // Skill resolution (new simple system)
  resolveSkills,
  loadConfig,

  // Skill management (CRUD operations)
  updateSingleSkill,
  addSingleSkill,
  hashDirectory,
  copyDirectory
};
