/**
 * The fastest path migrating over from our previous pkg setup and including our tuple-database patch is to continue to bundle our source code output.
 * For now, it means we need to export our source code output from this file.
 * IMO, we'd just transpile each file and keep our directory structure to allow for more selective importing.
 * What this means is everything must be imported from "@triplit/db", and not "@triplit/db/dist/query" or something like that.
 */

// TODO: note this somewhere - cannot export directly from external pkg with parcel
export { SQLiteTupleStorage as SqliteStorage } from 'tuple-database/storage/SQLiteTupleStorage.js';
export { IndexedDbTupleStorage as IndexedDbStorage } from 'tuple-database/storage/IndexedDbTupleStorage.js';
export { BrowserTupleStorage as BrowserLocalStorage } from 'tuple-database/storage/BrowserTupleStorage.js';
export { default as MemoryStorage } from './storage/memory-btree.js';
export { default as CachedIndexedDbStorage } from './storage/cached-indexed-db.js';

import DB from './db.js';
export default DB;
export { DB };
export type {
  Migration,
  CollectionNameFromModels,
  ModelFromModels,
  CollectionRules,
  CreateCollectionOperation,
  DropCollectionOperation,
  AddAttributeOperation,
  DropAttributeOperation,
  AlterAttributeOptionOperation,
  DropAttributeOptionOperation,
  AddRuleOperation,
  DropRuleOperation,
} from './db.js';
export type { DBTransaction } from './db-transaction.js';
export {
  queryResultToJson,
  or,
  and,
  constructEntity,
  triplesToEntities as constructEntities,
  QUERY_INPUT_TRANSFORMERS,
} from './query.js';
// TS issue occurs if we dont export FilterGroup (i think due to an infered return type somewhere)
export type { Query, FilterGroup } from './query.js';
export { stripCollectionFromId } from './db-helpers.js';
export type { TripleRow } from './triple-store.js';
export {
  Schema,
  triplesToSchema,
  schemaToJSON,
  timestampedObjectToPlainObject,
  hashSchemaJSON,
} from './schema.js';
export type {
  TObject,
  TimestampedTypeFromModel as TypeFromModel, // TODO: dont alias
} from './schema.js';
export type {
  InsertTypeFromModel,
  ResultTypeFromModel,
  ProxyTypeFromModel,
  Model,
  Models,
  TimestampedObject,
  UnTimestampedObject,
} from './schema.js';
export type {
  AttributeDefinition,
  CollectionAttributeDefinition,
  CollectionDefinition,
  CollectionsDefinition,
  UserTypeOptions,
} from './data-types/serialization.js';
export { timestampCompare } from './timestamp.js';
export type { Timestamp } from './timestamp.js';
export { DurableClock } from './clocks/durable-clock.js';
export { MemoryClock } from './clocks/memory-clock.js';
export { default as CollectionQueryBuilder } from './collection-query.js';
export type { CollectionQuery, FetchResult } from './collection-query.js';
export { default as Builder } from './utils/builder.js';
export type { toBuilder } from './utils/builder.js';
export type { IsAny } from './utility-types.js';
export * from './errors.js';
