import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToOrg } from './helpers/auth';

test.describe('Organizations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display organization selector after login', async ({
    page
  }) => {
    await expect(page.getByText('Your Organizations')).toBeVisible();
    await expect(
      page.getByText('Select an organization to continue')
    ).toBeVisible();
  });

  test('should display organization cards', async ({ page }) => {
    // Should see at least one org card
    const orgCards = page.locator('[class*="rounded-xl"][class*="cursor-pointer"]');
    await expect(orgCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to project list when clicking an org', async ({
    page
  }) => {
    await navigateToOrg(page, 'Acme Corp');

    // Should navigate to org dashboard with projects
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10000 });
  });
});
