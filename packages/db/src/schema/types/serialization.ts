import { SubQuery } from '../../data-types/definitions/query.js';
import {
  CollectionTypeKeys,
  UserTypeOptions,
  ValueTypeKeys,
} from '../../data-types/types/index.js';
import { TypeInterface } from '../../data-types/definitions/type.js';
import { QueryResultCardinality } from '../../query/types/collection-query.js';
import { Schema } from '../builder.js';
import { CollectionRules, RolePermissions, Roles } from './models.js';

// TODO: rename `XYZDefinition` to `SerializedXYZ`

/**
 * The serialized form of a schema
 */
export type SchemaDefinition = {
  version: number;
  collections: CollectionsDefinition;
  roles?: Roles;
};

/**
 * The serialized form of a schema's collections
 */
export interface CollectionsDefinition {
  [collection: string]: CollectionDefinition;
}

/**
 * The serialized form of a collection
 */
export interface CollectionDefinition {
  schema: RecordAttributeDefinition<{
    id: ReturnType<typeof Schema.Id>;
  }>;
  rules?: CollectionRules<any, any>;
  permissions?: RolePermissions<any, any>;
}

/**
 * The serialized form of a record attribute
 */
export type RecordAttributeDefinition<
  Properties extends Record<string, TypeInterface> = {}
> = {
  type: 'record';
  properties: Record<keyof Properties, AttributeDefinition>;
  optional?: (keyof Properties)[];
};

/**
 * The serialized form of a value attribute
 */
export type ValueAttributeDefinition = {
  type: ValueTypeKeys;
  options: UserTypeOptions;
};

/**
 * The serialized form of a collection attribute (e.g. a set)
 */
export type CollectionAttributeDefinition = {
  type: CollectionTypeKeys;
  items: ValueAttributeDefinition;
  options: UserTypeOptions;
};

/**
 * The serialized form of a query attribute
 */
export type QueryAttributeDefinition = {
  type: 'query';
  query: SubQuery<any, any>;
  cardinality: QueryResultCardinality;
};

/**
 * The union of all attribute definitions
 */
export type AttributeDefinition =
  | ValueAttributeDefinition
  | RecordAttributeDefinition<any>
  | CollectionAttributeDefinition
  | QueryAttributeDefinition;
