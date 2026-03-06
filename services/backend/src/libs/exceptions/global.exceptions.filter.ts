import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Response } from 'express';
import * as Sentry from '@sentry/nestjs';

import { ExceptionBase } from '@libs/exceptions';
import { RequestContextService } from '../context';

/**
 * Catches all unhandled exceptions globally. Routes ExceptionBase subclasses through
 * their `toJSON()` serialization; reformats class-validator errors into a consistent
 * `{ message, subErrors, correlationId }` shape; reports all exceptions to Sentry.
 *
 * @example
 * // Registered globally in main.ts:
 * app.useGlobalFilters(new GlobalExceptionsFilter());
 */
@Catch()
export class GlobalExceptionsFilter implements ExceptionFilter {
  private readonly logger: Logger = new Logger(GlobalExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    Sentry.captureException(exception);
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      (exception as any).status || HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof ExceptionBase) {
      this.logger.error(exception.toJSON());
      return response.status(exception.getStatus()).json(exception.toJSON());
    }

    // Logging for debugging purposes
    if (status >= 400 && status < 500) {
      this.logger.error(
        `[${RequestContextService.getRequestId()}]: ${(exception as ExceptionBase).message}`
      );

      this.logger.debug(
        `[${RequestContextService.getRequestId()}]: ${(exception as ExceptionBase).stack}`
      );

      this.logger.debug(
        `[${RequestContextService.getRequestId()}]: ${(exception as ExceptionBase).cause}`
      );

      const isClassValidatorError =
        Array.isArray((exception as any)?.response?.message) &&
        typeof (exception as any)?.response?.error === 'string' &&
        (exception as any).status === 400;
      // Transforming class-validator errors to a different format
      if (isClassValidatorError) {
        return response.status(HttpStatus.BAD_REQUEST).json({
          message: 'Validation error',
          error: (exception as any)?.response?.error,
          subErrors: (exception as any)?.response?.message,
          correlationId: RequestContextService.getRequestId() || nanoid(6)
        });
      }
    }

    this.logger.error(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      error: 'Internal server error',
      correlationId: RequestContextService.getRequestId() || nanoid(6)
    });
  }
}
