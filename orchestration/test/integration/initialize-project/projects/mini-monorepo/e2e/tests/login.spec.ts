import { test, expect } from '@playwright/test';

test('login flow redirects to dashboard', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[placeholder="username"]', 'alice');
  await page.fill('input[type="password"]', 'alice');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/);
});
