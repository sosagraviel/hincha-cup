import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3050',
  },
  webServer: {
    command: 'pnpm dev',
    port: 3050,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
