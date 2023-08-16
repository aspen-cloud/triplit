import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  SessionVariableNotFoundError,
} from './errors';
import { QueryWhere, FilterStatement } from './query';
import { Model } from './schema';
import { TripleRow } from './triple-store';

export function transformTripleAttribute(
  triples: TripleRow[],
  attribute: string[],
  newAttribute: string[]
) {
  // At some point this may not work for all data types, but for now it does
  return triples.map<TripleRow>((triple) => {
    const fullAttribute = [...triple.attribute];
    fullAttribute.splice(0, attribute.length, ...newAttribute);
    return { ...triple, attribute: fullAttribute };
  });
}

const ID_SEPARATOR = '#';

export function validateExternalId(id: string): Error | undefined {
  if (String(id).includes(ID_SEPARATOR)) {
    return new InvalidEntityIdError(id, `Id cannot include ${ID_SEPARATOR}.`);
  }
  return;
}

export function appendCollectionToId(collectionName: string, id: string) {
  return `${collectionName}${ID_SEPARATOR}${id}`;
}

export function splitIdParts(id: string): [collectionName: string, id: string] {
  const parts = id.split(ID_SEPARATOR);
  if (parts.length !== 2) {
    throw new InvalidInternalEntityIdError(
      `Malformed ID: ${id} should only include one separator(${ID_SEPARATOR})`
    );
  }
  return [parts[0], parts[1]];
}

export function stripCollectionFromId(id: string): string {
  const [_collection, entityId] = splitIdParts(id);
  return entityId;
}

export function replaceVariablesInFilterStatements<
  M extends Model<any> | undefined
>(statements: QueryWhere<M>, variables: Record<string, any>): QueryWhere<M> {
  return statements.map((filter) => {
    if (!(filter instanceof Array)) {
      filter.filters = replaceVariablesInFilterStatements(
        filter.filters,
        variables
      );
      return filter;
    }
    if (typeof filter[2] !== 'string' || !filter[2].startsWith('$'))
      return filter;
    const varValue = variables[filter[2].slice(1)];
    if (!varValue) throw new SessionVariableNotFoundError(filter[2]);
    return [filter[0], filter[1], varValue] as FilterStatement<M>;
  });
}
