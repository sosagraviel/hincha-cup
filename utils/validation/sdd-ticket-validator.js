/**
 * SDD Ticket Validator
 * Validates SDD tickets for completeness and INVEST criteria
 */

const { validateTicket } = require('../ticket-io/validators/ticket-validator');

class SDDTicketValidator {
  /**
   * Validate SDD ticket
   *
   * @param {Object} ticket - Canonical ticket object
   * @returns {Object} Validation result with gaps, warnings, and INVEST scores
   */
  static validate(ticket) {
    return validateTicket(ticket);
  }

  /**
   * Check if ticket is ready for implementation
   *
   * @param {Object} ticket - Canonical ticket object
   * @returns {boolean} True if ready for implementation
   */
  static isReadyForImplementation(ticket) {
    const validation = validateTicket(ticket);
    return validation.summary.readyForImplementation;
  }

  /**
   * Get validation gaps
   *
   * @param {Object} ticket - Canonical ticket object
   * @returns {Array} List of gaps
   */
  static getGaps(ticket) {
    const validation = validateTicket(ticket);
    return validation.gaps;
  }
}

module.exports = { SDDTicketValidator };
