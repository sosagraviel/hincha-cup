import { RequestContext } from '../context';

/**
 * Application-specific request context that extends RequestContext with a
 * correlation `requestId` for log tracing and error reporting.
 *
 * @example
 * const ctx = RequestContextService.getContext();
 * console.log(ctx.requestId); // e.g. "aB3xY9"
 */
export class AppRequestContext extends RequestContext {
  requestId: string;
}

/**
 * Static helper to read/write the AppRequestContext from anywhere in the
 * request lifecycle. Provides access to the correlation requestId set by
 * ContextInterceptor.
 *
 * @example
 * const requestId = RequestContextService.getRequestId();
 * RequestContextService.setRequestId('custom-id');
 */
export class RequestContextService {
  static getContext(): AppRequestContext {
    const ctx: AppRequestContext = RequestContext.currentContext?.req || {};
    return ctx;
  }

  static setRequestId(id: string): void {
    const ctx: any = this.getContext();
    ctx.requestId = id;
  }

  static getRequestId(): string | undefined {
    return this.getContext().requestId;
  }
}
