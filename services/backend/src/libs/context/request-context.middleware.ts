import { Injectable, NestMiddleware } from '@nestjs/common';
import { RequestContext } from './request-context.model';

/**
 * Creates an isolated AsyncLocalStorage context for each incoming request.
 * Wraps the request/response in a RequestContext instance so downstream code
 * can access per-request data (e.g., requestId) without passing it explicitly.
 *
 * @example
 * // Applied globally in RequestContextModule:
 * consumer.apply(RequestContextMiddleware).forRoutes('*');
 */
@Injectable()
export class RequestContextMiddleware<Request = any, Response = any>
  implements NestMiddleware<Request, Response>
{
  use(req: Request, res: Response, next: () => void) {
    RequestContext.cls.run(new RequestContext(req, res), next);
  }
}
