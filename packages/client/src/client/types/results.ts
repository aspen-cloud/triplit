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
  ReturnTypeFromQuery,
  Unalias,
} from '@triplit/db';
import { ClientQuery, ClientQueryDefault, ClientSchema } from './query.js';

/**
 * Results from a query based on the query's model in the format `Map<id, entity>`
 */
export type ClientFetchResult<C extends ClientQuery<any, any>> = Map<
  string,
  ClientFetchResultEntity<C>
>;

/**
 * Entity from a query based on the query's model
 */
export type ClientFetchResultEntity<C extends ClientQuery<any, any, any, any>> =
  ReturnTypeFromQuery<C>;

/**
 * The fully selected type of an entity, including all fields but not relations
 */
export type Entity<
  M extends ClientSchema,
  CN extends CollectionNameFromModels<M>
> = Unalias<ReturnTypeFromQuery<ClientQueryDefault<M, CN>>>;
