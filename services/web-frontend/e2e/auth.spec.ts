import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test.describe('Authentication', () => {
  test('should redirect to Keycloak login when unauthenticated', async ({
    page
  }) => {
    await page.goto('/orgs');

    // Should end up at Keycloak login
    await expect(page).toHaveURL(
      /.*\/realms\/gira\/protocol\/openid-connect\/auth.*/
    );
  });

  test('should show login form on Keycloak page', async ({ page }) => {
    await page.goto('/');

    // Wait for redirect to Keycloak
    await page.waitForURL(
      /.*\/realms\/gira\/protocol\/openid-connect\/auth.*/
    );

    // Keycloak login form should be visible
    await expect(page.locator('#kc-form-login')).toBeVisible({
      timeout: 15000
    });
  });

  test('should login with valid credentials and see organizations', async ({
    page
  }) => {
    await page.goto('/');

    // Wait for Keycloak redirect
    await page.waitForURL(
      /.*\/realms\/gira\/protocol\/openid-connect\/auth.*/
    );

    // Fill in credentials (seed data user)
    await page.fill('#username', 'admin@gira.com');
    await page.fill('#password', 'admin123');
    await page.click('#kc-login');

    // Should redirect back to app and show orgs page
    await page.waitForURL('**/orgs**', { timeout: 15000 });
    await expect(page.getByText('Your Organizations')).toBeVisible();
  });

  test('should logout and redirect to Keycloak login page', async ({
    page
  }) => {
    await loginAsAdmin(page);

    // Open the user dropdown via avatar button
    const avatarButton = page.getByRole('button', { name: 'AU' });
    await expect(avatarButton).toBeVisible({ timeout: 10000 });
    await avatarButton.click();

    // Click logout
    const logoutButton = page.getByTestId('logout-button');
    await expect(logoutButton).toBeVisible({ timeout: 5000 });
    await logoutButton.click();

    // Should redirect back to Keycloak login
    await page.waitForURL(
      /.*\/realms\/gira\/protocol\/openid-connect\/.*/,
      { timeout: 15000 }
    );
  });
});
