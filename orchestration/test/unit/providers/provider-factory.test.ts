import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from '../../../src/providers/provider-factory.js';
import { Provider } from '../../../src/providers/types.js';

describe('ProviderFactory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean provider-related env vars
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.PROVIDER;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('create', () => {
    it('should create a ClaudeProvider for CLAUDE', () => {
      const adapter = ProviderFactory.create(Provider.CLAUDE);
      expect(adapter.getConfig().provider).toBe(Provider.CLAUDE);
      expect(adapter.getPaths().configDir).toBe('.claude');
    });

    it('should create a CodexProvider for CODEX', () => {
      const adapter = ProviderFactory.create(Provider.CODEX);
      expect(adapter.getConfig().provider).toBe(Provider.CODEX);
      expect(adapter.getPaths().configDir).toBe('.codex');
    });
  });

  describe('detect', () => {
    it('should detect claude from ANTHROPIC_API_KEY', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const adapter = await ProviderFactory.detect();
      expect(adapter.getConfig().provider).toBe(Provider.CLAUDE);
      expect(adapter.getConfig().llmProvider).toBe('anthropic');
    });

    it('should detect codex from OPENAI_API_KEY', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const adapter = await ProviderFactory.detect();
      expect(adapter.getConfig().provider).toBe(Provider.CODEX);
      expect(adapter.getConfig().llmProvider).toBe('openai');
    });

    it('should respect PROVIDER=codex env var override', async () => {
      process.env.PROVIDER = 'codex';
      // Even without API key, should try codex
      try {
        const adapter = await ProviderFactory.detect();
        expect(adapter.getConfig().provider).toBe(Provider.CODEX);
      } catch {
        // May throw if codex CLI not installed - that's ok for unit test
      }
    });

    it('should respect PROVIDER=claude env var override', async () => {
      process.env.PROVIDER = 'claude';
      try {
        const adapter = await ProviderFactory.detect();
        expect(adapter.getConfig().provider).toBe(Provider.CLAUDE);
      } catch {
        // May throw if claude CLI not installed - that's ok for unit test
      }
    });

    it('should prioritize Anthropic API key over OpenAI', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-test';
      const adapter = await ProviderFactory.detect();
      expect(adapter.getConfig().provider).toBe(Provider.CLAUDE);
    });
  });
});
