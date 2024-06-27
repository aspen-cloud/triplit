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
  RelationDoesNotExistError,
  IncludedNonRelationError,
  InvalidFilterError,
} from './errors.js';
import {
  QueryWhere,
  FilterStatement,
  SubQueryFilter,
  CollectionQuery,
  QueryValue,
  WhereFilter,
  RelationSubquery,
  RelationshipExistsFilter,
} from './query/types';
import {
  isSubQueryFilter,
  isFilterGroup,
  isFilterStatement,
  isExistsFilter,
  exists,
} from './query.js';
import {
  getSchemaFromPath,
  schemaToTriples,
  triplesToSchema,
  getAttributeFromSchema,
} from './schema/schema.js';
import { Model, Models } from './schema/types';
import {
  diffSchemas,
  getSchemaDiffIssues,
  PossibleDataViolations,
} from './schema/diff.js';
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
  TimestampedFetchResult,
  bumpSubqueryVar,
  getRelationPathsFromIdentifier,
  validateIdentifier,
  convertEntityToJS,
} from './collection-query.js';
import { Logger } from '@triplit/types/logger';
import { prefixVariables } from './utils.js';
import { FetchResult } from './query/types';

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
    if (isFilterGroup(filter))
      return {
        ...filter,
        filters: replaceVariablesInFilterStatements(filter.filters, variables),
      };
    if (isFilterStatement(filter)) {
      const replacedValue = replaceVariable(filter[2], variables);
      return [filter[0], filter[1], replacedValue];
    }
    return filter;
  });
}

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
): Generator<
  FilterStatement<M, CN> | SubQueryFilter | RelationshipExistsFilter<M, CN>
