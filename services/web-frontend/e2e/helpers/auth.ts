import type { Page } from '@playwright/test';

export const USERS = {
  admin: { email: 'admin@gira.com', password: 'admin123' },
  alice: { email: 'alice@acme.com', password: 'member123' },
  bob: { email: 'bob@acme.com', password: 'member123' },
  carol: { email: 'carol@widgets.com', password: 'member123' },
} as const;

export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/');
  await page.waitForURL(
    /.*\/realms\/gira\/protocol\/openid-connect\/auth.*/,
  );
  await page.fill('#username', email);
  await page.fill('#password', password);
  await page.click('#kc-login');
  await page.waitForURL('**/orgs**', { timeout: 15000 });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, USERS.admin.email, USERS.admin.password);
}

export async function loginAsAlice(page: Page): Promise<void> {
  await login(page, USERS.alice.email, USERS.alice.password);
}

/**
 * Navigate to a specific org by name, or the first one if no name given.
 * Waits for the org cards to be visible before clicking.
 */
export async function navigateToOrg(
  page: Page,
  orgName?: string,
): Promise<void> {
  if (orgName) {
    const card = page.locator('[class*="rounded-xl"][class*="cursor-pointer"]', {
      hasText: orgName,
    }).first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    await card.click();
  } else {
    const card = page
      .locator('[class*="rounded-xl"][class*="cursor-pointer"]')
      .first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    await card.click();
  }
  await page.waitForURL('**/orgs/**');
}

/** @deprecated Use navigateToOrg('Acme Corp') for deterministic results */
export async function navigateToFirstOrg(page: Page): Promise<void> {
  return navigateToOrg(page);
}

/**
 * Navigate to a specific project by name, or the first one if no name given.
 */
export async function navigateToProject(
  page: Page,
  projectName?: string,
): Promise<void> {
  if (projectName) {
    const card = page.locator('[class*="rounded-xl"][class*="cursor-pointer"]', {
      hasText: projectName,
    }).first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    await card.click();
  } else {
    const card = page
      .locator('[class*="rounded-xl"][class*="cursor-pointer"]')
      .first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    await card.click();
  }
  await page.waitForURL('**/projects/**');
}

/** @deprecated Use navigateToProject() for deterministic results */
export async function navigateToFirstProject(page: Page): Promise<void> {
  return navigateToProject(page);
}

export async function loginAndNavigateToBoard(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await navigateToOrg(page, 'Acme Corp');
  await navigateToProject(page);
}
