/**
 * Shared state for ONE scenario (the PicoContainer "World" equivalent).
 * Injected as the `ctx` fixture: every step file that asks for `ctx` in the same scenario gets the SAME instance;
 * the next scenario gets a fresh one. Never keep state in module-level variables or statics.
 */
export class ScenarioContext {
  private readonly store = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  get<T>(key: string): T {
    if (!this.store.has(key)) throw new Error(`ScenarioContext: "${key}" was not set by a previous step`);
    return this.store.get(key) as T;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}
