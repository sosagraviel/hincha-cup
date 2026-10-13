import { Before } from '@fixtures';

/**
 * Known intermittent product bugs: scenarios tagged `@intermittent @BUG-NNN`.
 * - Normal run (`npm test`, CI): skipped, so a bug that shows up 1 in N runs does not turn the suite red.
 *   The summary lists them as "known-intermittent".
 * - `npm run test:intermittent`: runs only them, 4 times each (--repeat-each in package.json), and the summary
 *   reports the failure rate. 0 failures out of 4 → "bug-fixed?": check the bug and remove the tags.
 * Deterministic bugs use `@fail @BUG-NNN` instead (playwright-bdd turns @fail into test.fail()).
 */
Before({ tags: '@intermittent' }, async ({ $testInfo, $tags }) => {
  const bug = $tags.find((t) => /^@BUG-\d+$/.test(t))?.slice(1) ?? 'BUG-?';
  $testInfo.annotations.push({ type: 'known-intermittent', description: bug });
  $testInfo.skip(process.env.RUN_INTERMITTENT !== '1', `Known intermittent product bug ${bug}`);
});
