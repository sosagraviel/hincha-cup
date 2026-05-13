import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Anti-regression: `ui-testing/SKILL.md` claims to be stack-agnostic but
 * historically embedded FSD (Feature-Sliced Design) path patterns + a
 * hardcoded `src/test-setup.ts` literal. Those were removed and the
 * skill was updated to defer to the per-project
 * `testing-conventions` skill (synthesised by Phase 3 of
 * `/initialize-project`) for layout discovery.
 *
 * This test guards against any future edit reintroducing a hardcoded
 * methodology or a load-bearing static path.
 */

const UI_TESTING_SKILL_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/ui-testing/SKILL.md',
);
const UI_VISUAL_TESTING_SKILL_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/ui-visual-testing/SKILL.md',
);
const TOOL_DETECTION_REF_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/ui-testing/references/tool-detection.md',
);
const REACT_SPEC_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/ui-testing/references/react-specialization.md',
);

describe('ui-testing skill — stack-agnostic by construction', () => {
  describe('SKILL.md body', () => {
    const body = readFileSync(UI_TESTING_SKILL_PATH, 'utf-8');

    it('does NOT carry hardcoded FSD path patterns', () => {
      // FSD-specific tokens that bias the task classifier toward the
      // FSD methodology; projects that don't use FSD got misclassified.
      expect(body).not.toMatch(/\bshared\/ui\//);
      expect(body).not.toMatch(/\bentities\/\*\/ui\b/);
      // `widgets/` is so common (it's also a real Next.js / generic dir
      // name) that we only flag the specific FSD framing — "new file in
      // `widgets/`" — not the standalone token. The prior body had:
      //   "**New organism/widget** — new file in `widgets/`"
      // The post-cleanup body talks about the project's organism/widget
      // directory, deferred to testing-conventions.
      expect(body).not.toMatch(/new file in `widgets\/`/);
    });

    it('does NOT carry a hardcoded `src/test-setup.ts` literal', () => {
      // The test-setup file path varies by project. The post-cleanup
      // skill defers to the project's vitest/jest config and to
      // testing-conventions, never to a literal.
      expect(body).not.toMatch(/`src\/test-setup\.ts`/);
    });

    it('defers to `.claude/skills/testing-conventions/SKILL.md` for layout discovery', () => {
      // The structural fix: the skill now reads the per-project
      // testing-conventions to learn where atoms / molecules / pages live
      // in THIS codebase. A future edit that drops this reference would
      // re-open the door to hardcoded methodology.
      expect(body).toContain('.claude/skills/testing-conventions/SKILL.md');
    });

    it('still asserts stack-agnostic in its preamble', () => {
      // Anti-regression on the framing itself.
      expect(body).toMatch(/stack-agnostic/i);
    });

    it('declares the boundary with /ui-visual-testing', () => {
      // Per the audit, the two skills are not redundant — visual is
      // Level 4 of the broader testing taxonomy. The boundary paragraph
      // makes this explicit so a future reader doesn't merge them.
      expect(body).toMatch(/Boundary.*ui-visual-testing/i);
    });
  });

  describe('ui-visual-testing SKILL.md body', () => {
    const body = readFileSync(UI_VISUAL_TESTING_SKILL_PATH, 'utf-8');

    it('declares the boundary with /ui-testing (Level 4 only)', () => {
      expect(body).toMatch(/Boundary.*ui-testing/i);
      expect(body).toMatch(/Level 4/i);
    });
  });

  describe('tool-detection.md reference', () => {
    const body = readFileSync(TOOL_DETECTION_REF_PATH, 'utf-8');

    it('has the test-setup path hint marked as illustrative', () => {
      // The example config still contains `./src/test-setup.ts` but with
      // an explicit instruction to replace with the project's actual
      // setup-file path. That's the right shape for a starter config —
      // we don't want it removed, just disclaimed.
      expect(body).toMatch(
        /Replace with the project's setup-file path|adapt them to the project's actual layout/i,
      );
    });
  });

  describe('react-specialization.md reference', () => {
    const body = readFileSync(REACT_SPEC_PATH, 'utf-8');

    it('has the test-setup path hint marked as illustrative', () => {
      expect(body).toMatch(/Replace with the project's actual setup-file path|illustrative/i);
    });
  });
});
