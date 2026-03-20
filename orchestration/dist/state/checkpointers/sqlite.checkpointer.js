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
export const devCheckpointer = new MemorySaver();
/**
 * Initialize the checkpointer
 */
export async function initializeDevCheckpointer() {
    console.log(`✓ Memory checkpointer initialized (development mode)`);
    console.log(`   Note: Checkpoints are stored in memory and will be lost on restart.`);
    console.log(`   For production, use PostgresSaver or SqliteSaver.`);
}
//# sourceMappingURL=sqlite.checkpointer.js.map