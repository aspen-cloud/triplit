/**
 * Type mapping utilities for converting between Triplit schema types and Postgres SQL types
 */

import type { DataType } from '../schema/types/index.js';

export type PostgresColumnType =
  | 'TEXT'
  | 'VARCHAR'
  | 'INTEGER'
  | 'BIGINT'
  | 'NUMERIC'
  | 'FLOAT8'
  | 'BOOLEAN'
  | 'TIMESTAMP WITH TIME ZONE'
  | 'JSONB'
  | 'UUID';

export interface PostgresColumn {
  name: string;
  type: PostgresColumnType;
  nullable: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
  unique?: boolean;
}

/**
 * Converts a Triplit data type to a Postgres column type
 */
export function triplitTypeToPostgres(
  dataType: DataType,
  fieldName: string
): PostgresColumn {
  const config = 'config' in dataType ? dataType.config : {};
  const nullable = config.nullable ?? false;
  const defaultValue = config.default;

  // Handle primary key (id field)
  if (fieldName === 'id') {
    return {
      name: fieldName,
      type: 'TEXT',
      nullable: false,
      primaryKey: true,
    };
  }

  // Map type to Postgres type
  let postgresType: PostgresColumnType;

  switch (dataType.type) {
    case 'string':
      // Check if it's an enum
      if ('config' in dataType && dataType.config.enum) {
        // For enums, we could use Postgres ENUM type, but TEXT with CHECK constraint is more flexible
        postgresType = 'TEXT';
      } else {
        postgresType = 'TEXT';
      }
      break;

    case 'number':
      // Default to NUMERIC for precision, could be FLOAT8 or INTEGER based on usage
      postgresType = 'NUMERIC';
      break;

    case 'boolean':
      postgresType = 'BOOLEAN';
      break;

    case 'date':
      postgresType = 'TIMESTAMP WITH TIME ZONE';
      break;

    case 'set':
    case 'record':
    case 'json':
      postgresType = 'JSONB';
      break;

    default:
      postgresType = 'JSONB'; // Fallback for unknown types
  }

  return {
    name: fieldName,
    type: postgresType,
    nullable,
    defaultValue: defaultValue !== undefined ? formatDefaultValue(defaultValue, postgresType) : undefined,
  };
}

/**
 * Formats a default value for SQL
 */
function formatDefaultValue(value: any, type: PostgresColumnType): string {
  if (value === null) return 'NULL';

  switch (type) {
    case 'TEXT':
    case 'VARCHAR':
      return `'${String(value).replace(/'/g, "''")}'`;

    case 'INTEGER':
    case 'BIGINT':
    case 'NUMERIC':
    case 'FLOAT8':
      return String(value);

    case 'BOOLEAN':
      return value ? 'TRUE' : 'FALSE';

    case 'TIMESTAMP WITH TIME ZONE':
      if (value instanceof Date) {
        return `'${value.toISOString()}'`;
      }
      return `'${value}'`;

    case 'JSONB':
      return `'${JSON.stringify(value)}'::jsonb`;

    default:
      return `'${String(value)}'`;
  }
}

/**
 * Converts a Postgres column type back to a Triplit data type
 */
export function postgresTypeToTriplit(
  column: {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }
): DataType {
  const nullable = column.is_nullable === 'YES';

  switch (column.data_type.toUpperCase()) {
    case 'TEXT':
    case 'VARCHAR':
    case 'CHARACTER VARYING':
    case 'CHAR':
    case 'CHARACTER':
      return {
        type: 'string',
        config: { nullable },
      };

    case 'INTEGER':
    case 'BIGINT':
    case 'SMALLINT':
    case 'NUMERIC':
    case 'DECIMAL':
    case 'REAL':
    case 'DOUBLE PRECISION':
    case 'FLOAT':
    case 'FLOAT8':
      return {
        type: 'number',
        config: { nullable },
      };

    case 'BOOLEAN':
    case 'BOOL':
      return {
        type: 'boolean',
        config: { nullable },
      };

    case 'TIMESTAMP':
    case 'TIMESTAMP WITH TIME ZONE':
    case 'TIMESTAMPTZ':
    case 'TIMESTAMP WITHOUT TIME ZONE':
    case 'DATE':
      return {
        type: 'date',
        config: { nullable },
      };

    case 'JSONB':
    case 'JSON':
      return {
        type: 'json',
        config: { nullable },
      };

    default:
      // Unknown types default to JSON
      return {
        type: 'json',
        config: { nullable },
      };
  }
}

/**
 * Generates a CREATE TABLE statement for a collection
 */
export function generateCreateTableSQL(
  tableName: string,
  columns: PostgresColumn[]
): string {
  const columnDefs = columns.map((col) => {
    let def = `"${col.name}" ${col.type}`;

    if (col.primaryKey) {
      def += ' PRIMARY KEY';
    }

    if (!col.nullable && !col.primaryKey) {
      def += ' NOT NULL';
    }

    if (col.defaultValue !== undefined) {
      def += ` DEFAULT ${col.defaultValue}`;
    }

    if (col.unique && !col.primaryKey) {
      def += ' UNIQUE';
    }

    return def;
  });

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefs.join(',\n  ')}\n);`;
}

/**
 * Generates an ALTER TABLE statement to add a column
 */
export function generateAddColumnSQL(
  tableName: string,
  column: PostgresColumn
): string {
  let def = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${column.name}" ${column.type}`;

  if (!column.nullable) {
    def += ' NOT NULL';
  }

  if (column.defaultValue !== undefined) {
    def += ` DEFAULT ${column.defaultValue}`;
  }

  return `${def};`;
}

/**
 * Sanitizes a table or column name for SQL
 */
export function sanitizeSQLIdentifier(name: string): string {
  // Remove potentially dangerous characters and wrap in quotes
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Sanitizes a SQL value (for use in WHERE clauses, etc.)
 */
export function sanitizeSQLValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (value instanceof Set) {
    // Convert Set to JSONB object
    const obj: Record<string, boolean> = {};
    value.forEach((item) => {
      obj[String(item)] = true;
    });
    return `'${JSON.stringify(obj)}'::jsonb`;
  }

  // For objects and arrays, convert to JSON
  return `'${JSON.stringify(value)}'::jsonb`;
}
