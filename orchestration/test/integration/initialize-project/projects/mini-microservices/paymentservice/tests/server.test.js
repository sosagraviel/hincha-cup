const { charge } = require('../charge');

describe('charge', () => {
  const validReq = {
    amount: { currency_code: 'USD', units: 100, nanos: 0 },
    credit_card: { credit_card_number: '4111111111111111', credit_card_cvv: 123 },
  };

  it('returns a transaction_id on success', () => {
    const out = charge(validReq);
    expect(out.transaction_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects invalid currency_code', () => {
    expect(() => charge({ ...validReq, amount: { ...validReq.amount, currency_code: 'INVALID' } }))
      .toThrow(/3-letter/);
  });

  it('rejects 15-digit credit card', () => {
    expect(() =>
      charge({ ...validReq, credit_card: { credit_card_number: '411111111111111' } }),
    ).toThrow(/16 digits/);
  });

  it('rejects negative amount', () => {
    expect(() => charge({ ...validReq, amount: { ...validReq.amount, units: -1 } }))
      .toThrow(/non-negative/);
  });
});
