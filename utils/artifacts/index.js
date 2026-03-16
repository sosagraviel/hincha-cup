/**
 * Artifacts Module
 * Artifact collection, accuracy calculation, and PR description generation
 */

const { ArtifactCollector } = require('./artifact-collector.js');
const { calculateAccuracy } = require('./calculate-accuracy.js');
const { generatePRDescription } = require('./pr-description-generator.js');

module.exports = {
  ArtifactCollector,
  calculateAccuracy,
  generatePRDescription
};
