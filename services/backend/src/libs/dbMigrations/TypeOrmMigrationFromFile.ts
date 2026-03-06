import * as fs from 'fs';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base class for TypeORM migrations that reads SQL from external up.sql/down.sql files.
 * Handles splitting multi-statement SQL (including PostgreSQL $$ dollar-quoted blocks)
 * and executes statements sequentially.
 *
 * @example
 * export class CreateUsersTable1234 extends TypeOrmMigrationFromFile {
 *   constructor() {
 *     super(path.resolve(__dirname, 'up.sql'), path.resolve(__dirname, 'down.sql'));
 *   }
 * }
 */
export class TypeOrmMigrationFromFile implements MigrationInterface {
  private readonly pathToFileUp: string;
  private readonly pathToFileDown: string;
  constructor(pathToFileUp: string, pathToFileDown: string) {
    this.pathToFileUp = pathToFileUp;
    this.pathToFileDown = pathToFileDown;
  }

  async up(queryRunner: QueryRunner): Promise<any> {
    const query = await new Promise<string>((res, rej) =>
      fs.readFile(this.pathToFileUp, (err, data) => {
        if (err) rej(err);
        else res(data.toString());
      })
    );

    const queries: string[] = [];

    // Split queries considering PostgreSQL procedures with $$ delimiters
    const splitQueries = this.splitSqlQueries(query);
    splitQueries.forEach(q => {
      const cleanQuery = q.replace(/\r?\n|\r/g, ' ').trim();
      if (cleanQuery !== '') queries.push(cleanQuery);
    });

    // Execute queries sequentially to avoid issues with dependencies
    for (const q of queries) {
      await queryRunner.query(q);
    }
  }

  private splitSqlQueries(sqlContent: string): string[] {
    const queries: string[] = [];
    let currentQuery = '';
    let inDollarQuote = false;
    let dollarTag = '';
    let i = 0;

    while (i < sqlContent.length) {
      const char = sqlContent[i];

      // Check for dollar-quoted strings ($$...$$)
      if (char === '$' && !inDollarQuote) {
        // Look for opening dollar quote
        const dollarMatch = sqlContent.substring(i).match(/^\$([^$]*)\$/);
        if (dollarMatch) {
          dollarTag = dollarMatch[1];
          inDollarQuote = true;
          currentQuery += dollarMatch[0];
          i += dollarMatch[0].length;
          continue;
        }
      } else if (char === '$' && inDollarQuote) {
        // Look for closing dollar quote
        const closingTag = `$${dollarTag}$`;
        if (sqlContent.substring(i, i + closingTag.length) === closingTag) {
          inDollarQuote = false;
          currentQuery += closingTag;
          i += closingTag.length;
          continue;
        }
      }

      // If we're not in a dollar-quoted string and we find a semicolon
      if (char === ';' && !inDollarQuote) {
        currentQuery += char;
        const trimmedQuery = currentQuery.trim();
        if (trimmedQuery) {
          queries.push(trimmedQuery);
        }
        currentQuery = '';
      } else {
        currentQuery += char;
      }

      i++;
    }

    // Add any remaining query
    const trimmedQuery = currentQuery.trim();
    if (trimmedQuery) {
      queries.push(trimmedQuery);
    }

    return queries;
  }

  async down(queryRunner: QueryRunner): Promise<any> {
    const query = await new Promise<string>((res, rej) =>
      fs.readFile(this.pathToFileDown, (err, data) => {
        if (err) rej(err);
        else res(data.toString());
      })
    );
    await queryRunner.query(query.replace(/\r?\n|\r/g, ' '));
  }
}
