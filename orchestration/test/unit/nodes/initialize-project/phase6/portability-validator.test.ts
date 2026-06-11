import { execFileSync } from 'child_process';
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

function buildGitProject(provider: 'claude' | 'codex'): string {
  const projectPath = mkdtempSync(join(tmpdir(), 'portability-git-'));
  mkdirSync(join(projectPath, `.${provider}`), { recursive: true });
  execFileSync('git', ['-C', projectPath, 'init', '-q'], { stdio: 'ignore' });
  return projectPath;
}

describe('validatePortability — housekeeping', () => {
  it('strips stale volatile fields (project_metadata + per-resource last_sync) before scanning', () => {
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
          resource_state: {
            skills: { foo: { managed_by_framework: true, last_sync: '2026-04-22T00:00:00.000Z' } },
            agents: {},
            last_sync: '2026-04-22T00:00:00.000Z',
          },
        },
        null,
        2,
      ),
    );

    const result = validatePortability(projectPath);

    const after = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
    // The entire volatile project_metadata block is gone.
    expect(Object.prototype.hasOwnProperty.call(after, 'project_metadata')).toBe(false);
    const resourceState = after.resource_state as Record<string, any>;
    // Per-resource last_sync is stripped...
    expect(Object.prototype.hasOwnProperty.call(resourceState.skills.foo, 'last_sync')).toBe(false);
    // ...but the top-level sync marker and stable fields are preserved.
    expect(resourceState.last_sync).toBe('2026-04-22T00:00:00.000Z');
    expect(after.stack_profile).toEqual({ services: [] });
    expect(resourceState.skills.foo.managed_by_framework).toBe(true);

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
        schema_version: '1.0.0',
        framework_version: '1.0.0',
        stack_profile: { services: [{ id: 'api', path: 'services/api' }] },
        resource_state: { skills: {}, agents: {} },
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

  it('strips [mcp_servers.code_graph] block (with absolute paths) from .codex/config.toml before scanning', () => {
    const projectPath = buildProject('codex');
    const cfgPath = join(projectPath, '.codex', 'config.toml');
    writeFileSync(
      cfgPath,
      [
        '# preserved comment',
        '',
        'model = "gpt-5"',
        '',
        '[mcp_servers.code_graph]',
        'command = "bash"',
        'args = [',
        '    "/Users/alice/projects/myrepo/qubika-agentic-framework/scripts/code-review-graph-mcp.sh",',
        '    "serve",',
        '    "--repo",',
        '    "/Users/alice/projects/myrepo",',
        ']',
        '',
        '[other_block]',
        'preserved = true',
        '',
      ].join('\n'),
    );

    const result = validatePortability(projectPath);

    // Block was stripped on disk.
    const after = readFileSync(cfgPath, 'utf-8');
    expect(after).not.toContain('[mcp_servers.code_graph]');
    expect(after).not.toContain('/Users/alice');

    // Surrounding content is preserved.
    expect(after).toContain('# preserved comment');
    expect(after).toContain('model = "gpt-5"');
    expect(after).toContain('[other_block]');
    expect(after).toContain('preserved = true');

    // Scan reports clean (the only absolute paths were inside the stripped block).
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('leaves .codex/config.toml byte-identical when no [mcp_servers.code_graph] block is present', () => {
    const projectPath = buildProject('codex');
    const cfgPath = join(projectPath, '.codex', 'config.toml');
    const original = ['model = "gpt-5"', '', '[other]', 'flag = true', ''].join('\n');
    writeFileSync(cfgPath, original);

    validatePortability(projectPath);

    expect(readFileSync(cfgPath, 'utf-8')).toBe(original);
  });

  it('preserves sibling [mcp_servers.<other>] blocks while stripping only code_graph', () => {
    const projectPath = buildProject('codex');
    const cfgPath = join(projectPath, '.codex', 'config.toml');
    writeFileSync(
      cfgPath,
      [
        '[mcp_servers.code_graph]',
        'command = "bash"',
        'args = ["/Users/alice/x.sh"]',
        '',
        '[mcp_servers.atlassian]',
        'command = "uvx"',
        'args = ["mcp-atlassian"]',
        '',
      ].join('\n'),
    );

    const result = validatePortability(projectPath);
    const after = readFileSync(cfgPath, 'utf-8');

    expect(after).not.toContain('[mcp_servers.code_graph]');
    expect(after).toContain('[mcp_servers.atlassian]');
    expect(after).toContain('mcp-atlassian');
    expect(result.ok).toBe(true);
  });
});

describe('validatePortability — settings.local.json carve-out', () => {
  it('skips settings.local.json (machine-local) but still reports committed leaks', () => {
    const projectPath = buildProject('claude');
    writeFileSync(
      join(projectPath, '.claude', 'settings.local.json'),
      JSON.stringify({
        permissions: { allow: ['Bash(cd /home/jorgevergara-admin/projects/app && ls)'] },
      }),
    );
    writeFileSync(
      join(projectPath, '.claude', 'CLAUDE.md'),
      '# Project\n\nSee /Users/realuser/projects/app/out.txt\n',
    );

    const result = validatePortability(projectPath);

    // settings.local.json is never a hard violation...
    expect(result.violations.some((v) => v.file.endsWith('settings.local.json'))).toBe(false);
    // ...but the real leak in another committed file still fails the scan.
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.file.endsWith('CLAUDE.md'))).toBe(true);
  });

  it('skips settings.local.json even when the project is not a git repo', () => {
    const projectPath = buildProject('claude'); // no git init
    writeFileSync(
      join(projectPath, '.claude', 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(cd /home/dev/app && ls)'] } }),
    );

    const result = validatePortability(projectPath);
    expect(result.violations.some((v) => v.file.endsWith('settings.local.json'))).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('does not fail on a git-tracked settings.local.json but reports it for untracking', () => {
    const projectPath = buildGitProject('claude');
    writeFileSync(
      join(projectPath, '.claude', 'settings.local.json'),
      JSON.stringify({
        permissions: { allow: ['Bash(cd /home/jorgevergara-admin/projects/app && ls)'] },
      }),
    );
    // Track the file (committed before any ignore rule existed).
    // `-f` overrides any machine-global gitignore so the file is genuinely tracked.
    execFileSync('git', ['-C', projectPath, 'add', '-f', '.claude/settings.local.json'], {
      stdio: 'ignore',
    });

    const result = validatePortability(projectPath);

    // Never a hard violation, even though it carries an absolute path.
    expect(result.violations.some((v) => v.file.endsWith('settings.local.json'))).toBe(false);
    expect(result.ok).toBe(true);
    // ...but it IS surfaced so the caller can advise `git rm --cached`.
    expect(result.trackedLocalSettings).toContain('.claude/settings.local.json');
  });

  it('does not report a tracked settings.local.json that has no absolute paths', () => {
    const projectPath = buildGitProject('claude');
    writeFileSync(
      join(projectPath, '.claude', 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }),
    );
    // `-f` overrides any machine-global gitignore so the file is genuinely tracked.
    execFileSync('git', ['-C', projectPath, 'add', '-f', '.claude/settings.local.json'], {
      stdio: 'ignore',
    });

    const result = validatePortability(projectPath);
    expect(result.trackedLocalSettings).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
