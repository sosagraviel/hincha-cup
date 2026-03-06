import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should redirect unauthenticated users to Keycloak login', async ({
    page
  }) => {
    await page.goto('/');

    // Should redirect to Keycloak login page
    await expect(page).toHaveURL(/.*\/realms\/gira\/protocol\/openid-connect\/auth.*/);
  });
});
