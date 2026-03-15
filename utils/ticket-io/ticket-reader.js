/**
 * Ticket Reader
 * Unified interface for reading tickets from various formats
 */

const { parseMarkdownTicket } = require('./parsers/markdown-parser');
const { parseJiraTicket } = require('./parsers/jira-parser');

class TicketReader {
  /**
   * Read ticket from file
   *
   * @param {string} filePath - Path to ticket file
   * @param {Object} options - Options
   * @param {string} options.format - Format ('markdown' or 'jira'), auto-detected if not specified
   * @returns {Object} Parsed ticket object
   */
  static read(filePath, options = {}) {
    const format = options.format || this.detectFormat(filePath);

    switch (format) {
      case 'markdown':
        return parseMarkdownTicket(filePath);
      case 'jira':
        return parseJiraTicket(filePath);
      default:
        throw new Error(`Unsupported ticket format: ${format}`);
    }
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

module.exports = { TicketReader };
