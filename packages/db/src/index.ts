/**
 * The fastest path migrating over from our previous pkg setup and including our tuple-database patch is to continue to bundle our source code output.
 * For now, it means we need to export our source code output from this file.
 * IMO, we'd just transpile each file and keep our directory structure to allow for more selective importing.
 * What this means is everything must be imported from "@triplit/db", and not "@triplit/db/dist/query" or something like that.
 */

export { SQLiteTupleStorage as SqliteStorage } from 'tuple-database/storage/SQLiteTupleStorage';
// export { InMemoryTupleStorage as MemoryStorage } from 'tuple-database';
export { default as MemoryStorage } from './storage/memory-btree';
export { default as CachedIndexedDbStorage } from './storage/cached-indexed-db';
export { IndexedDbTupleStorage as IndexedDbStorage } from 'tuple-database/storage/IndexedDbTupleStorage';
export { BrowserTupleStorage as BrowserLocalStorage } from 'tuple-database/storage/BrowserTupleStorage';

export { default as DB } from './db';
export type {
  Migration,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
} from './db';
export { queryResultToJson, or, and } from './query';
export type { Query } from './query';
export type { TripleRow } from './triple-store';
export * as Schema from './schema';
export type {
  AttributeDefinition,
  CollectionDefinition,
  CollectionsDefinition,
  JSONTypeFromModel,
  Model,
  Models,
  TimestampedObject,
  UnTimestampedObject,
} from './schema';
export { timestampCompare } from './timestamp';
export type { Timestamp } from './timestamp';
export { DurableClock } from './clocks/durable-clock';
export { MemoryClock } from './clocks/memory-clock';
export { default as CollectionQueryBuilder } from './collection-query';
export type { CollectionQuery, FetchResult } from './collection-query';
export { default as Builder } from './utils/builder';
export type { toBuilder } from './utils/builder';
export type { IsAny } from './utility-types';
export * from './errors';
