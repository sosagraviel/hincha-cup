/**
 * Tests for PortableWriter path relativization, with emphasis on absolute paths
 * embedded mid-prose (not just bare whole-string paths). The project root is a
 * synthetic `/Users/...` string so the detector engages; only the write target
 * touches disk.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { PortablePathResolver } from '../../../../../src/services/framework/portable-paths/path-resolver.service.js';
import { PortableWriter } from '../../../../../src/services/framework/portable-paths/portable-writer.service.js';
import {
  PortabilityError,
  asAbsolutePath,
} from '../../../../../src/services/framework/portable-paths/types.js';

const PROJECT_ROOT = '/Users/testuser/project';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function makeWriter(): PortableWriter {
  return new PortableWriter(new PortablePathResolver(asAbsolutePath(PROJECT_ROOT)));
}

function writeAndRead(data: unknown): any {
  const dir = mkdtempSync(join(tmpdir(), 'qaf-portable-'));
  tempDirs.push(dir);
  const target = asAbsolutePath(join(dir, 'out.json'));
  makeWriter().writeJson(target, data);
  return JSON.parse(readFileSync(target, 'utf-8'));
}

describe('PortableWriter.writeJson — embedded in-project absolute paths', () => {
  it('rewrites an in-project absolute embedded mid-prose with a trailing colon (reported case)', () => {
    const value = `Read ${PROJECT_ROOT}/.claude-temp/initialize-project/project-inspection.json: port_candidates field is empty ({})`;

    const out = writeAndRead({ note: value });

    expect(out.note).toBe(
      'Read .claude-temp/initialize-project/project-inspection.json: port_candidates field is empty ({})',
    );
    expect(out.note).not.toContain('/Users/');
  });

  it('does not over-capture trailing punctuation around the embedded path', () => {
    const out = writeAndRead({
      paren: `(${PROJECT_ROOT}/services/api/main.ts)`,
      dot: `see ${PROJECT_ROOT}/services/api/main.ts. done`,
    });

    expect(out.paren).toBe('(services/api/main.ts)');
    expect(out.dot).toBe('see services/api/main.ts. done');
  });

  it('rewrites multiple in-project absolutes in one string', () => {
    const out = writeAndRead({
      note: `${PROJECT_ROOT}/a.ts and ${PROJECT_ROOT}/b.ts`,
    });

    expect(out.note).toBe('a.ts and b.ts');
  });

  it('still relativizes a bare whole-string in-project absolute', () => {
    const out = writeAndRead({ path: `${PROJECT_ROOT}/services/api` });

    expect(out.path).toBe(join('services', 'api'));
  });

  it('collapses the project root itself to "."', () => {
    const out = writeAndRead({ path: PROJECT_ROOT });

    expect(out.path).toBe('.');
  });

  it('walks nested arrays and objects', () => {
    const out = writeAndRead({
      services: [{ evidence: [`Read ${PROJECT_ROOT}/firebase.json — no emulators`] }],
    });

    expect(out.services[0].evidence[0]).toBe('Read firebase.json — no emulators');
  });
});

describe('PortableWriter.writeJson — out-of-project absolutes still throw', () => {
  it('rejects an out-of-project absolute embedded in prose', () => {
    expect(() =>
      writeAndRead({ note: 'Read /Users/someoneelse/secret/data.json then stop' }),
    ).toThrow(PortabilityError);
  });

  it('rejects a bare out-of-project absolute', () => {
    expect(() => writeAndRead({ path: '/home/otheruser/thing' })).toThrow(PortabilityError);
  });
});
