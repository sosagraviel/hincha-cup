import { test, expect } from '@playwright/test';
import { loginAndNavigateToBoard } from './helpers/auth';

test.describe('Kanban Board', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigateToBoard(page);
  });

  test('should display 5 board columns', async ({ page }) => {
    // Wait for board to load
    await expect(page.getByText('Create Ticket')).toBeVisible({
      timeout: 10000
    });

    // Check all 5 column labels
    await expect(page.getByText('Backlog')).toBeVisible();
    await expect(page.getByText('Todo')).toBeVisible();
    await expect(page.getByText('In Progress')).toBeVisible();
    await expect(page.getByText('In Review')).toBeVisible();
    await expect(page.getByText('Done')).toBeVisible();
  });

  test('should show board toolbar with filter and group buttons', async ({
    page
  }) => {
    await expect(page.getByText('Filter')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Group by: Status')).toBeVisible();
  });

  test('should open create ticket dialog', async ({ page }) => {
    await expect(page.getByText('Create Ticket')).toBeVisible({
      timeout: 10000
    });

    await page.getByText('Create Ticket').click();

    // Dialog should appear
    await expect(page.getByText('Create New Ticket')).toBeVisible({
      timeout: 5000
    });
    await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible();
    await expect(page.getByPlaceholder('Add more details...')).toBeVisible();
  });

  test('should close create ticket dialog with Cancel button', async ({
    page
  }) => {
    await page.getByText('Create Ticket').click();
    await expect(page.getByText('Create New Ticket')).toBeVisible({
      timeout: 5000
    });

    await page.getByText('Cancel').click();

    await expect(page.getByText('Create New Ticket')).not.toBeVisible();
  });

  test('should create ticket end-to-end and see it appear on the board', async ({
    page
  }) => {
    await expect(page.getByTestId('create-ticket-button')).toBeVisible({
      timeout: 10000
    });
    await page.getByTestId('create-ticket-button').click();

    // Fill in title
    const title = `E2E Ticket ${Date.now()}`;
    await page.getByPlaceholder('What needs to be done?').fill(title);

    // Submit the form
    await page.getByRole('button', { name: 'Create Ticket' }).click();

    // Dialog should close
    await expect(page.getByText('Create New Ticket')).not.toBeVisible({
      timeout: 5000
    });

    // New ticket should appear on the board
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Ticket Detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigateToBoard(page);
  });

  test('should open ticket detail panel when clicking a ticket', async ({
    page
  }) => {
    // Wait for board to load
    await expect(page.getByText('Create Ticket')).toBeVisible({
      timeout: 10000
    });

    // Click the first ticket card
    const firstTicket = page
      .locator('[class*="rounded-md"][class*="cursor-pointer"]')
      .first();
    await expect(firstTicket).toBeVisible({ timeout: 10000 });
    await firstTicket.click();

    // Ticket detail panel should show with comment section
    await expect(page.getByText('Comments')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByPlaceholder('Add a comment...')
    ).toBeVisible();
  });

  test('should add a comment to a ticket and see it appear', async ({
    page
  }) => {
    await expect(page.getByText('Create Ticket')).toBeVisible({
      timeout: 10000
    });

    // Open first ticket
    const firstTicket = page
      .locator('[class*="rounded-md"][class*="cursor-pointer"]')
      .first();
    await expect(firstTicket).toBeVisible({ timeout: 10000 });
    await firstTicket.click();

    // Wait for comment section to load
    await expect(page.getByPlaceholder('Add a comment...')).toBeVisible({
      timeout: 10000
    });

    // Type and submit a comment
    const commentText = `Playwright comment ${Date.now()}`;
    await page.getByPlaceholder('Add a comment...').fill(commentText);
    await page.getByRole('button', { name: 'Comment' }).click();

    // Comment should appear in the list
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });
});