> {
  for (const statement of statements) {
    if (isFilterGroup(statement)) {
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
  someFunction: (
    statement:
      | SubQueryFilter
      | FilterStatement<M, CN>
      | RelationshipExistsFilter<M, CN>
  ) => boolean
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
    statement:
      | FilterStatement<M, CN>
      | SubQueryFilter
      | RelationshipExistsFilter<M, CN>
  ) => FilterStatement<M, CN> | SubQueryFilter | RelationshipExistsFilter<M, CN>
): QueryWhere<M, CN> {
  return statements.map((statement) => {
    if (isFilterGroup(statement)) {
      statement.filters = mapFilterStatements(statement.filters, mapFunction);
      return statement;
    }
    return mapFunction(statement);
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
  const result = await db.transact(
    async (tx) => {
      const currentSchema = await tx.getSchema();
      let issues: PossibleDataViolations[] = [];
      if (currentSchema) {
        const diff = diffSchemas(currentSchema, schema);

        // If no differences, return early
        if (diff.length === 0) return { successful: true, issues };

        issues = await getSchemaDiffIssues(tx, diff);
        if (
          issues.length > 0 &&
          issues.some((issue) => issue.violatesExistingData)
        )
          return { successful: false, issues };

        diff.length > 0 &&
          db.logger.info(`applying ${diff.length} attribute changes to schema`);
      }

      const existingTriples = await tx.storeTx.findByEntity(
        appendCollectionToId('_metadata', '_schema')
      );
      await tx.storeTx.deleteTriples(existingTriples);

      const triples = schemaToTriples(schema);
      // TODO use tripleStore.setValues
      const ts = await tx.storeTx.clock.getNextTimestamp();
      const normalizedTriples = triples.map(([e, a, v]) => ({
        id: e,
        attribute: a,
        value: v,
        timestamp: ts,
        expired: false,
      }));
      await tx.storeTx.insertTriples(normalizedTriples);
      return { successful: true, issues };
    },
    {
      // This basically ensures we use the old schema to perform data checks before we apply the new schema
      dangerouslyBypassSchemaInitialization: true,
    }
  );
  return result?.output ?? { successful: false, issues: [] };
}

export function logSchemaChangeViolations(
  successful: boolean,
  issues: PossibleDataViolations[],
  logger?: Logger
) {
  const log = logger ?? console;
  const compatibleIssuesMessage = `Found ${issues.length} backwards incompatible schema changes.`;
  if (issues.length > 0) {
    log.warn(compatibleIssuesMessage);
  } else {
    log.info(compatibleIssuesMessage);
  }
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
    // @ts-expect-error
    (statement) => {
      // Validate filter
      whereValidator(statement);
      // Turn exists filter into a subquery
      if (isExistsFilter(statement)) {
        const { relationship, query } = statement;
        if (!schema)
          throw new InvalidFilterError(
            'A schema is required to execute an exists filter'
          );

        const relationshipPath = relationship.split('.');
        const [first, ...rest] = relationshipPath;
        const isPropertyNested = rest.length > 0;
        const attributeType = getAttributeFromSchema(
          [first],
          schema,
          fetchQuery.collectionName
        );
        if (!attributeType)
          throw new InvalidFilterError(
            `Could not find property '${relationship}' in the schema`
          );

        if (attributeType.type !== 'query')
          throw new InvalidFilterError(
            'Cannot execute an exists filter on a non-relation property'
          );

        const subquery = { ...attributeType.query };

        // If property is nested, create a new exists filter for the subquery
        const filterToAdd = isPropertyNested
          ? [exists(rest.join('.') as string as any, query)]
          : query?.where;

        subquery.where = [
          ...(attributeType.query.where ?? []),
          ...(filterToAdd ?? []),
        ];

        return {
          exists: prepareQuery(subquery, schema, options),
        };
      }
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
            // @ts-expect-error
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

  if (!query.select) query.select = [];

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
    if (isSubQueryFilter(statement)) return true;
    if (isExistsFilter(statement)) return true;
    // I believe these are handled as we expand statements in the mapFilterStatements function
    if (isFilterGroup(statement)) return true;

    const [prop, op, val] = statement;
    const { valid, path, reason } = validateIdentifier(
      prop,
      schema,
      collectionName as CollectionNameFromModels<NonNullable<M>>,
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
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(query: CollectionQuery<M, CN>, schema: M) {
  if (!query.include) return query;
  // TODO: typescript should handle schema = undefined, but it isn't
  const collectionSchema = schema?.[query.collectionName];
  if (!collectionSchema) return query;
  for (const [relationName, relation] of Object.entries(
    query.include as Record<string, RelationSubquery<M, any> | null>
  )) {
    const attributeType = getAttributeFromSchema(
      relationName.split('.'),
      schema,
      // @ts-expect-error TODO: figure out proper typing of collectionName
      query.collectionName
    );

    if (attributeType && attributeType.type === 'query') {
      let additionalQuery =
        // @ts-expect-error TODO: figure out proper typing of include here, this is where it would be helpful to know the difference between a CollectionQuery and Prepared<CollectionQuery>
        relation as CollectionQuery<M, any> | undefined;
      if (additionalQuery && additionalQuery.include) {
        additionalQuery = addSubsSelectsFromIncludes(
          {
            ...additionalQuery,
            collectionName: attributeType.query.collectionName,
          },
          schema
        );
      }
      const merged = mergeQueries({ ...attributeType.query }, additionalQuery);
      const subquerySelection = {
        subquery: merged,
        cardinality: attributeType.cardinality,
      };
      query.include = { ...query.include, [relationName]: subquerySelection };
    } else if (relation?.subquery) {
      query.include = { ...query.include, [relationName]: relation };
    } else {
      if (!attributeType) {
        throw new RelationDoesNotExistError(relationName, query.collectionName);
      }
      throw new IncludedNonRelationError(relationName, query.collectionName);
    }
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

export function isValueReferentialVariable(value: QueryValue): value is string {
  if (!isValueVariable(value)) return false;
  const [scope, key] = getVariableComponents(value);

  if (scope === undefined && key !== 'SESSION_USER_ID') return true;
  return !isNaN(parseInt(scope ?? ''));
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
