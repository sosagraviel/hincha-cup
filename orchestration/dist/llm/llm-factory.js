import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Zod Schema for Model Configuration
const ModelAliasSchema = z.object({
    provider: z.enum(["anthropic", "openai", "google"]),
    modelId: z.string(),
    description: z.string(),
    capabilities: z.array(z.string()),
    contextWindow: z.number()
});
const ProviderConfigSchema = z.object({
    apiKeyEnv: z.string(),
    defaultTemperature: z.number(),
    defaultMaxTokens: z.number(),
    headers: z.record(z.string(), z.string()).optional(),
    baseURL: z.string().optional()
});
const TierConfigSchema = z.object({
    description: z.string(),
    provider: z.enum(["anthropic", "openai", "google"]),
    agents: z.record(z.string(), z.string())
});
const ModelConfigSchema = z.object({
    version: z.string(),
    modelAliases: z.record(z.string(), ModelAliasSchema),
    tiers: z.record(z.string(), TierConfigSchema),
    providerConfig: z.record(z.string(), ProviderConfigSchema)
});
export class LLMFactory {
    config;
    modelCache = new Map();
    currentTier;
    constructor(configPath) {
        const defaultConfigPath = join(__dirname, "../../config/model-config.json");
        const path = configPath || defaultConfigPath;
        const rawConfig = JSON.parse(readFileSync(path, "utf-8"));
        this.config = ModelConfigSchema.parse(rawConfig);
        // Get tier from environment variable (MODEL_TIER) or default to "standard"
        this.currentTier = process.env.MODEL_TIER || "standard";
        // Validate that the tier exists
        if (!this.config.tiers[this.currentTier]) {
            throw new Error(`Unknown tier: ${this.currentTier}. Available tiers: ${Object.keys(this.config.tiers).join(", ")}`);
        }
    }
    /**
     * Resolve model alias for a given agent
     * Simply looks up the agent in the current tier's configuration
     */
    resolveAlias(agentName) {
        const tierConfig = this.config.tiers[this.currentTier];
        // Get the alias from tier configuration
        const alias = tierConfig.agents[agentName];
        if (!alias) {
            throw new Error(`No model configured for agent '${agentName}' in tier '${this.currentTier}'`);
        }
        return alias;
    }
    /**
     * Create LangChain ChatModel instance for an agent
     */
    async createModel(agentName, overrides) {
        const alias = this.resolveAlias(agentName);
        // Check cache
        const cacheKey = `${alias}:${JSON.stringify(overrides || {})}`;
        if (this.modelCache.has(cacheKey)) {
            return this.modelCache.get(cacheKey);
        }
        // Get alias configuration
        const aliasConfig = this.config.modelAliases[alias];
        if (!aliasConfig) {
            throw new Error(`Unknown model alias: ${alias}. Available aliases: ${Object.keys(this.config.modelAliases).join(", ")}`);
        }
        // Get provider configuration
        const providerConfig = this.config.providerConfig[aliasConfig.provider];
        if (!providerConfig) {
            throw new Error(`No configuration found for provider: ${aliasConfig.provider}`);
        }
        // Get API key from environment
        const apiKey = process.env[providerConfig.apiKeyEnv];
        if (!apiKey) {
            throw new Error(`API key not found in environment variable: ${providerConfig.apiKeyEnv}`);
        }
        // Create provider-specific model
        let model;
        switch (aliasConfig.provider) {
            case "anthropic":
                model = new ChatAnthropic({
                    model: aliasConfig.modelId,
                    apiKey,
                    temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
                    maxTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens,
                    clientOptions: {
                        defaultHeaders: providerConfig.headers
                    }
                });
                break;
            case "openai":
                model = new ChatOpenAI({
                    model: aliasConfig.modelId,
                    apiKey,
                    temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
                    maxTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens,
                    configuration: {
                        baseURL: providerConfig.baseURL
                    }
                });
                break;
            case "google":
                model = new ChatGoogleGenerativeAI({
                    model: aliasConfig.modelId,
                    apiKey,
                    temperature: overrides?.temperature ?? providerConfig.defaultTemperature,
                    maxOutputTokens: overrides?.maxTokens ?? providerConfig.defaultMaxTokens
                });
                break;
            default:
                throw new Error(`Unsupported provider: ${aliasConfig.provider}`);
        }
        // Cache and return
        this.modelCache.set(cacheKey, model);
        return model;
    }
    /**
     * Get model information for logging/debugging
     */
    getModelInfo(agentName) {
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
            contextWindow: aliasConfig.contextWindow
        };
    }
    /**
     * List all available model aliases
     */
    listAliases() {
        return Object.keys(this.config.modelAliases);
    }
    /**
     * Get the effective provider for the current tier
     */
    getEffectiveProvider() {
        return this.config.tiers[this.currentTier].provider;
    }
    /**
     * Get all available tiers
     */
    listTiers() {
        return Object.keys(this.config.tiers);
    }
    /**
     * Get current tier name
     */
    getCurrentTier() {
        return this.currentTier;
    }
    /**
     * Get agent-to-alias mapping for current tier
     */
    getTierMapping() {
        return this.config.tiers[this.currentTier].agents;
    }
}
// Singleton instance
let factoryInstance = null;
export function getLLMFactory(configPath) {
    if (!factoryInstance) {
        factoryInstance = new LLMFactory(configPath);
    }
    return factoryInstance;
}
//# sourceMappingURL=llm-factory.js.map