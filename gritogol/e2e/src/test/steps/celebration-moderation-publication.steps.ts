import { expect } from '@playwright/test';
import { Given, When, Then } from '@fixtures';
import { celebrationFile, matchByName } from '@data/celebrations';
import { assignDisplayName, displayNameFor } from '@support/displayNames';

// TC-CELEBMODER-001 — trace .qa-run/traces/TC-CELEBMODER-001.json. "The fan" is the default `page` (one guest).

// Step text has "/" (URL) → anchored regex instead of a Cucumber expression (IDE glue resolution).
Given(
  /^the fan opens GritoGol at "([^"]*)" as a guest on the "([^"]*)" match$/,
  async ({ appShell, ctx }, url: string, matchName: string) => {
    await appShell.openFollowing(matchByName(matchName).headerLabel, new URL(url).pathname);
    ctx.set('pelotasBefore', await appShell.pelotasCount()); // baseline for the "goes from … to …" check
  },
);

Given(
  'the fan has saved the display name {string} in the {string} tab',
  async ({ appShell, profilePage, ctx }, name: string, _tab: string) => {
    await appShell.goToProfile();
    await profilePage.saveDisplayName(assignDisplayName(ctx, name));
    await appShell.goToWall();
  },
);

When('the fan taps the demo button {string}', async ({ appShell }, label: string) => {
  await appShell.tapDemoButton(label);
});

Then(
  'the goal screen {string} is shown with a countdown and the button {string}',
  async ({ goalOverlay }, headline: string, button: string) => {
    // expected[0]: within 10 s a full-screen dialog shows '¡GOOOL!', a countdown under 10:00 labelled 'restante',
    // and the buttons 'Grabar mi festejo', 'Subir festejo' and 'Esta vez lo grito solo'
    await expect(goalOverlay.dialog).toBeVisible({ timeout: 10_000 });
    await expect(goalOverlay.textInDialog(headline)).toBeVisible();
    await expect(goalOverlay.countdown).toBeVisible();
    await expect(goalOverlay.remainingLabel).toBeVisible();
    const seconds = await goalOverlay.countdownSeconds();
    expect(seconds, 'countdown is under 10:00').toBeLessThan(600);
    expect(seconds, 'countdown is running').toBeGreaterThan(0);
    await expect(goalOverlay.recordButton).toBeVisible();
    await expect(goalOverlay.buttonInDialog(button)).toBeVisible();
    await expect(goalOverlay.dismissButton).toBeVisible();
  },
);

When(
  'the fan taps {string} and selects the video file {string}',
  async ({ goalOverlay }, button: string, fileName: string) => {
    await goalOverlay.uploadCelebration(button, celebrationFile(fileName));
  },
);

Then('the message {string} is shown', async ({ goalOverlay }, message: string) => {
  // expected[1]: after 'Subiendo tu festejo…' the dialog shows 'El video está siendo revisado' and 'consultando con IA…'.
  // The state lasts ~40 ms (publication is immediate), so a DOM observer armed before the upload records it;
  // this asserts the dialog really rendered both texts (not weakened to "best effort").
  expect(message).toBe('El video está siendo revisado'); // the observer watches exactly this text
  // requirement (GG-MOD-01 scenario 1): the uploaded video starts in estado "revisando" → the review state is rendered
  await expect
    .poll(() => goalOverlay.reviewState(), { timeout: 30_000, message: 'review state rendered in the goal dialog' })
    .toMatchObject({ reviewText: true, consultingText: true });
});

Then('the confirmation {string} is shown', async ({ goalOverlay, appShell }, confirmation: string) => {
  // expected[2]: within 30 s of the review message the dialog closes …
  // requirement (notes): a published video must not remain "under review" indefinitely
  await expect(goalOverlay.dialog).toBeHidden({ timeout: 30_000 });
  // … and the confirmation '¡Ya estás en el muro!' is visible (GG-MOD-01). Soft: the later checks (card, counters)
  // are independent of the wording and must still run when only the text differs.
  await expect.soft(appShell.message(confirmation)).toBeVisible({ timeout: 30_000 });
});

Then(
  'the first card on {string} is the celebration by {string}',
  async ({ wallPage, emulator, page, ctx }, wallTitle: string, author: string) => {
    const name = displayNameFor(ctx, author);
    const card = wallPage.firstCard();
    // expected[3]: on the Muro tab the newest (top) card shows the author, a play button 'Reproducir video' and 0 applause
    await expect(page).toHaveURL(/\/$/);
    await expect(wallPage.title(wallTitle)).toBeVisible();
    await expect(card).toContainText(name);
    await expect(wallPage.videoIn(card, name)).toBeVisible();
    await expect(wallPage.playButtonIn(card)).toBeVisible();
    await expect(wallPage.applauseButtonIn(card)).toHaveText('0');

    // requirement (GG-MOD-01 scenario 1): the clean video becomes "publicado" and never stays under review
    const video = async () => (await emulator.findByField('videos', 'autorAlias', name))[0]?.fields ?? {};
    await expect.poll(async () => (await video()).estado, { message: 'videos/<id>.estado' }).toBe('publicado');
    // requirement (GG-MOD-01 scenario 1): a sequential gritoNumero is assigned — first celebration after a fresh seed = #1
    await expect.poll(async () => (await video()).gritoNumero, { message: 'videos/<id>.gritoNumero' }).toBe(1);
    await expect(card).toContainText('FESTEJO #1');
    // requirement (GG-MOD-01 success criterion 1 + scenarios 1/4): no video reaches "publicado" without passing the
    // moderation function; with USE_MOCK_MODERATION=true it is approved → moderacion.aprobado = true on the video.
    // Soft so the counter check still runs.
    await expect
      .configure({ soft: true })
      .poll(async () => ((await video()).moderacion as { aprobado?: boolean } | undefined)?.aprobado, {
        message: 'videos/<id>.moderacion.aprobado (published through moderarVideo)',
      })
      .toBe(true);
    // not asserted: festejosPublicados increment — the match doc counter is not shown in the UI; pelotasDesbloqueadas,
    // written in the same transaction, is asserted in the next step.
  },
);

Then(
  'the {string} counter under {string} goes from {string} to {string}',
  async ({ appShell, ctx }, counter: string, title: string, from: string, to: string) => {
    // expected[4]: 'Impacto desbloqueado hoy' shows 48 above 'pelotas' (47 before the upload, after make seed)
    // requirement (GG-MOD-01 scenario 1): match counters increment
    expect(counter).toBe('pelotas'); // pelotasCount() reads exactly this counter
    await expect(appShell.scoreboardTitle(title)).toBeVisible();
    expect(ctx.get<number>('pelotasBefore'), 'pelotas before the upload').toBe(Number(from));
    await expect.poll(() => appShell.pelotasCount(), { message: 'pelotas after the upload' }).toBe(Number(to));
  },
);
