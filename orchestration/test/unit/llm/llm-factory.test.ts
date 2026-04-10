import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LLMFactory, getLLMFactory } from '../../../src/llm/llm-factory.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('LLMFactory', () => {
  const originalEnv = process.env;
  const testConfigPath = join(process.cwd(), 'test', 'fixtures', 'test-model-config.json');

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MODEL_TIER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    // Ensure fixtures directory exists before writing test config
    const fixturesDir = join(process.cwd(), 'test', 'fixtures');
    mkdirSync(fixturesDir, { recursive: true });

    const testConfig = {
      version: '1.0.0',
      modelAliases: {
        'test-sonnet': {
          provider: 'anthropic',
          modelId: 'claude-sonnet-4-6',
          description: 'Test Sonnet',
          capabilities: ['code'],
          contextWindow: 200000,
        },
        'test-gpt': {
          provider: 'openai',
          modelId: 'gpt-5.4-2026-03-05',
          description: 'Test GPT',
          capabilities: ['code'],
          contextWindow: 128000,
        },
        'test-gemini': {
          provider: 'google',
          modelId: 'gemini-3.1-pro-preview',
          description: 'Test Gemini',
          capabilities: ['code'],
          contextWindow: 1000000,
        },
      },
      tiers: {
        standard: {
          description: 'Standard tier',
          provider: 'anthropic',
          agents: {
            planner: 'test-sonnet',
            implementer: 'test-sonnet',
          },
        },
        openai: {
          description: 'OpenAI tier',
          provider: 'openai',
          agents: {
            planner: 'test-gpt',
            implementer: 'test-gpt',
          },
        },
        gemini: {
          description: 'Gemini tier',
          provider: 'google',
          agents: {
            planner: 'test-gemini',
            implementer: 'test-gemini',
          },
        },
      },
      providerConfig: {
        anthropic: {
          apiKeyEnv: 'ANTHROPIC_API_KEY',
          defaultTemperature: 0,
          defaultMaxTokens: 4096,
          headers: {
            'anthropic-beta': 'test-header',
          },
        },
        openai: {
          apiKeyEnv: 'OPENAI_API_KEY',
          defaultTemperature: 0,
          defaultMaxTokens: 4096,
          baseURL: 'https://api.openai.com/v1',
        },
        google: {
          apiKeyEnv: 'GOOGLE_API_KEY',
          defaultTemperature: 0,
          defaultMaxTokens: 8192,
        },
      },
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
  });

  afterEach(() => {
    process.env = originalEnv;
    // Only remove the specific test config file, not the entire fixtures directory
    // This prevents race conditions when tests run in parallel
    try {
      rmSync(testConfigPath, { force: true });
    } catch {}
  });

  describe('Constructor', () => {
    it('should create factory with custom config path', () => {
      const factory = new LLMFactory(testConfigPath);
      expect(factory).toBeDefined();
    });

    it('should use standard tier by default', () => {
      const factory = new LLMFactory(testConfigPath);
      expect(factory.getCurrentTier()).toBe('standard');
    });

    it('should use tier from MODEL_TIER env var', () => {
      process.env.MODEL_TIER = 'openai';
      const factory = new LLMFactory(testConfigPath);
      expect(factory.getCurrentTier()).toBe('openai');
    });

    it('should throw error for unknown tier', () => {
      process.env.MODEL_TIER = 'unknown-tier';
      expect(() => new LLMFactory(testConfigPath)).toThrow(/Unknown tier: unknown-tier/);
    });
  });

  describe('createModel', () => {
    it('should create Anthropic model', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model = await factory.createModel('planner');

      expect(model).toBeDefined();
      expect(model.constructor.name).toContain('ChatAnthropic');
    });

    it('should create OpenAI model', async () => {
      process.env.MODEL_TIER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model = await factory.createModel('planner');

      expect(model).toBeDefined();
      expect(model.constructor.name).toContain('ChatOpenAI');
    });

    it('should create Google model', async () => {
      process.env.MODEL_TIER = 'gemini';
      process.env.GOOGLE_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model = await factory.createModel('planner');

      expect(model).toBeDefined();
      expect(model.constructor.name).toContain('ChatGoogleGenerativeAI');
    });

    it('should cache models', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model1 = await factory.createModel('planner');
      const model2 = await factory.createModel('planner');

      expect(model1).toBe(model2);
    });

    it('should create different instances for different overrides', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model1 = await factory.createModel('planner');
      const model2 = await factory.createModel('planner', { temperature: 0.5 });

      expect(model1).not.toBe(model2);
    });

    it('should apply temperature override', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model = await factory.createModel('planner', { temperature: 0.7 });

      expect(model).toBeDefined();
    });

    it('should apply maxTokens override', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      const model = await factory.createModel('planner', { maxTokens: 8192 });

      expect(model).toBeDefined();
    });

    it('should throw error for unknown agent', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      await expect(factory.createModel('unknown-agent')).rejects.toThrow(
        /No model configured for agent 'unknown-agent'/,
      );
    });

    it('should throw error for unknown alias', async () => {
      const testConfig = JSON.parse(readFileSync(testConfigPath, 'utf-8'));
      testConfig.tiers.standard.agents.planner = 'unknown-alias';
      writeFileSync(testConfigPath, JSON.stringify(testConfig));

      process.env.ANTHROPIC_API_KEY = 'test-key';
      const factory = new LLMFactory(testConfigPath);

      await expect(factory.createModel('planner')).rejects.toThrow(
        /Unknown model alias: unknown-alias/,
      );
    });

    it('should throw error when API key is missing', async () => {
      const factory = new LLMFactory(testConfigPath);

      await expect(factory.createModel('planner')).rejects.toThrow(
        /API key not found in environment variable: ANTHROPIC_API_KEY/,
      );
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', () => {
      const factory = new LLMFactory(testConfigPath);

      const info = factory.getModelInfo('planner');

      expect(info.tier).toBe('standard');
      expect(info.alias).toBe('test-sonnet');
      expect(info.provider).toBe('anthropic');
      expect(info.modelId).toBe('claude-sonnet-4-6');
      expect(info.contextWindow).toBe(200000);
    });

    it('should return info for different agents', () => {
      const factory = new LLMFactory(testConfigPath);

      const info = factory.getModelInfo('implementer');

      expect(info.alias).toBe('test-sonnet');
    });

    it('should throw error for unknown agent', () => {
      const factory = new LLMFactory(testConfigPath);

      expect(() => factory.getModelInfo('unknown-agent')).toThrow(
        /No model configured for agent 'unknown-agent'/,
      );
    });

    it('should throw error for unknown alias', () => {
      const testConfig = JSON.parse(readFileSync(testConfigPath, 'utf-8'));
      testConfig.tiers.standard.agents.planner = 'unknown-alias';
      writeFileSync(testConfigPath, JSON.stringify(testConfig));

      const factory = new LLMFactory(testConfigPath);

      expect(() => factory.getModelInfo('planner')).toThrow(/Unknown model alias: unknown-alias/);
    });
  });

  describe('listAliases', () => {
    it('should list all available aliases', () => {
      const factory = new LLMFactory(testConfigPath);

      const aliases = factory.listAliases();

      expect(aliases).toContain('test-sonnet');
      expect(aliases).toContain('test-gpt');
      expect(aliases).toContain('test-gemini');
      expect(aliases.length).toBe(3);
    });
  });

  describe('getEffectiveProvider', () => {
    it('should return effective provider for current tier', () => {
      const factory = new LLMFactory(testConfigPath);

      const provider = factory.getEffectiveProvider();

      expect(provider).toBe('anthropic');
    });

    it('should return correct provider for different tiers', () => {
      process.env.MODEL_TIER = 'openai';
      const factory = new LLMFactory(testConfigPath);

      const provider = factory.getEffectiveProvider();

      expect(provider).toBe('openai');
    });
  });

  describe('listTiers', () => {
    it('should list all available tiers', () => {
      const factory = new LLMFactory(testConfigPath);

      const tiers = factory.listTiers();

      expect(tiers).toContain('standard');
      expect(tiers).toContain('openai');
      expect(tiers).toContain('gemini');
      expect(tiers.length).toBe(3);
    });
  });

  describe('getCurrentTier', () => {
    it('should return current tier', () => {
      const factory = new LLMFactory(testConfigPath);

      const tier = factory.getCurrentTier();

      expect(tier).toBe('standard');
    });

    it('should return tier from env var', () => {
      process.env.MODEL_TIER = 'openai';
      const factory = new LLMFactory(testConfigPath);

      const tier = factory.getCurrentTier();

      expect(tier).toBe('openai');
    });
  });

  describe('getTierMapping', () => {
    it('should return agent-to-alias mapping for current tier', () => {
      const factory = new LLMFactory(testConfigPath);

      const mapping = factory.getTierMapping();

      expect(mapping.planner).toBe('test-sonnet');
      expect(mapping.implementer).toBe('test-sonnet');
    });

    it('should return mapping for different tier', () => {
      process.env.MODEL_TIER = 'openai';
      const factory = new LLMFactory(testConfigPath);

      const mapping = factory.getTierMapping();

      expect(mapping.planner).toBe('test-gpt');
    });
  });

  describe('getLLMFactory singleton', () => {
    it('should return singleton instance', () => {
      const factory1 = getLLMFactory(testConfigPath);
      const factory2 = getLLMFactory(testConfigPath);

      expect(factory1).toBe(factory2);
    });

    it('should create new instance on first call', () => {
      const factory = getLLMFactory(testConfigPath);

      expect(factory).toBeDefined();
      expect(factory.getCurrentTier()).toBe('standard');
    });
  });
});

function readFileSync(path: string, encoding: string) {
  return require('fs').readFileSync(path, encoding);
}
