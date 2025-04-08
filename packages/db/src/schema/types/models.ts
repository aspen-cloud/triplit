import { RecordType } from '../data-types/definitions/record.js';
import {
  CollectionQuery,
  QueryResultCardinality,
  QueryWhere,
  SchemaQuery,
} from '../../query/types/index.js';
import { StringKey } from '../../utils/types.js';

// === Model Definitions ===
// ====== Core Types ======
/**
 * The set of collections that define a schema
 */
export type Models<T = Record<string, Collection<any>>> = {
  [K in StringKey<T>]: Collection<
    // @ts-expect-error - allow any for model to allow self-referencing
    T,
    K
  >;
};

/**
 * Information pertaining to a collection
 */
export interface Collection<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> {
  schema: Model;
  relationships?: { [R in string]: ModelRelationship<M> };
  permissions?: ModelRolePermissions<M, CN>;
}

/**
 * Collection names in a model
 */
export type CollectionNameFromModels<M extends Models<M>> = StringKey<M>;

// ====== Model ======
/**
 * An individual model
 */
export type Model = RecordType;

// ====== Relationships ======
/**
 * Mapped type of all relationships in a schema
 */
type ModelsRelationship<M extends Models<M> = Models> = {
  [CN in CollectionNameFromModels<M>]: Relationship<M, SchemaQuery<M, CN>>;
};
/**
 * Union of specified relationships in a schema with CN
 */
type ModelRelationship<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = ModelsRelationship<M>[CN];

/**
 * A relationship between two collections
 */
export type Relationship<
  M extends Models<M> = Models,
  Q extends SchemaQuery<M> = SchemaQuery<M>,
  Cardinality extends QueryResultCardinality = QueryResultCardinality,
> = {
  query: Q;
  cardinality: Cardinality;
};

// ====== Roles and Permissions ======
// ========= Permissions =========
/**
 * Mapped type of all permissions in a schema
 */
type ModelsRolePermissions<M extends Models<M> = Models> = {
  [CN in CollectionNameFromModels<M>]: RolePermissions<M, CN>;
};

/**
 * Union of specified permissions in a schema with CN
 */
type ModelRolePermissions<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = ModelsRolePermissions<M>[CN];

/**
 * A collection of permissions by role
 */
export type RolePermissions<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  [R in string]: CollectionPermissions<M, CN>;
};

/**
 * Permissions for a collection by known operation
 */
export type CollectionPermissions<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  read?: CollectionPermission<M, CN>;
  insert?: CollectionPermission<M, CN>;
  update?: CollectionPermission<M, CN>;
  postUpdate?: CollectionPermission<M, CN>;
  delete?: CollectionPermission<M, CN>;
};

/**
 * A permissions definition
 */
export type CollectionPermission<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  filter?: QueryWhere<M, CN>;
  // attributes?: Array<QuerySelectionValue<M, CN>>;
  // attributesExclude?: Array<QuerySelectionValue<M, CN>>;
};

/**
 * Union of operations for permissions
 */
export type PermissionOperations = keyof CollectionPermissions<any, any>;

/**
 * Union of write operations for permissions
 */
export type PermissionWriteOperations = Exclude<PermissionOperations, 'read'>;

// ========= Roles =========
/**
 * Collection of roles for a database
 */
export type Roles = Record<string, Role>;

/**
 * Requisite information related to a role
 */
export type Role = {
  match: PermissionMatcher;
};

// TODO: we could maybe try to make this more type safe, should be valid JSON
/**
 * An object that will be matched against a JWT payload to determine if a user has a role
 * A value prefixed with '$' indicates a wildcard that will be replaced with the value from the JWT payload
 */
export type PermissionMatcher = Record<string, any>;

// ====== Rules (deprecated) ======
// TODO: remove
export interface CollectionRules<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> {
  read?: Record<string, Rule<M, CN>>;
  write?: Record<string, Rule<M, CN>>;
}
// TODO: remove
export interface Rule<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> {
  filter: QueryWhere<M, CN>;
  description?: string;
}
