import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

type ToastRecord = { message: string; atMs: number };

declare global {
  interface Window {
    __qaToasts?: { startedAt: number; messages: ToastRecord[] };
  }
}

/**
 * Parts of the app that are on every tab: header (followed match), "Marcador de impacto", tab bar,
 * demo controls (dev build only) and the toast (role=status).
 */
export class AppShell extends BasePage {
  protected readonly path = '/';
  readonly header: Locator;
  readonly impactScoreboard: Locator;
  readonly wallTab: Locator;
  readonly profileTab: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    super(page);
    this.header = page.getByRole('banner');
    this.impactScoreboard = page.getByRole('region', { name: 'Marcador de impacto' });
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    this.wallTab = nav.getByRole('link', { name: 'Muro' });
    this.profileTab = nav.getByRole('link', { name: 'Perfil' });
    this.toast = page.getByRole('status');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.impactScoreboard).toBeVisible();
  }

  /** A message anywhere on screen (confirmation screen or toast): GG-MOD-01 does not fix where it appears. */
  message(text: string): Locator {
    return this.page.getByText(text);
  }

  /** Section title inside "Marcador de impacto" (e.g. "Impacto desbloqueado hoy"). */
  scoreboardTitle(title: string): Locator {
    return this.impactScoreboard.getByRole('heading', { name: title });
  }

  /**
   * Opens the app as a guest (new browser context = new anonymous guest) and waits until the followed match
   * (e.g. "URU – ESP") is loaded (~1-2 s). `path` is resolved against BASE_URL.
   */
  async openFollowing(matchHeaderLabel: string, path: string = this.path): Promise<void> {
    await this.page.goto(path);
    await expect(this.header).toContainText(matchHeaderLabel);
    await this.expectLoaded();
  }

  async goToProfile(): Promise<void> {
    await this.profileTab.click();
    await expect(this.page).toHaveURL(/\/perfil$/);
  }

  async goToWall(): Promise<void> {
    await this.wallTab.click();
    await expect(this.page).toHaveURL(/\/$/);
  }

  /** Demo controls (dev build only, bottom right). "Disparar gol ahora" opens a 10-minute goal window. */
  async tapDemoButton(label: string): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  /** Number shown above "pelotas" in "Impacto desbloqueado hoy". */
  async pelotasCount(): Promise<number> {
    const text = await this.impactScoreboard.innerText();
    const match = /(\d+)\s*pelotas/i.exec(text);
    if (!match) throw new Error(`"pelotas" counter not found in the impact scoreboard: ${text}`);
    return Number(match[1]);
  }

  /**
   * Starts recording every message the toast shows from now on (the toast hides after ~3 s, so a later
   * snapshot could miss it). Read the record with `toastMessagesDuringFirst(ms)`.
   */
  async startRecordingToasts(): Promise<void> {
    await this.toast.evaluate((status) => {
      const record = { startedAt: performance.now(), messages: [] as ToastRecord[] };
      window.__qaToasts = record;
      const push = () => {
        const message = (status.textContent ?? '').trim();
        const last = record.messages[record.messages.length - 1];
        if (message && message !== last?.message) {
          record.messages.push({ message, atMs: Math.round(performance.now() - record.startedAt) });
        }
      };
      new MutationObserver(push).observe(status, { subtree: true, childList: true, characterData: true, attributes: true });
    });
  }

  /** Toast messages shown during the first `windowMs` after `startRecordingToasts()` (waits until that window ends). */
  async toastMessagesDuringFirst(windowMs: number): Promise<string[]> {
    return this.page.evaluate(async (ms) => {
      const record = window.__qaToasts;
      if (!record) throw new Error('startRecordingToasts() was not called');
      const remaining = record.startedAt + ms - performance.now();
      // Observation window of the expected result ("within 5 s of the tap"), not a synchronization sleep.
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      return record.messages.filter((m) => m.atMs <= ms).map((m) => m.message);
    }, windowMs);
  }
}
