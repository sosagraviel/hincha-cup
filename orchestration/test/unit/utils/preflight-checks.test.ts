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
