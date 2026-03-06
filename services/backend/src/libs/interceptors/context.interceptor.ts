import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { nanoid } from 'nanoid';
import { RequestContextService } from '../context';

/**
 * Assigns a unique correlation ID (nanoid) to each request via RequestContextService.
 * The ID is used in logs and exception responses to trace a request end-to-end.
 * If the request body contains a `requestId`, that value is used instead.
 *
 * @example
 * // Registered globally in main.ts:
 * app.useGlobalInterceptors(new ContextInterceptor());
 */
@Injectable()
export class ContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    /**
     * Setting an ID in the global context for each request.
     * This ID can be used as correlation id shown in logs
     */
    const requestId = request?.body?.requestId ?? nanoid(6);

    RequestContextService.setRequestId(requestId);

    return next.handle().pipe(
      tap(() => {
        // Perform cleaning if needed
      })
    );
  }
}
