//  There is some odd behavior when using infer with intersection types
//  Our query types are set up as:
//  CollectionQuery<...> = Query<...> & { ... }
//  ClientQuery<...> = CollectionQuery<...> & { ... }
//
//  However, if you attempt to infer the generic of a base object (ex. CollectionQuery<infer M>) with the intersected object (ClientQuery<any>) the inferred type M is overly generic
//
//  Recreating the fetch result types here to avoid this issue
//  Playground: https://www.typescriptlang.org/play?#code/KYDwDg9gTgLgBDAnmYcCyEAmwA2BnAHgCg44BhCHHYAYxgEsIA7AOQEMBbVUGYJzPHDwwo9JgHMANCTgAVODz4C4AJVrRMBYaImShIseIB8RI3AC8q9VE0UqtBs3Zc9sowG4iRJCjgAhNjxgAjQFEF5+QQxsfAI2JkQ9eMQjPTIWMIjlAGtgRAgAM3QzSwBvGTYYEQBGAC50AG10gF1PAF8vH1QAUXClYE1QxUj0LFxCZKSE1PIM4Zy8wuKLf0DgtDSWMwAyOFLKkQAmeu1DNs9vZFRZYGFqgnl5wQCguISplJK5TKVntbfEnBkmYAPxwADkYECeHBcHq4IKbHoOHBni6cluMEODx+IxewUmQOmX0efTx-zEBWAUDgAFUPqC6XCIYjkajOlc4ABJJhgACu8EsvSyAwIpV4wnq+3hBQgEHBbTaenBEpg4I8HN8ajwfJwMGqKxudwIPP5MA16O1uqxhsx2NNAo8QA

import {
  CollectionNameFromModels,
  CollectionQuery,
  Models,
  QueryInclusions,
  QuerySelection,
  ReturnTypeFromQuery,
  Unalias,
} from '@triplit/db';
import { ClientQuery, ClientSchema, SchemaClientQueries } from './query.js';

/**
 * Results from a query based on the query's model in the format `Map<id, entity>`
 */
export type ClientFetchResult<
  M extends Models,
  C extends SchemaClientQueries<M>
> = Map<string, ClientFetchResultEntity<M, C>>;

/**
 * Entity from a query based on the query's model
 */
export type ClientFetchResultEntity<
  M extends Models,
  C extends SchemaClientQueries<M>
> = ReturnTypeFromQuery<M, C>;

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
  M extends ClientSchema,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelection<M, CN> = QuerySelection<M, CN>,
  Inclusion extends QueryInclusions<M, CN> = {}
> = Unalias<
  ReturnTypeFromQuery<M, CollectionQuery<M, CN, Selection, Inclusion>>
>;

/**
 * The type for the result returned from a query
 */
export type QueryResult<
  M extends Models,
  C extends SchemaClientQueries<M>
> = Unalias<ReturnTypeFromQuery<M, C>>;
