import type { Page } from '@playwright/test';
import { test as base, createBdd } from 'playwright-bdd';
import { ScenarioContext } from '@support/ScenarioContext';
import { AppShell } from '@pages/AppShell';
import { ProfilePage } from '@pages/ProfilePage';
import { GoalOverlay } from '@pages/GoalOverlay';
import { WallPage } from '@pages/WallPage';
import { FirestoreEmulator } from '@utils/firestoreEmulator';
import { runSeed } from '@utils/seed';

/**
 * Dependency injection, PicoContainer-style, with Playwright fixtures:
 * - Steps never `new` a page: they ask for it by name (`async ({ wallPage, ctx }) => …`).
 * - Fixtures are scenario-scoped: created lazily on first use, shared by every step of that scenario, disposed after it.
 * - No shared state between scenarios.
 *
 * Fans: the default `page` is the first fan ("the fan" / "QA Fan A"). `secondFanPage` is a separate browser
 * context, i.e. a different anonymous guest ("the second fan"), with its own Page Objects.
 */
type Fixtures = {
  ctx: ScenarioContext;
  freshData: void;
  emulator: FirestoreEmulator;
  appShell: AppShell;
  profilePage: ProfilePage;
  goalOverlay: GoalOverlay;
  wallPage: WallPage;
  secondFanPage: Page;
  secondFanShell: AppShell;
  secondFanGoalOverlay: GoalOverlay;
  secondFanWall: WallPage;
};

export const test = base.extend<Fixtures>({
  ctx: async ({}, use) => use(new ScenarioContext()),

  emulator: async ({}, use) => use(new FirestoreEmulator()),

  /**
   * reset-gap: `make seed` alone does not delete videos nor goal events (an open goal window re-opens the
   * "¡GOOOL!" dialog on every load). Every scenario starts from: local Firestore emulator emptied + `make seed`.
   * Local emulator only (FirestoreEmulator refuses non-local hosts). Runs before any page is opened.
   */
  freshData: [
    async ({ emulator }, use) => {
      await emulator.clearAllDocuments();
      runSeed();
      await use();
    },
    { auto: true, timeout: 180_000 },
  ],

  appShell: async ({ page }, use) => use(new AppShell(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  goalOverlay: async ({ page }, use) => use(new GoalOverlay(page)),
  wallPage: async ({ page }, use) => use(new WallPage(page)),

  secondFanPage: async ({ browser, baseURL, locale }, use) => {
    const context = await browser.newContext({ baseURL, locale });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  secondFanShell: async ({ secondFanPage }, use) => use(new AppShell(secondFanPage)),
  secondFanGoalOverlay: async ({ secondFanPage }, use) => use(new GoalOverlay(secondFanPage)),
  secondFanWall: async ({ secondFanPage }, use) => use(new WallPage(secondFanPage)),
});

export const { Given, When, Then, Before, After } = createBdd(test);
