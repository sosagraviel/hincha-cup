import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';
import 'dotenv/config';

const isCI = !!process.env.CI;
const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

// Layout: src/main = framework code (pages, fixtures/DI, support, data, utils, reporters);
//         src/test = what is tested (steps, hooks, resources/features).
// features (Gherkin) → steps (TS) → pages. bddgen turns each scenario into a Playwright test in .features-gen/.
const testDir = defineBddConfig({
  features: 'src/test/resources/features/**/*.feature',
  steps: ['src/test/steps/**/*.ts', 'src/test/hooks/**/*.ts', 'src/main/fixtures/**/*.ts'],
  outputDir: '.features-gen',
});

export default defineConfig({
  testDir,
  // Serial on purpose: every scenario resets the ONE local Firestore emulator (`freshData` fixture) and asserts
  // match-wide counters ("pelotas" 47 → 48) and match-wide goal windows, so two scenarios cannot overlap.
  // Each scenario is still independent (own browser contexts, own fixtures, own data) and order-agnostic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 120_000, // emulator reset + seed (~10-20 s) + client frame extraction and upload (~5 s) + publication
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    cucumberReporter('html', { outputFile: 'cucumber-report/index.html' }),
    ['./src/main/reporters/summary-reporter.ts'],
  ],
  use: {
    baseURL,
    testIdAttribute: process.env.TEST_ID_ATTRIBUTE ?? 'data-testid', // the app has no test ids today
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-AR', // UI copy is rioplatense Spanish
  },
  projects: [
    // Guest-only app (anonymous Firebase Auth): no login, no storageState. Every browser context is a new guest.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // `make start` detaches (`docker compose up -d`), so this is its foreground form. The trap removes the
  // containers when Playwright stops the server. An app that is already up on BASE_URL is reused as is.
  webServer: {
    command:
      "sh -c 'test -f docker/.env || cp docker/.env.example docker/.env; trap \"docker compose down\" TERM INT; docker compose up --build & wait'",
    cwd: '..',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 600_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
  },
});
