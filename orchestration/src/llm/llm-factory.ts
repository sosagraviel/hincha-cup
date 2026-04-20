import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ModelAliasSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google']),
  modelId: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()),
  contextWindow: z.number(),
});

const ProviderConfigSchema = z.object({
  apiKeyEnv: z.string(),
  defaultTemperature: z.number(),
  defaultMaxTokens: z.number(),
  headers: z.record(z.string(), z.string()).optional(),
  baseURL: z.string().optional(),
});

const TierConfigSchema = z.object({
  description: z.string(),
  provider: z.enum(['anthropic', 'openai', 'google']),
  agents: z.record(z.string(), z.string()),
});

const ModelConfigSchema = z.object({
  version: z.string(),
  modelAliases: z.record(z.string(), ModelAliasSchema),
  tiers: z.record(z.string(), TierConfigSchema),
  providerConfig: z.record(z.string(), ProviderConfigSchema),
});

type ModelConfig = z.infer<typeof ModelConfigSchema>;

export class LLMFactory {
  private config: ModelConfig;
  private modelCache: Map<string, BaseChatModel> = new Map();
  private currentTier: string;

  constructor(configPath?: string) {
    const defaultConfigPath = join(__dirname, '../../config/model-config.json');
    const path = configPath || defaultConfigPath;

    const rawConfig = JSON.parse(readFileSync(path, 'utf-8'));
    this.config = ModelConfigSchema.parse(rawConfig);

    this.currentTier = process.env.MODEL_TIER || 'standard';

    if (!this.config.tiers[this.currentTier]) {
      throw new Error(
        `Unknown tier: ${this.currentTier}. Available tiers: ${Object.keys(this.config.tiers).join(', ')}`,
      );
    }
  }

  private resolveAlias(agentName: string): string {
    const tierConfig = this.config.tiers[this.currentTier];
    const alias = tierConfig.agents[agentName];

    if (!alias) {
      throw new Error(`No model configured for agent '${agentName}' in tier '${this.currentTier}'`);
    }

    return alias;
  }

  /**
   * Create LangChain ChatModel instance for an agent
   */
  async createModel(
    agentName: string,
    overrides?: { temperature?: number; maxTokens?: number },
  ): Promise<BaseChatModel> {
    const alias = this.resolveAlias(agentName);

    const cacheKey = `${alias}:${JSON.stringify(overrides || {})}`;
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    const aliasConfig = this.config.modelAliases[alias];
    if (!aliasConfig) {
      throw new Error(
        `Unknown model alias: ${alias}. Available aliases: ${Object.keys(this.config.modelAliases).join(', ')}`,
      );
    }

    const providerConfig = this.config.providerConfig[aliasConfig.provider];
    if (!providerConfig) {
      throw new Error(`No configuration found for provider: ${aliasConfig.provider}`);
    }

    const apiKey = process.env[providerConfig.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`API key not found in environment variable: ${providerConfig.apiKeyEnv}`);
    }

    let model: BaseChatModel;

    switch (aliasConfig.provider) {
      case 'anthropic':
        model = new ChatAnthropic({
          model: aliasConfig.modelId,
          apiKey,
          temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
          maxTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens,
          clientOptions: {
            defaultHeaders: providerConfig.headers,
          },
        });
        break;

      case 'openai':
        model = new ChatOpenAI({
          model: aliasConfig.modelId,
          apiKey,
          temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
          maxTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens,
          configuration: {
            baseURL: providerConfig.baseURL,
          },
        });
        break;

      case 'google':
        model = new ChatGoogleGenerativeAI({
          model: aliasConfig.modelId,
          apiKey,
          temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
          maxOutputTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens,
        });
        break;

      default:
        throw new Error(`Unsupported provider: ${aliasConfig.provider}`);
    }

    this.modelCache.set(cacheKey, model);
    return model;
  }

  /**
   * Get model information for logging/debugging
   */
  getModelInfo(agentName: string): {
    tier: string;
    alias: string;
    provider: string;
    modelId: string;
    contextWindow: number;
  } {
    const alias = this.resolveAlias(agentName);
    const aliasConfig = this.config.modelAliases[alias];

    if (!aliasConfig) {
      throw new Error(`Unknown model alias: ${alias}`);
    }

    return {
      tier: this.currentTier,
      alias,
      provider: aliasConfig.provider,
      modelId: aliasConfig.modelId,
      contextWindow: aliasConfig.contextWindow,
    };
  }

  /**
   * List all available model aliases
   */
  listAliases(): string[] {
    return Object.keys(this.config.modelAliases);
  }

  /**
   * Get the effective provider for the current tier
   */
  getEffectiveProvider(): string {
    return this.config.tiers[this.currentTier].provider;
  }

  /**
   * Get all available tiers
   */
  listTiers(): string[] {
    return Object.keys(this.config.tiers);
  }

  /**
   * Get current tier name
   */
  getCurrentTier(): string {
    return this.currentTier;
  }

  /**
   * Get agent-to-alias mapping for current tier
   */
  getTierMapping(): Record<string, string> {
    return this.config.tiers[this.currentTier].agents;
  }
}

let factoryInstance: LLMFactory | null = null;

/**
 * Get singleton LLMFactory instance
 */
export function getLLMFactory(configPath?: string): LLMFactory {
  if (!factoryInstance) {
    factoryInstance = new LLMFactory(configPath);
  }
  return factoryInstance;
}

/**
 * Reset the singleton instance (needed when MODEL_TIER changes after initial creation)
 */
export function resetLLMFactory(): void {
  factoryInstance = null;
}
