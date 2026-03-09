#!/usr/bin/env node

/**
 * Argument Parser Utility
 *
 * Stack-agnostic argument parsing for implement-ticket and create-sdd-ticket skills.
 * Validates flag combinations and provides clear error messages.
 *
 * @module argument-parser
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse arguments for implement-ticket skill
 *
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed arguments with inputMode, inputValue, and options
 * @throws {Error} If invalid arguments or combinations
 */
function parseImplementTicketArgs(args) {
  const parsed = {
    inputMode: null,
    inputValue: null,
    options: {
      noStop: false,
      interactive: false,
      skipPreFlight: false,
      resume: false,
      architectMode: false,
      plannerMode: false
    }
  };

  // Parse input mode (mutually exclusive)
  const fromJiraIndex = args.indexOf('--from-jira');
  const fromMarkdownIndex = args.indexOf('--from-markdown');

  if (fromJiraIndex !== -1 && fromMarkdownIndex !== -1) {
    throw new Error('Cannot use both --from-jira and --from-markdown. Choose one input source.');
  }

  if (fromJiraIndex !== -1) {
    parsed.inputMode = 'jira';
    parsed.inputValue = getValueAfterFlag(args, fromJiraIndex, '--from-jira');
    validateJiraInput(parsed.inputValue);
  } else if (fromMarkdownIndex !== -1) {
    parsed.inputMode = 'markdown';
    parsed.inputValue = getValueAfterFlag(args, fromMarkdownIndex, '--from-markdown');
    validateMarkdownPath(parsed.inputValue);
  } else {
    throw new Error(
      'Input source required. Use:\n' +
      '  --from-jira <JIRA-URL-OR-KEY>\n' +
      '  --from-markdown <PATH>\n\n' +
      'Example: /implement-ticket --from-jira PROJ-123'
    );
  }

  // Parse options
  parsed.options.noStop = args.includes('--no-stop') || args.includes('--autonomous');
  parsed.options.interactive = args.includes('--interactive');
  parsed.options.skipPreFlight = args.includes('--skip-pre-flight');
  parsed.options.resume = args.includes('--resume');
  parsed.options.architectMode = args.includes('--architect-mode') || args.includes('--architect');
  parsed.options.plannerMode = args.includes('--planner-mode') || args.includes('--planner');

  // Validate mutually exclusive options
  if (parsed.options.architectMode && parsed.options.plannerMode) {
    throw new Error('Cannot use both --architect-mode and --planner-mode. Choose one planning mode.');
  }

  if (parsed.options.noStop && parsed.options.interactive) {
    console.warn('⚠️  Warning: Both --no-stop and --interactive specified. Using --no-stop (autonomous mode).');
    parsed.options.interactive = false;
  }

  return parsed;
}

/**
 * Parse arguments for create-sdd-ticket skill
 *
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed arguments with inputMode, inputValue, outputMode, outputValue, and options
 * @throws {Error} If invalid arguments or combinations
 */
