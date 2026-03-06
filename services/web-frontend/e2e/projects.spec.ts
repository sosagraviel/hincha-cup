import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToOrg } from './helpers/auth';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToOrg(page, 'Acme Corp');
  });

  test('should display project list with title and description', async ({
    page
  }) => {
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('Manage and access your team projects')
    ).toBeVisible();
  });

  test('should show New Project button', async ({ page }) => {
    await expect(page.getByText('New Project')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to board view when clicking a project', async ({
    page
  }) => {
    // Wait for project cards and click the first one
    const projectCard = page
      .locator('[class*="rounded-xl"][class*="cursor-pointer"]')
      .first();
    await expect(projectCard).toBeVisible({ timeout: 10000 });
    await projectCard.click();

    // Should navigate to the board view with columns
    await page.waitForURL('**/projects/**');

    // Board toolbar should be visible
    await expect(page.getByText('Create Ticket')).toBeVisible({
      timeout: 10000
    });
  });
});
