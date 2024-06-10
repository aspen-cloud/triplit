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
  SetAttributeOptionalOperation,
  DBConfig,
  FetchByIdQueryParams,
  DBFetchOptions,
} from './db.js';
export { ChangeTracker, createUpdateProxy } from './db-transaction.js';
export type { DBTransaction } from './db-transaction.js';
export {
  queryResultToJson,
  or,
  and,
  constructEntity,
  // TODO
  triplesToEntities as constructEntities,
  compareCursors,
} from './query.js';
export { QUERY_INPUT_TRANSFORMERS } from './query/builder.js';
// TS issue occurs if we dont export FilterGroup (i think due to an infered return type somewhere)
export type {
  Query,
  FilterGroup,
  CollectionQuery,
  ValueCursor,
  RelationSubquery,
  QuerySelectionValue,
} from './query.js';
export {
  stripCollectionFromId,
  appendCollectionToId,
  logSchemaChangeViolations,
} from './db-helpers.js';
export type {
  TripleRow,
  EntityId,
  Attribute,
  TupleValue,
} from './triple-store-utils.js';
export type { TripleStoreApi } from './triple-store.js';
export {
  triplesToSchema,
  schemaToJSON,
  JSONToSchema,
  hashSchemaJSON,
  getSchemaFromPath,
} from './schema/schema.js';
export { Schema } from './schema/builder.js';
export type { TObject } from './schema/schema.js';
export type {
  InsertTypeFromModel,
  UpdateTypeFromModel,
  Model,
  Models,
  RelationAttributes,
} from './schema/types';
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
export {
  default as CollectionQueryBuilder,
  convertEntityToJS,
} from './collection-query.js';
export { QueryBuilder } from './query/builder.js';
export type {
  TimestampedTypeFromModel as TypeFromModel, // TODO: dont alias
} from './collection-query.js';
export type * from './query/types';
export { default as Builder } from './utils/builder.js';
export type { toBuilder } from './utils/builder.js';
export { timestampedObjectToPlainObject } from './utils.js';
export type { TimestampedObject, UnTimestampedObject } from './utils.js';
export type { IsAny } from './utility-types.js';
export * from './errors.js';
