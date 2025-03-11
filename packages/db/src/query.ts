import {
  Models,
  RelationPaths,
  RelationshipCollectionName,
} from './schema/types/index.js';
import { CollectionNameFromModels, ModelFromModels } from './db.js';
import { encodeValue } from '@triplit/tuple-database/helpers/codec';
import {
  AndFilterGroup,
  CollectionQuery,
  FilterGroup,
  FilterStatement,
  OrFilterGroup,
  QueryWhere,
  RelationshipExistsFilter,
  SubQueryFilter,
  ValueCursor,
  WhereFilter,
} from './query/types/index.js';
import { TriplitError } from './errors.js';

export function isFilterStatement<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: WhereFilter<M, CN>): filter is FilterStatement<M, CN> {
  return (
    filter instanceof Array &&
    filter.length === 3 &&
    typeof filter[0] === 'string' &&
    typeof filter[1] === 'string'
  );
}

export function isFilterGroup<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: WhereFilter<M, CN>): filter is FilterGroup<M, CN> {
  return filter instanceof Object && 'mod' in filter;
}

export function isSubQueryFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: WhereFilter<M, CN>): filter is SubQueryFilter<M> {
  return filter instanceof Object && 'exists' in filter;
}

export function isExistsFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: WhereFilter<M, CN>): filter is RelationshipExistsFilter<M, CN> {
  return (
    filter instanceof Object &&
    'type' in filter &&
    filter['type'] === 'relationshipExists'
  );
}

export function isBooleanFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: WhereFilter<M, CN>): filter is boolean {
  return typeof filter === 'boolean';
}

export function isWhereFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(filter: any): filter is WhereFilter<M, CN> {
  return (
    isFilterStatement(filter) ||
    isFilterGroup(filter) ||
    isSubQueryFilter(filter) ||
    isExistsFilter(filter) ||
    isBooleanFilter(filter)
  );
}

export function or<M extends Models, CN extends CollectionNameFromModels<M>>(
  where: QueryWhere<M, CN>
): OrFilterGroup<M, CN> {
  return { mod: 'or' as const, filters: where };
}

export function and<M extends Models, CN extends CollectionNameFromModels<M>>(
  where: QueryWhere<M, CN>
): AndFilterGroup<M, CN> {
  return { mod: 'and' as const, filters: where };
}

export function exists<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  P extends RelationPaths<ModelFromModels<M, CN>, M> = RelationPaths<
    ModelFromModels<M, CN>,
    M
  >,
>(
  relationship: P,
  query?: Pick<
    CollectionQuery<M, RelationshipCollectionName<M, CN, P>>,
    'where'
  >
): RelationshipExistsFilter<M, CN, P> {
  return { type: 'relationshipExists', relationship, query };
}

export function compareCursors(
  cursor1: ValueCursor | undefined,
  cursor2: ValueCursor | undefined
) {
  if (cursor1 && cursor1.length > 2) throw new TriplitError('invalid cursor');
  if (cursor2 && cursor2.length > 2) throw new TriplitError('invalid cursor');
  if (!cursor1 && !cursor2) return 0;
  if (!cursor1) return -1;
  if (!cursor2) return 1;
  let cursor1Value = cursor1[0];
  let cursor2Value = cursor2[0];
  // hack
  if (cursor1Value instanceof Date) cursor1Value = cursor1Value.getTime();
  if (cursor2Value instanceof Date) cursor2Value = cursor2Value.getTime();
  if (cursor1Value !== cursor2Value)
    return encodeValue(cursor1Value) > encodeValue(cursor2Value) ? 1 : -1;
  if (cursor1[1] !== cursor2[1])
    return (cursor1[1] as string) > (cursor2[1] as string) ? 1 : -1;
  return 0;
}
