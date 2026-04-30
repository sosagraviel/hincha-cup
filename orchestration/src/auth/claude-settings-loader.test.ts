import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadClaudeSettingsEnv, getClaudeSettingsPath } from './claude-settings-loader.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test'),
  default: { homedir: vi.fn(() => '/home/test') },
}));

describe('loadClaudeSettingsEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_CODE_USE_FOUNDRY;
    delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
    delete process.env.SOME_TEST_VAR;
    delete process.env.ANOTHER_TEST_VAR;
    vi.clearAllMocks();
  });

  it('resolves the settings path under the user home directory', () => {
    const path = getClaudeSettingsPath();
    expect(path).toContain('.claude');
    expect(path).toContain('settings.json');
  });

  it('returns cleanly when the settings file does not exist', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = loadClaudeSettingsEnv();

    expect(result.fileFound).toBe(false);
    expect(result.appliedKeys).toEqual([]);
    expect(result.skippedKeys).toEqual([]);
    expect(result.warning).toBeUndefined();
  });

  it('applies env block from settings.json into process.env', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        env: {
          CLAUDE_CODE_USE_FOUNDRY: '1',
          ANTHROPIC_FOUNDRY_RESOURCE: 'my-resource',
        },
      }),
    );

    const result = loadClaudeSettingsEnv();

    expect(result.fileFound).toBe(true);
    expect(result.appliedKeys.sort()).toEqual([
      'ANTHROPIC_FOUNDRY_RESOURCE',
      'CLAUDE_CODE_USE_FOUNDRY',
    ]);
    expect(process.env.CLAUDE_CODE_USE_FOUNDRY).toBe('1');
    expect(process.env.ANTHROPIC_FOUNDRY_RESOURCE).toBe('my-resource');
  });

  it('does not overwrite existing process.env values (shell wins)', async () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = 'shell-value';

    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        env: {
          CLAUDE_CODE_USE_FOUNDRY: 'settings-value',
          ANTHROPIC_FOUNDRY_RESOURCE: 'my-resource',
        },
      }),
    );

    const result = loadClaudeSettingsEnv();

    expect(process.env.CLAUDE_CODE_USE_FOUNDRY).toBe('shell-value');
    expect(result.skippedKeys).toEqual(['CLAUDE_CODE_USE_FOUNDRY']);
    expect(result.appliedKeys).toEqual(['ANTHROPIC_FOUNDRY_RESOURCE']);
  });

  it('returns a warning when the file is malformed JSON', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json');

    const result = loadClaudeSettingsEnv();

    expect(result.fileFound).toBe(true);
    expect(result.appliedKeys).toEqual([]);
    expect(result.warning).toMatch(/Malformed JSON/);
  });

  it('handles settings.json with no env block gracefully', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ permissions: { allow: [] } }));

    const result = loadClaudeSettingsEnv();

    expect(result.fileFound).toBe(true);
    expect(result.appliedKeys).toEqual([]);
    expect(result.warning).toBeUndefined();
  });

  it('warns when env block is not an object', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ env: 'not-an-object' }));

    const result = loadClaudeSettingsEnv();

    expect(result.appliedKeys).toEqual([]);
    expect(result.warning).toMatch(/"env" to be an object/);
  });

  it('skips non-string values inside env block', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        env: {
          SOME_TEST_VAR: 'string-value',
          ANOTHER_TEST_VAR: 123, // non-string, should be skipped silently
        },
      }),
    );

    const result = loadClaudeSettingsEnv();

    expect(result.appliedKeys).toEqual(['SOME_TEST_VAR']);
    expect(process.env.SOME_TEST_VAR).toBe('string-value');
    expect(process.env.ANOTHER_TEST_VAR).toBeUndefined();
  });
});
