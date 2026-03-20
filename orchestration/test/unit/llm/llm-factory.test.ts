import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMFactory } from '../../src/llm/llm-factory.js';

describe('LLMFactory', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.MODEL_PLANNER;
    delete process.env.MODEL_IMPLEMENTER;
    process.env.NODE_ENV = 'development';
  });

  describe('Model Alias Resolution', () => {
    it('should resolve simple alias', () => {
      const factory = new LLMFactory();
      const info = factory.getModelInfo('sonnet-latest');
      
      expect(info.resolvedAlias).toBe('sonnet-latest');
      expect(info.provider).toBe('anthropic');
      expect(info.modelId).toBe('claude-sonnet-4-5-20250929');
    });

    it('should resolve alias with agent context', () => {
      const factory = new LLMFactory();
      const info = factory.getModelInfo('sonnet-latest', { agent: 'planner' });
      
      expect(info.resolvedAlias).toBe('sonnet-latest');
      expect(info.provider).toBe('anthropic');
    });

    it('should apply CLI override', () => {
      process.env.MODEL_PLANNER = 'opus-latest';
      
      const factory = new LLMFactory();
      const info = factory.getModelInfo('sonnet-latest', { agent: 'planner' });
      
      expect(info.resolvedAlias).toBe('opus-latest');
      expect(info.modelId).toBe('claude-opus-4-5-20251101');
    });

    it('should apply environment overrides', () => {
      process.env.NODE_ENV = 'development';
      
      const factory = new LLMFactory();
      const info = factory.getModelInfo('sonnet-latest', { agent: 'planner' });
      
      // Development env uses haiku-latest for planner
      expect(info.resolvedAlias).toBe('haiku-latest');
      expect(info.modelId).toBe('claude-haiku-4-20250514');
    });

    it('should list all available aliases', () => {
      const factory = new LLMFactory();
      const aliases = factory.listAliases();
      
      expect(aliases).toContain('sonnet-latest');
      expect(aliases).toContain('haiku-latest');
      expect(aliases).toContain('opus-latest');
      expect(aliases).toContain('gpt4-latest');
      expect(aliases).toContain('gemini-latest');
    });
  });

  describe('Model Creation', () => {
    it('should create Anthropic model instance', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const factory = new LLMFactory();
      const model = await factory.createModel('sonnet-latest');
      
      expect(model).toBeDefined();
      expect(model.constructor.name).toContain('ChatAnthropic');
    });

    it('should throw error when API key missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      const factory = new LLMFactory();
      
      await expect(factory.createModel('sonnet-latest')).rejects.toThrow(
        'API key not found'
      );
    });

    it('should throw error for unknown alias', async () => {
      const factory = new LLMFactory();
      
      await expect(factory.createModel('unknown-alias')).rejects.toThrow(
        'Unknown model alias: unknown-alias'
      );
    });
  });

  describe('Provider Support', () => {
    it('should support Anthropic provider', () => {
      const factory = new LLMFactory();
      const info = factory.getModelInfo('sonnet-latest');
      
      expect(info.provider).toBe('anthropic');
    });

    it('should support OpenAI provider', () => {
      const factory = new LLMFactory();
      const info = factory.getModelInfo('gpt4-latest');
      
      expect(info.provider).toBe('openai');
    });

    it('should support Google provider', () => {
      const factory = new LLMFactory();
      const info = factory.getModelInfo('gemini-latest');
      
      expect(info.provider).toBe('google');
    });
  });
});
