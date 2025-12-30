/**
 * SQL Query Planner - Translates Triplit PreparedQuery to Postgres SQL
 */

import type {
  PreparedQuery,
  PreparedWhere,
  PreparedWhereFilter,
  PreparedOrder,
  PreparedInclusions,
  FilterStatement,
  FilterGroup,
  PreparedSubQueryFilter,
} from '../query/types/index.js';
import { sanitizeSQLIdentifier, sanitizeSQLValue } from './type-mapping.js';

export interface SQLQuery {
  sql: string;
  params: any[];
}

export interface SQLQueryPlannerOptions {
  /**
   * Enable query logging for debugging
   */
  debug?: boolean;
}

export class SQLQueryPlanner {
  private paramCounter: number = 0;
  private options: SQLQueryPlannerOptions;

  constructor(options: SQLQueryPlannerOptions = {}) {
    this.options = options;
  }

  /**
   * Plans a full SELECT query from a PreparedQuery
   */
  planSelect(query: PreparedQuery): SQLQuery {
    this.paramCounter = 0;
    const params: any[] = [];

    const tableName = sanitizeSQLIdentifier(query.collectionName);
    const selectClause = this.planSelectClause(query.select);
    const fromClause = `FROM ${tableName}`;

    let whereParts: string[] = [];
    let whereParams: any[] = [];

    // Add WHERE filters
    if (query.where && query.where.length > 0) {
      const { clause, params: filterParams } = this.planFilters(
        query.where,
        tableName
      );
      if (clause) {
        whereParts.push(clause);
        whereParams.push(...filterParams);
      }
    }

    // Add AFTER (cursor pagination) filter
    if (query.after) {
      const { clause, params: afterParams } = this.planAfterFilter(
        query.after,
        tableName
      );
      if (clause) {
        whereParts.push(clause);
        whereParams.push(...afterParams);
      }
    }

    const whereClause =
      whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Add ORDER BY
    const orderClause = query.order ? this.planOrderBy(query.order) : '';

    // Add LIMIT
    const limitClause = query.limit ? `LIMIT ${query.limit}` : '';

    // Combine all parts
    const parts = [
      selectClause,
      fromClause,
      whereClause,
      orderClause,
      limitClause,
    ].filter(Boolean);

    const sql = parts.join('\n');
    params.push(...whereParams);

    if (this.options.debug) {
      console.log('[SQL Query Planner]', sql, params);
    }

    return { sql, params };
  }

  /**
   * Plans the SELECT clause
   */
  private planSelectClause(select?: string[]): string {
    if (!select || select.length === 0) {
      return 'SELECT *';
    }

    const columns = select.map((col) => sanitizeSQLIdentifier(col));
    return `SELECT ${columns.join(', ')}`;
  }

  /**
   * Plans WHERE clause from filters
   */
  planFilters(
    filters: PreparedWhere,
    tableAlias: string
  ): { clause: string; params: any[] } {
    const params: any[] = [];
    const clauses: string[] = [];

    for (const filter of filters) {
      if (typeof filter === 'boolean') {
        // true = match all, false = match none
        clauses.push(filter ? 'TRUE' : 'FALSE');
        continue;
      }

      if (this.isFilterStatement(filter)) {
        const { clause, params: filterParams } = this.planFilterStatement(
          filter,
          tableAlias
        );
        clauses.push(clause);
        params.push(...filterParams);
      } else if (this.isFilterGroup(filter)) {
        const { clause, params: groupParams } = this.planFilterGroup(
          filter,
          tableAlias
        );
        clauses.push(`(${clause})`);
        params.push(...groupParams);
      } else if (this.isSubQueryFilter(filter)) {
        const { clause, params: subParams } = this.planSubQueryFilter(
          filter,
          tableAlias
        );
        clauses.push(clause);
        params.push(...subParams);
      }
    }

    const clause = clauses.join(' AND ');
    return { clause, params };
  }

  /**
   * Plans a single filter statement (e.g., ['status', '=', 'published'])
   */
  private planFilterStatement(
    filter: FilterStatement,
    tableAlias: string
  ): { clause: string; params: any[] } {
    const [path, operator, value] = filter;
    const params: any[] = [];

    // Handle nested paths (e.g., 'user.name')
    const column = this.planColumnPath(path, tableAlias);

    // Handle different operators
    switch (operator) {
      case '=':
      case '!=':
      case '<':
      case '>':
      case '<=':
      case '>=': {
        const paramIndex = this.nextParam();
        params.push(value);
        return { clause: `${column} ${operator} $${paramIndex}`, params };
      }

      case 'like':
      case 'nlike': {
        const paramIndex = this.nextParam();
        params.push(value);
        const op = operator === 'like' ? 'LIKE' : 'NOT LIKE';
        return { clause: `${column} ${op} $${paramIndex}`, params };
      }

      case 'in':
      case 'nin': {
        const values = Array.from(value instanceof Set ? value : [value]);
        if (values.length === 0) {
          return {
            clause: operator === 'in' ? 'FALSE' : 'TRUE',
            params,
          };
        }

        const paramIndices = values.map(() => this.nextParam());
        params.push(...values);
        const placeholders = paramIndices.map((i) => `$${i}`).join(', ');
        const op = operator === 'in' ? 'IN' : 'NOT IN';
        return { clause: `${column} ${op} (${placeholders})`, params };
      }

      case 'has':
      case '!has': {
        // For JSONB set operations
        const paramIndex = this.nextParam();
        params.push(String(value));
        const op = operator === 'has' ? '?' : 'NOT ?';
        return { clause: `${column} ${op} $${paramIndex}`, params };
      }

      case 'isDefined': {
        return { clause: `${column} IS NOT NULL`, params };
      }

      default: {
        throw new Error(`Unsupported operator: ${operator}`);
      }
    }
  }

