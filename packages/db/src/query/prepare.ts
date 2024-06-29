import { bumpSubqueryVar } from '../collection-query.js';
import { DataType } from '../data-types/base.js';
import { appendCollectionToId, isValueVariable } from '../db-helpers.js';
import { CollectionFromModels, CollectionNameFromModels } from '../db.js';
import {
  IncludedNonRelationError,
  InvalidCollectionNameError,
  InvalidFilterError,
  InvalidOrderClauseError,
  InvalidSelectClauseError,
  InvalidWhereClauseError,
  RelationDoesNotExistError,
  TriplitError,
} from '../errors.js';
import {
  exists,
  isBooleanFilter,
  isExistsFilter,
  isFilterGroup,
  isSubQueryFilter,
} from '../query.js';
import {
  createSchemaTraverser,
  getAttributeFromSchema,
} from '../schema/schema.js';
import { Models } from '../schema/types';
import {
  CollectionQuery,
  FilterStatement,
  QueryWhere,
  RelationSubquery,
  RelationshipExistsFilter,
  SubQueryFilter,
  WhereFilter,
} from './types/index.js';

export interface QueryPreparationOptions {
  skipRules?: boolean;
}

// At some point it would be good to have a clear pipeline of data shapes for query builder -> query json -> query the execution engine reads
// Ex. things like .entityId are more sugar for users than valid values used by the execution engine
export function prepareQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, options: QueryPreparationOptions = {}) {
  let fetchQuery = { ...query };

  // Validate collection name
  validateCollectionName(fetchQuery, schema);

  // Determine selects
  const select = getQuerySelects(fetchQuery, schema, options);
  const include = getQueryInclude(fetchQuery, schema, options);

  // Determine filters
  const where = getQueryFilters(fetchQuery, schema, options);

  // Determine order
  const order = getQueryOrder(fetchQuery, schema, options);

  // Determine after
  const after = getQueryAfter(fetchQuery, schema, options);

  return {
    ...query,
    select,
    include,
    where,
    order,
    after,
  };
}

function getQuerySelects<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, _options: QueryPreparationOptions) {
  // If undefined, treat as select all
  if (!query.select) return query.select as undefined;

  // If no schema, return the select as is
  if (!schema) return [...query.select];

  // Validate selects
  for (const select of query.select) {
    const { valid, path, reason } = validateIdentifier(
      select,
      schema,
      query.collectionName,
      (dataType, i, path) => {
        if (!dataType) return { valid: false, reason: 'Path not found' };
        if (dataType.type === 'query') {
          return {
            valid: false,
            reason:
              "Cannot select into relationships, please use 'include' instead",
          };
        }

        return { valid: true };
      }
    );
    if (!valid) {
      throw new InvalidSelectClauseError(
        `Select field ${select} is not valid: ${reason} at path ${path}`
      );
    }
  }

  return [...query.select];
}

function isSystemCollection(collectionName: string) {
  return collectionName === '_metadata';
}

function validateCollectionName<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M) {
  const collectionName = query.collectionName;
  const isString = typeof collectionName === 'string';
  if (!isString)
    throw new InvalidCollectionNameError(
      collectionName,
      'Collection name must be a string'
    );
  if (!!schema) {
    if (!schema[collectionName] && !isSystemCollection(collectionName))
      throw new InvalidCollectionNameError(
        collectionName,
        `Collection '${collectionName}' does not exist in the schema`
      );
  }
}

function getQueryInclude<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, options: QueryPreparationOptions) {
  if (!schema) return query.include;
  if (!query.include) return query.include;
  //   addSubsSelectsFromIncludes(query, schema);
  const inclusions: any = {}; // TODO: type this
  for (const [relationName, relation] of Object.entries(
    query.include as Record<string, RelationSubquery<M, any> | null>
  )) {
    const attributeType = getAttributeFromSchema(
      relationName.split('.'),
      schema,
      query.collectionName
    );

    if (attributeType && attributeType.type === 'query') {
      // TODO: this might be wrong
      let additionalQuery =
        // @ts-expect-error TODO: figure out proper typing of include here, this is where it would be helpful to know the difference between a CollectionQuery and Prepared<CollectionQuery>
        relation as CollectionQuery<M, any> | undefined;
      const merged = mergeQueries({ ...attributeType.query }, additionalQuery);
      const subquerySelection = {
        subquery: prepareQuery(merged, schema, options),
        cardinality: attributeType.cardinality,
      };
      inclusions[relationName] = subquerySelection;
      //   query.include = { ...query.include, [relationName]: subquerySelection };
    } else if (relation?.subquery) {
      inclusions[relationName] = relation;
      //   query.include = { ...query.include, [relationName]: relation };
    } else {
      if (!attributeType) {
        throw new RelationDoesNotExistError(relationName, query.collectionName);
      }
      throw new IncludedNonRelationError(relationName, query.collectionName);
    }
  }
  return inclusions;
}

