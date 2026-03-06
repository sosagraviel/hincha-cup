import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';

/**
 * Transforms a raw config record into a validated class instance using class-transformer
 * and class-validator. Throws on validation failure with a descriptive error message.
 *
 * @example
 * const validated = validateConfig(process.env, DatabaseConfigValidator);
 * // Throws Error if required DB_HOST, DB_PORT, etc. are missing or invalid
 */
function validateConfig<T extends object>(
  config: Record<string, unknown>,
  envVariablesClass: ClassConstructor<T>
) {
  const validatedConfig: T = plainToClass(envVariablesClass, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}

export default validateConfig;
