import { describe, it, expect } from 'vitest';
import { CodexProvider } from '../../../src/providers/codex-provider.js';
import { Provider, AuthMethod } from '../../../src/providers/types.js';

describe('CodexProvider', () => {
  const provider = new CodexProvider();

  describe('getConfig', () => {
    it('should return codex provider config', () => {
      const config = provider.getConfig();
      expect(config.provider).toBe(Provider.CODEX);
      expect(config.llmProvider).toBe('openai');
    });
  });

  describe('getPaths', () => {
    it('should return codex-specific paths', () => {
      const paths = provider.getPaths();
      expect(paths.configDir).toBe('.codex');
      expect(paths.instructionFile).toBe('AGENTS.md');
      expect(paths.tempDir).toBe('.codex-temp');
      expect(paths.backupDir).toBe('.codex-backups');
      expect(paths.homeConfigDir).toBe('.codex');
      expect(paths.hooksFile).toBe('hooks.json');
    });
  });

  describe('getCLIConfig', () => {
    it('should return codex CLI flags', () => {
      const config = provider.getCLIConfig();
      expect(config.agentFileFlag).toBeNull(); // Codex reads AGENTS.md from dir
      expect(config.modelFlag).toBe('--model');
      expect(config.bypassPermissionsFlag).toBe('--yolo');
      expect(config.toolsFlag).toBeNull(); // Codex manages tools internally
      expect(config.sessionFlag).toBeNull(); // Codex manages sessions internally
      expect(config.nonInteractiveMode).toBe('exec');
    });
  });

  describe('mapModelToCLI', () => {
    it('should map gpt5-latest to gpt-5.4', () => {
      expect(provider.mapModelToCLI('gpt5-latest')).toBe('gpt-5.4');
    });

    it('should map gpt5-mini to gpt-5.4-mini', () => {
      expect(provider.mapModelToCLI('gpt5-mini')).toBe('gpt-5.4-mini');
    });

    it('should map codex aliases to gpt-5.3-codex', () => {
      expect(provider.mapModelToCLI('gpt-5.3-codex')).toBe('gpt-5.3-codex');
    });

    it('should default to gpt-5.4 for unknown aliases', () => {
      expect(provider.mapModelToCLI('sonnet-latest')).toBe('gpt-5.4');
      expect(provider.mapModelToCLI('unknown')).toBe('gpt-5.4');
    });
  });

  describe('buildCLIArgs', () => {
    const baseParams = {
      agentFilePath: '/path/to/agent.md',
      model: 'gpt-5.4',
      inputPrompt: 'test prompt',
      sessionId: 'abc-123',
      isRetry: false,
    };

    it('should use exec subcommand', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args[0]).toBe('exec');
    });

    it('should include prompt as argument', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args).toContain('test prompt');
    });

    it('should include --yolo flag', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args).toContain('--yolo');
    });

    it('should include --model flag', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args).toContain('--model');
      expect(args).toContain('gpt-5.4');
    });

    it('should include --skip-git-repo-check', () => {
      const args = provider.buildCLIArgs(baseParams);
      expect(args).toContain('--skip-git-repo-check');
    });
  });

  describe('buildEnvVars', () => {
    it('should include FRAMEWORK_PATH', () => {
      const env = provider.buildEnvVars('/framework');
      expect(env.FRAMEWORK_PATH).toBe('/framework');
    });

    it('should NOT include CLAUDE_SKIP_CONFIRMATIONS', () => {
      const env = provider.buildEnvVars('/framework');
      expect(env.CLAUDE_SKIP_CONFIRMATIONS).toBeUndefined();
    });
  });

  describe('parseCLIOutput', () => {
    it('should extract final message from JSON stream', () => {
      const jsonStream = [
        '{"type":"tool_use","name":"shell","input":"ls"}',
        '{"type":"message","content":"Here are the files: ..."}',
      ].join('\n');

      expect(provider.parseCLIOutput(jsonStream)).toBe('Here are the files: ...');
    });

    it('should return raw output if no message events', () => {
      const output = 'plain text output';
      expect(provider.parseCLIOutput(output)).toBe('plain text output');
    });

    it('should handle mixed JSON and text lines', () => {
      const mixed = 'some text\n{"type":"message","content":"result"}\nmore text';
      expect(provider.parseCLIOutput(mixed)).toBe('result');
    });
  });

  describe('detectRateLimit', () => {
    it('should detect 429 in stderr', () => {
      const result = provider.detectRateLimit('', 'Error 429: rate limit exceeded');
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(true);
    });

    it('should detect rate limit in stdout', () => {
      const result = provider.detectRateLimit('rate limit reached', '');
      expect(result).not.toBeNull();
      expect(result!.isRateLimited).toBe(true);
    });

    it('should return null for normal output', () => {
      const result = provider.detectRateLimit('Task completed', '');
      expect(result).toBeNull();
    });
  });

  describe('getValidFrontmatterFields', () => {
    it('should include basic fields', () => {
      const fields = provider.getValidFrontmatterFields();
      expect(fields).toContain('name');
      expect(fields).toContain('description');
      expect(fields).toContain('model');
    });

    it('should NOT include claude-specific fields', () => {
      const fields = provider.getValidFrontmatterFields();
      expect(fields).not.toContain('tools');
      expect(fields).not.toContain('mcpServers');
      expect(fields).not.toContain('hooks');
    });
  });

  describe('getInstructionFileMarkers', () => {
    it('should use AGENTS.md markers', () => {
      const markers = provider.getInstructionFileMarkers();
      expect(markers.sectionStart).toBe('# AGENTS.md Content');
    });
  });

  describe('detectConfig', () => {
    it('should detect API key from environment', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const config = await CodexProvider.detectConfig();
      expect(config.authMethod).toBe(AuthMethod.API_KEY);
      expect(config.apiKeyEnvVar).toBe('OPENAI_API_KEY');

      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });
});
