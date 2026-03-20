import { BaseChatModel } from "@langchain/core/language_models/chat_models";
export declare class LLMFactory {
    private config;
    private modelCache;
    private currentTier;
    constructor(configPath?: string);
    /**
     * Resolve model alias for a given agent
     * Simply looks up the agent in the current tier's configuration
     */
    private resolveAlias;
    /**
     * Create LangChain ChatModel instance for an agent
     */
    createModel(agentName: string, overrides?: {
        temperature?: number;
        maxTokens?: number;
    }): Promise<BaseChatModel>;
    /**
     * Get model information for logging/debugging
     */
    getModelInfo(agentName: string): {
        tier: string;
        alias: string;
        provider: string;
        modelId: string;
        contextWindow: number;
    };
    /**
     * List all available model aliases
     */
    listAliases(): string[];
    /**
     * Get the effective provider for the current tier
     */
    getEffectiveProvider(): string;
    /**
     * Get all available tiers
     */
    listTiers(): string[];
    /**
     * Get current tier name
     */
    getCurrentTier(): string;
    /**
     * Get agent-to-alias mapping for current tier
     */
    getTierMapping(): Record<string, string>;
}
export declare function getLLMFactory(configPath?: string): LLMFactory;
//# sourceMappingURL=llm-factory.d.ts.map