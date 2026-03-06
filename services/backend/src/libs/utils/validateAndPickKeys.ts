import validateConfig from '@libs/utils/validate-config';

/**
 * Validates environment variables against a class-validator/class-transformer DTO,
 * then picks only the declared keys (stripping extraneous process.env properties).
 * Used by all config factories (app, database, keycloak) to produce clean, typed config objects.
 *
 * @example
 * const config = validateAndPickKeys(process.env, AppValidator);
 * // Returns { NODE_ENV: 'development', API_PORT: 3050, ... } with only declared keys
 */
export function validateAndPickKeys<T extends object>(
  env: NodeJS.ProcessEnv,
  validatorClass: new () => T
): Pick<T, keyof T> {
  const validatedConfig = validateConfig(env, validatorClass);
  const keys = Object.keys(validatedConfig) as (keyof T)[];
  const result = {} as Pick<T, keyof T>;
  keys.forEach(key => {
    if (key in validatedConfig) {
      result[key] = validatedConfig[key];
    }
  });
  return result;
}
