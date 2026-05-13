import { charge } from '../index.js';

interface MockReqRes {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
}

function makeRes(): MockReqRes {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as MockReqRes;
}

describe('charge', () => {
  it('rejects non-POST', async () => {
    const res = makeRes();
    await charge({ method: 'GET' } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects zero amount', async () => {
    const res = makeRes();
    await charge(
      { method: 'POST', body: { amount: 0, currency: 'USD', customerId: 'cu_1' } } as never,
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns a charge id on success', async () => {
    const res = makeRes();
    await charge(
      { method: 'POST', body: { amount: 1000, currency: 'USD', customerId: 'cu_1' } } as never,
      res as never,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, amount: 1000 }));
  });
});
