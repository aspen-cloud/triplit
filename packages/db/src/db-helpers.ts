import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  InvalidSchemaPathError,
  CollectionNotFoundError,
  NoSchemaRegisteredError,
  SessionVariableNotFoundError,
  ValueSchemaMismatchError,
  InvalidOrderClauseError,
  TriplitError,
  InvalidWhereClauseError,
} from './errors.js';
import {
  QueryWhere,
  FilterStatement,
  SubQueryFilter,
  CollectionQuery,
  RelationSubquery,
  QueryValue,
  WhereFilter,
} from './query.js';
import {
  Model,
  Models,
  diffSchemas,
  getSchemaDiffIssues,
  convertEntityToJS,
  getSchemaFromPath,
  schemaToTriples,
  triplesToSchema,
  PossibleDataViolations,
  getAttributeFromSchema,
} from './schema.js';
import { TripleStoreApi } from './triple-store.js';
import { VALUE_TYPE_KEYS } from './data-types/serialization.js';
import DB, {
  CollectionFromModels,
  CollectionNameFromModels,
  SystemVariables,
} from './db.js';
import { DBTransaction } from './db-transaction.js';
import { DataType } from './data-types/base.js';
import { Attribute, TupleValue } from './triple-store-utils.js';
import {
  FetchExecutionContext,
  FetchResult,
  TimestampedFetchResult,
  bumpSubqueryVar,
  getRelationPathsFromIdentifier,
  validateIdentifier,
} from './collection-query.js';
import { Logger } from '@triplit/types/src/logger.js';
import { prefixVariables } from './utils.js';

const ID_SEPARATOR = '#';

export interface QueryPreparationOptions {
  skipRules?: boolean;
}

const ID_REGEX = /^[a-zA-Z0-9_\-:.]+$/;
export function validateExternalId(id: string): Error | undefined {
  if (!id) {
    return new InvalidEntityIdError(id, 'id cannot be undefined.');
  }
  if (String(id).includes(ID_SEPARATOR)) {
    return new InvalidEntityIdError(id, `Id cannot include ${ID_SEPARATOR}.`);
  }
  // TODO enable this check when we have a better understanding of what is allowed
  // if (id.match(ID_REGEX) === null) {
  //   return new InvalidEntityIdError(
  //     id,
  //     `Id must match regex ${ID_REGEX.toString()}.`
  //   );
  // }
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
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  variables: Record<string, any>
): QueryWhere<M, CN> {
  return statements.map((filter) => {
    if ('exists' in filter) return filter;
    if (!(filter instanceof Array)) {
      if (!(filter instanceof Array)) {
        return {
          ...filter,
          filters: replaceVariablesInFilterStatements(
            filter.filters,
            variables
          ),
        };
      }
    }
    const replacedValue = replaceVariable(filter[2], variables);
    return [filter[0], filter[1], replacedValue] as FilterStatement<M, CN>;
  });
}

async function loadVariableValue(executionContext: FetchExecutionContext) {}

export function replaceVariable(
  target: any,
  variables: Record<string, any> = {}
) {
  if (!isValueVariable(target)) return target;
  const [scope, key] = getVariableComponents(target);
  if (scope) {
    // new variables will have a scope
    const scopeVars = variables[scope];
    // Traverse scopeVars to find the variable
    const path = key.split('.');
    let current = scopeVars;
    for (const part of path) {
      if (current == null) {
        // console.warn(new SessionVariableNotFoundError(target));
        throw new SessionVariableNotFoundError(target);
        return undefined;
      }
      current = current[part];
    }
    return current;
  } else {
    // old variables will not
    if (key in variables) return variables[key];
    // console.warn(new SessionVariableNotFoundError(target));
    throw new SessionVariableNotFoundError(target);
    return undefined;
  }
}

export function* filterStatementIterator<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>
): Generator<FilterStatement<M, CN> | SubQueryFilter> {
  for (const statement of statements) {
    if (!(statement instanceof Array) && 'filters' in statement) {
      yield* filterStatementIterator(statement.filters);
    } else {
      yield statement;
    }
  }
}

export function someFilterStatements<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  someFunction: (statement: SubQueryFilter | FilterStatement<M, CN>) => boolean
): boolean {
  for (const statement of filterStatementIterator(statements)) {
    if (someFunction(statement)) return true;
  }
  return false;
}

export function mapFilterStatements<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  mapFunction: (
    statement: SubQueryFilter | FilterStatement<M, CN>
  ) => SubQueryFilter | FilterStatement<M, CN>
): QueryWhere<M, CN> {
  return statements.map((statement) => {
    if ('exists' in statement) return statement;
    if (!(statement instanceof Array) && 'filters' in statement) {
      statement.filters = mapFilterStatements(statement.filters, mapFunction);
    }
    return mapFunction(statement as FilterStatement<M, CN>);
  });
}

