import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  InvalidSchemaPathError,
  CollectionNotFoundError,
  NoSchemaRegisteredError,
  SessionVariableNotFoundError,
  ValueSchemaMismatchError,
  TriplitError,
} from './errors.js';
import {
  QueryWhere,
  FilterStatement,
  SubQueryFilter,
  CollectionQuery,
  QueryValue,
  RelationshipExistsFilter,
  FetchResultEntity,
} from './query/types/index.js';
import { isFilterGroup, isFilterStatement } from './query.js';
import { getSchemaFromPath, triplesToSchema } from './schema/schema.js';
import { schemaToTriples } from './schema/export/index.js';
import { Models, StoreSchema } from './schema/types/index.js';
import {
  diffSchemas,
  getSchemaDiffIssues,
  PossibleDataViolations,
} from './schema/diff.js';
import { TripleStoreApi } from './triple-store.js';
import { VALUE_TYPE_KEYS } from './data-types/constants.js';
import DB, { CollectionFromModels, CollectionNameFromModels } from './db.js';
import { DBTransaction } from './db-transaction.js';
import { Attribute, TupleValue } from './triple-store-utils.js';
import { convertEntityToJS } from './collection-query.js';
import { Logger } from '@triplit/types/logger';
import { FetchResult } from './query/types/index.js';
import { genToArr } from './utils/generator.js';
import { COLLECTION_MARKER, OBJECT_MARKER } from './entity.js';

const ID_SEPARATOR = '#';

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
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(
  statements: QueryWhere<M, CN>,
  variables: Record<string, any>
): QueryWhere<M, CN> {
  return statements.map((filter) => {
    if (isFilterGroup(filter)) {
      return {
        ...filter,
        filters: replaceVariablesInFilterStatements(filter.filters, variables),
      };
    }
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
      current = current[part];
      if (current == null) {
        // Allow referential variables to be undefined
        if (varScopeType(scope) === 'relational') return undefined;
        throw new SessionVariableNotFoundError(target, scope, scopeVars);
      }
    }
    return current;
  } else {
    // if no scope, allow missing variable
    if (key in variables) return variables[key];
    // console.warn(new SessionVariableNotFoundError(target));
    // throw new SessionVariableNotFoundError(target);
    return undefined;
  }
}

export function* filterStatementIterator<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(
  statements: QueryWhere<M, CN>
): Generator<
  | FilterStatement<M, CN>
  | SubQueryFilter<M>
  | RelationshipExistsFilter<M, CN>
  | boolean
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
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>(
  statements: QueryWhere<M, CN>,
  someFunction: (
    statement:
      | SubQueryFilter<M>
      | FilterStatement<M, CN>
      | RelationshipExistsFilter<M, CN>
      | boolean
  ) => boolean
): boolean {
  for (const statement of filterStatementIterator(statements)) {
    if (someFunction(statement)) return true;
  }
  return false;
}

export async function getSchemaTriples(tripleStore: TripleStoreApi) {
  return genToArr(
    tripleStore.findByEntity(appendCollectionToId('_metadata', '_schema'))
  );
}

export async function readSchemaFromTripleStore<M extends Models = Models>(
  tripleStores: TripleStoreApi
) {
  const schemaTriples = await getSchemaTriples(tripleStores);
  const schema =
    schemaTriples.length > 0 ? triplesToSchema<M>(schemaTriples) : undefined;
  return {
    schema,
    schemaTriples,
  };
}

export async function overrideStoredSchema<M extends Models>(
  db: DB<M>,
  schema: StoreSchema<M> | undefined,
  { failOnBackwardsIncompatibleChange = false } = {}
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

        // TODO if `failOnBackwardsIncompatibleChange` is true, we should skip
        // data checks for faster performance
        if (failOnBackwardsIncompatibleChange && issues.length > 0) {
          return { successful: false, issues };
        }
        if (
          issues.length > 0 &&
          issues.some((issue) => issue.violatesExistingData)
        )
          return { successful: false, issues };

        diff.length > 0 &&
          db.logger.info(`applying ${diff.length} changes to schema`);
      }

      const existingTriples = await tx.storeTx.findByEntity(
        appendCollectionToId('_metadata', '_schema')
      );
      await tx.storeTx.deleteTriples(await genToArr(existingTriples));

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
  {
    logger,
    forcePrintIssues = false,
  }: { logger?: Logger; forcePrintIssues?: boolean } = {}
) {
  const log = logger ?? (console as unknown as Logger);
  if (successful) {
    log.info('Schema update successful');
  } else {
    log.error('Schema update failed. Please resolve the following issues:');
  }
  const compatibleIssuesMessage = `Found ${issues.length} backwards incompatible schema changes.`;
  if (issues.length > 0) {
    log.warn(compatibleIssuesMessage);
  } else {
    log.info(compatibleIssuesMessage);
  }

  if (!successful || forcePrintIssues) {
    const problematicIssues = issues.filter(
      (issue) => forcePrintIssues || issue.violatesExistingData
    );
    logSchemaIssues(log, problematicIssues);
  }
}

function logSchemaIssues(logger: Logger, issues: PossibleDataViolations[]) {
  const collectionIssueMap = issues.reduce((acc, issue) => {
    const collection = issue.context.collection;
    const existingIssues = acc.get(collection) ?? [];
    acc.set(collection, [...existingIssues, issue]);
    return acc;
  }, new Map<string, PossibleDataViolations[]>());
  collectionIssueMap.forEach((issues, collection) => {
    logger.error(`\nCollection: '${collection}'`);
    issues.forEach(({ issue, context, cure }) => {
      logger.error(
        `\t'${context.attribute.join('.')}'
\t\tIssue: ${issue}
\t\tFix:   ${cure}`
      );
    });
  });
  logger.info('');
}

export function validateTriple(
  schema: Models,
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
  if (modelName === COLLECTION_MARKER) return;
  if (modelName === '_metadata') return;

  const model = schema[modelName];
  if (!model) {
    throw new CollectionNotFoundError(modelName as string, schema);
  }

  const valueSchema = getSchemaFromPath(model.schema, path);
  // allow record marker for certain types
  if (value === OBJECT_MARKER && ['record', 'set'].includes(valueSchema.type))
    return;
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
  M extends Models,
  CN extends CollectionNameFromModels<M>,
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

export function fetchResultToJS<
  M extends Models,
  Q extends CollectionQuery<M, CollectionNameFromModels<M>>,
>(
  results: Map<string, FetchResultEntity<M, Q>>,
  schema: M | undefined,
  collectionName: CollectionNameFromModels<M>
): FetchResult<M, Q> {
  return Array.from(results.values()).map((entity) =>
    convertEntityToJS(entity, schema, collectionName)
  );
}

export function isValueVariable(value: QueryValue): value is string {
  return typeof value === 'string' && value[0] === '$';
}

export function isValueReferentialVariable(value: QueryValue): value is string {
  if (!isValueVariable(value)) return false;
  const [scope, key] = getVariableComponents(value);

  if (scope === undefined && key !== 'SESSION_USER_ID') return true;
  return !isNaN(parseInt(scope ?? ''));
}

const VARIABLE_SCOPES = ['global', 'session', 'role', 'query']; // 'relational' is a type, but denoted by integers

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

export function varScopeType(scope: string): string {
  if (!isNaN(parseInt(scope))) return 'relational';
  return scope;
}

export function createVariable(
  scope: string | undefined,
  ...keys: string[]
): string {
  return `$${scope ? `${scope}.` : ''}${keys.join('.')}`;
}
