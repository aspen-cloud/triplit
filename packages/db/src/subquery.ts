import {
  QueryInclusion,
  QueryResultCardinality,
  RefShorthand,
  RefSubquery,
  RelationSubquery,
} from './types.js';

export function isQueryInclusionSubquery(
  inclusion: QueryInclusion
): inclusion is RelationSubquery {
  return (
    !isQueryInclusionShorthand(inclusion) &&
    typeof inclusion === 'object' &&
    'subquery' in inclusion
  );
}

export function isQueryInclusionShorthand(
  inclusion: QueryInclusion
): inclusion is RefShorthand {
  return inclusion === true || inclusion === null;
}

export function isQueryInclusionReference(
  inclusion: QueryInclusion
): inclusion is RefSubquery {
  return (
    !isQueryInclusionShorthand(inclusion) &&
    typeof inclusion === 'object' &&
    '_extends' in inclusion
  );
}

export function isQueryResultCardinality(
  cardinality: string
): cardinality is QueryResultCardinality {
  return cardinality === 'one' || cardinality === 'many';
}
