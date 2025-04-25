import type {
  CollectionQuery,
  QueryAfter,
  QueryWhere,
  ValueCursor,
  WhereFilter,
  QueryInclusions,
  QueryResultCardinality,
  RefQueryExtension,
  SchemaQuery,
  PreparedWhere,
  PreparedQuery,
  PreparedInclusions,
  PreparedWhereFilter,
  PreparedOrder,
} from './types/index.js';
import { DataType } from '../schema/data-types/types/index.js';
import {
  flipOperator,
  Models,
  PermissionOperations,
  SET_OP_PREFIX,
  SUPPORTED_OPERATIONS,
} from '../schema/index.js';
import {
  IncludedNonRelationError,
  InvalidCollectionNameError,
  InvalidFilterError,
  InvalidOrderClauseError,
  InvalidQueryCardinalityError,
  InvalidSelectClauseError,
  RelationDoesNotExistError,
  SessionVariableNotFoundError,
  TriplitError,
  InvalidQueryAfterError,
  InvalidQueryInclusionError,
  InvalidQueryLimitError,
  InvalidQueryWhereError,
} from '../errors.js';
import {
  and,
  or,
  exists,
  isBooleanFilter,
  isRelationshipExistsFilter,
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
} from '../filters.js';
import {
  getVariableComponents,
  isValueVariable,
  isVariableScopeRelational,
  safeIncrementQueryVars,
  safeIncrementSubqueryVar,
} from '../variables.js';
import { ValuePointer } from '../utils/value-pointer.js';
import { Session } from '../session.js';
import {
  getCollectionPermissions,
  isWritePermissionOperation,
} from '../permissions.js';
import {
  createSchemaEntriesIterator,
  getAttributeFromSchema,
  isTraversalRelationship,
  SchemaTraversalData,
  validateIdentifier,
} from '../schema/utilities.js';
import { simplifyQuery } from './simplify-query.js';
import { Type } from '../schema/data-types/type.js';
import {
  isQueryInclusionReference,
  isQueryInclusionShorthand,
  isQueryInclusionSubquery,
  isQueryResultCardinality,
} from '../subquery.js';

const ACCESS_DENIED_FILTER = Object.freeze([false]) as PreparedWhere;

/**
 * User facing prepare query options
 */
type PrepareQueryOptions = {
  applyPermission: PermissionOperations | undefined;
  // If false, prepareQuery will not replace static variables with their values
  // Another part of the code will need to handle variable replacement
  // TODO: make this required at the top level to make sure a dev is explicit about usage (do when this becomes a feature)
  // NOTE: this is an experimental feature
  replaceStaticVariables?: boolean;
};

/**
 * Internal prepare query options
 */
type PrepareQueryRecursiveOptions = Required<PrepareQueryOptions> & {
  isExpandingPermission: boolean;
  permissionStack: string[];
  queryStack: CollectionQuery[];
};

// export function prepareQuery<M extends Models<M> = Models>(
//   query: SchemaQuery<M>,
//   schema: M | undefined,
//   variables: Record<string, any>,
//   session: Session | undefined,
//   options: PrepareQueryOptions
// ): PreparedQuery;
export function prepareQuery(
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryOptions
): PreparedQuery {
  // Assign query variables, assume only the root query has vars set
  if (query.vars && !variables.$query) {
    variables = { ...variables, $query: query.vars };
  }

  const preparedQuery = prepareQueryRecursive(
    query,
    schema,
    variables,
    session,
    {
      applyPermission: options.applyPermission,
      isExpandingPermission: false,
      permissionStack: [],
      queryStack: [],
      replaceStaticVariables: options.replaceStaticVariables ?? true,
    }
  );

  return simplifyQuery(preparedQuery);
}

