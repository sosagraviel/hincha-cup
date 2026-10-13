import { type Locator, type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type ReviewStateRecord = { reviewText: boolean; consultingText: boolean; atMs: number | null };

declare global {
  interface Window {
    __qaReviewState?: ReviewStateRecord & { startedAt: number };
  }
}

/** Full-screen "¡GOOOL!" dialog (role=dialog "Gol") opened while a goal window is open. */
export class GoalOverlay extends BasePage {
  protected readonly path = '/';
  readonly dialog: Locator;
  readonly headline: Locator;
  readonly countdown: Locator;
  readonly remainingLabel: Locator;
  readonly recordButton: Locator;
  readonly uploadButton: Locator;
  readonly dismissButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.getByRole('dialog', { name: 'Gol' });
    this.headline = this.dialog.getByText('¡GOOOL!', { exact: true });
    this.countdown = this.dialog.getByText(/^\d{1,2}:\d{2}$/);
    this.remainingLabel = this.dialog.getByText('restante', { exact: true });
    this.recordButton = this.dialog.getByRole('button', { name: 'Grabar mi festejo' });
    this.uploadButton = this.dialog.getByRole('button', { name: 'Subir festejo', exact: true });
    this.dismissButton = this.dialog.getByRole('button', { name: 'Esta vez lo grito solo' });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  /** Exact text inside the goal dialog (e.g. the headline named by the scenario). */
  textInDialog(text: string): Locator {
    return this.dialog.getByText(text, { exact: true });
  }

  /** Button of the goal dialog by its exact accessible name (e.g. "Subir festejo"). */
  buttonInDialog(name: string): Locator {
    return this.dialog.getByRole('button', { name, exact: true });
  }

  /** Seconds left on the countdown ("m:ss"). */
  async countdownSeconds(): Promise<number> {
    const [m, s] = (await this.countdown.innerText()).trim().split(':').map(Number);
    return m! * 60 + s!;
  }

  /**
   * Incidental: while a goal window is open (10 min after any "Disparar gol ahora"), every load shows this dialog
   * to every guest. Called only where the window is known to be open, so it always runs the same path.
   */
  async dismiss(): Promise<void> {
    await this.dismissButton.click();
    await expect(this.dialog).toBeHidden();
  }

  /**
   * "Subir festejo" + pick the file in the native file chooser. The review state ("El video está siendo
   * revisado") lasts ~40 ms before publication, so a DOM observer is armed BEFORE the upload and records whether
   * the dialog ever rendered it. Read it with `reviewState()`.
   */
  async uploadCelebration(buttonLabel: string, filePath: string): Promise<void> {
    await this.watchReviewState();
    const chooser = this.page.waitForEvent('filechooser');
    await this.dialog.getByRole('button', { name: buttonLabel, exact: true }).click();
    await (await chooser).setFiles(filePath);
  }

  private async watchReviewState(): Promise<void> {
    await this.page.evaluate(() => {
      const record = { startedAt: performance.now(), reviewText: false, consultingText: false, atMs: null as number | null };
      window.__qaReviewState = record;
      const check = () => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Gol"]');
        const text = dialog?.textContent ?? '';
        const review = text.includes('El video está siendo revisado');
        const consulting = text.includes('consultando con IA');
        if (review && consulting && record.atMs === null) record.atMs = Math.round(performance.now() - record.startedAt);
        record.reviewText ||= review;
        record.consultingText ||= consulting;
      };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  }

  async reviewState(): Promise<ReviewStateRecord> {
    return this.page.evaluate(() => {
      const r = window.__qaReviewState;
      if (!r) throw new Error('uploadCelebration() did not arm the review-state observer');
      return { reviewText: r.reviewText, consultingText: r.consultingText, atMs: r.atMs };
    });
  }
}
