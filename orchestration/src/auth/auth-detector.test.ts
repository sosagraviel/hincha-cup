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
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

describe('auth-detector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    vi.clearAllMocks();
  });

  describe('detectAuthMode', () => {
    it('should detect Anthropic API key', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.API_KEY);
      expect(result.provider).toBe('anthropic');
      expect(result.hasAPIKey).toBe(true);
    });

    it('should detect OpenAI API key', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.API_KEY);
      expect(result.provider).toBe('openai');
      expect(result.hasAPIKey).toBe(true);
    });

    it('should detect Google API key', async () => {
      process.env.GOOGLE_API_KEY = 'google-test-key';

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.API_KEY);
      expect(result.provider).toBe('google');
      expect(result.hasAPIKey).toBe(true);
    });

    it('should prioritize Anthropic over other providers', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      process.env.OPENAI_API_KEY = 'sk-test-key';
      process.env.GOOGLE_API_KEY = 'google-test-key';

      const result = await detectAuthMode();

      expect(result.mode).toBe(AuthMode.API_KEY);
      expect(result.provider).toBe('anthropic');
    });

    it('should detect Claude CLI mode when no API key is set', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation((cmd: string) => {
        if (cmd === 'which claude' || cmd === 'claude --help') {
          return Buffer.from('');
        }
        throw new Error('Command failed');
      });

      const fs = await import('fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);

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
      vi.mocked(fs.default.existsSync).mockReturnValue(true);

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
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('claude setup-token');
      expect(message).toContain('Option 2: Authenticate Claude CLI');
    });

    it('should include CLI installation instructions when CLI is not available', () => {
      const authConfig = {
        mode: AuthMode.NONE,
        hasClaudeCLI: false,
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
        hasAPIKey: false,
      };

      const message = getAuthErrorMessage(authConfig);

      expect(message).toContain('ANTHROPIC_API_KEY');
      expect(message).toContain('OPENAI_API_KEY');
      expect(message).toContain('GOOGLE_API_KEY');
    });
  });
});
