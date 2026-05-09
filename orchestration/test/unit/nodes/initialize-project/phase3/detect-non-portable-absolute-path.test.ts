/**
 * Plan v4 Phase F — `detectNonPortableAbsolutePath` unit tests.
 *
 * Asserts:
 *   - `/Users/<name>/...` and `/home/<name>/...` paths are rejected.
 *   - Allowed system prefixes (`/usr/`, `/opt/`, `/etc/`, `/tmp/`,
 *     `/var/`, `/dev/`, `/bin/`, `/sbin/`) pass through.
 *   - The literal `<tempDir>/...` placeholder passes (it's a
 *     portable framework path-shape).
 *   - Project-relative paths pass.
 *   - Multiple offenders surface in a single feedback message.
 */

import { describe, expect, it } from 'vitest';
import { detectNonPortableAbsolutePath } from '../../../../../src/nodes/initialize-project/phase3/validators/detect-non-portable-absolute-path.js';

describe('detectNonPortableAbsolutePath', () => {
  it('rejects /Users/<name>/... paths (macOS)', () => {
    const msg = detectNonPortableAbsolutePath(
      'See /Users/alice/projects/myrepo/src/api.ts for details.',
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain('/Users/alice');
  });

  it('rejects /home/<name>/... paths (Linux)', () => {
    const msg = detectNonPortableAbsolutePath('Edit /home/bob/code/repo/src/main.go.');
    expect(msg).not.toBeNull();
    expect(msg).toContain('/home/bob');
  });

  it('passes on project-relative paths', () => {
    expect(
      detectNonPortableAbsolutePath('See `services/api/src/main.ts:42` for the handler.'),
    ).toBeNull();
  });

  it('passes on the <tempDir>/... placeholder', () => {
    expect(
      detectNonPortableAbsolutePath(
        'The synthesizer reads <tempDir>/composer-views/code-conventions.input.json.',
      ),
    ).toBeNull();
  });

  it('passes on system-installed paths', () => {
    expect(detectNonPortableAbsolutePath('Run /usr/bin/ssh-keygen for setup.')).toBeNull();
    expect(detectNonPortableAbsolutePath('Append to /etc/hosts and /tmp/cache.')).toBeNull();
    expect(detectNonPortableAbsolutePath('Logs land in /var/log/myapp.')).toBeNull();
    expect(detectNonPortableAbsolutePath('Read from /dev/null when needed.')).toBeNull();
    expect(detectNonPortableAbsolutePath('Install to /opt/myapp/.')).toBeNull();
  });

  it('surfaces every offender in a single feedback message', () => {
    const body = `
The build outputs to /Users/alice/projects/myrepo/dist
and the tests live in /home/alice/projects/myrepo/test.
Also see /Users/alice/scripts/deploy.sh.
`;
    const msg = detectNonPortableAbsolutePath(body) ?? '';
    expect(msg).toContain('Found 3 absolute path');
    expect(msg).toContain('/Users/alice/projects/myrepo/dist');
    expect(msg).toContain('/home/alice/projects/myrepo/test');
  });

  it('passes on empty input', () => {
    expect(detectNonPortableAbsolutePath('')).toBeNull();
    expect(detectNonPortableAbsolutePath('   ')).toBeNull();
  });

  it('does not match system prefixes that just contain the substring "Users" or "home"', () => {
    expect(detectNonPortableAbsolutePath('See /opt/myhomeapp/bin/run for the runner.')).toBeNull();
    expect(detectNonPortableAbsolutePath('Use /usr/Users-helper for legacy.')).toBeNull();
  });
});
