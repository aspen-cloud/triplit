import { validateIdentifier } from '../collection-query.js';
import { DataType } from '../data-types/base.js';
import { appendCollectionToId, isValueVariable } from '../db-helpers.js';
import { CollectionFromModels, CollectionNameFromModels } from '../db.js';
import {
  IncludedNonRelationError,
  InvalidFilterError,
  InvalidOrderClauseError,
  InvalidWhereClauseError,
  RelationDoesNotExistError,
} from '../errors.js';
import {
  exists,
  isBooleanFilter,
  isExistsFilter,
  isFilterGroup,
  isSubQueryFilter,
} from '../query.js';
import { getAttributeFromSchema } from '../schema/schema.js';
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

  // Determine selects
  // Filter down selects based on permissions
  // Validate selects
  // If undefined, leave as undefined (supports schemaless, check if this works...)

  // Determine filters
  // Add filters based on permissions
  // Validate filters
  // Parse filters as needed

  // Determine order
  // Filter down order based on permissions (throw or ignore?)
  // Validate order

  // Determine after
  // Parse after as needed

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

function addReadRulesToQuery<
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
