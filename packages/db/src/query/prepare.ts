import {
  bumpSubqueryVar,
  isQueryInclusionReference,
  isQueryInclusionShorthand,
  isQueryInclusionSubquery,
} from '../collection-query.js';
import { DataType } from '../data-types/types/index.js';
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
  and,
  exists,
  isBooleanFilter,
  isExistsFilter,
  isFilterGroup,
  isSubQueryFilter,
  or,
} from '../query.js';
import {
  getCollectionPermissions,
  SessionRole,
} from '../schema/permissions.js';
import {
  createSchemaTraverser,
  getAttributeFromSchema,
} from '../schema/schema.js';
import { Models } from '../schema/types/index.js';
import {
  CollectionQuery,
  FilterStatement,
  QueryWhere,
  RefQueryExtension,
  RelationshipExistsFilter,
  SubQueryFilter,
  WhereFilter,
} from './types/index.js';

export interface QueryPreparationOptions {
  skipRules?: boolean;
}

interface Session {
  roles?: SessionRole[];
}

// At some point it would be good to have a clear pipeline of data shapes for query builder -> query json -> query the execution engine reads
// Ex. things like .entityId are more sugar for users than valid values used by the execution engine
export function prepareQuery<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined,
  session: Session,
  options: QueryPreparationOptions = {}
): Q {
  let fetchQuery = { ...query };

  // Validate collection name
  validateCollectionName(fetchQuery, schema);

  // Determine selects
  const select = getQuerySelects(fetchQuery, schema, options);
  const include = getQueryInclude(fetchQuery, schema, session, options);

  // Determine filters
  const where = getQueryFilters(fetchQuery, schema, session, options);

  // Determine order
  const order = getQueryOrder(fetchQuery, schema, options);

  // Determine after
  const after = getQueryAfter(fetchQuery, schema, options);

  return {
    ...fetchQuery,
    select,
    include,
    where,
    order,
    after,
    vars: {
      ...(fetchQuery.vars ?? {}),
    },
  };
}

function getQuerySelects<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined,
  _options: QueryPreparationOptions
) {
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
        `Select field '${select}' is not valid: ${reason} at path '${path}'`
      );
    }
  }

  return [...query.select];
}

function isSystemCollection(collectionName: string) {
  return collectionName === '_metadata';
}

function validateCollectionName<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined
) {
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

function getQueryInclude<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined,
  session: Session,
  options: QueryPreparationOptions
) {
  if (!schema) return query.include;
  if (!query.include) return query.include;
  //   addSubsSelectsFromIncludes(query, schema);
  const inclusions: any = {}; // TODO: type this
  for (const [alias, relation] of Object.entries(query.include)) {
    // We have already prepared this statement
    if (isQueryInclusionSubquery(relation)) {
      inclusions[alias] = {
        subquery: prepareQuery(
          relation.subquery,
          schema as M,
          session,
          options
        ),
        cardinality: relation.cardinality,
      };
      continue;
    }

    let relationName: string;
    let additionalQuery: RefQueryExtension<M> | null;
    if (isQueryInclusionReference(relation)) {
      const { _rel, ...queryExt } = relation;
      relationName = _rel;
      additionalQuery = queryExt as RefQueryExtension<M>;
    } else if (isQueryInclusionShorthand(relation)) {
      relationName = alias;
      additionalQuery = null;
    } else {
      throw new TriplitError('Invalid inclusion format');
    }

    const attributeType = getAttributeFromSchema(
      relationName.split('.'),
      schema,
      query.collectionName
    );

    if (attributeType && attributeType.type === 'query') {
      const merged = mergeQueries<M>(
        { ...attributeType.query },
        // @ts-expect-error this is improperly typed because RefQueryExtension is a subset of CollectionQuery
        additionalQuery
      );
      const subquerySelection = {
        subquery: prepareQuery(merged, schema as M, session, options),
        cardinality: attributeType.cardinality,
      };
      inclusions[alias] = subquerySelection;
      //   query.include = { ...query.include, [relationName]: subquerySelection };
    } else {
      if (!attributeType) {
        throw new RelationDoesNotExistError(
          relationName,
          alias,
          query.collectionName
        );
      }

      throw new IncludedNonRelationError(
        relationName,
        alias,
        query.collectionName
      );
    }
  }
  return inclusions;
}

