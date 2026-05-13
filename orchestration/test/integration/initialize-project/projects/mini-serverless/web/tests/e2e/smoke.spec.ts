import { test, expect } from '@playwright/test';

test('renders the login form', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
