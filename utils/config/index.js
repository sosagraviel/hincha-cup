/**
 * Configuration Module
 * Handles environment detection, MCP configuration, and argument parsing
 */

const { ConfigUpdater } = require('./config-updater.js');
const { detectEnvironment } = require('./environment-detection.js');
const { EnvironmentManager } = require('./environment-manager.js');
const { detectMCPServers } = require('./mcp-detection.js');
const { parseArguments } = require('./argument-parser.js');

module.exports = {
  ConfigUpdater,
  detectEnvironment,
  EnvironmentManager,
  detectMCPServers,
  parseArguments
};
