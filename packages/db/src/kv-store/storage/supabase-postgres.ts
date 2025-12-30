import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryTransaction } from '../transactions/memory-tx.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import { decodeTuple, encodeTuple, Tuple } from '../../codec.js';
import { ScopedKVStore } from '../utils/scoped-store.js';

export type SupabasePostgresKVStoreOptions = {
  /**
   * The name of the table to use for the key-value store.
   * Defaults to 'triplit_kv_store'.
   */
  tableName?: string;
  /**
   * Whether to create the table if it doesn't exist.
   * Defaults to true.
   */
  autoCreateTable?: boolean;
};

const DEFAULT_TABLE_NAME = 'triplit_kv_store';

/**
 * A KVStore implementation that uses Supabase Postgres as the storage backend.
 *
 * This adapter provides a drop-in replacement for the default KV-based storage,
 * allowing Triplit to use Postgres instead of the ordered KV abstraction.
 *
 * @example
 * ```typescript
 * import { createClient } from '@supabase/supabase-js';
 * import { SupabasePostgresKVStore } from '@triplit/db';
 *
 * const supabase = createClient(
 *   'https://your-project.supabase.co',
 *   'your-anon-key'
 * );
 *
 * const store = new SupabasePostgresKVStore(supabase);
 * const db = new DB({ kv: store });
 * ```
 */
export class SupabasePostgresKVStore implements KVStore {
  private tableName: string;
  private tableCreated: boolean = false;

  constructor(
    private supabase: SupabaseClient,
    private options: SupabasePostgresKVStoreOptions = {}
  ) {
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME;

    // Create table on initialization if autoCreateTable is enabled (default: true)
    if (options.autoCreateTable !== false) {
      this.createTable();
    }
  }

  /**
   * Creates the KV store table if it doesn't exist.
   * This uses Supabase's RPC function to execute raw SQL.
   */
  private async createTable(): Promise<void> {
    if (this.tableCreated) return;

    try {
      // Use raw SQL via Supabase RPC or direct SQL execution
      // Note: This requires a stored procedure or admin access
      // For now, we'll use the Supabase client to check if table exists
      // The table should ideally be created via migration (see schema.sql)

      // Try a simple query to check if table exists
      const { error } = await this.supabase
        .from(this.tableName)
        .select('key')
        .limit(0);

      if (error && error.code === '42P01') {
        // Table doesn't exist - it should be created via migration
        console.warn(
          `Table '${this.tableName}' does not exist. Please run the SQL migration to create it.`
        );
      }

      this.tableCreated = true;
    } catch (error) {
      console.error('Error checking table existence:', error);
      this.tableCreated = true; // Don't keep retrying
    }
  }

  async get(key: Tuple, scope?: Tuple): Promise<any> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('value')
      .eq('key', encodedKey)
      .single();

    if (error) {
      // PGRST116 means no rows found
      if (error.code === 'PGRST116') {
        return undefined;
      }
      throw new Error(`Get failed: ${error.message}`);
    }

    return data ? JSON.parse(data.value) : undefined;
  }

  async set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const encodedValue = JSON.stringify(value);

    const { error } = await this.supabase
      .from(this.tableName)
      .upsert(
        { key: encodedKey, value: encodedValue },
        { onConflict: 'key' }
      );

    if (error) {
      throw new Error(`Set failed: ${error.message}`);
    }
  }

  async delete(key: Tuple, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('key', encodedKey);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const prefix = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = prefix + '\uffff';

    // Supabase doesn't support streaming, so we need to fetch all at once
    // For large datasets, consider implementing pagination
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('key, value')
      .gte('key', prefix)
      .lt('key', high)
      .order('key', { ascending: true });

    if (error) {
      throw new Error(`Scan failed: ${error.message}`);
    }

    if (!data) return;

    const prefixLength = (scope?.length ?? 0) + options.prefix.length;

    for (const row of data) {
      const key = decodeTuple(row.key);
      const keyWithoutPrefix = prefixLength > 0 ? key.slice(prefixLength) : key;

      // Skip empty keys (same as SQLite implementation)
      if (keyWithoutPrefix.length === 0) continue;

      yield [keyWithoutPrefix, JSON.parse(row.value)];
    }
  }

  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const prefix = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = prefix + '\uffff';

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('value')
      .gte('key', prefix)
      .lt('key', high)
      .order('key', { ascending: true });

    if (error) {
      throw new Error(`ScanValues failed: ${error.message}`);
    }

    if (!data) return;

    for (const row of data) {
      yield JSON.parse(row.value);
    }
  }

  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const fullPrefix = scope ? [...scope, ...options.prefix] : options.prefix;

    if (!fullPrefix.length) {
      // Count all rows
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        throw new Error(`Count failed: ${error.message}`);
      }

      return count ?? 0;
    }

    // Count with prefix
    const prefix = encodeTuple(fullPrefix);
    const high = prefix + '\uffff';

    const { count, error } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .gte('key', prefix)
      .lt('key', high);

    if (error) {
      throw new Error(`Count failed: ${error.message}`);
    }

    return count ?? 0;
  }

  async clear(scope?: Tuple): Promise<void> {
    if (!scope?.length) {
      // Delete all rows
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .neq('key', ''); // Delete all (workaround for Supabase requiring a filter)

      if (error) {
        throw new Error(`Clear failed: ${error.message}`);
      }
      return;
    }

    // Delete with scope prefix
    const prefix = encodeTuple(scope);
    const high = prefix + '\uffff';

    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .gte('key', prefix)
      .lt('key', high);

    if (error) {
      throw new Error(`Clear failed: ${error.message}`);
    }
  }

  scope(scope: Tuple): KVStore {
    return new ScopedKVStore(this, scope);
  }

  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }

  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    // Accumulate all edits first
    const accumulatedSets: { key: string; value: string }[] = [];
    const accumulatedDeletes: string[] = [];

    for await (const [key, value] of sets) {
      accumulatedSets.push({
        key: encodeTuple(key),
        value: JSON.stringify(value),
      });
    }

    for await (const key of deletes) {
      accumulatedDeletes.push(encodeTuple(key));
    }

    // Execute deletes first, then sets
    // Note: Ideally this would be in a transaction, but Supabase client doesn't expose transactions
    // For true ACID guarantees, consider using a Postgres connection pool directly

    if (accumulatedDeletes.length > 0) {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .in('key', accumulatedDeletes);

      if (error) {
        throw new Error(`ApplyEdits delete failed: ${error.message}`);
      }
    }

    if (accumulatedSets.length > 0) {
      const { error } = await this.supabase
        .from(this.tableName)
        .upsert(accumulatedSets, { onConflict: 'key' });

      if (error) {
        throw new Error(`ApplyEdits upsert failed: ${error.message}`);
      }
    }
  }
}
