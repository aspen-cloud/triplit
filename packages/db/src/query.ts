import { Model, Models, TypeFromModel, updateEntityAtPath } from './schema';
import { TripleRow } from './triple-store';

type Path = string;
type Value = any;
export type Operator = '=' | '<' | '>' | '<=' | '>=' | '!=' | 'like';

export type FilterStatement<M extends Model<any> | undefined> = [
  M extends Model<any> ? keyof M['properties'] : Path,
  Operator,
  Value
];
export type FilterGroup<M extends Model<any> | undefined> = {
  mod: 'or' | 'and';
  filters: FilterStatement<M>[];
};

export type WhereFilter<M extends Model<any> | undefined> =
  | FilterStatement<M>
  | FilterGroup<M>;

type QueryWhere<M extends Model<any> | undefined> = WhereFilter<M>[];

export interface Query<M extends Model<any> | undefined> {
  where: QueryWhere<M>;
  select: (M extends Model<any> ? keyof M['properties'] : Path)[];
  order?: [
    property: M extends Model<any> ? keyof M['properties'] : Path,
    direction: 'ASC' | 'DESC'
  ];
  limit?: number;
}

export function entityToResultReducer<M extends Models<any, any>[string]>(
  entity: TypeFromModel<M>,
  triple: TripleRow
) {
  // TODO support tombestones and timestamps
  const { attribute, value, timestamp, expired: isExpired } = triple;
  if (isExpired) return entity;
  if (attribute[0] === '_collection')
    return { ...entity, _collection: [value, timestamp] };
  const [_collectionName, ...path] = attribute;
  updateEntityAtPath(entity, path, value, timestamp);
  return entity;
}

export function queryResultToJson(
  results: Map<string, Record<string, Set<any>>>
) {
  const entries = Array.from(results.entries());
  const jsonifiedEntries = entries.map(([id, vals]) => [
    id,
    setRecordToArrayRecord(vals),
  ]);
  return Object.fromEntries(jsonifiedEntries);
}

function setRecordToArrayRecord(
  record: Record<string, Set<any>>
): Record<string, any[]> {
  return Object.fromEntries(
    Object.entries(record).map(([id, set]) => [id, Array.from(set)])
  );
}

export function or<M extends Model<any> | undefined>(where: QueryWhere<M>) {
  return { mod: 'or' as const, filters: where };
}

export function and<M extends Model<any> | undefined>(where: QueryWhere<M>) {
  return { mod: 'and' as const, filters: where };
}
