/**
 * Application-level configuration loaded from environment variables (NODE_ENV, API_NAME, API_PREFIX, API_PORT, CLIENT_URL).
 * Validates and exposes typed config via NestJS ConfigModule's `registerAs('app', ...)`.
 *
 * @example
 * // Access in services via TypedConfigService:
 * const port = configService.get('app.API_PORT'); // number
 */
import { registerAs } from '@nestjs/config';
import { IsEnum, IsNumber, IsString } from 'class-validator';
import { validateAndPickKeys } from '@src/libs/utils/validateAndPickKeys';
import { Expose, Transform } from 'class-transformer';

export enum Environment {
  development = 'development',
  production = 'production',
  testing = 'testing',
  staging = 'staging'
}

class AppValidator {
  @Expose()
  @IsEnum(Environment)
  @Transform(({ value }) => {
    return value.toLowerCase();
  })
  NODE_ENV: Environment;

  @IsString()
  @Expose()
  API_NAME: string;

  @IsString()
  @Expose()
  API_PREFIX: string;

  @IsNumber()
  @Transform(({ value }) => +value)
  @Expose()
  API_PORT: number;

  @IsString()
  @Expose()
  CLIENT_URL: string;
}

const appConfig = () => validateAndPickKeys(process.env, AppValidator);

type AppConfig = ReturnType<typeof appConfig>;

function isDevelopment(): boolean {
  return appConfig().NODE_ENV === Environment.development;
}

function isProduction(): boolean {
  return appConfig().NODE_ENV === Environment.production;
}

function isTesting(): boolean {
  return appConfig().NODE_ENV === Environment.testing;
}

export { appConfig, type AppConfig, isDevelopment, isProduction, isTesting };

export default registerAs<AppConfig>('app', appConfig);
