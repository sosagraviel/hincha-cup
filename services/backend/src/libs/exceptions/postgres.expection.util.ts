import { QueryFailedError } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  ArgumentNotProvidedException
} from '@libs/exceptions';

//https://gist.github.com/robertmarriott/16c8cdadfba75356ba3d5428d0508e85
// Adapted from https://www.postgresql.org/docs/12/errcodes-appendix.html
enum PgIntegrityConstraintViolation {
  IntegrityConstraintViolation = '23000',
  RestrictViolation = '23001',
  NotNullViolation = '23502',
  ForeignKeyViolation = '23503',
  UniqueViolation = '23505',
  CheckViolation = '23514',
  ExclusionViolation = '23P01'
}

/**
 * Translates PostgreSQL integrity constraint violations (unique, not-null, foreign key)
 * into domain-specific exceptions. Pass any caught error and it will re-throw as
 * ConflictException, ArgumentNotProvidedException, or NotFoundException as appropriate.
 * Non-QueryFailedError errors are silently ignored.
 *
 * @example
 * try {
 *   await repository.save(entity);
 * } catch (error) {
 *   handlePostgresException(error);
 *   throw error;
 * }
 */
export const handlePostgresException = (error: unknown) => {
  if (error instanceof QueryFailedError) {
    const pgError = error.driverError; // Access the underlying PostgreSQL error
    const errorCode = pgError.code; // Get the SQLSTATE code

    switch (errorCode) {
      case PgIntegrityConstraintViolation.UniqueViolation:
        throw new ConflictException(
          'Duplicate entry found',
          new Error(pgError.detail)
        );
      case PgIntegrityConstraintViolation.NotNullViolation:
        throw new ArgumentNotProvidedException(
          'Missing required data',
          new Error(pgError.detail)
        );
      case PgIntegrityConstraintViolation.ForeignKeyViolation:
        throw new NotFoundException(
          'Related record not found',
          new Error(pgError.detail)
        );
    }
  }
};
