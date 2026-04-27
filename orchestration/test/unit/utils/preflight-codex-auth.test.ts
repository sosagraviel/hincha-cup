import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runPreflightChecks } from '../../../src/utils/preflight-checks.js';

describe('runPreflightChecks — Codex API-key login', () => {
  let projectPath: string;
  let frameworkPath: string;
  let localCodexPath: string;
  let authStatePath: string;
  let capturedKeyPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PROVIDER;

    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qaf-codex-proj-'));
    frameworkPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qaf-codex-fw-'));
    fs.writeFileSync(path.join(frameworkPath, 'package.json'), '{}');
    fs.writeFileSync(path.join(frameworkPath, 'pnpm-workspace.yaml'), '');

    const binDir = path.join(frameworkPath, 'orchestration', 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    localCodexPath = path.join(binDir, 'codex');
    authStatePath = path.join(frameworkPath, 'codex-authenticated');
    capturedKeyPath = path.join(frameworkPath, 'captured-openai-key');
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.rmSync(frameworkPath, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('authenticates Codex CLI with OPENAI_API_KEY when login status initially fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    writeFakeCodex({ apiKeyLoginSucceeds: true });

    const result = await runPreflightChecks(projectPath, frameworkPath);

    expect(result.success).toBe(true);
    expect(result.authMode).toBe('codex_cli');
    expect(result.provider).toBe('openai');
    expect(fs.readFileSync(capturedKeyPath, 'utf-8').trim()).toBe('sk-test-key');
  });

  it('fails preflight clearly when automatic Codex API-key login fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    writeFakeCodex({ apiKeyLoginSucceeds: false });

    const result = await runPreflightChecks(projectPath, frameworkPath);

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('Automatic Codex API-key login failed');
  });

  function writeFakeCodex(params: { apiKeyLoginSucceeds: boolean }) {
    const loginBlock = params.apiKeyLoginSucceeds
      ? `cat > "${capturedKeyPath}"\ntouch "${authStatePath}"\nexit 0`
      : 'exit 1';

    fs.writeFileSync(
      localCodexPath,
      `#!/usr/bin/env sh
if [ "$1" = "--version" ]; then
  echo "codex 0.121.0"
  exit 0
fi

if [ "$1" = "login" ] && [ "$2" = "status" ]; then
  if [ -f "${authStatePath}" ]; then
    exit 0
  fi
  exit 1
fi

if [ "$1" = "login" ] && [ "$2" = "--with-api-key" ]; then
  ${loginBlock}
fi

exit 1
`,
      'utf-8',
    );
    fs.chmodSync(localCodexPath, 0o755);
  }
});
