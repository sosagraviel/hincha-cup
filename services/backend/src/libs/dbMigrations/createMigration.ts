import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffolds a new TypeORM migration or seed directory with up.sql, down.sql,
 * and a TypeScript migration class that extends TypeOrmMigrationFromFile.
 * Can be run directly via CLI or imported programmatically.
 *
 * @example
 * // CLI usage:
 * // npx ts-node src/libs/dbMigrations/createMigration.ts migration user CreateUsersTable
 * // Creates: src/modules/user/database/migrations/<timestamp>-CreateUsersTable/
 */
const createMigration = (
  type: string,
  module: string,
  migrationName: string
) => {
  const migrationType = `${type}s`;
  const currentTime = Date.now();
  const directory = path.resolve(
    __dirname,
    '../../',
    'modules',
    module,
    'database',
    migrationType,
    `${currentTime}-${migrationName}`
  );

  const migrationFileContent = `import * as path from "path";
import { TypeOrmMigrationFromFile } from "@libs/dbMigrations/TypeOrmMigrationFromFile";

export class ${migrationName}${currentTime} extends TypeOrmMigrationFromFile {
constructor() {
  super(path.resolve(__dirname, 'up.sql'), path.resolve(__dirname, 'down.sql'))
}
}`;

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const migrationFilePath = path.resolve(
    directory,
    `${currentTime}-${migrationName}.ts`
  );
  const migrationUpFilePath = path.resolve(directory, `up.sql`);
  const migrationDownFilePath = path.resolve(directory, `down.sql`);

  if (!fs.existsSync(migrationFilePath)) {
    fs.writeFileSync(migrationFilePath, migrationFileContent);
  }

  if (!fs.existsSync(migrationUpFilePath)) {
    fs.writeFileSync(migrationUpFilePath, '');
  }

  if (!fs.existsSync(migrationDownFilePath)) {
    fs.writeFileSync(migrationDownFilePath, '');
  }
};

if (require.main === module) {
  const args = process.argv.slice(2).filter(arg => arg !== '--');

  if (!args[0] || (args[0] !== 'migration' && args[0] !== 'seed') || !args[1]) {
    console.error(`Invalid params, migration or seed should include 'type' and 'name'.
  Ex: npx ts-node @libs/dbMigrations/createMigration.ts <type> <module> <name>
  Args:
    type: possible values 'migrations' or 'seed'
    module: the application module where the migrations will be created in
    name: the name of your migration. Ex: 'CreateUserTable'
  `);
    process.exit(1);
  }
  createMigration(args[0], args[1], args[2]);
  process.exit(0);
}
