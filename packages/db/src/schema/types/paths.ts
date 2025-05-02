import {
  RefCollectionName,
  RefDefinition,
  RelationshipRef,
} from '../../query/types/index.js';
import { StringKey } from '../../types.js';
import { JsonType, RecordType } from '../data-types/index.js';
import { CollectionNameFromModels, Models } from './models.js';

export type SchemaPaths<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> = RecordPaths<M[CN]['schema']>;

// TODO: increasing max depth to 3 causes typescript to complain
type MAX_RELATION_DEPTH = 2;
type DEPTH = 0 | 1 | 2;
type IncrementDepth<D extends DEPTH> = D extends 0
  ? 1
  : D extends 1
    ? 2
    : never;

// Exhaustive schema paths = root paths + all relations (+ their root paths)
export type ModelPaths<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  RDepth extends DEPTH = 0,
> = SchemaPaths<M, CN> | RelationshipPaths<M, CN, RDepth>;

export type RelationshipPaths<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  RDepth extends DEPTH = 0,
> = RDepth extends MAX_RELATION_DEPTH
  ? string
  : {
      [K in RelationshipRef<
        M,
        CN
      >]: `${K & string}.${ModelPaths<M, RefCollectionName<M, CN, K>, IncrementDepth<RDepth>>}`;
    }[RelationshipRef<M, CN>];

// Given a point in the schema, resolve the path returning the data type
export type ResolveModelPath<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Path extends string,
  Current extends RecordType = M[CN]['schema'],
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends StringKey<Current['properties']>
    ? ResolveModelPath<M, CN, Tail, Current['properties'][Head]>
    : Head extends RelationshipRef<M, CN>
      ? ResolveModelPath<
          M,
          RefCollectionName<M, CN, Head>,
          Tail,
          M[CN]['schema']
        >
      : never
  : Current['properties'][Path];

// All paths in the schema that are relationships from a starting point
// TODO: unify with RelationshipPaths (this is a prefix)
export type ModelRelationshipPaths<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  RDepth extends DEPTH = 0,
> = RDepth extends MAX_RELATION_DEPTH
  ? string
  : {
      [K in RelationshipRef<M, CN>]:
        | `${K & string}`
        | `${K & string}.${ModelRelationshipPaths<M, RefCollectionName<M, CN, K>, IncrementDepth<RDepth>>}`;
    }[RelationshipRef<M, CN>];

export type ResolveRelationshipPath<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends RelationshipRef<M, CN>
    ? ResolveRelationshipPath<M, RefCollectionName<M, CN, Head>, Tail>
    : never
  : Path extends RelationshipRef<M, CN>
    ? RefDefinition<M, CN, Path>
    : never;

/**
 * Expand a record type into a union of all possible paths, including nested records and the root time of a nested record
 */
type RecordPaths<R extends RecordType> = R extends RecordType
  ? {
      // this breaks with StringKey<R['properties']> for some reason? Using keyof R['properties'] instead
      [K in keyof R['properties']]: R['properties'][K] extends RecordType
        ?
            | `${K & string}`
            | `${K & string}.${RecordPaths<
                // @ts-expect-error
                R['properties'][K]
              >}`
        : R['properties'][K] extends JsonType
          ? `${K & string}` | `${K & string}.${string}`
          : K & string;
    }[StringKey<R['properties']>]
  : never;

/**
 * SplitPath<"a.b.c", "."> --> ["a", "b", "c"]
 */
type SplitPath<
  S extends string,
  Delimiter extends string,
> = S extends `${infer Head}${Delimiter}${infer Tail}`
  ? [Head, ...SplitPath<Tail, Delimiter>]
  : [S];

/**
 * Utility to turn a union of object types into a single
 * intersection type. For example:
 *
 *   { a: number } | { b: string }
 * becomes:
 *   { a: number } & { b: string }
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * PathFilteredHelper<T, ["a", "b"]>:
 *   1. If "a" is a key of T, we keep T["a"] under the key "a",
 *   2. then recursively process the remainder of the path ("b") on T["a"].
 *   3. If we exhaust the path, we simply return T (meaning keep the entire sub-object).
 */
type PathFilteredHelper<T, Keys extends string[]> = Keys extends [
  infer Head,
  ...infer Tail,
]
  ? Head extends StringKey<T>
    ? {
        [K in Head]: PathFilteredHelper<T[K], Extract<Tail, string[]>>;
      }
    : {}
  : T;

/**
 * PathFiltered<T, "foo.bar" | "x" | "y.z"> takes each path in the union,
 * runs it through PathFilteredHelper, and intersects the results.
 *
 * Example:
 *   PathFiltered<typeof obj, 'age' | 'address.street'>
 *     => { age: number } & { address: { street: string } }
 */
export type PathFiltered<T, Paths extends string> = UnionToIntersection<
  Paths extends infer P
    ? P extends string
      ? PathFilteredHelper<T, SplitPath<P, '.'>>
      : never
    : never
>;
