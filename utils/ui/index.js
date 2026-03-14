/**
 * UI Module
 * Screenshot capture and comparison for UI validation
 */

const { captureScreenshot, captureMultipleScreenshots } = require('./screenshot-capture.js');
const { compareScreenshots, generateDiffReport } = require('./screenshot-comparator.js');

module.exports = {
  captureScreenshot,
  captureMultipleScreenshots,
  compareScreenshots,
  generateDiffReport
};
