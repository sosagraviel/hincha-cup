import * as path from 'path';

import { dbConfig } from './database.config';
import { SnakeNamingStrategy } from '@src/libs/utils/snake-naming-strategy';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Builds the TypeORM module configuration from validated database environment variables.
 * Auto-discovers entity models and migrations via glob patterns, applies SnakeNamingStrategy,
 * and configures retry/logging behavior.
 *
 * @example
 * // Used in AppModule:
 * TypeOrmModule.forRoot(getDatabaseConfig())
 */
export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  const config = dbConfig();

  // __dirname is unavailable in ESM contexts (e.g. jest --experimental-vm-modules).
  // autoLoadEntities: true makes the entities array redundant; migration globs are
  // only needed when migrationsRun is enabled (i.e. production / docker).
  const hasDir = typeof __dirname !== 'undefined';

  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    synchronize: config.DB_SYNCHRONIZE,
    logging: config.DB_LOGGING,
    migrationsRun: config.DB_MIGRATIONS_RUN,
    retryAttempts: 10000,
    type: config.DB_TYPE,
    dropSchema: false,
    entities: hasDir
      ? [path.resolve(__dirname, '../modules/**/database/**/*.model.{ts,js}')]
      : [],
    migrations: hasDir
      ? [
          path.resolve(__dirname, './migrations/**/*.{ts,js}'),
          path.resolve(
            __dirname,
            '../modules/**/database/migrations/**/*.{ts,js}'
          )
        ]
      : [],
    namingStrategy: new SnakeNamingStrategy(),
    autoLoadEntities: true
  };
};
