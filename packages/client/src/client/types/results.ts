import {
  CollectionNameFromModels,
  FetchResult,
  Models,
  Schema as S,
  SchemaQuery,
} from '@triplit/entity-db';

/**
 * The fully selected type of an entity, including all fields but not relations
 *
 * @template M The type of the defined schema
 * @template CN The collection name
 *
 * @example
 * ```ts
 * type MyEntity = Entity<typeof schema, 'myCollection'>
 * ```
 */
export type Entity<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = QueryResult<M, { collectionName: CN }>;

const schema = S.Collections({
  todos: {
    schema: S.Schema({
      id: S.Id(),
      title: S.String(),
      done: S.Boolean(),
      assigneeId: S.String(),
    }),
    relationships: {
      assignee: S.RelationById('users', '$1.assigneeId'),
    },
  },
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
    }),
  },
});

/**
 * The type for the result returned from a query. This is also useful for creating types for data.
 *
 * @template M The type of the defined schema
 * @template Q A valid query for the schema M
 *
 * @example
 * ```ts
 * type MyFilteredEntity = QueryResult<
 *  typeof schema,
 *  {
 *    collectionName: 'todos';
 *    select: ['id', 'title', 'done'];
 *    include: { assignee: true };
 *  }>;
 * ```
 */
export type QueryResult<
  M extends Models<M> = Models,
  Q extends SchemaQuery<M> = SchemaQuery<M>,
> = NonNullable<FetchResult<M, Q, 'one'>>;
