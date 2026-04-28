import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { validatePortability } from '../../../../../src/nodes/initialize-project/phase6/helpers/portability-validator.js';

function buildProject(provider: 'claude' | 'codex'): string {
  const projectPath = mkdtempSync(join(tmpdir(), 'portability-housekeeping-'));
  mkdirSync(join(projectPath, `.${provider}`), { recursive: true });
  return projectPath;
}

describe('validatePortability — housekeeping', () => {
  it('strips stale project_metadata.project_path before scanning', () => {
    const projectPath = buildProject('codex');
    const cfgPath = join(projectPath, '.codex', 'framework-config.json');
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          version: '1.0.0',
          project_metadata: {
            project_path: '/Users/ignaciobarreto/itIsHere/projects/gira',
            initialization_hash: 'abc123',
            last_analysis: '2026-04-22T00:00:00.000Z',
          },
          stack_profile: { services: [] },
        },
        null,
        2,
      ),
    );

    const result = validatePortability(projectPath);

    // Field has been stripped from the on-disk file.
    const after = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    const meta = after.project_metadata as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(meta, 'project_path')).toBe(false);
    // Other fields are preserved.
    expect(meta.initialization_hash).toBe('abc123');
    expect(meta.last_analysis).toBe('2026-04-22T00:00:00.000Z');
    expect(after.stack_profile).toEqual({ services: [] });

    // The resulting scan reports no violations from this file.
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('leaves framework-config.json untouched when it has no stale field', () => {
    const projectPath = buildProject('claude');
    const cfgPath = join(projectPath, '.claude', 'framework-config.json');
    const original = JSON.stringify(
      {
        version: '1.0.0',
        project_metadata: {
          initialization_hash: 'xyz789',
          last_analysis: '2026-04-28T00:00:00.000Z',
        },
        stack_profile: { services: [{ id: 'api', path: 'services/api' }] },
      },
      null,
      2,
    );
    writeFileSync(cfgPath, original);

    validatePortability(projectPath);
    expect(readFileSync(cfgPath, 'utf-8')).toBe(original);
  });

  it('still reports violations from sources outside framework-config.json', () => {
    const projectPath = buildProject('claude');
    mkdirSync(join(projectPath, '.claude', 'skills', 'foo'), { recursive: true });
    writeFileSync(
      join(projectPath, '.claude', 'skills', 'foo', 'bad.md'),
      '# Bad skill\n\nSee /Users/leaked/path/output.txt for details.\n',
    );

    const result = validatePortability(projectPath);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.file.endsWith('bad.md'))).toBe(true);
  });
});
