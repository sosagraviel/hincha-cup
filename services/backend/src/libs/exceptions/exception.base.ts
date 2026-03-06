import { RequestContextService } from '@libs/context';
import { HttpException } from '@nestjs/common';
import { isDevelopment } from '@src/config/app.config';
import { nanoid } from 'nanoid';

interface SerializedException {
  message: string;
  code: string;
  correlationId: string;
  stack?: string;
  cause?: { message: string; stack: string | undefined };
  metadata?: unknown;
  /**
   * ^ Consider adding optional `metadata` object to
   * exceptions (if language doesn't support anything
   * similar by default) and pass some useful technical
   * information about the exception when throwing.
   * This will make debugging easier.
   */
}

/**
 * Abstract base for all custom exceptions. Extends HttpException with a correlation
 * ID (from RequestContext or nanoid fallback) and a `code` string for cross-process
 * error identification. Serializes differently in dev vs production (stack/cause hidden in prod).
 *
 * @example
 * export class NotFoundException extends ExceptionBase {
 *   code = NOT_FOUND;
 *   constructor(message = 'Not found', cause?: Error) {
 *     super({ message, status: HttpStatus.NOT_FOUND, cause });
 *   }
 * }
 */
export abstract class ExceptionBase extends HttpException {
  abstract code: string;

  public readonly correlationId: string;
  private readonly metadata: unknown;
  declare public cause: Error;

  /**
   * @param {string} message
   * @param {ObjectLiteral} [metadata={}]
   * **BE CAREFUL** not to include sensitive info in 'metadata'
   * to prevent leaks since all exception's data will end up
   * in application's log files. Only include non-sensitive
   * info that may help with debugging.
   */
  constructor({
    message,
    status,
    cause,
    metadata
  }: {
    message: string;
    status: number;
    readonly cause?: Error;
    readonly metadata?: unknown;
  }) {
    super(message, status, {
      cause
    });
    Error.captureStackTrace(this, this.constructor);
    const ctx = RequestContextService.getContext();
    this.correlationId = ctx?.requestId || nanoid(6);
    this.metadata = metadata;
  }

  /**
   * By default in NodeJS Error objects are not
   * serialized properly when sending plain objects
   * to external processes. This method is a workaround.
   * Keep in mind not to return a stack trace to user when in production.
   * https://iaincollins.medium.com/error-handling-in-javascript-a6172ccdf9af
   */
  toJSON(): SerializedException {
    return isDevelopment()
      ? {
          message: this.message,
          code: this.code,
          stack: this.stack,
          correlationId: this.correlationId,
          cause: {
            message:
              typeof this.cause === 'object'
                ? JSON.stringify(this.cause, null, 2)
                : this.cause,
            stack: this.cause?.stack
          },
          metadata: this.metadata
        }
      : {
          message: this.message,
          code: this.code,
          correlationId: this.correlationId
        };
  }
}