function getQueryFilters<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined,
  session: Session,
  options: QueryPreparationOptions
): QueryWhere<M> {
  const filters: QueryWhere<M> = query.where ? [...query.where] : [];

  // Translate entityId helper to where clause filter
  if (query.entityId) {
    filters.push(
      // @ts-expect-error
      ['id', '=', query.entityId]
    );
  }

  if (
    schema &&
    !isSystemCollection(query.collectionName) &&
    !options.skipRules
  ) {
    // Old permission system
    const ruleFilters = getReadRuleFilters(schema, query.collectionName);
    if (ruleFilters?.length > 0)
      filters.push(
        // @ts-expect-error
        ...ruleFilters
      );

    // New permission system
    const collectionPermissions = getCollectionPermissions(
      schema,
      query.collectionName
    );
    // If we have collection permissions, we should apply them, otherwise its permissionless
    if (collectionPermissions) {
      let permissionFilters: QueryWhere<M, any>[] = [];
      let hasMatch = false;
      if (session.roles) {
        for (const sessionRole of session.roles) {
          const permission = collectionPermissions[sessionRole.key]?.read;
          if (permission?.filter) {
            // Must opt in to the permission
            hasMatch = true;
            // TODO: handle empty arrays
            if (Array.isArray(permission.filter)) {
              permissionFilters.push(
                // @ts-expect-error
                permission.filter
              );
            }
          }
        }
      }
      if (!hasMatch) permissionFilters = [[false]];
      const permissionsWhere = or(permissionFilters.map((f) => and(f)));
      filters.push(permissionsWhere);
    }
  }

  const whereValidator = whereFilterValidator(schema, query.collectionName);
  return mapFilterStatements(filters, (statement) => {
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
        exists: prepareQuery(subquery, schema, session, options),
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
          val = '$' + bumpSubqueryVar(val.slice(1));
        }
        subquery.where = [...subquery.where, [path.join('.'), op, val]];
        return {
          exists: prepareQuery(subquery, schema, session, options),
        };
      }
    }
    // TODO: should be integrated into type system
    return [prop, op, val instanceof Date ? val.toISOString() : val];
  });
}

function getReadRuleFilters(
  schema: Models,
  collectionName: CollectionNameFromModels
): QueryWhere<any, any> {
  if (schema?.[collectionName]?.rules?.read)
    return Object.values(schema[collectionName].rules?.read ?? {}).flatMap(
      (rule) => rule.filter
    );

  return [];
}

function getQueryOrder<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  schema: M | undefined,
  _options: QueryPreparationOptions
) {
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
        `Order by field '${field}' is not valid: ${reason} at path '${path}'`
      );
    }
  }
  return [...query.order];
}

function getQueryAfter<M extends Models, Q extends CollectionQuery<M>>(
  query: Q,
  _schema: M | undefined,
  _options: QueryPreparationOptions
) {
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

function whereFilterValidator<
  M extends Models,
  CN extends CollectionNameFromModels<M>
>(
  schema: M | undefined,
  collectionName: CN
): (filter: WhereFilter<M, CN>) => boolean {
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
        ])} is not valid: ${reason} at path '${path}'`
      );
    }
    return true;
  };
}

function mergeQueries<M extends Models>(
  queryA: CollectionQuery<M, any>,
  queryB?: CollectionQuery<M, any>
) {
  if (!queryB) return queryA;
  const mergedWhere =
    !!queryA.where || !!queryB.where
      ? [...(queryA.where ?? []), ...(queryB.where ?? [])]
      : undefined;
  const mergedSelect =
    !!queryA.select || !!queryB.select
      ? [...(queryA.select ?? []), ...(queryB.select ?? [])]
      : undefined;
  return { ...queryA, ...queryB, where: mergedWhere, select: mergedSelect };
}

function mapFilterStatements<
  M extends Models,
  CN extends CollectionNameFromModels<M>
>(
  statements: QueryWhere<M, CN>,
  mapFunction: (
    statement:
      | FilterStatement<M, CN>
      | SubQueryFilter<M>
      | RelationshipExistsFilter<M, CN>
      | boolean
  ) =>
    | FilterStatement<M, CN>
    | SubQueryFilter<M>
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
  M extends Models,
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
