/**
 * Supabase SQL Adapter - Uses actual Postgres tables instead of KV store
 *
 * This adapter:
 * - Translates Triplit queries to SQL queries
 * - Maps collections to Postgres tables
 * - Supports schema introspection from existing Postgres databases
 * - Handles schema migrations
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { DBSchema } from '../schema/types/index.js';
import type { PreparedQuery } from '../query/types/index.js';
import type { Models } from '../schema/types/models.js';
import { SQLQueryPlanner } from './query-planner.js';
import {
  triplitTypeToPostgres,
  postgresTypeToTriplit,
  generateCreateTableSQL,
  type PostgresColumn,
} from './type-mapping.js';

export interface SupabaseSQLAdapterOptions {
  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Auto-run migrations on initialization
   */
  autoMigrate?: boolean;

  /**
   * Schema to use (defaults to 'public')
   */
  schema?: string;
}

/**
 * Supabase SQL Adapter
 *
 * Uses Postgres tables directly instead of a KV store abstraction.
 */
export class SupabaseSQLAdapter<M extends Models = Models> {
  private supabase: SupabaseClient;
  private queryPlanner: SQLQueryPlanner;
  private options: Required<SupabaseSQLAdapterOptions>;
  private schema?: DBSchema<M>;

  constructor(
    supabase: SupabaseClient,
    schema?: DBSchema<M>,
    options: SupabaseSQLAdapterOptions = {}
  ) {
    this.supabase = supabase;
    this.schema = schema;
    this.options = {
      debug: options.debug ?? false,
      autoMigrate: options.autoMigrate ?? false,
      schema: options.schema ?? 'public',
    };

    this.queryPlanner = new SQLQueryPlanner({ debug: this.options.debug });

    if (this.options.autoMigrate && this.schema) {
      this.runMigrations().catch((err) => {
        console.error('Failed to run migrations:', err);
      });
    }
  }

  /**
   * Execute a Triplit query and return results
   */
  async fetch(query: PreparedQuery): Promise<any[]> {
    const { sql, params } = this.queryPlanner.planSelect(query);

    if (this.options.debug) {
      console.log('[SupabaseSQLAdapter] Executing query:', sql, params);
    }

    const { data, error } = await this.executeRPC(sql, params);

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Get a single entity by ID
   */
  async getEntity(
    collection: string,
    id: string
  ): Promise<Record<string, any> | undefined> {
    const { data, error } = await this.supabase
      .from(collection)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return undefined;
      }
      throw new Error(`Failed to get entity: ${error.message}`);
    }

    return data ?? undefined;
  }

  /**
   * Get all entities in a collection
   */
  async *getEntitiesInCollection(
    collection: string
  ): AsyncIterable<Record<string, any>> {
    // Supabase doesn't support streaming, so we fetch in batches
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await this.supabase
        .from(collection)
        .select('*')
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`Failed to get entities: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const entity of data) {
        yield entity;
      }

      if (data.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }
  }

  /**
   * Insert an entity
   */
  async insertEntity(
    collection: string,
    entity: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase.from(collection).insert(entity);

    if (error) {
      throw new Error(`Failed to insert entity: ${error.message}`);
    }
  }

  /**
   * Update an entity
   */
  async updateEntity(
    collection: string,
    id: string,
    updates: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase
      .from(collection)
      .update(updates)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update entity: ${error.message}`);
    }
  }

  /**
   * Delete an entity
   */
  async deleteEntity(collection: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from(collection)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete entity: ${error.message}`);
    }
  }

  /**
   * Introspect existing Postgres schema and generate Triplit schema
   */
  async introspectSchema(): Promise<DBSchema<any>> {
    const tables = await this.getTables();
    const collections: any = {};

    for (const tableName of tables) {
      const columns = await this.getColumns(tableName);
      const schema: any = {};

      for (const column of columns) {
        const dataType = postgresTypeToTriplit(column);
        schema[column.column_name] = dataType;
      }

      collections[tableName] = {
        schema,
      };
    }

    return {
      collections,
      version: 0,
    };
  }

  /**
   * Run migrations to create/update tables based on Triplit schema
   */
  async runMigrations(): Promise<void> {
    if (!this.schema?.collections) {
      throw new Error('No schema provided for migrations');
    }

    for (const [collectionName, collection] of Object.entries(
      this.schema.collections
    )) {
      const columns: PostgresColumn[] = [];

      // Always add id column
      columns.push({
        name: 'id',
        type: 'TEXT',
        nullable: false,
        primaryKey: true,
      });

      // Add other columns from schema
      for (const [fieldName, fieldSchema] of Object.entries(
        collection.schema
      )) {
        if (fieldName === 'id') continue; // Skip id, already added

        const column = triplitTypeToPostgres(fieldSchema, fieldName);
        columns.push(column);
      }

      // Generate and execute CREATE TABLE statement
      const createSQL = generateCreateTableSQL(collectionName, columns);

      if (this.options.debug) {
        console.log('[SupabaseSQLAdapter] Creating table:', createSQL);
      }

      await this.executeSQL(createSQL);
    }
  }

  /**
   * Execute raw SQL via Supabase RPC
   */
  private async executeSQL(sql: string): Promise<void> {
    // Note: This requires a Postgres function to be created
    // See migration file for setup instructions
    const { error } = await this.supabase.rpc('execute_sql', { sql_query: sql });

    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }
  }

  /**
   * Execute parameterized query via RPC
   */
  private async executeRPC(
    sql: string,
    params: any[]
  ): Promise<{ data: any[] | null; error: PostgrestError | null }> {
    // Note: This requires a Postgres function to be created
    const { data, error } = await this.supabase.rpc('execute_query', {
      sql_query: sql,
      sql_params: params,
    });

    return { data, error };
  }

  /**
   * Get list of all tables
   */
  private async getTables(): Promise<string[]> {
    const { data, error } = await this.supabase.rpc('get_tables', {
      schema_name: this.options.schema,
    });

    if (error) {
      throw new Error(`Failed to get tables: ${error.message}`);
    }

    return (data ?? []).map((row: any) => row.table_name);
  }

  /**
   * Get columns for a table
   */
  private async getColumns(
    tableName: string
  ): Promise<
    Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>
  > {
    const { data, error } = await this.supabase.rpc('get_columns', {
      table_name: tableName,
      schema_name: this.options.schema,
    });

    if (error) {
      throw new Error(`Failed to get columns: ${error.message}`);
    }

    return data ?? [];
  }
}
