// charge(req) — pure function, easy to unit test.
const { randomUUID } = require('crypto');

/**
 * Validate + charge a credit card.
 *
 * @param {object} req                          The gRPC request.
 * @param {object} req.amount                   Money.
 * @param {string} req.amount.currency_code     ISO 4217 (3 letters).
 * @param {number} req.amount.units             integer part.
 * @param {object} req.credit_card              Card info.
 * @param {string} req.credit_card.credit_card_number  PAN (16 digits).
 * @returns {{transaction_id: string}}
 * @throws Error if validation fails.
 */
function charge(req) {
  if (!req?.amount?.currency_code || req.amount.currency_code.length !== 3) {
    throw new Error('amount.currency_code must be a 3-letter ISO code');
  }
  if (typeof req.amount.units !== 'number' || req.amount.units < 0) {
    throw new Error('amount.units must be a non-negative number');
  }
  const card = req.credit_card?.credit_card_number ?? '';
  if (!/^[0-9]{16}$/.test(card)) {
    throw new Error('credit_card.credit_card_number must be 16 digits');
  }
  return { transaction_id: randomUUID() };
}

module.exports = { charge };
