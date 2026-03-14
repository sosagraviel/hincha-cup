/**
 * Documentation Module
 * Documentation change detection and architecture diagram generation
 */

const { detectDocUpdates } = require('./detect-doc-updates.js');
const { DocChangeDetector } = require('./doc-change-detector.js');
const { generateArchitectureDiagram } = require('./generate-architecture-diagram.js');

module.exports = {
  detectDocUpdates,
  DocChangeDetector,
  generateArchitectureDiagram
};
