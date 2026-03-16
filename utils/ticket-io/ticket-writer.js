/**
 * Ticket Writer
 * Unified interface for writing tickets to various formats
 */

const fs = require('fs');
const path = require('path');
const { MarkdownFormatter } = require('./formatters/markdown-formatter');
const { JiraFormatter } = require('./formatters/jira-formatter');

class TicketWriter {
  /**
   * Write ticket to file
   *
   * @param {Object} ticket - Ticket object to write
   * @param {string} outputPath - Output file path
   * @param {Object} options - Options
   * @param {string} options.format - Format ('markdown' or 'jira'), auto-detected if not specified
   * @returns {string} Path to written file
   */
  static write(ticket, outputPath, options = {}) {
    const format = options.format || this.detectFormat(outputPath);
    let content;

    switch (format) {
      case 'markdown':
        content = MarkdownFormatter.format(ticket);
        break;
      case 'jira':
        content = JiraFormatter.format(ticket);
        break;
      default:
        throw new Error(`Unsupported ticket format: ${format}`);
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(outputPath, content, 'utf-8');

    return outputPath;
  }

  /**
   * Detect ticket format from file extension
   *
   * @param {string} filePath - Path to ticket file
   * @returns {string} Detected format
   */
  static detectFormat(filePath) {
    if (filePath.endsWith('.md')) {
      return 'markdown';
    } else if (filePath.endsWith('.json')) {
      return 'jira';
    }
    return 'markdown'; // Default
  }
}

module.exports = { TicketWriter };
