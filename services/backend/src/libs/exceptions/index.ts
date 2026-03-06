import { HttpStatus } from '@nestjs/common';
export * from './exception.base';
import { ExceptionBase } from './exception.base';
import {
  ARGUMENT_INVALID,
  ARGUMENT_OUT_OF_RANGE,
  CONFLICT,
  FORBIDDEN,
  INTERNAL_SERVER_ERROR,
  INVALID_ORDER_BY_FIELD,
  NOT_FOUND,
  UNAUTHORIZED
} from './exception.codes';
import { ARGUMENT_NOT_PROVIDED } from './exception.codes';
export * from './postgres.expection.util';

/**
 * Used to indicate that an incorrect argument was provided to a method/function/class constructor
 *
 * @class ArgumentInvalidException
 * @extends {ExceptionBase}
 */
export class ArgumentInvalidException extends ExceptionBase {
  readonly code = ARGUMENT_INVALID;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.BAD_REQUEST,
      message,
      cause
    });
  }
}

/**
 * Used to indicate that an argument was not provided (is empty object/array, null of undefined).
 *
 * @class ArgumentNotProvidedException
 * @extends {ExceptionBase}
 */
export class ArgumentNotProvidedException extends ExceptionBase {
  readonly code = ARGUMENT_NOT_PROVIDED;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.BAD_REQUEST,
      message,
      cause
    });
  }
}

/**
 * Used to indicate that an argument is out of allowed range
 * (for example: incorrect string/array length, number not in allowed min/max range etc)
 *
 * @class ArgumentOutOfRangeException
 * @extends {ExceptionBase}
 */
export class ArgumentOutOfRangeException extends ExceptionBase {
  readonly code = ARGUMENT_OUT_OF_RANGE;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.BAD_REQUEST,
      message,
      cause
    });
  }
}

/**
 * Used to indicate conflicting entities (usually in the database)
 *
 * @class ConflictException
 * @extends {ExceptionBase}
 */
export class ConflictException extends ExceptionBase {
  readonly code = CONFLICT;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.CONFLICT,
      message,
      cause
    });
  }
}

/**
 * Used to indicate that user is not authorized to access the resource
 *
 * @class UnauthorizedException
 * @extends {ExceptionBase}
 */
export class UnauthorizedException extends ExceptionBase {
  readonly code = UNAUTHORIZED;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.UNAUTHORIZED,
      message,
      cause
    });
  }
}

/**
 * Exception thrown when a forbidden action is attempted.
 *
 * @extends ExceptionBase
 * @property {string} code - The error code representing a forbidden action.
 * @property {number} status - The HTTP status code for forbidden actions (403).
 */
export class ForbiddenException extends ExceptionBase {
  readonly code = FORBIDDEN;
  constructor(message: string, cause?: Error) {
    super({
      status: HttpStatus.FORBIDDEN,
      message,
      cause
    });
  }
}

/**
 * Used to indicate that entity is not found
 *
 * @class NotFoundException
 * @extends {ExceptionBase}
 */
export class NotFoundException extends ExceptionBase {
  readonly code = NOT_FOUND;
  constructor(message: string = 'Not Found', cause?: Error) {
    super({
      status: HttpStatus.NOT_FOUND,
      message,
      cause
    });
  }
}

/**
 * Used to indicate an internal server error that does not fall under all other errors
 *
 * @class InternalServerException
 * @extends {ExceptionBase}
 */
export class InternalServerException extends ExceptionBase {
  readonly code = INTERNAL_SERVER_ERROR;
  constructor(message: string = 'Internal Server Error', cause?: Error) {
    super({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      cause
    });
  }
}

/**
 * Used to indicate an internal server error that does not fall under all other errors
 *
 * @class InternalServerException
 * @extends {ExceptionBase}
 */
export class InvalidOrderByFieldException extends ExceptionBase {
  readonly code = INVALID_ORDER_BY_FIELD;
  constructor(message: string = 'Invalid order by field', cause?: Error) {
    super({
      status: HttpStatus.BAD_REQUEST,
      message,
      cause
    });
  }
}
