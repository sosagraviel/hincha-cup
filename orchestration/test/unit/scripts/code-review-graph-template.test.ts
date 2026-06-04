import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Anti-regression: the framework's `templates/code-review-graph-gitignore`
 * is the source of truth for which `.code-review-graph/*` files are
 * team-shared vs per-developer.
 *
 * `launcher.json` IS team-shared (deterministic, idempotent compare-then-
 * write, lets every dev's MCP launcher use the same tool resolution).
 *
 * `extraction-manifest.json` was PREVIOUSLY allowlisted, but the upstream
 * `code-review-graph` tool stamps a `created_at` timestamp on every build
 * — the file churns on every preflight regardless of whether the graph
 * content changed. It was removed from the allowlist and an idempotent
 * untrack-on-preflight migration was added in
 * `scripts/setup-code-graph.sh`.
 *
 * This test fails if any future edit reintroduces the allowlist.
 */

const FRAMEWORK_ROOT = join(__dirname, '../../../../');
const TEMPLATE_PATH = join(FRAMEWORK_ROOT, 'templates/code-review-graph-gitignore');
const SETUP_SCRIPT_PATH = join(FRAMEWORK_ROOT, 'scripts/setup-code-graph.sh');

describe('templates/code-review-graph-gitignore', () => {
  const body = readFileSync(TEMPLATE_PATH, 'utf-8');

  it('allowlists `launcher.json` (team-shared)', () => {
    expect(body).toMatch(/^!launcher\.json\s*$/m);
  });

  it('allowlists its own `.gitignore`', () => {
    expect(body).toMatch(/^!\.gitignore\s*$/m);
  });

  it('does NOT allowlist `extraction-manifest.json` (per-build only)', () => {
    // extraction-manifest.json must NEVER be tracked because the upstream
    // tool's `created_at` field churns on every build.
    expect(body).not.toMatch(/^!extraction-manifest\.json\s*$/m);
  });

  it('starts with the catch-all `*` rule (allowlist semantics)', () => {
    // The first non-comment, non-blank line must be `*`.
    const firstRule = body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    expect(firstRule).toBe('*');
  });

  it('documents the rationale (not a bare allowlist)', () => {
    // A future maintainer re-allowlisting `extraction-manifest.json` should
    // first hit a comment block explaining why we excluded it.
    expect(body).toMatch(/extraction-manifest\.json/);
    expect(body).toMatch(/created_at|churns|timestamp/i);
  });
});

describe('scripts/setup-code-graph.sh — migration block', () => {
  const body = readFileSync(SETUP_SCRIPT_PATH, 'utf-8');

  it('defines `migrate_untrack_extraction_manifest`', () => {
    // Stack-agnostic, idempotent migration: drops
    // `extraction-manifest.json` from the git index automatically on
    // the next preflight.
    expect(body).toMatch(/migrate_untrack_extraction_manifest\s*\(\)\s*\{/);
  });

  it('migration is idempotent (uses `git ls-files --error-unmatch` guard)', () => {
    // The guard ensures the migration is a no-op when the file isn't
    // tracked. Anti-regression on the idempotency contract.
    expect(body).toMatch(/git -C "\$PROJECT_PATH" ls-files --error-unmatch/);
  });

  it('migration uses `git rm --cached` (preserves working tree)', () => {
    // We only untrack — the file itself stays on disk because the upstream
    // tool needs to keep regenerating it. Anti-regression on the
    // working-tree-preservation invariant.
    expect(body).toMatch(/git -C "\$PROJECT_PATH" rm --cached/);
  });

  it('migration is invoked from main()', () => {
    // The function must be wired in, not just defined. Look for the call
    // site (after the open of `main()`).
    expect(body).toMatch(/^\s*migrate_untrack_extraction_manifest\s*$/m);
  });

  it('migration handles non-git directories gracefully', () => {
    // Without this guard the script would error on a non-git checkout
    // (e.g., a Docker build context, a tarball extraction).
    expect(body).toMatch(/git -C "\$PROJECT_PATH" rev-parse --git-dir/);
  });

  it('find_python routes its "Using Python" log to stderr (no stdout pollution)', () => {
    // Anti-regression: find_python's stdout is captured via $(find_python); the
    // human-facing log line MUST go to stderr or it corrupts the resolved
    // python_cmd into a two-line blob, which then fails the pip-fallback install
    // path with a misleading `... command not found`. Only reproduces on machines
    // without uv/uvx/pipx (the only path that reaches find_python).
    expect(body).toMatch(/log_info "Using Python \$version \(\$candidate\)" >&2/);
  });
});

describe('scripts/lib/bootstrap-uv.sh — uv bootstrap gating', () => {
  const body = readFileSync(join(FRAMEWORK_ROOT, 'scripts/lib/bootstrap-uv.sh'), 'utf-8');

  it('does NOT treat a bare python interpreter as a suitable tool', () => {
    // A bare interpreter cannot run code-review-graph without a pip install that
    // fails under PEP 668 (externally-managed-environment). Counting python3/python
    // here wrongly suppresses the uv bootstrap and forces those users down the one
    // install path that cannot work. Anti-regression on that gating.
    expect(body).not.toMatch(/command -v python3? >\/dev\/null 2>&1 && return 0/);
  });

  it('still counts real runners/installers (uvx, uv, pipx)', () => {
    expect(body).toMatch(/command -v uvx >\/dev\/null 2>&1 && return 0/);
    expect(body).toMatch(/command -v pipx >\/dev\/null 2>&1 && return 0/);
  });
});
