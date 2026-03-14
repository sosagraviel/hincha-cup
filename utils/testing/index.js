/**
 * Testing Module
 * Test framework detection, orchestration, selection, and E2E initialization
 */

const { detectTestFramework } = require('./test-framework-detection.js');
const { TestOrchestrator } = require('./test-orchestrator.js');
const { selectTests } = require('./smart-test-selection.js');
const { SelfHealingTests } = require('./self-healing-tests.js');
const { initE2EFramework } = require('./init-e2e-framework.js');
const { parseCoverageGaps } = require('./parse-coverage-gaps.js');
const { saveTestCheckpoint, loadTestCheckpoint } = require('./test-checkpoint.js');

module.exports = {
  detectTestFramework,
  TestOrchestrator,
  selectTests,
  SelfHealingTests,
  initE2EFramework,
  parseCoverageGaps,
  saveTestCheckpoint,
  loadTestCheckpoint
};
