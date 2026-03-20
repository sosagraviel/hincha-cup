import { MemorySaver } from "@langchain/langgraph";
/**
 * Memory Checkpointer for Development
 *
 * Stores workflow checkpoints in memory.
 * Useful for development and testing.
 *
 * NOTE: For production, replace with a persistent checkpointer like PostgresSaver
 * Install: npm install @langchain/langgraph-checkpoint-postgres
 */
export declare const devCheckpointer: MemorySaver;
/**
 * Initialize the checkpointer
 */
export declare function initializeDevCheckpointer(): Promise<void>;
//# sourceMappingURL=sqlite.checkpointer.d.ts.map