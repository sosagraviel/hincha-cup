/**
 * Database connection configuration loaded from environment variables (DB_TYPE, DB_HOST, DB_PORT, etc.).
 * Validates and transforms boolean flags (DB_SYNCHRONIZE, DB_LOGGING, DB_MIGRATIONS_RUN) from string env vars.
 * Registered as the 'database' config namespace via NestJS ConfigModule.
 *
 * @example
 * const host = configService.get('database.DB_HOST'); // 'localhost'
 */
import { registerAs } from '@nestjs/config';
import { IsBoolean, IsEnum, IsNumber, IsString } from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { validateAndPickKeys } from '@src/libs/utils/validateAndPickKeys';

enum DatabaseType {
  mysql = 'mysql',
  postgres = 'postgres',
  sqlite = 'sqlite',
  mssql = 'mssql'
}

class DatabaseConfigValidator {
  @IsEnum(DatabaseType)
  @Expose()
  DB_TYPE: DatabaseType;

  @IsBoolean()
  @Transform(({ obj, key }) => obj[key]?.toLowerCase() === 'true')
  @Expose()
  DB_SYNCHRONIZE: boolean;

  @IsBoolean()
  @Transform(({ obj, key }) => obj[key]?.toLowerCase() === 'true')
  @Expose()
  DB_LOGGING: boolean;

  @IsBoolean()
  @Transform(({ obj, key }) => obj[key]?.toLowerCase() === 'true')
  @Expose()
  DB_MIGRATIONS_RUN: boolean;

  @IsString()
  @Expose()
  DB_HOST: string;

  @IsNumber()
  @Expose()
  DB_PORT: number;

  @IsString()
  @Expose()
  DB_USER: string;

  @IsString()
  @Expose()
  DB_PASSWORD: string;

  @IsString()
  @Expose()
  DB_NAME: string;
}

const dbConfig = () => {
  return validateAndPickKeys(process.env, DatabaseConfigValidator);
};
type DatabaseConfig = ReturnType<typeof dbConfig>;

export { dbConfig, type DatabaseConfig };

export default registerAs<DatabaseConfig>('database', dbConfig);
