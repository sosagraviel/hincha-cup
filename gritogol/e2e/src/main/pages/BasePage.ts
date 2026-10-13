import { type Page, type Locator, expect } from '@playwright/test';

export abstract class BasePage {
  /** Path relative to baseURL. */
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path);
    await this.expectLoaded();
  }

  /** Synchronization: the screen is ready. Override with an element specific to the page. */
  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  protected byRole(role: Parameters<Page['getByRole']>[0], name: string | RegExp): Locator {
    return this.page.getByRole(role, { name });
  }
}
