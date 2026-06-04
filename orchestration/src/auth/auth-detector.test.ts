import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectAuthMode,
  AuthMode,
  isClaudeCLIAvailable,
  isClaudeCLIAuthenticated,
  isCodexCLIAvailable,
  getAuthErrorMessage,
  getClaudeCLIVersion,
  getCodexCLIVersion,
  resetLocalCLIPathCache,
} from './auth-detector.js';
import { logger } from '../utils/logger.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
  },
}));

// Mock logger so getClaudeCLIVersion/getCodexCLIVersion can surface (and we can
// assert) the underlying failure without writing to the test console.
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('auth-detector', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PROVIDER;
    delete process.env.FRAMEWORK_PATH;
    delete process.env.CLAUDE_CODE_USE_FOUNDRY;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
    delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;

    vi.clearAllMocks();

    // The local-CLI probe cache is process-lived; reset it between cases so a
    // cached `null` from one test cannot poison another's existsSync/--version setup.
    resetLocalCLIPathCache();

    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('detectAuthMode', () => {
    it('should use Claude CLI when ANTHROPIC_API_KEY is set and Claude CLI is available', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(true);
    });

    it('should not return API_KEY when ANTHROPIC_API_KEY is set without Claude CLI', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(detectAuthMode()).rejects.toThrow(/Claude CLI is not installed/);
    });

    it('should auto-authenticate Codex CLI when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      const { execSync, execFileSync, spawnSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which codex') return Buffer.from('/usr/local/bin/codex');
        if (cmd === 'codex --version') return Buffer.from('codex 0.121.0');
        throw new Error('Command failed');
      });
      vi.mocked(execFileSync)
        .mockImplementationOnce(() => {
          throw new Error('Not authenticated');
        })
        .mockReturnValue(Buffer.from('Logged in'));
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        signal: null,
        output: [null, '', ''],
        pid: 123,
        stdout: '',
        stderr: '',
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CODEX_CLI);
      expect(result.provider).toBe('openai');
      expect(result.hasAPIKey).toBe(true);
      expect(spawnSync).toHaveBeenCalledWith(
        'codex',
        ['login', '--with-api-key'],
        expect.objectContaining({ input: 'sk-test-key\n' }),
      );
    });

    it('should fail clearly when OPENAI_API_KEY automatic Codex login fails', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      const { execSync, execFileSync, spawnSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which codex') return Buffer.from('/usr/local/bin/codex');
        if (cmd === 'codex --version') return Buffer.from('codex 0.121.0');
        throw new Error('Command failed');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Not authenticated');
      });
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        signal: null,
        output: [null, '', 'failed'],
        pid: 123,
        stdout: '',
        stderr: 'failed',
      });

      await expect(detectAuthMode()).rejects.toThrow(/Automatic Codex API-key login failed/);
    });

    it('should keep normal Codex login guidance when no OPENAI_API_KEY is set', async () => {
      process.env.PROVIDER = 'codex';
      const { execSync, execFileSync, spawnSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which codex') return Buffer.from('/usr/local/bin/codex');
        if (cmd === 'codex --version') return Buffer.from('codex 0.121.0');
        throw new Error('Command failed');
      });
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Not authenticated');
      });

      await expect(detectAuthMode()).rejects.toThrow(/codex login/);
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('should ignore GOOGLE_API_KEY and fall through to Claude CLI detection', async () => {
      process.env.GOOGLE_API_KEY = 'google-test-key';
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude' || cmd === 'claude --help') {
          return Buffer.from('');
        }
        if (cmd === 'claude --version') {
          return Buffer.from('2.1.0');
        }
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
    });

    it('should prioritize Anthropic API key over other provider keys', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      process.env.OPENAI_API_KEY = 'sk-test-key';
      process.env.GOOGLE_API_KEY = 'google-test-key';
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        if (cmd === 'which codex') return Buffer.from('/usr/local/bin/codex');
        if (cmd === 'codex --version') return Buffer.from('codex 0.121.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
    });

    it('should detect Claude CLI mode when no API key is set', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude' || cmd === 'claude --help') {
          return Buffer.from('');
        }
        if (cmd === 'claude --version') {
          return Buffer.from('2.1.0');
        }
        throw new Error('Command failed');
      });

      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
      expect(result.hasClaudeCLI).toBe(true);
    });

    it('should accept Azure AI Foundry gateway without ANTHROPIC_API_KEY or claude login', async () => {
      process.env.CLAUDE_CODE_USE_FOUNDRY = '1';
      process.env.ANTHROPIC_FOUNDRY_RESOURCE = 'my-foundry-resource';

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
    });

    it('should ignore CLAUDE_CODE_USE_FOUNDRY without ANTHROPIC_FOUNDRY_RESOURCE', async () => {
      process.env.CLAUDE_CODE_USE_FOUNDRY = '1';
      // ANTHROPIC_FOUNDRY_RESOURCE intentionally not set
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.NONE);
    });

    it('should accept AWS Bedrock gateway without ANTHROPIC_API_KEY', async () => {
      process.env.CLAUDE_CODE_USE_BEDROCK = '1';

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
    });

    it('should accept Google Vertex AI gateway without ANTHROPIC_API_KEY', async () => {
      process.env.CLAUDE_CODE_USE_VERTEX = '1';

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
    });

    it('should fail with a clear error if a Claude gateway is configured but Claude CLI is missing', async () => {
      process.env.CLAUDE_CODE_USE_BEDROCK = '1';

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(detectAuthMode()).rejects.toThrow(
        /AWS Bedrock is configured for Claude, but Claude CLI is not installed/,
      );
    });

    it('should accept gateway under explicit PROVIDER=claude without ANTHROPIC_API_KEY', async () => {
      process.env.PROVIDER = 'claude';
      process.env.CLAUDE_CODE_USE_FOUNDRY = '1';
      process.env.ANTHROPIC_FOUNDRY_RESOURCE = 'my-foundry-resource';

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude') return Buffer.from('/usr/local/bin/claude');
        if (cmd === 'claude --version') return Buffer.from('2.1.0');
        throw new Error('Command failed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(false);
    });

    it('should return NONE when no authentication is available', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.NONE);
      expect(result.hasAPIKey).toBe(false);
      expect(result.hasClaudeCLI).toBe(false);
    });

    it('should fall back to the global CLI when the bundled CLI is broken (regression)', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      // Bundled wrapper exists but its native binary is missing → `--version` fails.
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // getClaudeCLIVersion runs with `encoding: 'utf-8'` and `.trim()`s the
        // result, so the global probe must yield a string (a real exec would).
        if (cmd === 'claude --version') return '2.1.150 (Claude Code)';
        // The bundled probe (`"<abs-path>" --version`) and everything else fail.
        throw new Error('claude native binary not installed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.CLAUDE_CLI);
      expect(result.hasClaudeCLI).toBe(true);
      expect(result.claudeCLIVersion).toBeDefined();
      expect(result.claudeCLIVersion).toContain('2.1.150');
    });

    it('should return NONE (never CLAUDE_CLI with undefined version) when bundled and global CLIs are both broken', async () => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('claude native binary not installed');
      });

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.NONE);
      expect(result.hasClaudeCLI).toBe(false);
      expect(result.claudeCLIVersion).toBeUndefined();
    });
  });

  describe('isClaudeCLIAvailable', () => {
    it('should return true when global Claude CLI runs --version', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from('2.1.0 (Claude Code)'));

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(true);
      // Availability is now defined by a working `--version`, not mere presence on PATH.
      expect(execSync).toHaveBeenCalledWith('claude --version', expect.any(Object));
    });

    it('should return false when Claude CLI is not installed', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(false);
    });

    it('should handle timeout gracefully', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Timeout');
      });

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(false);
    });

    it('should return false when the bundled CLI is broken AND no working global CLI exists', async () => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      // Bundled wrapper is present...
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // ...but every `--version` invocation (bundled and global) fails.
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('claude native binary not installed');
      });

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(false);
    });

    it('should return true via the global CLI even when the bundled CLI is broken', async () => {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        // The bundled probe is quoted with an absolute path; the global probe is exactly `claude --version`.
        if (cmd === 'claude --version') return Buffer.from('2.1.150 (Claude Code)');
        throw new Error('claude native binary not installed');
      });

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(true);
    });
  });

  describe('getClaudeCLIVersion', () => {
    it('should log a warning and return undefined when the version check fails', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('claude native binary not installed');
      });

      const version = await getClaudeCLIVersion();

      expect(version).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Claude CLI version check failed'),
      );
    });
  });

  describe('isCodexCLIAvailable', () => {
    it('should probe with `codex --version` rather than `which codex`', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from('codex 0.121.0'));

      const result = await isCodexCLIAvailable();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('codex --version', expect.any(Object));
    });
  });

  describe('getCodexCLIVersion', () => {
    it('should log a warning and return undefined when the version check fails', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('codex native binary not installed');
      });

      const version = await getCodexCLIVersion();

      expect(version).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Codex CLI version check failed'),
      );
    });
  });

  describe('isClaudeCLIAuthenticated', () => {
    it.skip('should return true when credentials file exists (Linux/Windows)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await isClaudeCLIAuthenticated();

      expect(result).toBe(true);
    });

    it('should return true on macOS (assumes Keychain)', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const result = await isClaudeCLIAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when CLI fails', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not authenticated');
      });

      const result = await isClaudeCLIAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('getAuthErrorMessage', () => {
    it('should include Claude CLI setup when CLI is available', () => {
      const authConfig = {
        mode: AuthMode.NONE,
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('claude login');
      expect(message).toContain('Option 3: Authenticate Claude CLI');
    });

    it('should include CLI installation instructions when CLI is not available', () => {
      const authConfig = {
        mode: AuthMode.NONE,
        hasClaudeCLI: false,
        hasCodexCLI: false,
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('Install and authenticate Claude CLI');
      expect(message).toContain('https://code.claude.com');
    });

    it('should include cloud-provider gateway instructions', () => {
      const authConfig = {
        mode: AuthMode.NONE,
        hasClaudeCLI: false,
        hasCodexCLI: false,
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('CLAUDE_CODE_USE_FOUNDRY');
      expect(message).toContain('ANTHROPIC_FOUNDRY_RESOURCE');
      expect(message).toContain('CLAUDE_CODE_USE_BEDROCK');
      expect(message).toContain('CLAUDE_CODE_USE_VERTEX');
    });

    it('should always include API key instructions', () => {
      const authConfig = {
        mode: AuthMode.NONE,
        hasClaudeCLI: false,
        hasCodexCLI: false,
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('ANTHROPIC_API_KEY');
      expect(message).toContain('OPENAI_API_KEY');
      expect(message).not.toContain('GOOGLE_API_KEY');
    });
  });
});
