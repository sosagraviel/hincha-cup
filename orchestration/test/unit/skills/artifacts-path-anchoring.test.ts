import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Regression coverage for the workspace-root artifact-path invariant.
 *
 * /implement-ticket is the anchor: it resolves an ABSOLUTE ARTIFACTS_DIR via
 * project_path() (from scripts/lib/resolve-paths.sh, cwd-independent) and passes
 * it down as --artifacts-dir. The sub-skills (/pr-reviewer, /security-review)
 * prefer that flag and only fall back to the prior relative default when invoked
 * standalone. ensure-context.sh normalizes any relative dir to absolute, records
 * the anchor in .preflight-ok, and locally ignores the temp dirs in every repo.
 *
 * Net effect: the orchestrated path that previously leaked .claude-temp into a
 * child repo now always lands at the workspace root.
 */

const REPO_ROOT = join(__dirname, '../../../..');

function read(relPath: string): string {
  const abs = join(REPO_ROOT, relPath);
  if (!existsSync(abs)) {
    throw new Error(`fixture missing: ${abs}`);
  }
  return readFileSync(abs, 'utf-8');
}

const IMPLEMENT_TICKET = {
  'SKILL.claude.md': read('skills/020-development-workflow/implement-ticket/SKILL.claude.md'),
  'SKILL.codex.md': read('skills/020-development-workflow/implement-ticket/SKILL.codex.md'),
} as const;

const PR_REVIEWER = {
  'SKILL.claude.md': read('skills/030-quality-assurance/pr-reviewer/SKILL.claude.md'),
  'SKILL.codex.md': read('skills/030-quality-assurance/pr-reviewer/SKILL.codex.md'),
} as const;

const SECURITY_REVIEW = {
  'SKILL.claude.md': read('skills/030-quality-assurance/security-review/SKILL.claude.md'),
  'SKILL.codex.md': read('skills/030-quality-assurance/security-review/SKILL.codex.md'),
} as const;

const ENSURE_CONTEXT = read('scripts/ensure-context.sh');

/**
 * Flags a code line that assigns ARTIFACTS_DIR from a bare relative {{TEMP_DIR}}
 * (i.e. not preceded by the absolute project_path() anchor). Prose that merely
 * describes the anti-pattern is excluded.
 */
function hasUnanchoredArtifactsDirAssignment(body: string): boolean {
  return body.split('\n').some((line) => /ARTIFACTS_DIR="\{\{TEMP_DIR\}\}\//.test(line));
}

describe('implement-ticket anchors ARTIFACTS_DIR at the workspace root', () => {
  for (const [variant, body] of Object.entries(IMPLEMENT_TICKET)) {
    describe(variant, () => {
      it('sources resolve-paths.sh and builds ARTIFACTS_DIR from project_path()', () => {
        expect(body).toMatch(/source\s+"?\{\{CONFIG_DIR\}\}\/scripts\/lib\/resolve-paths\.sh"?/);
        expect(body).toMatch(
          /ARTIFACTS_DIR="\$\(project_path\)\/\{\{TEMP_DIR\}\}\/tickets\/\$TICKET_ID\/artifacts"/,
        );
      });

      it('never assigns ARTIFACTS_DIR from a bare relative {{TEMP_DIR}}', () => {
        expect(hasUnanchoredArtifactsDirAssignment(body)).toBe(false);
      });

      it('still invokes ensure-context.sh with --artifacts-dir "$ARTIFACTS_DIR"', () => {
        expect(body).toMatch(
          /bash\s+"?\{\{CONFIG_DIR\}\}\/scripts\/ensure-context\.sh"?\s+--artifacts-dir\s+"?\$ARTIFACTS_DIR"?/,
        );
      });

      it('passes --artifacts-dir to /pr-reviewer and /security-review in Phase 10', () => {
        expect(body).toMatch(/\/pr-reviewer[^\n]*--artifacts-dir\s+"?\$ARTIFACTS_DIR"?/);
        expect(body).toMatch(/\/security-review[^\n]*--artifacts-dir\s+"?\$ARTIFACTS_DIR"?/);
      });
    });
  }
});

describe('pr-reviewer / security-review accept --artifacts-dir, else prior relative default', () => {
  const cases = [
    [
      'pr-reviewer',
      PR_REVIEWER,
      /ARTIFACTS_BASE="\$\{ARTIFACTS_DIR_FLAG:-\{\{TEMP_DIR\}\}\/artifacts\/\$\{JIRA_KEY\}\}"/,
    ],
    [
      'security-review',
      SECURITY_REVIEW,
      /ARTIFACTS_BASE="\$\{ARTIFACTS_DIR_FLAG:-\{\{TEMP_DIR\}\}\/artifacts\/\$\{JIRA_KEY\}\}"/,
    ],
  ] as const;

  for (const [skill, variants, baseExpr] of cases) {
    for (const [variant, body] of Object.entries(variants)) {
      describe(`${skill} ${variant}`, () => {
        it('documents the --artifacts-dir flag', () => {
          expect(body).toMatch(/--artifacts-dir/);
        });

        it('resolves the base as flag-preferred with the prior relative fallback', () => {
          expect(body).toMatch(baseExpr);
        });

        it('does not re-source resolve-paths.sh (kept concise; orchestrator is the anchor)', () => {
          expect(body).not.toMatch(/scripts\/lib\/resolve-paths\.sh/);
        });
      });
    }
  }
});

describe('ensure-context.sh is the absolute anchor of record', () => {
  it('normalizes a relative --artifacts-dir against the project root', () => {
    expect(ENSURE_CONTEXT).toMatch(/\*\)\s*ARTIFACTS_DIR="\$PROJECT_PATH\/\$ARTIFACTS_DIR"/);
  });

  it('records workspace_root and artifacts_dir in the preflight marker', () => {
    expect(ENSURE_CONTEXT).toMatch(/"workspace_root":\s*"\$PROJECT_PATH"/);
    expect(ENSURE_CONTEXT).toMatch(/"artifacts_dir":\s*"\$ARTIFACTS_DIR"/);
  });

  it('excludes the temp dirs locally in every repo via .git/info/exclude (not tracked .gitignore)', () => {
    expect(ENSURE_CONTEXT).toMatch(/git\s+-C\s+"\$repo"\s+rev-parse\s+--git-path\s+info\/exclude/);
    expect(ENSURE_CONTEXT).toMatch(/ensure_temp_excluded\s+"\$PROJECT_PATH"/);
    expect(ENSURE_CONTEXT).toContain('.claude-temp/');
    expect(ENSURE_CONTEXT).toContain('.codex-temp/');
  });
});
