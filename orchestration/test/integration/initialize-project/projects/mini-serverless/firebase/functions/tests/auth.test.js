import { jest } from '@jest/globals';

describe('verifyIdToken', () => {
  it('delegates to admin.auth().verifyIdToken', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ uid: 'u1' });
    jest.unstable_mockModule('firebase-admin', () => ({
      auth: () => ({ verifyIdToken }),
    }));
    const { verifyIdToken: subject } = await import('../lib/auth.js');
    const decoded = await subject('mock-token');
    expect(decoded.uid).toBe('u1');
    expect(verifyIdToken).toHaveBeenCalledWith('mock-token');
  });
});
