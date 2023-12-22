import DB from './db.js';
import type {
  TupleStorageApi,
  AsyncTupleStorageApi,
} from '@triplit/tuple-database';

export default DB;
export { DB };

type Storage = TupleStorageApi | AsyncTupleStorageApi;
export type { Storage };

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
  DBConfig,
  FetchByIdQueryParams,
} from './db.js';
export type { DBTransaction } from './db-transaction.js';
export {
  queryResultToJson,
  or,
  and,
  constructEntity,
  // TODO
  triplesToEntities as constructEntities,
  QUERY_INPUT_TRANSFORMERS,
} from './query.js';
// TS issue occurs if we dont export FilterGroup (i think due to an infered return type somewhere)
export type { Query, FilterGroup, CollectionQuery } from './query.js';
export { stripCollectionFromId } from './db-helpers.js';
export type { TripleRow, EntityId, Attribute, Value } from './triple-store.js';
export {
  Schema,
  triplesToSchema,
  schemaToJSON,
  JSONToSchema,
  timestampedObjectToPlainObject,
  hashSchemaJSON,
  convertEntityToJS,
  getSchemaFromPath,
} from './schema.js';
export type {
  TObject,
  TimestampedTypeFromModel as TypeFromModel, // TODO: dont alias
} from './schema.js';
export type {
  InsertTypeFromModel,
  UpdateTypeFromModel,
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
  QueryAttributeDefinition,
  UserTypeOptions,
} from './data-types/serialization.js';
export { timestampCompare } from './timestamp.js';
export type { Timestamp } from './timestamp.js';
export { DurableClock } from './clocks/durable-clock.js';
export { MemoryClock } from './clocks/memory-clock.js';
export { default as CollectionQueryBuilder } from './collection-query.js';
export type {
  FetchResult,
  FetchResultEntity,
  ReturnTypeFromQuery,
  MaybeReturnTypeFromQuery,
} from './collection-query.js';
export { default as Builder } from './utils/builder.js';
export type { toBuilder } from './utils/builder.js';
export type { IsAny } from './utility-types.js';
export * from './errors.js';
