import { type Locator, type Page, type Response, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type ApplauseState = { count: string; applauded: boolean; atMs: number };

declare global {
  interface Window {
    __qaApplause?: { startedAt: number; states: ApplauseState[] };
  }
}

/** "Muro" tab: "Muro de la hinchada", the feed of published celebrations of the followed match. */
export class WallPage extends BasePage {
  protected readonly path = '/';
  readonly heading: Locator;
  readonly cards: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Muro de la hinchada' });
    // TODO(testability): suggest data-testid / accessible name for the feed card (<article> has no name)
    this.cards = page.getByRole('main').getByRole('article');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  /** Newest card: the feed order (newest first) is part of the expected result. */
  firstCard(): Locator {
    return this.cards.first();
  }

  cardBy(author: string): Locator {
    return this.cards.filter({ has: this.videoOf(author) });
  }

  videoOf(author: string): Locator {
    return this.page.getByRole('img', { name: `Video del festejo de ${author}`, exact: true });
  }

  /** Page title by name (the scenario names it, e.g. "Muro de la hinchada"). */
  title(name: string): Locator {
    return this.page.getByRole('heading', { name });
  }

  /** Video thumbnail of `author`'s celebration inside a given card. */
  videoIn(card: Locator, author: string): Locator {
    return card.getByRole('img', { name: `Video del festejo de ${author}`, exact: true });
  }

  playButtonIn(card: Locator): Locator {
    return card.getByRole('button', { name: 'Reproducir video' });
  }

  /**
   * Applause (heart) button of a card. Applause and share buttons are both named only by their count, in that
   * order, so the first count-named button is the heart.
   * TODO(testability): suggest aria-label / data-testid (and aria-pressed for the applauded state) on the applause button
   */
  applauseButtonIn(card: Locator): Locator {
    return card.getByRole('button', { name: /^\d[\d.,]*$/ }).first();
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async expectCardOf(author: string): Promise<void> {
    await expect(this.videoOf(author)).toBeVisible();
  }

  /**
   * Taps the heart on `author`'s card. Also arms a DOM observer on that button (count + applauded state) so the
   * "stays that way" expectation can be checked over a time window. Returns the Firestore commit response.
   */
  async applaud(author: string): Promise<Response> {
    const heart = this.applauseButtonIn(this.cardBy(author));
    await heart.evaluate((button) => {
      const record = { startedAt: performance.now(), states: [] as ApplauseState[] };
      window.__qaApplause = record;
      const snap = () => {
        const state = {
          count: (button.textContent ?? '').trim(),
          applauded: /accionGustado/.test(button.className),
          atMs: Math.round(performance.now() - record.startedAt),
        };
        const last = record.states[record.states.length - 1];
        if (!last || last.count !== state.count || last.applauded !== state.applauded) record.states.push(state);
      };
      snap();
      new MutationObserver(snap).observe(button, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const commit = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/documents:commit') && (r.request().postData() ?? '').includes('/votos/'),
    );
    await heart.click();
    return commit;
  }

  /** Heart states recorded during the first `windowMs` after `applaud()` (waits until that window ends). */
  async applauseStatesDuringFirst(windowMs: number): Promise<ApplauseState[]> {
    return this.page.evaluate(async (ms) => {
      const record = window.__qaApplause;
      if (!record) throw new Error('applaud() did not arm the applause observer');
      const remaining = record.startedAt + ms - performance.now();
      // Observation window of the expected result ("stays that way for at least 5 s"), not a synchronization sleep.
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      return record.states.filter((s) => s.atMs <= ms);
    }, windowMs);
  }
}
