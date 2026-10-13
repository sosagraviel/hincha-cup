import { expect } from '@playwright/test';
import type { Response } from '@playwright/test';
import { Given, When, Then } from '@fixtures';
import { celebrationFile, matchByName } from '@data/celebrations';
import { publishCelebration } from '@support/celebrationFlow';
import { assignDisplayName, displayNameFor } from '@support/displayNames';

// TC-CELEBWALL-001 — trace .qa-run/traces/TC-CELEBWALL-001.json.
// Fan A = default `page` (publishes); "the second fan" = `secondFan*` fixtures (separate browser context = other guest).

const OBSERVATION_WINDOW_MS = 5_000; // "stays that way for at least 5 s" / "within 5 s of the tap"

Given(
  'a celebration by {string} is published on the {string} of the {string} match with {string} applause',
  async ({ appShell, profilePage, goalOverlay, wallPage, emulator, ctx }, author: string, wallTitle: string, matchName: string, applause: string) => {
    const name = assignDisplayName(ctx, author);
    ctx.set('matchHeaderLabel', matchByName(matchName).headerLabel);
    // Real publication flow (TC-CELEBMODER-001) as Fan A; dependsOn becomes this precondition, not test ordering.
    await publishCelebration(
      { appShell, profilePage, goalOverlay, wallPage },
      { matchHeaderLabel: ctx.get('matchHeaderLabel'), displayName: name, videoFile: celebrationFile('celebration.webm') },
    );
    // Precondition checks: it is on that wall, published, with the given applause count.
    await expect(wallPage.heading).toHaveText(wallTitle);
    await expect(wallPage.applauseButtonIn(wallPage.cardBy(name))).toHaveText(applause);
    // requirement (docs/schema.md): the wall shows only "publicado" videos → the card on the wall is a published one
    await expect.poll(async () => (await emulator.findByField('videos', 'autorAlias', name))[0]?.fields.estado).toBe('publicado');
  },
);

// Step text has "/" (URL) → anchored regex instead of a Cucumber expression (IDE glue resolution).
Given(
  /^a second fan opens GritoGol at "([^"]*)" as a guest in a separate browser session$/,
  async ({ secondFanShell, secondFanGoalOverlay, secondFanWall, ctx }, url: string) => {
    await secondFanShell.openFollowing(ctx.get('matchHeaderLabel'), new URL(url).pathname);
    // Incidental: Fan A's goal window (10 min) is open, so the '¡GOOOL!' dialog covers the wall on every load.
    await secondFanGoalOverlay.dismiss();
    await secondFanWall.expectLoaded();
  },
);

When(
  'the second fan taps the applause button on the {string} celebration card',
  async ({ secondFanShell, secondFanWall, ctx }, author: string) => {
    const name = displayNameFor(ctx, author);
    await secondFanWall.expectCardOf(name);
    await secondFanShell.startRecordingToasts();
    ctx.set<Response>('applauseCommit', await secondFanWall.applaud(name));
  },
);

Then(
  'the applause count on the {string} card shows {string} and the heart is filled',
  async ({ secondFanWall, ctx }, author: string, count: string) => {
    const heart = secondFanWall.applauseButtonIn(secondFanWall.cardBy(displayNameFor(ctx, author)));
    // expected[0]: the heart shows 1 and is filled (applauded) and stays that way for at least 5 s
    const states = await secondFanWall.applauseStatesDuringFirst(OBSERVATION_WINDOW_MS);
    const firstApplauded = states.findIndex((s) => s.count === count && s.applauded);
    expect(firstApplauded, `heart reached "${count}" + filled; states: ${JSON.stringify(states)}`).toBeGreaterThanOrEqual(0);
    expect(
      states.slice(firstApplauded).map(({ count: c, applauded }) => ({ count: c, applauded })),
      `heart stayed at "${count}" + filled for ${OBSERVATION_WINDOW_MS} ms; states: ${JSON.stringify(states)}`,
    ).toEqual(states.slice(firstApplauded).map(() => ({ count, applauded: true })));
    await expect(heart).toHaveText(count);
    await expect(heart).toHaveClass(/accionGustado/); // TODO(testability): aria-pressed for the applauded state
    // requirement (notes): any signed-in fan can applaud another fan's celebration → the backend accepts the write
    expect(ctx.get<Response>('applauseCommit').status(), 'Firestore commit of the applause').toBe(200);
    // not asserted: "only once" per fan — the scenario taps once; a second tap is out of this case's steps.
  },
);

Then('the message {string} is not shown', async ({ secondFanShell }, message: string) => {
  // expected[1]: no toast 'No se pudo aplaudir' (nor 'No podés aplaudir tu propio festejo') within 5 s of the tap
  const shown = await secondFanShell.toastMessagesDuringFirst(OBSERVATION_WINDOW_MS);
  expect(shown, 'toasts shown within 5 s of the tap').not.toContainEqual(expect.stringContaining(message));
  expect(shown, 'toasts shown within 5 s of the tap').not.toContainEqual(
    expect.stringContaining('No podés aplaudir tu propio festejo'),
  );
});

When('the second fan reloads the page', async ({ secondFanWall, secondFanGoalOverlay }) => {
  await secondFanWall.reload();
  // Incidental: the goal window is still open, so the dialog re-opens after the reload.
  await secondFanGoalOverlay.dismiss();
  await secondFanWall.expectLoaded();
});

Then(
  'the {string} card still shows {string} applause',
  async ({ secondFanWall, emulator, ctx }, author: string, count: string) => {
    const name = displayNameFor(ctx, author);
    await secondFanWall.expectCardOf(name);
    // expected[2]: after reload the card shows 1 on the heart button (the applause was saved)
    await expect(secondFanWall.applauseButtonIn(secondFanWall.cardBy(name))).toHaveText(count);
    // requirement (notes): the applause count increases by one → persisted on videos/<id>.aplausos
    expect((await emulator.findByField('videos', 'autorAlias', name))[0]?.fields.aplausos, 'videos/<id>.aplausos').toBe(
      Number(count),
    );
  },
);
