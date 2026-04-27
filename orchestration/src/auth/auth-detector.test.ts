import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectAuthMode,
  AuthMode,
  isClaudeCLIAvailable,
  isClaudeCLIAuthenticated,
  getAuthErrorMessage,
} from './auth-detector.js';

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

describe('auth-detector', () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PROVIDER;
    delete process.env.FRAMEWORK_PATH;

    vi.clearAllMocks();

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
  });

  describe('isClaudeCLIAvailable', () => {
    it('should return true when Claude CLI is installed', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/local/bin/claude'));

      const result = await isClaudeCLIAvailable();

      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith('which claude', expect.any(Object));
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