function prepareQueryRecursive(
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedQuery {
  options.queryStack.push(query);
  const prepared: PreparedQuery = {
    collectionName: prepareCollectionName(query, schema),
    select: prepareQuerySelects(query, schema),
    include: prepareQueryInclude(query, schema, variables, session, options),
    where: prepareQueryFilters(query, schema, variables, session, options),
    order: prepareQueryOrder(query, schema, variables, session, options),
    limit: prepareQueryLimit(query),
    after: prepareQueryAfter(query, schema),
  };
  options.queryStack.pop();
  return prepared;
}

// TODO: improve system collection detection in other prepare functions
function isSystemCollection(collectionName: string) {
  return collectionName === '_metadata';
}

/**
 * Validates the collection name
 */
function prepareCollectionName(
  query: CollectionQuery,
  schema: Models | undefined
) {
  const collectionName = query.collectionName;
  // Must exist
  if (!collectionName)
    throw new InvalidCollectionNameError(
      collectionName,
      'Collection name must be provided'
    );

  // Must be string
  const isString = typeof collectionName === 'string';
  if (!isString)
    throw new InvalidCollectionNameError(
      collectionName,
      'Collection name must be a string'
    );

  // If schema is provided, validate that the collection exists in the schema
  if (schema) {
    if (!schema[collectionName] && !isSystemCollection(collectionName))
      throw new InvalidCollectionNameError(
        collectionName,
        `Collection '${collectionName}' does not exist in the schema`
      );
  }
  return collectionName;
}

/**
 * Validates each provided select field
 */
function prepareQuerySelects(
  query: CollectionQuery,
  schema: Models | undefined
) {
  // If undefined, treat as select all
  if (!query.select) return query.select;

  // Validate selected fields
  for (const select of query.select) {
    // All must be strings
    if (typeof select !== 'string')
      throw new InvalidSelectClauseError(
        `Select field '${select}' is not a string`
      );

    // If schema is provided, validate that the field exists in the schema
    if (schema) {
      const { valid, path, reason } = validateIdentifier(
        select,
        schema,
        query.collectionName,
        (dataType, i, path) => {
          if (!dataType) return { valid: false, reason: 'Path not found' };
          if (isTraversalRelationship(dataType)) {
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
  }

  return [...query.select];
}

/**
 * Validates each provided include field, loads relationship from schemas as needed and prepares subqueries
 */
function prepareQueryInclude(
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedInclusions | undefined {
  if (!query.include) return query.include;
  const inclusions: PreparedInclusions = {};
  // Schemaless -> ensure everything is a valid subquery and prepare them
  // Schemaful -> Schemaless checks + transform each inferred clause
  for (let [alias, relation] of Object.entries(query.include)) {
    // load the relation if needed
    if (schema) {
      let relationName: string | undefined;
      let queryExtension: RefQueryExtension | null = null;
      // Shorthand just load the query
      if (isQueryInclusionShorthand(relation)) {
        // load relation
        relationName = alias;
      } else if (isQueryInclusionReference(relation)) {
        // load relation
        const { _extends, ...queryExt } = relation;
        relationName = _extends;
        queryExtension = queryExt;
      }

      // If no relationship name, should fall out to InvalidQueryInclusionError error throwing
      if (relationName) {
        // Load relationship from schema
        const relationDefinition = getAttributeFromSchema(
          relationName.split('.'),
          schema,
          query.collectionName
        );
        // If the relation is a query, merge the query with the extension and create a subquery
        if (relationDefinition && isTraversalRelationship(relationDefinition)) {
          const merged = mergeQueries(
            relationDefinition.query,
            // @ts-expect-error this is improperly typed because RefQueryExtension is a subset of CollectionQuery
            queryExtension
          );
          relation = {
            subquery: merged,
            cardinality: relationDefinition.cardinality,
          };
        } else {
          if (!relationDefinition) {
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
    }

    // At this point, relation should be a subquery
    if (!isQueryInclusionSubquery(relation)) {
      throw new InvalidQueryInclusionError(relation);
    }

    // Validate the cardinality
    if (!isQueryResultCardinality(relation.cardinality))
      throw new InvalidQueryCardinalityError(relation.cardinality);

    // Prepare the unprepared subquery
    const preparedQuery = prepareQueryRecursive(
      relation.subquery,
      schema,
      variables,
      session,
      options
    );
    inclusions[alias] = {
      subquery: preparedQuery,
      cardinality: relation.cardinality,
    };
  }

  return inclusions;
}

/**
 * Validates where clauses and transforms them to statements, groups, or subqueries
 * Applies permissions if specified in options
 * Replaces static variables, other vars handled by query engine
 */
export function prepareQueryFilters(
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedWhere | undefined {
  let inputFilters: QueryWhere = query.where ?? [];
  if (!Array.isArray(inputFilters))
    throw new InvalidQueryWhereError(
      query.where,
      'Where clause must be an array'
    );

  // Make a copy of the where clause
  inputFilters = [...inputFilters];

  // 1. transform input filters to valid filters
  // 2. transform permission filters (which have different variable requirements)
  // 3. merge the two
  const where = transformAndValidateFilters(
    inputFilters,
    query,
    schema,
    variables,
    session,
    options
  );

  const shouldApplyPermissions =
    options.applyPermission &&
    // if expanding permissions, dont apply again
    (!options.isExpandingPermission ||
      !options.permissionStack.includes(query.collectionName));

  if (shouldApplyPermissions) {
    const collectionPermissions = getCollectionPermissions(
      schema,
      query.collectionName
    );
    // If we have collection permissions, we should apply them, otherwise its permissionless
    if (collectionPermissions) {
      let permissionFilters: PreparedWhere[] = [];
      let hasMatch = false;
      if (session?.roles) {
        for (const sessionRole of session.roles) {
          const permission =
            collectionPermissions[sessionRole.key]?.[options.applyPermission!];
          if (permission?.filter) {
            if (Array.isArray(permission.filter)) {
              hasMatch = true;
              // Empty filters should be treated as access denied
              if (permission.filter.length === 0) {
                permissionFilters.push(ACCESS_DENIED_FILTER);
              } else {
                // Rule application for write rules should recursively check read rules of nested data
                const nextOptions: PrepareQueryRecursiveOptions = {
                  ...options,
                  applyPermission: isWritePermissionOperation(
                    options.applyPermission!
                  )
                    ? 'read'
                    : options.applyPermission,
                  isExpandingPermission: true,
                  permissionStack: [
                    ...(options.permissionStack ?? []),
                    query.collectionName,
                  ],
                };

                /**
                 * We need to append $0 to permission filters because we treat them as a special case for backwards compataiblity before we had referential prefixes
                 * - for relational where clauses, we default to $1
                 * - for permissions filters, we default to $0
                 * TODO: IMO this is a bit hack. TODO: we should figure out the right default for missing referential prefixes
                 */
                const prefixedPermissionFilters =
                  prependPermissionFilterVariables(permission.filter);

                permissionFilters.push(
                  transformAndValidateFilters(
                    prefixedPermissionFilters,
                    query,
                    schema,
                    // Apply role variables
                    { ...variables, $role: sessionRole.roleVars },
                    session,
                    nextOptions
                  )
                );
              }
            } else {
              throw new InvalidFilterError(
                `Invalid permission filter format, expected array`
              );
            }
          }
        }
      }

      if (
        !hasMatch &&
        // postUpdate permissions are optional, so if there isnt a postUpdate match we wont apply the deny filter
        options.applyPermission !== 'postUpdate'
      ) {
        // If there are no permissions, we should deny access by applying a filter that will never match
        permissionFilters = [ACCESS_DENIED_FILTER];
      }

      // Append any permissions filters to the transformed input clauses
      const permissionsWhere = or(
        permissionFilters.map((filters) => and(filters))
      );
      where.push(permissionsWhere);
    }
  }
  if (!where.length) return undefined;
  return where;
}

function prependPermissionFilterVariables(filters: QueryWhere): QueryWhere {
  return filters.map((filter) => {
    if (isFilterStatement(filter)) {
      const [prop, op, val] = filter;
      if (isValueVariable(val)) {
        const components = getVariableComponents(val);
        // Unassigned variables, default to $0
        if (components[0] === undefined) {
          components[0] = 0;
          return [prop, op, '$' + components.join('.')];
        }
      }
      return [prop, op, val];
    }
    if (isFilterGroup(filter)) {
      return {
        ...filter,
        filters: prependPermissionFilterVariables(filter.filters),
      };
    }
    return filter;
  });
}

function transformAndValidateFilters(
  filters: QueryWhere,
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedWhere {
  return filters.map((filter) =>
    transformAndValidateFilter(
      filter,
      query,
      schema,
      variables,
      session,
      options
    )
  );
}

/**
 * Transforms and validates individual filters recursively
 */
function transformAndValidateFilter(
  filter: WhereFilter,
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedWhereFilter {
  // Boolean filters are already valid
  if (isBooleanFilter(filter)) return filter;

  // Handle and / or statements (may transform into filter statement or exists statement)
  if (isFilterGroup(filter)) {
    // Validate mod value
    if (filter.mod !== 'and' && filter.mod !== 'or')
      throw new InvalidFilterError(`Invalid filter group mod '${filter.mod}'`);
    return {
      mod: filter.mod,
      filters: transformAndValidateFilters(
        filter.filters,
        query,
        schema,
        variables,
        session,
        options
      ),
    };
  }

  // Handle filter statements (may transform into exists statement)
  if (isFilterStatement(filter)) {
    let [prop, op, val] = filter;

    // If anything in the path is a query type, need to transform it to an exists statement
    if (schema) {
      const propPath = prop.split('.');
      let propAttributeType: DataType | undefined;
      // Loop through the path and get the attribute type
      for (const [attrPath, attr] of createSchemaEntriesIterator(
        propPath,
        schema,
        query.collectionName
      )) {
        // If a query type, evaluate as exists subquery
        if (isTraversalRelationship(attr)) {
          const subquery = { ...attr.query };
          const subpath = propPath.slice(attrPath.length).join('.');
          if (isValueVariable(val)) {
            // If the value is a referential variable, we should increment the scope
            val = safeIncrementSubqueryVar(val);
          }
          subquery.where = [...(subquery.where ?? []), [subpath, op, val]];
          const filter = transformAndValidateFilter(
            {
              exists: subquery,
            },
            subquery,
            schema,
            variables,
            session,
            options
          );
          return filter;
        }
        propAttributeType = attr;
      }

      // If we didn't find an attribute, throw an error
      if (!propAttributeType)
        throw new InvalidFilterError(
          `Could not find property '${prop}' in the schema`
        );

      /**
       * Temporarily prefixing all set operations to make them unique in the query engine
       * This may be a long term solution, but it is okay to refactor the representation if needed
       */
      if (
        propAttributeType.type === 'set' &&
        // to make this idempotent (we really should try to avoid running prepareQuery twice)
        !op.startsWith(SET_OP_PREFIX)
      ) {
        op = `${SET_OP_PREFIX}${op}`;
      }

      // Validate the operator for the prop
      if (!Type.supportedOperations(propAttributeType).includes(op as never))
        throw new InvalidFilterError(
          `Operator '${op}' is not valid for property '${prop}' of type '${propAttributeType.type}'`
        );
    }

    // replace variables
    if (isValueVariable(val)) {
      const components = getVariableComponents(val);
      let scope = components[0];
      // If the variable is not scoped, assume it is a relational variable referring to parent
      if (scope === undefined) {
        components[0] = 1;
        scope = components[0];
        val = '$' + components.join('.');
      }

      // Replace static variables
      if (!isVariableScopeRelational(scope)) {
        if (options.replaceStaticVariables) {
          const variable = ValuePointer.Get(variables, components as string[]);
          if (variable === undefined) {
            throw new SessionVariableNotFoundError(
              val,
              scope,
              variables[scope]
            );
          }
          val = variable;
        }
      }
      // Replace relational paths with subquery filter
      else if (schema) {
        /**
         * To expand the variable path in to a filter we must
         * 1. Find the query the path starts from (refQuery)
         * 2. Find the relationship in the path, coming from the filter value
         * 3. Bump every variable in the subquery definition based on how deep we are in the query stack
         * 4. Create a new filter statement based on the current filter, with the flipped operator and the value as a variable path of the filter prop
         * 5. Eval as subquery
         */
        const refQuery =
          options.queryStack[options.queryStack.length - scope - 1];
        const valPath = components.slice(1) as string[];
        for (const [attrPath, attr] of createSchemaEntriesIterator(
          valPath,
          schema,
          refQuery.collectionName
        )) {
          if (isTraversalRelationship(attr)) {
            const subquery = { ...attr.query };
            // Placing the subquery in a nested spot, increment variables based on how deep we are in the query stack
            const incrementedSubquery = safeIncrementQueryVars(
              subquery,
              options.queryStack.length - 1
            );

            // Create flipped filter components (swapping left and right operands)
            const flippedPath = valPath.slice(attrPath.length).join('.');
            const flippedOp = flipOperator(op);
            let flippedVal = `$1.${prop}`;

            // Add flipped filter to subquery
            incrementedSubquery.where = [
              ...(incrementedSubquery.where ?? []),
              [flippedPath, flippedOp, flippedVal],
            ];

            const filter = transformAndValidateFilter(
              {
                exists: incrementedSubquery,
              },
              subquery,
              schema,
              variables,
              session,
              options
            );
            return filter;
          }
        }
      }
    }

    // TODO: this should probably be handled by the path type definition, with some schemaless defaults (for things like dates)
    if (val instanceof Date) {
      val = val.toISOString();
    }

    if (Array.isArray(val)) {
      val = new Set(val);
    }

    return [prop, op, val];
  }

  // Handle transforming to a subquery filter
  if (isRelationshipExistsFilter(filter)) {
    if (!schema)
      throw new InvalidFilterError(
        'A schema is required to execute an exists filter'
      );
    const { exists: _exists } = filter;
    const { _extends: relationship, ...queryExt } = _exists;
    const relationshipPath = relationship.split('.');
    let queryPath: string[] | undefined;
    let relationshipAttributeType: SchemaTraversalData;
    // Loop through the path and find the first query type
    for (const [relPath, rel] of createSchemaEntriesIterator(
      relationshipPath,
      schema,
      query.collectionName
    )) {
      queryPath = relPath;
      relationshipAttributeType = rel;
      // If a query type, evaluate as exists subquery
      if (isTraversalRelationship(relationshipAttributeType)) {
        break;
      }
    }
    if (!relationshipAttributeType)
      throw new InvalidFilterError(
        `Could not find property '${relationship}' in the schema`
      );

    if (!isTraversalRelationship(relationshipAttributeType))
      throw new InvalidFilterError(
        'Cannot execute an exists filter on a non-relation property'
      );

    const subquery = { ...relationshipAttributeType.query } as CollectionQuery;

    // If we're at the end of the path, create subquery filter
    // If there is still more to resolve, create a new exists filter
    const atLeaf = relationshipPath.length === queryPath!.length;
    const filterToAdd = !atLeaf
      ? [exists(relationshipPath.slice(queryPath!.length).join('.'), queryExt)]
      : queryExt?.where;

    subquery.where = [
      ...(relationshipAttributeType.query.where ?? []),
      ...(filterToAdd ?? []),
    ];

    return transformAndValidateFilter(
      {
        exists: subquery,
      },
      subquery,
      schema,
      variables,
      session,
      options
    );
  }

  if (isSubQueryFilter(filter)) {
    const { exists } = filter;
    // Only take required components from the subquery
    const subquery = {
      collectionName: exists.collectionName,
      where: exists.where,
    };
    return {
      exists: prepareQueryRecursive(
        subquery,
        schema,
        variables,
        session,
        options
      ),
    };
  }

  throw new InvalidFilterError('Filter is not valid format');
}

/**
 * Validates the order by clause
 */
function prepareQueryOrder(
  query: CollectionQuery,
  schema: Models | undefined,
  variables: Record<string, any>,
  session: Session | undefined,
  options: PrepareQueryRecursiveOptions
): PreparedOrder | undefined {
  if (!query.order) return query.order;
  const order: PreparedOrder = [];
  for (const [field, direction] of query.order) {
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new InvalidOrderClauseError(
        `Invalid order direction '${direction}'`
      );
    }

    // Validate that the order by fields exist and are sortable
    if (schema) {
      const { valid, path, reason } = validateIdentifier(
        field,
        schema,
        query.collectionName,
        (dataType, i, path) => {
          if (!dataType) return { valid: false, reason: 'Path not found' };
          if (
            i === path.length - 1 &&
            (isTraversalRelationship(dataType) ||
              dataType.type === 'set' ||
              dataType.type === 'record')
          ) {
            return {
              valid: false,
              reason: 'Order by field is not sortable',
            };
          }
          if (
            isTraversalRelationship(dataType) &&
            dataType.cardinality !== 'one'
          )
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
      let subqueryRef: CollectionQuery | undefined = undefined;
      let cardinality: QueryResultCardinality | undefined = undefined;
      for (const [path, dataType] of createSchemaEntriesIterator(
        field.split('.'),
        schema,
        query.collectionName
      )) {
        const component = path[path.length - 1];
        if (dataType && isTraversalRelationship(dataType)) {
          const subquery = { ...dataType.query };
          if (!subqueryRef) {
            subqueryRef = subquery;
            cardinality = dataType.cardinality;
          } else {
            subqueryRef.include = {
              ...subqueryRef.include,
              [component]: {
                subquery,
                cardinality: dataType.cardinality,
              },
            };
          }
        } else {
          break;
        }
      }
      if (subqueryRef) {
        const prepared = prepareQueryRecursive(
          subqueryRef,
          schema,
          variables,
          session,
          options
        );
        order.push([
          field,
          direction,
          { subquery: prepared, cardinality: 'one' },
        ]);
        continue;
      }
    }
    order.push([field, direction]);
  }
  return order;
}

/**
 * Validates the limit clause
 */
function prepareQueryLimit(query: CollectionQuery) {
  if (!query.limit) return query.limit;
  if (typeof query.limit !== 'number')
    throw new InvalidQueryLimitError('Limit must be a number');
  if (query.limit < 0)
    throw new InvalidQueryLimitError('Limit must be a positive number');
  return query.limit;
}

function prepareQueryAfter(
  query: CollectionQuery,
  schema: Models | undefined
): QueryAfter | undefined {
  if (!query.after) return query.after;
  // Validate after clause structure
  if (!Array.isArray(query.after))
    throw new InvalidQueryAfterError('After clause must be an array');
  if (query.after.length < 2)
    throw new InvalidQueryAfterError(
      'After clause must contain a cursor and inclusive flag'
    );
  if (query.after.length > 2)
    throw new InvalidQueryAfterError(
      'After clause has too many components - it should contain a cursor and inclusive flag'
    );
  if (!Array.isArray(query.after[0]))
    throw new InvalidQueryAfterError('After clause cursor must be an array');
  if (!query.order)
    throw new InvalidQueryAfterError(
      'After clause requires an order by clause to be provided'
    );

  if (query.after[0].length !== query.order.length)
    throw new InvalidQueryAfterError(
      'After clause cursor must match the elements in the order by clause'
    );

  if (typeof query.after[1] !== 'boolean')
    throw new InvalidQueryAfterError(
      'After clause inclusive flag must be a boolean'
    );

  // @ts-expect-error
  const cursor: ValueCursor = [];
  // Loop through order clause and validate / transform cursor values
  for (let i = 0; i < query.order.length; i++) {
    let cursorValue = query.after[0][i];

    // TODO: re-address this when we unify the hadnling of undefined and null
    if (cursorValue === undefined)
      throw new InvalidQueryAfterError('Cursor value cannot be undefined');

    if (schema) {
      const orderPath = query.order[i][0].split('.');
      for (const [attrPath, attr] of createSchemaEntriesIterator(
        orderPath,
        schema,
        query.collectionName
      )) {
        if (!attr)
          throw new InvalidQueryAfterError(
            `Attribute ${query.order[i][0]} not found in schema`
          );

        // Evaluate support for this, because this would be good to support
        // Throwing error for now because I think in the client we implicitly need to include the data for some client side checks and in the query engine we dont pre-load the data
        if (isTraversalRelationship(attr)) {
          throw new InvalidQueryAfterError(
            `Attribute ${query.order[i][0]} is not allowed in after clause because it is relational`
          );
        }

        const isLeaf = attrPath.length === orderPath.length;
        if (isLeaf) {
          // Set, query, record types are not allowed in after clause
          if (
            attr.type === 'set' ||
            isTraversalRelationship(attr) ||
            attr.type === 'record'
          ) {
            throw new InvalidQueryAfterError(
              `Attribute ${query.order[i][0]} is not allowed in after clause because the type is not sortable`
            );
          }

          // Apply schema type transformations
          try {
            cursorValue = Type.encode(attr, cursorValue);
          } catch (e: any) {
            if (e instanceof TriplitError)
              throw new InvalidQueryAfterError(
                `Error converting cursor value for attribute ${query.order[i][0]}: ${e.message}`
              );
            throw e;
          }
        }
      }
    }

    // Apply default transforms
    if (cursorValue instanceof Date) {
      cursorValue = cursorValue.toISOString();
    }

    cursor.push(cursorValue);
  }

  return [cursor, query.after[1]];
}

function mergeQueries(queryA: CollectionQuery, queryB?: CollectionQuery) {
  if (!queryB) return { ...queryA };
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
