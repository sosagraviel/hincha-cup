/**
 * Rejects non-portable absolute paths in synthesis output.
 *
 * The operator's CLAUDE.md / SKILL.md ships to many machines. A path like
 * `/Users/alice/projects/my-repo/src/api.ts` leaks the developer's home
 * directory and is meaningless on every other machine.
 *
 * Path-shape rule:
 *   ✓ project-relative paths               ("services/api/src/main.ts")
 *   ✓ <tempDir> placeholder                ("<tempDir>/composer-views/...")
 *   ✓ system-installed binaries / dirs     ("/usr/bin/foo", "/opt/bar", "/etc/baz")
 *   ✓ tmp / cache / null device            ("/tmp/foo", "/var/cache", "/dev/null")
 *   ✗ user-home absolute paths             ("/Users/<name>/...", "/home/<name>/...")
 *
 * Stack/structure-agnostic: checks PATH SHAPE only.
 */

import { NON_PORTABLE_HOME_ROOTS } from '../../../../services/framework/portable-paths/patterns.js';

const HOME_PATH_RE = new RegExp(
  `(?:^|[\\s'"\`(<])(/(?:${NON_PORTABLE_HOME_ROOTS})/[A-Za-z0-9_.-]+/[^\\s'"\`)>]+)`,
  'g',
);
const ALLOWED_PREFIXES = ['/usr/', '/opt/', '/etc/', '/tmp/', '/var/', '/dev/', '/bin/', '/sbin/'];

export function detectNonPortableAbsolutePath(body: string): string | null {
  if (!body || body.trim().length === 0) return null;
  const offenders: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = HOME_PATH_RE.exec(body)) !== null) {
    const candidate = match[1];
    if (ALLOWED_PREFIXES.some((p) => candidate.startsWith(p))) continue;
    offenders.push(candidate);
  }
  if (offenders.length === 0) return null;

  HOME_PATH_RE.lastIndex = 0;

  const sample = offenders.slice(0, 6).map((p) => `   • ${p}`);
  return [
    'NON-PORTABLE ABSOLUTE PATH DETECTED IN SYNTHESIS BODY',
    '',
    '🔴 WHAT WENT WRONG:',
    `   Found ${offenders.length} absolute path(s) that include a per-machine home`,
    '   directory. These are meaningless on the 6000+ developer machines the',
    '   framework ships to:',
    '',
    ...sample,
    offenders.length > sample.length ? `   • …and ${offenders.length - sample.length} more` : '',
    '',
    '🟢 HOW TO FIX:',
    '   Use project-relative paths only ("services/api/src/main.ts"). When you',
    '   need to reference a framework-internal location, use the literal',
    '   "<tempDir>/..." placeholder. System paths under /usr, /opt, /etc, /tmp,',
    '   /var, /dev, /bin, /sbin are allowed (those exist on every machine);',
    '   /Users/<name>/... and /home/<name>/... are NOT.',
  ]
    .filter(Boolean)
    .join('\n');
}