export function everyFilterStatement<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  everyFunction: (statement: FilterStatement<M, CN>) => boolean
): boolean {
  return statements.every((filter) => {
    if (!(filter instanceof Array) && 'filters' in filter) {
      return everyFilterStatement(filter.filters, everyFunction);
    }
    // TODO should this traverse sub-queries?
    if ('exists' in filter) return true;
    return everyFunction(filter);
  });
}

export async function getSchemaTriples(tripleStore: TripleStoreApi) {
  return tripleStore.findByEntity(appendCollectionToId('_metadata', '_schema'));
}

export async function readSchemaFromTripleStore(tripleStores: TripleStoreApi) {
  const schemaTriples = await getSchemaTriples(tripleStores);
  const schema =
    schemaTriples.length > 0 ? triplesToSchema(schemaTriples) : undefined;
  return {
    schema,
    schemaTriples,
  };
}

export type StoreSchema<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? {
        version: number;
        collections: M;
      }
    : M extends undefined
    ? undefined
    : never;

export async function overrideStoredSchema<M extends Models<any, any>>(
  db: DB<M>,
  schema: StoreSchema<M>
): Promise<{
  successful: boolean;
  issues: PossibleDataViolations[];
}> {
  if (!schema) return { successful: false, issues: [] };
  let tripleStore = db.tripleStore;
  const result = await tripleStore.transact(async (tx) => {
    const currentSchema = await readSchemaFromTripleStore(tx);
    let issues: PossibleDataViolations[] = [];
    if (currentSchema.schema) {
      const diff = diffSchemas(currentSchema.schema, schema);
      issues = await getSchemaDiffIssues(db, diff);
      if (
        issues.length > 0 &&
        issues.some((issue) => issue.violatesExistingData)
      )
        return { successful: false, issues };

      diff.length > 0 &&
        db.logger.info(`applying ${diff.length} attribute changes to schema`);
    }

    const existingTriples = await tx.findByEntity(
      appendCollectionToId('_metadata', '_schema')
    );
    await tx.deleteTriples(existingTriples);

    const triples = schemaToTriples(schema);
    // TODO use tripleStore.setValues
    const ts = await tx.clock.getNextTimestamp();
    const normalizedTriples = triples.map(([e, a, v]) => ({
      id: e,
      attribute: a,
      value: v,
      timestamp: ts,
      expired: false,
    }));
    await tx.insertTriples(normalizedTriples);
    return { successful: true, issues };
  });
  return result?.output ?? { successful: false, issues: [] };
}

export function logSchemaChangeViolations(
  successful: boolean,
  issues: PossibleDataViolations[],
  logger?: Logger
) {
  const log = logger ?? console;
  log.warn(`Found ${issues.length} backwards incompatible schema changes.`);
  if (successful) {
    log.info('Schema update successful');
  } else {
    log.error('Schema update failed. Please resolve the following issues:');
    const problematicIssues = issues.filter(
      (issue) => issue.violatesExistingData
    );
    const collectionIssueMap = problematicIssues.reduce((acc, issue) => {
      const collection = issue.context.collection;
      const existingIssues = acc.get(collection) ?? [];
      acc.set(collection, [...existingIssues, issue]);
      return acc;
    }, new Map<string, PossibleDataViolations[]>());
    collectionIssueMap.forEach((issues, collection) => {
      log.error(`\nCollection: '${collection}'`);
      issues.forEach(({ issue, violatesExistingData, context, cure }) => {
        if (!violatesExistingData) return;
        log.error(
          `\t'${context.attribute.join('.')}'
\t\tIssue: ${issue}
\t\tFix:   ${cure}`
        );
      });
    });
    log.info('');
  }
}

export function validateTriple(
  schema: Models<any, any>,
  attribute: Attribute,
  value: TupleValue
) {
  if (schema == undefined) {
    throw new NoSchemaRegisteredError(
      'Unable to run triple validation due to missing schema. This is unexpected and likely a bug.'
    );
  }
  const [modelName, ...path] = attribute;

  // TODO: remove this hack
  if (modelName === '_collection') return;
  if (modelName === '_metadata') return;

  const model = schema[modelName];
  if (!model) {
    throw new CollectionNotFoundError(modelName as string, schema);
  }

  const valueSchema = getSchemaFromPath(model.schema, path);
  // allow record marker for certain types
  if (value === '{}' && ['record', 'set'].includes(valueSchema.type)) return;
  // We expect you to set values at leaf nodes
  // Our leafs should be value types, so use that as check
  const isLeaf = (VALUE_TYPE_KEYS as unknown as string[]).includes(
    valueSchema.type
  );
  if (
    !isLeaf &&
    ['record', 'set'].includes(valueSchema.type) &&
    // @ts-ignore
    valueSchema.options?.nullable === true &&
    value === null
  )
    return;
  if (!isLeaf) {
    throw new InvalidSchemaPathError(
      path as string[],
      'Cannot set a non-value type to a value. For example, you may be attempting to set a value on a record type.'
    );
  }
  // Leaf values are an array [value, timestamp], so check value
  if (!valueSchema.validateTripleValue(value))
    throw new ValueSchemaMismatchError(
      modelName as string,
      attribute as string[],
      value
    );
}

