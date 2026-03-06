import { AsyncLocalStorage } from 'async_hooks';

/**
 * Holds per-request data using Node.js AsyncLocalStorage. Each request gets its own
 * isolated instance, accessible anywhere via `RequestContext.currentContext` without
 * needing to thread the request object through every call.
 *
 * @example
 * const ctx = RequestContext.currentContext;
 * const request = ctx?.req;
 */
export class RequestContext<TRequest = any, TResponse = any> {
  static cls = new AsyncLocalStorage<RequestContext>();

  static get currentContext() {
    const localStorage = this.cls.getStore();
    return localStorage;
  }

  constructor(
    public readonly req: TRequest,
    public readonly res: TResponse
  ) {}
}
