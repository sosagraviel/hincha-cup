import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runPreflightChecks } from '../../../src/utils/preflight-checks.js';

describe('runPreflightChecks — CLAUDE.md conflict detection (QAF-46)', () => {
  let projectPath: string;
  let frameworkPath: string;
  let originalAnthropicKey: string | undefined;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qaf46-proj-'));
    frameworkPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qaf46-fw-'));
    fs.writeFileSync(path.join(frameworkPath, 'package.json'), '{}');
    fs.writeFileSync(path.join(frameworkPath, 'pnpm-workspace.yaml'), '');
    fs.mkdirSync(path.join(frameworkPath, 'orchestration'));

    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-dummy-key';
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.rmSync(frameworkPath, { recursive: true, force: true });
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('warns when ./CLAUDE.md already exists', async () => {
    fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), '# existing');

    const result = await runPreflightChecks(projectPath, frameworkPath);

    expect(
      result.warnings.some((w) => w.includes('Existing CLAUDE.md detected at project root')),
    ).toBe(true);
    expect(result.warnings.some((w) => w.includes('Existing .claude/CLAUDE.md detected'))).toBe(
      false,
    );
  });

  it('warns when ./.claude/CLAUDE.md already exists', async () => {
    fs.mkdirSync(path.join(projectPath, '.claude'));
    fs.writeFileSync(path.join(projectPath, '.claude', 'CLAUDE.md'), '# prior');

    const result = await runPreflightChecks(projectPath, frameworkPath);

    expect(result.warnings.some((w) => w.includes('Existing .claude/CLAUDE.md detected'))).toBe(
      true,
    );
    expect(result.warnings.some((w) => w.includes('.bak'))).toBe(true);
    expect(
      result.warnings.some((w) => w.includes('Existing CLAUDE.md detected at project root')),
    ).toBe(false);
  });

  it('emits neither CLAUDE.md warning for a fresh project', async () => {
    const result = await runPreflightChecks(projectPath, frameworkPath);

    expect(
      result.warnings.some(
        (w) =>
          w.includes('Existing CLAUDE.md detected at project root') ||
          w.includes('Existing .claude/CLAUDE.md detected'),
      ),
    ).toBe(false);
  });
});

describe('runPreflightChecks — .gitignore automation includes .mcp.json', () => {
  let projectPath: string;
  let frameworkPath: string;
  let originalAnthropicKey: string | undefined;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-mcp-proj-'));
    frameworkPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-mcp-fw-'));
    fs.writeFileSync(path.join(frameworkPath, 'package.json'), '{}');
    fs.writeFileSync(path.join(frameworkPath, 'pnpm-workspace.yaml'), '');
    fs.mkdirSync(path.join(frameworkPath, 'orchestration'));

    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-dummy-key';
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.rmSync(frameworkPath, { recursive: true, force: true });
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it('writes .mcp.json (no trailing slash) into a freshly-created .gitignore', async () => {
    await runPreflightChecks(projectPath, frameworkPath);

    const content = fs.readFileSync(path.join(projectPath, '.gitignore'), 'utf-8');
    const lines = content.split('\n').map((l) => l.trim());
    expect(lines).toContain('.mcp.json');
    // Must NOT be written as a directory pattern.
    expect(lines).not.toContain('.mcp.json/');
  });

  it('appends .mcp.json to a pre-existing .gitignore that lacks it', async () => {
    fs.writeFileSync(
      path.join(projectPath, '.gitignore'),
      'node_modules/\n.claude-temp/\n.codex-temp/\n.claude-backups/\n.codex-backups/\n',
    );

    await runPreflightChecks(projectPath, frameworkPath);

    const content = fs.readFileSync(path.join(projectPath, '.gitignore'), 'utf-8');
    const lines = content.split('\n').map((l) => l.trim());
    expect(lines).toContain('.mcp.json');
  });

  it('does NOT duplicate .mcp.json when already present in .gitignore', async () => {
    fs.writeFileSync(
      path.join(projectPath, '.gitignore'),
      [
        '.claude-temp/',
        '.codex-temp/',
        '.claude-backups/',
        '.codex-backups/',
        path.basename(frameworkPath) + '/',
        '.mcp.json',
        '',
      ].join('\n'),
    );

    await runPreflightChecks(projectPath, frameworkPath);

    const content = fs.readFileSync(path.join(projectPath, '.gitignore'), 'utf-8');
    const occurrences = (content.match(/^\.mcp\.json$/gm) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
