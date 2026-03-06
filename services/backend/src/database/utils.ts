import { DataSource, DataSourceOptions } from 'typeorm';
import { getDatabaseConfig } from './database.setup';

/**
 * Creates a standalone TypeORM DataSource, runs all pending migrations, then destroys the connection.
 * Called during application bootstrap (main.ts) before the NestJS app starts listening.
 *
 * @example
 * await runMigrations(); // Runs all *.ts migration files found by getDatabaseConfig()
 */
export const runMigrations = async () => {
  const dataSource = new DataSource(getDatabaseConfig() as DataSourceOptions);
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
};