export async function getCollectionSchema<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(tx: DB<M> | DBTransaction<M>, collectionName: CN) {
  const res = await tx.getSchema();
  const { collections } = res ?? {};
  if (!collections || !collections[collectionName]) return undefined;
  const collectionSchema = collections[collectionName] as CollectionFromModels<
    M,
    CN
  >;
  return collectionSchema;
}

export function addReadRulesToQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, collection: CollectionFromModels<M>): Q {
  if (collection?.rules?.read) {
    const updatedWhere = [
      ...(query.where ?? []),
      ...Object.values(collection.rules.read).flatMap((rule) => rule.filter),
    ];
    return { ...query, where: updatedWhere };
  }
  return query;
}

export function mergeQueries<M extends Models<any, any> | undefined>(
  queryA: CollectionQuery<M, any>,
  queryB?: CollectionQuery<M, any>
) {
  if (!queryB) return queryA;
  const mergedWhere = [...(queryA.where ?? []), ...(queryB.where ?? [])];
  const mergedSelect = [...(queryA.select ?? []), ...(queryB.select ?? [])];
  return { ...queryA, ...queryB, where: mergedWhere, select: mergedSelect };
}

// At some point it would be good to have a clear pipeline of data shapes for query builder -> query json -> query the execution engine reads
// Ex. things like .entityId are more sugar for users than valid values used by the execution engine
export function prepareQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, options: QueryPreparationOptions = {}) {
  let fetchQuery = { ...query };
  const collectionSchema = schema?.[
    fetchQuery.collectionName
  ] as CollectionFromModels<M, any>;
  if (collectionSchema && !options.skipRules) {
    fetchQuery = addReadRulesToQuery<M, Q>(fetchQuery, collectionSchema);
  }

  // Translate entityId helper to where clause filter
  if (fetchQuery.entityId) {
    fetchQuery.where = [
      // @ts-expect-error
      ['id', '=', fetchQuery.entityId],
      ...(fetchQuery.where ?? []),
    ];
  }

  const whereValidator = whereFilterValidator(
    schema,
    fetchQuery.collectionName
  );
  fetchQuery.where = mapFilterStatements(
    fetchQuery.where ?? [],
    (statement) => {
      // Validate filter
      whereValidator(statement);
      if (!Array.isArray(statement)) return statement;

      // Expand subquery statements
      let [prop, op, val] = statement;
      if (schema && fetchQuery.collectionName !== '_metadata') {
        // Validation should handle this existing
        const attributeType = getAttributeFromSchema(
          [(prop as string).split('.')[0]], // TODO: properly handle query in record...
          schema,
          fetchQuery.collectionName
        )!;
        if (attributeType.type === 'query') {
          const [_collectionName, ...path] = (prop as string).split('.');
          const subquery = { ...attributeType.query };
          // As we expand subqueries, "bump" the variable names
          if (isValueVariable(val)) {
            val = '$' + bumpSubqueryVar(val.slice(1));
          }
          subquery.where = [...subquery.where, [path.join('.'), op, val]];
          return {
            exists: prepareQuery(subquery, schema, options),
          };
        }
      }
      // TODO: should be integrated into type system
      return [prop, op, val instanceof Date ? val.toISOString() : val];
    }
  );
  // TODO: need to find a better place to apply schema transformations (see where too)
  if (fetchQuery.after) {
    const [cursor, inclusive] = fetchQuery.after;
    fetchQuery.after = [
      [
        cursor[0] instanceof Date ? cursor[0].toISOString() : cursor[0],
        appendCollectionToId(fetchQuery.collectionName, cursor[1]),
      ],
      inclusive,
    ];
  }
  if (collectionSchema) {
    // If we dont have a field selection, select all fields
    // Helps guard against 'include' injection causing issues as well
    if (!fetchQuery.select) {
      const selectAllProps = Object.entries(
        collectionSchema.schema.properties as Record<string, DataType>
      )
        .filter(([_key, definition]) => definition.type !== 'query')
        .map(([key, _definition]) => key);
      //@ts-expect-error
      fetchQuery.select = selectAllProps;
    }
    if (fetchQuery.order) {
      // Validate that the order by fields
      fetchQuery.order.every(([field, _direction]) => {
        if (!schema) return true;
        const { valid, path, reason } = validateIdentifier(
          field,
          schema,
          fetchQuery.collectionName,
          (dataType, i, path) => {
            if (!dataType) return { valid: false, reason: 'Path not found' };
            if (
              i === path.length - 1 &&
              (dataType.type === 'query' ||
                dataType.type === 'set' ||
                dataType.type === 'record')
            ) {
              return {
                valid: false,
                reason: 'Order by field is not sortable',
              };
            }
            if (dataType.type === 'query' && dataType.cardinality !== 'one')
              return {
                valid: false,
                reason:
                  'Order by field is a query with cardinality not equal to one',
              };
            return { valid: true };
          }
        );
        if (!valid) {
          throw new InvalidOrderClauseError(
            `Order by field ${field} is not valid: ${reason} at path ${path}`
          );
        }
        return true;
      });
    }
  }

  if (fetchQuery.include) {
    addSubsSelectsFromIncludes(fetchQuery, schema);
  }

  return fetchQuery;
}

