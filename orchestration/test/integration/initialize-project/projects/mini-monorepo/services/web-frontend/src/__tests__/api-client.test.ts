import { describe, it, expect, vi } from 'vitest';
import { apiClient } from '../lib/api-client.js';

describe('apiClient', () => {
  it('posts to /auth/login and returns the access token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: 't' }),
    }) as never;
    const result = await apiClient.login({ username: 'alice', password: 'pw' });
    expect(result.accessToken).toBe('t');
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as never;
    await expect(apiClient.login({ username: 'a', password: 'b' })).rejects.toThrow(/401/);
  });
});
