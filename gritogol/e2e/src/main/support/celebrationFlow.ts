import { expect } from '@playwright/test';
import type { AppShell } from '@pages/AppShell';
import type { ProfilePage } from '@pages/ProfilePage';
import type { GoalOverlay } from '@pages/GoalOverlay';
import type { WallPage } from '@pages/WallPage';

type FanPages = { appShell: AppShell; profilePage: ProfilePage; goalOverlay: GoalOverlay; wallPage: WallPage };

/**
 * The real publication flow (TC-CELEBMODER-001) used as a precondition by other features: open the match, save the
 * display name, trigger a goal with the demo button, upload a celebration and wait until its card is on the wall.
 * Publication is done by the onVideoSubido Storage trigger (~5 s after the file is picked).
 */
export async function publishCelebration(
  pages: FanPages,
  opts: { matchHeaderLabel: string; displayName: string; videoFile: string },
): Promise<void> {
  const { appShell, profilePage, goalOverlay, wallPage } = pages;
  await appShell.openFollowing(opts.matchHeaderLabel);
  await appShell.goToProfile();
  await profilePage.saveDisplayName(opts.displayName);
  await appShell.goToWall();
  await appShell.tapDemoButton('Disparar gol ahora');
  await goalOverlay.expectLoaded();
  await goalOverlay.uploadCelebration('Subir festejo', opts.videoFile);
  // Precondition sync: the card reaches the wall (client frame extraction ~4.5 s + Storage trigger).
  await expect(wallPage.videoOf(opts.displayName)).toBeVisible({ timeout: 45_000 });
}
