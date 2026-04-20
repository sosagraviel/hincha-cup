import { describe, it, expect } from 'vitest';
import { ClaudeProvider } from '../../../src/providers/claude-provider.js';
import { Provider, AuthMethod } from '../../../src/providers/types.js';

describe('ClaudeProvider', () => {
  const provider = new ClaudeProvider();

  describe('getConfig', () => {
    it('should return claude provider config', () => {
      const config = provider.getConfig();
      expect(config.provider).toBe(Provider.CLAUDE);
      expect(config.llmProvider).toBe('anthropic');
    });
  });

  describe('getPaths', () => {
    it('should return claude-specific paths', () => {
      const paths = provider.getPaths();
      expect(paths.configDir).toBe('.claude');
      expect(paths.instructionFile).toBe('CLAUDE.md');
      expect(paths.tempDir).toBe('.claude-temp');
      expect(paths.backupDir).toBe('.claude-backups');
      expect(paths.homeConfigDir).toBe('.claude');
      expect(paths.hooksFile).toBe('settings.json');
    });
  });

  describe('getCLIConfig', () => {
    it('should return claude CLI flags', () => {
      const config = provider.getCLIConfig();
      expect(config.agentFileFlag).toBe('--agent');
      expect(config.modelFlag).toBe('--model');
      expect(config.bypassPermissionsFlag).toBe('--dangerously-skip-permissions');
      expect(config.toolsFlag).toBe('--tools');
      expect(config.sessionFlag).toBe('--session-id');
      expect(config.resumeFlag).toBe('--resume');
      expect(config.settingsFlag).toBe('--settings');
      expect(config.skipConfirmationsEnvVar).toBe('CLAUDE_SKIP_CONFIRMATIONS');
    });
  });

  describe('mapModelToCLI', () => {
    it('should map sonnet aliases to sonnet', () => {
      expect(provider.mapModelToCLI('sonnet-latest')).toBe('sonnet');
      expect(provider.mapModelToCLI('claude-sonnet-4')).toBe('sonnet');
    });

    it('should map opus aliases to opus', () => {
      expect(provider.mapModelToCLI('opus-latest')).toBe('opus');
      expect(provider.mapModelToCLI('claude-opus-4')).toBe('opus');
    });

    it('should map haiku aliases to haiku', () => {
      expect(provider.mapModelToCLI('haiku-latest')).toBe('haiku');
    });

    it('should default to sonnet for unknown aliases', () => {
      expect(provider.mapModelToCLI('gpt5-latest')).toBe('sonnet');
      expect(provider.mapModelToCLI('unknown')).toBe('sonnet');
    });
  });

  describe('buildCLIArgs', () => {
    const baseParams = {
      agentFilePath: '/path/to/agent.md',
      model: 'sonnet',
      inputPrompt: 'test prompt',
      sessionId: 'abc-123',
      isRetry: false,
    };

    it('should include --agent and --model flags', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args).toContain('--agent');
      expect(args).toContain('/path/to/agent.md');
      expect(args).toContain('--model');
      expect(args).toContain('sonnet');
    });

    it('should include --tools when specified', () => {
      const args = provider.buildCLIArgs({ ...baseParams, tools: 'Read,Grep,Glob' });
      expect(args).toContain('--tools');
      expect(args).toContain('Read,Grep,Glob');
      expect(args).not.toContain('--dangerously-skip-permissions');
    });

    it('should include --dangerously-skip-permissions when no tools', () => {
      const args = provider.buildCLIArgs({ ...baseParams, tools: null });
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).not.toContain('--tools');
    });

    it('should use --session-id for new sessions', () => {
      const args = provider.buildCLIArgs({ ...baseParams, isRetry: false });
      expect(args).toContain('--session-id');
      expect(args).toContain('abc-123');
    });

    it('should use --resume for retries', () => {
      const args = provider.buildCLIArgs({ ...baseParams, isRetry: true });
      expect(args).toContain('--resume');
      expect(args).toContain('abc-123');
    });

    it('should include --settings when specified', () => {
      const args = provider.buildCLIArgs({ ...baseParams, settingsPath: '/path/to/settings.json' });
      expect(args).toContain('--settings');
      expect(args).toContain('/path/to/settings.json');
    });
  });

  describe('buildEnvVars', () => {
    it('should include CLAUDE_SKIP_CONFIRMATIONS and FRAMEWORK_PATH', () => {
      const env = provider.buildEnvVars('/framework');
      expect(env.CLAUDE_SKIP_CONFIRMATIONS).toBe('1');
      expect(env.FRAMEWORK_PATH).toBe('/framework');
    });
  });

  describe('detectRateLimit', () => {
    it('should detect rate limit from Limit reached', () => {
      const result = provider.detectRateLimit('Limit reached. Usage resets 5pm (EST)', '');
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(true);
    });

    it('should return null for normal output', () => {
      const result = provider.detectRateLimit('Task completed successfully', '');
      expect(result).toBeNull();
    });
  });

  describe('getValidFrontmatterFields', () => {
    it('should include claude-specific fields', () => {
      const fields = provider.getValidFrontmatterFields();
      expect(fields).toContain('tools');
      expect(fields).toContain('mcpServers');
      expect(fields).toContain('hooks');
      expect(fields).toContain('skills');
      expect(fields).toContain('stop-hook');
    });
  });

  describe('getInstructionFileMarkers', () => {
    it('should use CLAUDE.md markers', () => {
      const markers = provider.getInstructionFileMarkers();
      expect(markers.sectionStart).toBe('# CLAUDE.md Content');
    });
  });

  describe('detectConfig', () => {
    it('should detect API key from environment', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const config = await ClaudeProvider.detectConfig();
      expect(config.authMethod).toBe(AuthMethod.API_KEY);
      expect(config.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');

      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });
});