function parseCreateSddTicketArgs(args) {
  const parsed = {
    inputMode: null,
    inputValue: null,
    outputMode: null,
    outputValue: null,
    options: {
      projectKey: null,
      issueType: 'Story',
      priority: 'Medium'
    }
  };

  // Parse input mode (mutually exclusive)
  const fromInputIndex = args.indexOf('--from-input');
  const fromJiraIndex = args.indexOf('--from-jira');
  const fromMarkdownIndex = args.indexOf('--from-markdown');

  const inputModes = [
    fromInputIndex !== -1 && 'from-input',
    fromJiraIndex !== -1 && 'from-jira',
    fromMarkdownIndex !== -1 && 'from-markdown'
  ].filter(Boolean);

  if (inputModes.length === 0) {
    throw new Error(
      'Input mode required. Use one of:\n' +
      '  --from-input "description"\n' +
      '  --from-jira <JIRA-URL>\n' +
      '  --from-markdown <PATH>\n\n' +
      'Example: /create-sdd-ticket --from-input "Add user export feature" --save-to-markdown ./specs/export.md'
    );
  }

  if (inputModes.length > 1) {
    throw new Error(`Cannot use multiple input modes: ${inputModes.join(', ')}. Choose one.`);
  }

  // Set input mode and value
  if (fromInputIndex !== -1) {
    parsed.inputMode = 'input';
    parsed.inputValue = getValueAfterFlag(args, fromInputIndex, '--from-input');
    if (!parsed.inputValue || parsed.inputValue.length < 10) {
      throw new Error('--from-input requires a description of at least 10 characters');
    }
  } else if (fromJiraIndex !== -1) {
    parsed.inputMode = 'jira';
    parsed.inputValue = getValueAfterFlag(args, fromJiraIndex, '--from-jira');
    validateJiraInput(parsed.inputValue);
  } else if (fromMarkdownIndex !== -1) {
    parsed.inputMode = 'markdown';
    parsed.inputValue = getValueAfterFlag(args, fromMarkdownIndex, '--from-markdown');
    validateMarkdownPath(parsed.inputValue);
  }

  // Parse output destination (mutually exclusive)
  const saveToJiraIndex = args.indexOf('--save-to-jira');
  const saveToMarkdownIndex = args.indexOf('--save-to-markdown');

  const outputModes = [
    saveToJiraIndex !== -1 && 'save-to-jira',
    saveToMarkdownIndex !== -1 && 'save-to-markdown'
  ].filter(Boolean);

  if (outputModes.length === 0) {
    throw new Error(
      'Output destination required. Use one of:\n' +
      '  --save-to-jira <BOARD-URL>\n' +
      '  --save-to-markdown <PATH>\n\n' +
      'Example: --save-to-markdown ./specs/ticket.md'
    );
  }

  if (outputModes.length > 1) {
    throw new Error(`Cannot use multiple output destinations: ${outputModes.join(', ')}. Choose one.`);
  }

  // Set output mode and value
  if (saveToJiraIndex !== -1) {
    parsed.outputMode = 'jira';
    parsed.outputValue = getValueAfterFlag(args, saveToJiraIndex, '--save-to-jira');
    validateJiraBoardUrl(parsed.outputValue);
  } else if (saveToMarkdownIndex !== -1) {
    parsed.outputMode = 'markdown';
    parsed.outputValue = getValueAfterFlag(args, saveToMarkdownIndex, '--save-to-markdown');
    validateOutputPath(parsed.outputValue);
  }

  // Parse optional flags
  const projectKeyIndex = args.indexOf('--project-key');
  if (projectKeyIndex !== -1) {
    parsed.options.projectKey = getValueAfterFlag(args, projectKeyIndex, '--project-key');
    validateProjectKey(parsed.options.projectKey);
  }

  const issueTypeIndex = args.indexOf('--issue-type');
  if (issueTypeIndex !== -1) {
    parsed.options.issueType = getValueAfterFlag(args, issueTypeIndex, '--issue-type');
    validateIssueType(parsed.options.issueType);
  }

  const priorityIndex = args.indexOf('--priority');
  if (priorityIndex !== -1) {
    parsed.options.priority = getValueAfterFlag(args, priorityIndex, '--priority');
    validatePriority(parsed.options.priority);
  }

  // Warn if same source and destination
  if (parsed.inputMode === 'jira' && parsed.outputMode === 'jira') {
    const inputNormalized = normalizeJiraUrl(parsed.inputValue);
    const outputNormalized = normalizeJiraUrl(parsed.outputValue);
    if (inputNormalized === outputNormalized) {
      console.warn('⚠️  Warning: Input and output Jira locations are the same. Ticket will be updated in place.');
    }
  }

  // Require project-key when saving to Jira
  if (parsed.outputMode === 'jira' && !parsed.options.projectKey) {
    throw new Error('--project-key is required when using --save-to-jira\n\nExample: --save-to-jira <url> --project-key PROJ');
  }

  return parsed;
}

/**
 * Get value after a flag
 */
