import { onCall, onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { audit } from './lib/audit-trail.js';

admin.initializeApp();

export const createUser = onCall({ region: 'us-central1' }, async (request) => {
  const { email, displayName } = request.data;
  if (!email) throw new Error('email required');
  const user = await admin.auth().createUser({ email, displayName });
  await audit('user.created', { uid: user.uid, email });
  return { uid: user.uid };
});

export const healthcheck = onRequest((req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});
