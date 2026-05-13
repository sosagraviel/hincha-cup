import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
  it('rejects requests with no bearer token', async () => {
    const guard = new AuthGuard({ verifyAsync: jest.fn() } as never);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as never;
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Missing bearer token/);
  });

  it('rejects requests with an invalid token', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad')) };
    const guard = new AuthGuard(jwt as never);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer bogus' } }),
      }),
    } as never;
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Invalid token/);
  });
});