function getQueryFilters<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, options: QueryPreparationOptions): QueryWhere<M, any> {
  const filters: QueryWhere<M, any> = query.where ? [...query.where] : [];

  // Translate entityId helper to where clause filter
  if (query.entityId) {
    filters.push(
      // @ts-expect-error
      ['id', '=', query.entityId]
    );
  }

  if (schema && !options.skipRules) {
    const ruleFilters = getReadRuleFilters(schema, query.collectionName);
    if (ruleFilters?.length > 0)
      filters.push(
        // @ts-expect-error
        ...ruleFilters
      );
  }

  const whereValidator = whereFilterValidator(schema, query.collectionName);
  return mapFilterStatements(
    filters,
    // @ts-expect-error
    (statement) => {
      // Validate filter
      whereValidator(statement);
      // Turn exists filter into a subquery
      if (isExistsFilter(statement)) {
        const { relationship, query: statementQuery } = statement;
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
          query.collectionName
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
          ? [exists(rest.join('.') as string as any, statementQuery)]
          : statementQuery?.where;

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
      if (schema && !isSystemCollection(query.collectionName)) {
        // Validation should handle this existing
        const attributeType = getAttributeFromSchema(
          [(prop as string).split('.')[0]], // TODO: properly handle query in record...
          schema,
          query.collectionName
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
}

function getReadRuleFilters(
  schema: Models<any, any>,
  collectionName: CollectionFromModels<any, any>
) {
  return Object.values(schema?.[collectionName]?.rules?.read ?? {}).flatMap(
    (rule) => rule.filter
  );
}

function getQueryOrder<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, schema: M, _options: QueryPreparationOptions) {
  if (!query.order) return query.order as undefined;
  if (!schema) return [...query.order];
  // Validate that the order by fields exist and are sortable
  for (const [field, _direction] of query.order) {
    const { valid, path, reason } = validateIdentifier(
      field,
      schema,
      query.collectionName,
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
  }
  return [...query.order];
}

function getQueryAfter<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, _schema: M, _options: QueryPreparationOptions) {
  if (!query.after) return query.after as undefined;
  if (!query.order || query.order.length === 0) {
    // TODO: make more specific
    // TODO: check to make sure this is correct?
    throw new TriplitError('Cannot use after without an order clause');
  }
  // Could validate the cursor matches the order by field type
  // If we support multiple cursors we could validate that there is a cursor for each order by field

  const [cursor, inclusive] = query.after;
  const after = [
    [
      // TODO: need to find a better place to apply schema transformations (see where too)
      cursor[0] instanceof Date ? cursor[0].toISOString() : cursor[0],
      appendCollectionToId(query.collectionName, cursor[1]),
    ],
    inclusive,
  ];
  return after;
}

function whereFilterValidator<M extends Models<any, any> | undefined>(
  schema: M,
  collectionName: string
): (filter: WhereFilter<M, any>) => boolean {
  return (statement) => {
    // TODO: add helper function to determine when we should(n't) schema check (ie schemaless and _metadata)
    if (!schema) return true;
    if (collectionName === '_metadata') return true;
    if (isSubQueryFilter(statement)) return true;
    if (isExistsFilter(statement)) return true;

    // I believe these are handled as we expand statements in the mapFilterStatements function
    if (isFilterGroup(statement)) return true;
    if (isBooleanFilter(statement)) return true;
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

function mergeQueries<M extends Models<any, any> | undefined>(
  queryA: CollectionQuery<M, any>,
  queryB?: CollectionQuery<M, any>
) {
  if (!queryB) return queryA;
  const mergedWhere = [...(queryA.where ?? []), ...(queryB.where ?? [])];
  const mergedSelect = [...(queryA.select ?? []), ...(queryB.select ?? [])];
  return { ...queryA, ...queryB, where: mergedWhere, select: mergedSelect };
}

function mapFilterStatements<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  mapFunction: (
    statement:
      | FilterStatement<M, CN>
      | SubQueryFilter
      | RelationshipExistsFilter<M, CN>
      | boolean
  ) =>
    | FilterStatement<M, CN>
    | SubQueryFilter
    | RelationshipExistsFilter<M, CN>
    | boolean
): QueryWhere<M, CN> {
  return statements.map((statement) => {
    if (isFilterGroup(statement)) {
      statement.filters = mapFilterStatements(statement.filters, mapFunction);
      return statement;
    }
    return mapFunction(statement);
  });
}

/**
 * Validates an identifier path based on a validator function. The validator function is called for each part of the path.
 */
function validateIdentifier<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(
  identifier: string,
  schema: M,
  collectionName: CN,
  validator: (
    dataType: DataType | undefined,
    i: number,
    path: string[]
  ) => {
    valid: boolean;
    reason?: string;
  }
): { valid: boolean; path?: string; reason?: string } {
  let schemaTraverser = createSchemaTraverser(schema, collectionName);
  const attrPath = identifier.split('.');
  let traversedPath: string[] = [];
  for (let i = 0; i < attrPath.length; i++) {
    const attr = attrPath[i];
    schemaTraverser = schemaTraverser.get(attr);
    traversedPath.push(attr);
    const { valid, reason } = validator(schemaTraverser.current, i, attrPath);
    if (!valid) {
      return { valid, path: traversedPath.join('.'), reason };
    }
  }
  return { valid: true };
}