function getValueAfterFlag(args, flagIndex, flagName) {
  const value = args[flagIndex + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flagName} requires a value. Example: ${flagName} <value>`);
  }
  return value;
}

/**
 * Validate Jira input (URL or key)
 */
function validateJiraInput(input) {
  // Accept JIRA-KEY format (PROJECT-123)
  const keyPattern = /^[A-Z]+-[0-9]+$/;
  // Accept full Jira URL
  const urlPattern = /^https?:\/\/[^\/]+\.atlassian\.net\/browse\/[A-Z]+-[0-9]+/;

  if (!keyPattern.test(input) && !urlPattern.test(input)) {
    throw new Error(
      `Invalid Jira input: ${input}\n\n` +
      'Must be either:\n' +
      '  - Jira key: PROJ-123\n' +
      '  - Full URL: https://acme.atlassian.net/browse/PROJ-123'
    );
  }
}

/**
 * Validate markdown file path exists
 */
function validateMarkdownPath(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Markdown file not found: ${filePath}\n\n` +
      `Resolved path: ${resolvedPath}\n` +
      'Check that the file exists and path is correct.'
    );
  }

  if (!filePath.endsWith('.md')) {
    console.warn(`⚠️  Warning: File does not have .md extension: ${filePath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
}

/**
 * Validate Jira board URL
 */
function validateJiraBoardUrl(url) {
  const boardPattern = /^https?:\/\/[^\/]+\.atlassian\.net\/(jira\/software\/projects\/[A-Z]+\/boards\/[0-9]+|browse\/[A-Z]+-[0-9]+)/;

  if (!boardPattern.test(url)) {
    throw new Error(
      `Invalid Jira board URL: ${url}\n\n` +
      'Must be in format:\n' +
      '  https://acme.atlassian.net/jira/software/projects/PROJ/boards/1\n' +
      '  or\n' +
      '  https://acme.atlassian.net/browse/PROJ-123'
    );
  }
}

/**
 * Validate output path is writable
 */
function validateOutputPath(filePath) {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    throw new Error(
      `Output directory does not exist: ${dir}\n\n` +
      'Create the directory first or use a different path.'
    );
  }

  if (fs.existsSync(resolvedPath)) {
    console.warn(`⚠️  Warning: File already exists and will be overwritten: ${filePath}`);
  }

  if (!filePath.endsWith('.md')) {
    console.warn(`⚠️  Warning: Output file does not have .md extension: ${filePath}`);
  }
}

/**
 * Validate project key format
 */
function validateProjectKey(key) {
  const keyPattern = /^[A-Z]+$/;
  if (!keyPattern.test(key)) {
    throw new Error(
      `Invalid project key: ${key}\n\n` +
      'Project key must be uppercase letters only (e.g., PROJ, ENG, TEAM)'
    );
  }
}

/**
 * Validate issue type
 */
function validateIssueType(type) {
  const validTypes = ['Story', 'Task', 'Bug', 'Epic'];
  if (!validTypes.includes(type)) {
    throw new Error(
      `Invalid issue type: ${type}\n\n` +
      `Must be one of: ${validTypes.join(', ')}`
    );
  }
}

/**
 * Validate priority
 */
function validatePriority(priority) {
  const validPriorities = ['High', 'Medium', 'Low'];
  if (!validPriorities.includes(priority)) {
    throw new Error(
      `Invalid priority: ${priority}\n\n` +
      `Must be one of: ${validPriorities.join(', ')}`
    );
  }
}

/**
 * Normalize Jira URL for comparison
 */
function normalizeJiraUrl(input) {
  // Extract key from URL or use as-is if already a key
  const urlMatch = input.match(/browse\/([A-Z]+-[0-9]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  const keyMatch = input.match(/^([A-Z]+-[0-9]+)$/);
  if (keyMatch) {
    return keyMatch[1];
  }

  return input;
}

/**
 * Extract Jira key from URL or return as-is
 */
function extractJiraKey(input) {
  const urlMatch = input.match(/browse\/([A-Z]+-[0-9]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return input;
}

module.exports = {
  parseImplementTicketArgs,
  parseCreateSddTicketArgs,
  extractJiraKey,
  normalizeJiraUrl
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    if (command === 'implement-ticket') {
      const parsed = parseImplementTicketArgs(args.slice(1));
      console.log(JSON.stringify(parsed, null, 2));
    } else if (command === 'create-sdd-ticket') {
      const parsed = parseCreateSddTicketArgs(args.slice(1));
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.error('Usage: node argument-parser.js <implement-ticket|create-sdd-ticket> [args...]');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}
