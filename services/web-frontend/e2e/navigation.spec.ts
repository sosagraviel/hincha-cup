import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateToOrg, navigateToProject } from './helpers/auth';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should show header with Gira branding', async ({ page }) => {
    await expect(page.getByText('Gira')).toBeVisible({ timeout: 10000 });
  });

  test('should show user avatar dropdown in header', async ({ page }) => {
    // Click avatar button (the initials badge "AU")
    const avatarButton = page.getByRole('button', { name: 'AU' });
    await expect(avatarButton).toBeVisible({ timeout: 10000 });
    await avatarButton.click();

    // Dropdown should show logout option
    await expect(page.getByText('Logout')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate from orgs to projects and back', async ({ page }) => {
    // Start at orgs page
    await expect(page.getByText('Your Organizations')).toBeVisible({ timeout: 10000 });

    // Navigate to Acme Corp
    await navigateToOrg(page, 'Acme Corp');

    // Should see projects
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10000 });

    // Navigate back via Gira logo link
    await page.getByText('Gira').click();
    await page.waitForURL('**/orgs**');
    await expect(page.getByText('Your Organizations')).toBeVisible({ timeout: 10000 });
  });

  test('should show Chat link when inside an org', async ({ page }) => {
    await navigateToOrg(page, 'Acme Corp');

    // Inside org, Chat link should be visible
    await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should navigate from board to chat and back', async ({ page }) => {
    await navigateToOrg(page, 'Acme Corp');
    await navigateToProject(page);

    // Should see board columns
    await expect(page.getByText('Backlog')).toBeVisible({ timeout: 10000 });

    // Navigate to chat
    const chatLink = page.getByRole('link', { name: 'Chat' });
    await chatLink.click();
    await page.waitForURL('**/chat**');

    // Should see chat sidebar
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should display org name in header breadcrumb', async ({ page }) => {
    await navigateToOrg(page, 'Acme Corp');

    // Org name should appear in the header breadcrumb
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 10000 });
  });

  test('should display org and project in header breadcrumb on board page', async ({
    page
  }) => {
    await navigateToOrg(page, 'Acme Corp');
    await navigateToProject(page, 'Platform Redesign');

    // Both org and project names should be in the header breadcrumb
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Platform Redesign')).toBeVisible({
      timeout: 10000
    });
  });

  test('should navigate home via the home link in the header', async ({
    page
  }) => {
    await navigateToOrg(page, 'Acme Corp');
    await navigateToProject(page);

    // Click the home link
    await page.getByTestId('home-link').click();
    await page.waitForURL('**/orgs**', { timeout: 10000 });
    await expect(page.getByText('Your Organizations')).toBeVisible({
      timeout: 10000
    });
  });
});
