import type { HttpFunction } from '@google-cloud/functions-framework';

interface ChargeBody {
  amount: number;
  currency: string;
  customerId: string;
}

export const charge: HttpFunction = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('method not allowed');
    return;
  }
  const body = req.body as ChargeBody;
  if (!body?.amount || body.amount <= 0) {
    res.status(400).json({ error: 'amount must be > 0' });
    return;
  }
  // In production this would call Stripe / a similar processor.
  res.json({
    ok: true,
    chargeId: `ch_${Date.now()}`,
    amount: body.amount,
    currency: body.currency,
    customerId: body.customerId,
  });
};