function whereFilterValidator<M extends Models<any, any> | undefined>(
  schema: M,
  collectionName: string
): (fitler: WhereFilter<M, any>) => boolean {
  return (statement) => {
    // TODO: add helper function to determine when we should(n't) schema check (ie schemaless and _metadata)
    if (!schema) return true;
    if (collectionName === '_metadata') return true;
    if ('exists' in statement) return true;
    // I believe these are handled as we expand statements in the mapFilterStatements function
    if ('mod' in statement) return true;

    const [prop, op, val] = statement;
    const { valid, path, reason } = validateIdentifier(
      prop,
      schema,
      collectionName,
      (dataType, i, path) => {
        if (!dataType) return { valid: false, reason: 'Path not found' };
        // TODO: check if operator is valid for the type and use that to determine if it's valid
        if (
          i === path.length - 1 &&
          (dataType.type === 'query' || dataType.type === 'record')
        ) {
          return {
            valid: false,
            reason: 'Where filter is not operable',
          };
        }
        return { valid: true };
      }
    );
    if (!valid) {
      throw new InvalidWhereClauseError(
        `Where filter ${JSON.stringify([
          prop,
          op,
          val,
        ])} is not valid: ${reason} at path ${path}`
      );
    }
    return true;
  };
}

function addSubsSelectsFromIncludes<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(query: CollectionQuery<M, CN>, schema: M) {
  if (!query.include) return query;
  const collectionSchema = schema[query.collectionName];
  for (const [relationName, extraQuery] of Object.entries(
    query.include as Record<string, CollectionQuery<M, any>>
  )) {
    const attributeType = getSchemaFromPath(collectionSchema.schema!, [
      relationName,
    ]);
    if (attributeType.type !== 'query') {
      throw new Error(
        `${relationName} is not an existing relationship in ${query.collectionName} schema`
      );
    }
    if (!query.select) query.select = [];
    let additionalQuery = extraQuery;
    if (additionalQuery && additionalQuery.include) {
      additionalQuery = addSubsSelectsFromIncludes(
        { ...extraQuery, collectionName: attributeType.query.collectionName },
        schema
      );
    }
    const merged = mergeQueries(attributeType.query, additionalQuery);
    const subquerySelection: RelationSubquery<M> = {
      attributeName: relationName,
      subquery: merged,
      cardinality: attributeType.cardinality,
    };

    query.select.push(subquerySelection);
  }
  return query;
}

export function fetchResultToJS<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, CollectionNameFromModels<M>>
>(
  results: TimestampedFetchResult<Q>,
  schema: M,
  collectionName: CollectionNameFromModels<M>
) {
  results.forEach((entity, id) => {
    results.set(id, convertEntityToJS(entity, schema, collectionName));
  });
  return results as FetchResult<Q>;
}

export function isValueVariable(value: QueryValue): value is string {
  return typeof value === 'string' && value.startsWith('$');
}

const VARIABLE_SCOPES = ['global', 'session', 'query'];

export function getVariableComponents(
  variable: string
): [scope: string | undefined, key: string] {
  const components = variable.slice(1).split('.');
  if (components.length < 1)
    throw new TriplitError(`Invalid variable: ${variable}`);
  if (components.length === 1) return [undefined, components[0]];

  // For backwards compatability, we allow non-scoped variables
  if (isScopedVariable(components[0])) {
    return [components[0], components.slice(1).join('.')];
  } else {
    return [undefined, components.join('.')];
  }
}

function isScopedVariable(scope: string | undefined): scope is string {
  return VARIABLE_SCOPES.includes(scope ?? '') || !isNaN(parseInt(scope ?? ''));
}