  /**
   * Plans a filter group (AND/OR)
   */
  private planFilterGroup(
    group: FilterGroup,
    tableAlias: string
  ): { clause: string; params: any[] } {
    const { mod, filters } = group;
    const operator = mod === 'and' ? ' AND ' : ' OR ';

    const params: any[] = [];
    const clauses: string[] = [];

    for (const filter of filters) {
      if (typeof filter === 'boolean') {
        clauses.push(filter ? 'TRUE' : 'FALSE');
        continue;
      }

      if (this.isFilterStatement(filter)) {
        const { clause, params: filterParams } = this.planFilterStatement(
          filter,
          tableAlias
        );
        clauses.push(clause);
        params.push(...filterParams);
      } else if (this.isFilterGroup(filter)) {
        const { clause, params: groupParams } = this.planFilterGroup(
          filter,
          tableAlias
        );
        clauses.push(`(${clause})`);
        params.push(...groupParams);
      } else if (this.isSubQueryFilter(filter)) {
        const { clause, params: subParams } = this.planSubQueryFilter(
          filter,
          tableAlias
        );
        clauses.push(clause);
        params.push(...subParams);
      }
    }

    const clause = clauses.join(operator);
    return { clause, params };
  }

  /**
   * Plans a subquery filter (EXISTS)
   */
  private planSubQueryFilter(
    filter: PreparedSubQueryFilter,
    parentTableAlias: string
  ): { clause: string; params: any[] } {
    const subQuery = filter.exists;
    const params: any[] = [];

    const subTableName = sanitizeSQLIdentifier(subQuery.collectionName);

    // Build subquery WHERE clause
    const whereParts: string[] = [];

    if (subQuery.where) {
      const { clause, params: subParams } = this.planFilters(
        subQuery.where,
        subTableName
      );
      if (clause) {
        whereParts.push(clause);
        params.push(...subParams);
      }
    }

    const whereClause =
      whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const existsSQL = `EXISTS (SELECT 1 FROM ${subTableName} ${whereClause})`;

    return { clause: existsSQL, params };
  }

  /**
   * Plans AFTER filter for cursor pagination
   */
  private planAfterFilter(
    after: any,
    tableAlias: string
  ): { clause: string; params: any[] } {
    // Cursor pagination implementation
    // This depends on the cursor format - for now, simple ID-based
    if (Array.isArray(after) && after.length >= 2) {
      const [field, value] = after;
      const column = this.planColumnPath(field, tableAlias);
      const paramIndex = this.nextParam();
      return {
        clause: `${column} > $${paramIndex}`,
        params: [value],
      };
    }

    return { clause: '', params: [] };
  }

  /**
   * Plans ORDER BY clause
   */
  private planOrderBy(order: PreparedOrder): string {
    const orderClauses = order.map(([field, direction]) => {
      const column = sanitizeSQLIdentifier(field);
      return `${column} ${direction}`;
    });

    return `ORDER BY ${orderClauses.join(', ')}`;
  }

  /**
   * Plans column path (handles nested JSONB access)
   */
  private planColumnPath(path: string, tableAlias: string): string {
    const parts = path.split('.');

    if (parts.length === 1) {
      // Simple column
      return sanitizeSQLIdentifier(parts[0]);
    }

    // Nested JSONB path
    const column = sanitizeSQLIdentifier(parts[0]);
    const jsonPath = parts.slice(1);

    // Use JSONB operators for nested access
    // e.g., data->'user'->>'name'
    let result = column;
    for (let i = 0; i < jsonPath.length; i++) {
      const isLast = i === jsonPath.length - 1;
      const op = isLast ? '->>' : '->';
      result = `${result}${op}'${jsonPath[i]}'`;
    }

    return result;
  }

  /**
   * Type guards
   */
  private isFilterStatement(filter: any): filter is FilterStatement {
    return (
      Array.isArray(filter) &&
      filter.length === 3 &&
      typeof filter[0] === 'string'
    );
  }

  private isFilterGroup(filter: any): filter is FilterGroup {
    return (
      typeof filter === 'object' &&
      filter !== null &&
      'mod' in filter &&
      'filters' in filter
    );
  }

  private isSubQueryFilter(filter: any): filter is PreparedSubQueryFilter {
    return typeof filter === 'object' && filter !== null && 'exists' in filter;
  }

  /**
   * Get next parameter index
   */
  private nextParam(): number {
    return ++this.paramCounter;
  }
}
