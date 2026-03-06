import { test, expect } from '@playwright/test';
import { loginAsAlice, navigateToOrg } from './helpers/auth';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAlice(page);
    await navigateToOrg(page, 'Acme Corp');

    // Navigate to chat page via the header Chat link
    const chatLink = page.getByRole('link', { name: 'Chat' });
    await expect(chatLink).toBeVisible({ timeout: 10000 });
    await chatLink.click();
    await page.waitForURL('**/chat**');
  });

  test('should display chat sidebar with channels section', async ({
    page,
  }) => {
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Direct Messages', { exact: true })).toBeVisible();
  });

  test('should show empty state when no conversation selected', async ({
    page,
  }) => {
    await expect(page.getByText('Select a conversation')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should have search input in sidebar', async ({ page }) => {
    await expect(page.getByPlaceholder('Search...')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should open create channel dialog', async ({ page }) => {
    // Click the + button next to Channels
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 10000 });
    const addButton = page.getByText('Channels', { exact: true }).locator('..').locator('button');
    await addButton.click();

    // Dialog should appear
    await expect(page.getByText('Create Channel')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByPlaceholder('e.g. general')).toBeVisible();
  });

  test('should create a channel and select it', async ({ page }) => {
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 10000 });

    // Open create dialog
    const addButton = page.getByText('Channels', { exact: true }).locator('..').locator('button');
    await addButton.click();
    await expect(page.getByText('Create Channel')).toBeVisible({
      timeout: 5000,
    });

    // Fill in name and submit
    const channelName = `e2e-channel-${Date.now()}`;
    await page.getByPlaceholder('e.g. general').fill(channelName);
    await page.getByRole('button', { name: 'Create' }).click();

    // Channel should appear in sidebar and be selected
    await expect(page.getByText(channelName).first()).toBeVisible({ timeout: 10000 });
  });

  test('should send a message in a channel', async ({ page }) => {
    await expect(page.getByText('Channels', { exact: true })).toBeVisible({ timeout: 10000 });

    // Create a channel first
    const addButton = page.getByText('Channels', { exact: true }).locator('..').locator('button');
    await addButton.click();
    const channelName = `e2e-msg-${Date.now()}`;
    await page.getByPlaceholder('e.g. general').fill(channelName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(channelName).first()).toBeVisible({ timeout: 10000 });

    // Type and send a message
    const messageInput = page.getByPlaceholder('Type a message...');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill('Hello from Playwright!');
    await messageInput.press('Enter');

    // Message should appear in the list
    await expect(page.getByText('Hello from Playwright!')).toBeVisible({
      timeout: 10000,
    });
  });
});
