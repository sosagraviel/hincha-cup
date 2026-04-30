import { DebugStore } from './debug-store.js';

/**
 * Process-wide singleton holding the active DebugStore. Set once at CLI
 * startup; read everywhere (agent impls, nodes, retry layer) without plumbing.
 *
 * Keeping this out of LangGraph state lets us:
 *  - Write debug artifacts from spots that don't receive state (e.g. inside
 *    the agent factory) without threading runId through every call.
 *  - Skip debug writes cleanly when no run has been registered (e.g. in unit
 *    tests that instantiate an agent directly).
 */
let activeStore: DebugStore | null = null;

export function setActiveDebugStore(store: DebugStore | null): void {
  activeStore = store;
}

export function getActiveDebugStore(): DebugStore | null {
  return activeStore;
}

/**
 * Node-side helper: read the active store or return null. Callers should
 * treat a null return as "no debug run is active — just skip the write".
 */
export function tryActiveDebugStore(): DebugStore | null {
  return activeStore;
}
