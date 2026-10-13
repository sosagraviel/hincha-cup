import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** "Perfil" tab: the guest's display name shown on the wall. */
export class ProfilePage extends BasePage {
  protected readonly path = '/perfil';
  readonly displayNameInput: Locator;
  readonly saveNameButton: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    super(page);
    this.displayNameInput = page.getByRole('textbox', { name: 'Tu nombre en el muro' });
    this.saveNameButton = page.getByRole('button', { name: 'Guardar nombre' });
    this.toast = page.getByRole('status');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.displayNameInput).toBeVisible();
  }

  async saveDisplayName(name: string): Promise<void> {
    await this.expectLoaded();
    await this.displayNameInput.fill(name);
    await this.saveNameButton.click();
    await expect(this.toast).toContainText('Nombre actualizado'); // sync: the name is stored
  }
}
