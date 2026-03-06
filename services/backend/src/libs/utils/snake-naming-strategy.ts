import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

/**
 * Converts a camelCase or PascalCase string to snake_case.
 */
function snakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, match => `_${match.toLowerCase()}`)
    .replace(/^_/, '');
}

/**
 * TypeORM naming strategy that converts camelCase entity properties to snake_case column names.
 * Applied globally in database.setup.ts.
 *
 * @example
 * // Entity property `profilePictureUrl` -> DB column `profile_picture_url`
 * // Entity class `OrganizationMember` -> DB table `organization_member` (when no custom name)
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName: string): string {
    return customName || snakeCase(className);
  }

  columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[]
  ): string {
    return (
      snakeCase(embeddedPrefixes.join('_')) +
      (customName || snakeCase(propertyName))
    );
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string
  ): string {
    return snakeCase(
      `${firstTableName}_${firstPropertyName.replace(/\./gi, '_')}_${secondTableName}`
    );
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string
  ): string {
    return snakeCase(`${tableName}_${columnName || propertyName}`);
  }

  classTableInheritanceParentColumnName(
    parentTableName: string,
    parentTableIdPropertyName: string
  ): string {
    return snakeCase(`${parentTableName}_${parentTableIdPropertyName}`);
  }
}
