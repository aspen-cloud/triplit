/**
 * Tests for Type Mapping utilities
 */

import { describe, it, expect } from 'vitest';
import {
  triplitTypeToPostgres,
  postgresTypeToTriplit,
  generateCreateTableSQL,
  generateAddColumnSQL,
  sanitizeSQLIdentifier,
  sanitizeSQLValue,
  type PostgresColumn,
} from './type-mapping.js';

describe('Type Mapping', () => {
  describe('triplitTypeToPostgres', () => {
    it('should map string type to TEXT', () => {
      const result = triplitTypeToPostgres(
        { type: 'string', config: {} },
        'name'
      );

      expect(result).toEqual({
        name: 'name',
        type: 'TEXT',
        nullable: false,
      });
    });

    it('should map number type to NUMERIC', () => {
      const result = triplitTypeToPostgres(
        { type: 'number', config: {} },
        'age'
      );

      expect(result).toEqual({
        name: 'age',
        type: 'NUMERIC',
        nullable: false,
      });
    });

    it('should map boolean type to BOOLEAN', () => {
      const result = triplitTypeToPostgres(
        { type: 'boolean', config: {} },
        'isActive'
      );

      expect(result).toEqual({
        name: 'isActive',
        type: 'BOOLEAN',
        nullable: false,
      });
    });

    it('should map date type to TIMESTAMP WITH TIME ZONE', () => {
      const result = triplitTypeToPostgres(
        { type: 'date', config: {} },
        'createdAt'
      );

      expect(result).toEqual({
        name: 'createdAt',
        type: 'TIMESTAMP WITH TIME ZONE',
        nullable: false,
      });
    });

    it('should map set type to JSONB', () => {
      const result = triplitTypeToPostgres(
        { type: 'set', items: { type: 'string' }, config: {} },
        'tags'
      );

      expect(result).toEqual({
        name: 'tags',
        type: 'JSONB',
        nullable: false,
      });
    });

    it('should map record type to JSONB', () => {
      const result = triplitTypeToPostgres(
        { type: 'record', properties: {}, config: {} },
        'metadata'
      );

      expect(result).toEqual({
        name: 'metadata',
        type: 'JSONB',
        nullable: false,
      });
    });

    it('should map json type to JSONB', () => {
      const result = triplitTypeToPostgres(
        { type: 'json', config: {} },
        'data'
      );

      expect(result).toEqual({
        name: 'data',
        type: 'JSONB',
        nullable: false,
      });
    });

    it('should handle nullable fields', () => {
      const result = triplitTypeToPostgres(
        { type: 'string', config: { nullable: true } },
        'bio'
      );

      expect(result.nullable).toBe(true);
    });

    it('should handle default values', () => {
      const result = triplitTypeToPostgres(
        { type: 'boolean', config: { default: true } },
        'isActive'
      );

      expect(result.defaultValue).toBe('TRUE');
    });

    it('should handle id field as primary key', () => {
      const result = triplitTypeToPostgres(
        { type: 'string', config: {} },
        'id'
      );

      expect(result).toEqual({
        name: 'id',
        type: 'TEXT',
        nullable: false,
        primaryKey: true,
      });
    });

    it('should handle string enums', () => {
      const result = triplitTypeToPostgres(
        {
          type: 'string',
          config: { enum: ['active', 'inactive', 'pending'] },
        },
        'status'
      );

      expect(result.type).toBe('TEXT');
    });
  });

  describe('postgresTypeToTriplit', () => {
    it('should map TEXT to string type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'name',
        data_type: 'TEXT',
        is_nullable: 'NO',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'string',
        config: { nullable: false },
      });
    });

    it('should map VARCHAR to string type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'email',
        data_type: 'CHARACTER VARYING',
        is_nullable: 'NO',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'string',
        config: { nullable: false },
      });
    });

    it('should map INTEGER to number type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'age',
        data_type: 'INTEGER',
        is_nullable: 'NO',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'number',
        config: { nullable: false },
      });
    });

    it('should map NUMERIC to number type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'price',
        data_type: 'NUMERIC',
        is_nullable: 'YES',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'number',
        config: { nullable: true },
      });
    });

    it('should map BOOLEAN to boolean type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'is_active',
        data_type: 'BOOLEAN',
        is_nullable: 'NO',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'boolean',
        config: { nullable: false },
      });
    });

    it('should map TIMESTAMP WITH TIME ZONE to date type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'created_at',
        data_type: 'TIMESTAMP WITH TIME ZONE',
        is_nullable: 'NO',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'date',
        config: { nullable: false },
      });
    });

    it('should map JSONB to json type', () => {
      const result = postgresTypeToTriplit({
        column_name: 'metadata',
        data_type: 'JSONB',
        is_nullable: 'YES',
        column_default: null,
      });

      expect(result).toEqual({
        type: 'json',
        config: { nullable: true },
      });
    });

    it('should handle nullable fields', () => {
      const result = postgresTypeToTriplit({
        column_name: 'bio',
        data_type: 'TEXT',
        is_nullable: 'YES',
        column_default: null,
      });

      expect(result.config.nullable).toBe(true);
    });
  });

  describe('generateCreateTableSQL', () => {
    it('should generate basic CREATE TABLE statement', () => {
      const columns: PostgresColumn[] = [
        { name: 'id', type: 'TEXT', nullable: false, primaryKey: true },
        { name: 'name', type: 'TEXT', nullable: false },
        { name: 'email', type: 'TEXT', nullable: false },
      ];

      const sql = generateCreateTableSQL('users', columns);

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "users"');
      expect(sql).toContain('"id" TEXT PRIMARY KEY');
      expect(sql).toContain('"name" TEXT NOT NULL');
      expect(sql).toContain('"email" TEXT NOT NULL');
    });

    it('should handle nullable columns', () => {
      const columns: PostgresColumn[] = [
        { name: 'id', type: 'TEXT', nullable: false, primaryKey: true },
        { name: 'bio', type: 'TEXT', nullable: true },
      ];

      const sql = generateCreateTableSQL('users', columns);

      expect(sql).toContain('"bio" TEXT');
      expect(sql).not.toContain('"bio" TEXT NOT NULL');
    });

    it('should handle default values', () => {
      const columns: PostgresColumn[] = [
        { name: 'id', type: 'TEXT', nullable: false, primaryKey: true },
        {
          name: 'is_active',
          type: 'BOOLEAN',
          nullable: false,
          defaultValue: 'TRUE',
        },
      ];

      const sql = generateCreateTableSQL('users', columns);

      expect(sql).toContain('"is_active" BOOLEAN NOT NULL DEFAULT TRUE');
    });

    it('should handle unique constraints', () => {
      const columns: PostgresColumn[] = [
        { name: 'id', type: 'TEXT', nullable: false, primaryKey: true },
        { name: 'email', type: 'TEXT', nullable: false, unique: true },
      ];

      const sql = generateCreateTableSQL('users', columns);

      expect(sql).toContain('"email" TEXT NOT NULL UNIQUE');
    });

    it('should handle multiple column types', () => {
      const columns: PostgresColumn[] = [
        { name: 'id', type: 'TEXT', nullable: false, primaryKey: true },
        { name: 'name', type: 'TEXT', nullable: false },
        { name: 'age', type: 'INTEGER', nullable: true },
        { name: 'is_active', type: 'BOOLEAN', nullable: false },
        {
          name: 'created_at',
          type: 'TIMESTAMP WITH TIME ZONE',
          nullable: false,
        },
        { name: 'metadata', type: 'JSONB', nullable: true },
      ];

      const sql = generateCreateTableSQL('users', columns);

      expect(sql).toContain('"id" TEXT PRIMARY KEY');
      expect(sql).toContain('"name" TEXT NOT NULL');
      expect(sql).toContain('"age" INTEGER');
      expect(sql).toContain('"is_active" BOOLEAN NOT NULL');
      expect(sql).toContain('"created_at" TIMESTAMP WITH TIME ZONE NOT NULL');
      expect(sql).toContain('"metadata" JSONB');
    });
  });

  describe('generateAddColumnSQL', () => {
    it('should generate ALTER TABLE ADD COLUMN statement', () => {
      const column: PostgresColumn = {
        name: 'bio',
        type: 'TEXT',
        nullable: true,
      };

      const sql = generateAddColumnSQL('users', column);

      expect(sql).toBe(
        'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT;'
      );
    });

    it('should handle NOT NULL columns', () => {
      const column: PostgresColumn = {
        name: 'email',
        type: 'TEXT',
        nullable: false,
      };

      const sql = generateAddColumnSQL('users', column);

      expect(sql).toContain('ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL');
    });

    it('should handle default values', () => {
      const column: PostgresColumn = {
        name: 'is_active',
        type: 'BOOLEAN',
        nullable: false,
        defaultValue: 'TRUE',
      };

      const sql = generateAddColumnSQL('users', column);

      expect(sql).toContain(
        'ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE'
      );
    });
  });

  describe('sanitizeSQLIdentifier', () => {
    it('should wrap identifier in double quotes', () => {
      const result = sanitizeSQLIdentifier('users');
      expect(result).toBe('"users"');
    });

    it('should escape double quotes in identifier', () => {
      const result = sanitizeSQLIdentifier('my"table');
      expect(result).toBe('"my""table"');
    });

    it('should handle identifiers with special characters', () => {
      const result = sanitizeSQLIdentifier('user-posts');
      expect(result).toBe('"user-posts"');
    });
  });

  describe('sanitizeSQLValue', () => {
    it('should handle null values', () => {
      expect(sanitizeSQLValue(null)).toBe('NULL');
      expect(sanitizeSQLValue(undefined)).toBe('NULL');
    });

    it('should handle string values', () => {
      expect(sanitizeSQLValue('hello')).toBe("'hello'");
    });

    it('should escape single quotes in strings', () => {
      expect(sanitizeSQLValue("it's a test")).toBe("'it''s a test'");
    });

    it('should handle number values', () => {
      expect(sanitizeSQLValue(42)).toBe('42');
      expect(sanitizeSQLValue(3.14)).toBe('3.14');
      expect(sanitizeSQLValue(0)).toBe('0');
    });

    it('should handle boolean values', () => {
      expect(sanitizeSQLValue(true)).toBe('TRUE');
      expect(sanitizeSQLValue(false)).toBe('FALSE');
    });

    it('should handle Date values', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      expect(sanitizeSQLValue(date)).toBe("'2024-01-15T10:30:00.000Z'");
    });

    it('should handle Set values as JSONB', () => {
      const set = new Set(['a', 'b', 'c']);
      const result = sanitizeSQLValue(set);

      expect(result).toContain('::jsonb');
      expect(result).toContain('"a":true');
      expect(result).toContain('"b":true');
      expect(result).toContain('"c":true');
    });

    it('should handle object values as JSONB', () => {
      const obj = { foo: 'bar', baz: 42 };
      expect(sanitizeSQLValue(obj)).toBe("'{\"foo\":\"bar\",\"baz\":42}'::jsonb");
    });

    it('should handle array values as JSONB', () => {
      const arr = [1, 2, 3];
      expect(sanitizeSQLValue(arr)).toBe("'[1,2,3]'::jsonb");
    });
  });

  describe('Round-trip conversions', () => {
    it('should convert string type back and forth', () => {
      const triplitType = { type: 'string' as const, config: {} };
      const postgresColumn = triplitTypeToPostgres(triplitType, 'test');
      const backToTriplit = postgresTypeToTriplit({
        column_name: 'test',
        data_type: postgresColumn.type,
        is_nullable: postgresColumn.nullable ? 'YES' : 'NO',
        column_default: null,
      });

      expect(backToTriplit.type).toBe('string');
    });

    it('should convert number type back and forth', () => {
      const triplitType = { type: 'number' as const, config: {} };
      const postgresColumn = triplitTypeToPostgres(triplitType, 'test');
      const backToTriplit = postgresTypeToTriplit({
        column_name: 'test',
        data_type: postgresColumn.type,
        is_nullable: postgresColumn.nullable ? 'YES' : 'NO',
        column_default: null,
      });

      expect(backToTriplit.type).toBe('number');
    });

    it('should convert boolean type back and forth', () => {
      const triplitType = { type: 'boolean' as const, config: {} };
      const postgresColumn = triplitTypeToPostgres(triplitType, 'test');
      const backToTriplit = postgresTypeToTriplit({
        column_name: 'test',
        data_type: postgresColumn.type,
        is_nullable: postgresColumn.nullable ? 'YES' : 'NO',
        column_default: null,
      });

      expect(backToTriplit.type).toBe('boolean');
    });

    it('should convert date type back and forth', () => {
      const triplitType = { type: 'date' as const, config: {} };
      const postgresColumn = triplitTypeToPostgres(triplitType, 'test');
      const backToTriplit = postgresTypeToTriplit({
        column_name: 'test',
        data_type: postgresColumn.type,
        is_nullable: postgresColumn.nullable ? 'YES' : 'NO',
        column_default: null,
      });

      expect(backToTriplit.type).toBe('date');
    });

    it('should preserve nullability', () => {
      const triplitType = { type: 'string' as const, config: { nullable: true } };
      const postgresColumn = triplitTypeToPostgres(triplitType, 'test');
      const backToTriplit = postgresTypeToTriplit({
        column_name: 'test',
        data_type: postgresColumn.type,
        is_nullable: postgresColumn.nullable ? 'YES' : 'NO',
        column_default: null,
      });

      expect(backToTriplit.config.nullable).toBe(true);
    });
  });
});
