/**
 * AI Agentic Framework - Utils Public API
 * Production-ready utilities organized by domain
 */

// Core framework modules
const core = require('./core');
const stack = require('./stack');
const skills = require('./skills');
const agents = require('./agents');
const ticketIO = require('./ticket-io');
const validation = require('./validation');

// Domain-specific modules
const config = require('./config');
const errorHandling = require('./error-handling');
const testing = require('./testing');
const workflow = require('./workflow');
const documentation = require('./documentation');
const artifacts = require('./artifacts');
const ui = require('./ui');
const discovery = require('./discovery');

module.exports = {
  // Core framework (most commonly used - direct exports)
  resolveSkills: core.resolveSkills,
  detectStack: stack.detectStack,
  detectStackSimple: stack.detectStackSimple,
  generateAgents: agents.generateAgents,
  TicketReader: ticketIO.TicketReader,
  TicketWriter: ticketIO.TicketWriter,

  // Core modules (namespace exports)
  core,
  stack,
  skills,
  agents,
  ticketIO,
  validation,

  // Domain modules (namespace exports for advanced usage)
  config,
  errorHandling,
  testing,
  workflow,
  documentation,
  artifacts,
  ui,
  discovery
};
